// Contratos (painel): gerar a partir do modelo, enviar para assinatura no portal, acompanhar.
import { Router } from 'express';
import { handler, HttpError, parseId, toId } from '../lib/http.js';
import { montarContrato, listarContratos, carregarContrato, sha256 } from '../services/contratos.js';
import { linkPortal } from '../services/responsaveis.js';
import { enfileirarTexto } from '../services/notificacoes.js';
import { normalizarTelefone } from '../services/whatsapp.js';
import { empresaId } from '../lib/tenant.js';
import { lerConfig } from '../services/config.js';

const router = Router();

router.get('/', handler(async (req, res, conn) => {
    const alunoId = toId(req.query.aluno_id);
    res.json(alunoId ? await listarContratos(conn, 'c.aluno_id = ?', [alunoId]) : await listarContratos(conn));
}, 'Erro ao listar contratos'));

router.get('/previa', handler(async (req, res, conn) => {
    const c = await montarContrato(conn, toId(req.query.aluno_id));
    if (!c) throw new HttpError(404, 'Aluno não encontrado.');
    res.json(c);
}, 'Erro ao montar contrato'));

router.get('/:id', handler(async (req, res, conn) => {
    const c = await carregarContrato(conn, parseId(req));
    if (!c) throw new HttpError(404, 'Contrato não encontrado.');
    res.json(c);
}, 'Erro ao carregar contrato'));

router.post('/', handler(async (req, res, conn) => {
    const alunoId = toId(req.body?.aluno_id);
    const base = await montarContrato(conn, alunoId);
    if (!base) throw new HttpError(404, 'Aluno não encontrado.');
    if (!base.responsavel_id) throw new HttpError(400, 'Cadastre o responsável do aluno antes de gerar o contrato (ele assina pelo portal).');
    // o painel pode ajustar o texto antes de gerar; depois de gerado, o texto fica travado (hash)
    const conteudo = typeof req.body?.conteudo === 'string' && req.body.conteudo.trim().length > 50 ? req.body.conteudo.slice(0, 30000) : base.conteudo;
    await conn.query(`UPDATE contratos SET status = 'cancelado', cancelado_em = NOW() WHERE aluno_id = ? AND empresa_id = ? AND status = 'pendente'`, [alunoId, empresaId()]);
    const r = await conn.query(`
        INSERT INTO contratos (empresa_id, aluno_id, responsavel_id, status, conteudo, hash_sha256, valor, vigencia_inicio, vigencia_fim, criado_por)
        VALUES (?, ?, ?, 'pendente', ?, ?, ?, ?, ?, ?)`,
        [empresaId(), alunoId, base.responsavel_id, conteudo, sha256(conteudo), base.valor, base.vigencia_inicio, base.vigencia_fim, req.user?.id || null]);
    res.status(201).json({ id: Number(r.insertId) });
}, 'Erro ao gerar contrato'));

router.post('/:id/enviar', handler(async (req, res, conn) => {
    const c = await carregarContrato(conn, parseId(req));
    if (!c) throw new HttpError(404, 'Contrato não encontrado.');
    if (c.status !== 'pendente') throw new HttpError(400, 'Só contratos pendentes podem ser enviados.');
    const [r] = await conn.query('SELECT telefone, whatsapp_ativo FROM responsaveis WHERE id = ? AND empresa_id = ?', [c.responsavel_id, empresaId()]);
    const link = await linkPortal(conn, c.responsavel_id);
    if (!r || !normalizarTelefone(r.telefone)) throw new HttpError(400, 'Responsável sem telefone válido. Copie o link e envie de outra forma.');
    const texto = `📄 Olá, ${c.responsavel_nome?.split(' ')[0] || ''}! Segue o contrato do transporte escolar de ${c.aluno_nome.split(' ')[0]} para leitura e assinatura.\n\nÉ só abrir o portal, ir em *Pagamentos → Contrato* e confirmar com seu nome e CPF:\n${link}\n\n_${(await lerConfig(conn, 'empresa')).nome_fantasia}_`;
    await enfileirarTexto(conn, { telefone: r.telefone, responsavelId: c.responsavel_id, texto, tipo: 'contrato' });
    await conn.query('UPDATE contratos SET enviado_em = NOW() WHERE id = ? AND empresa_id = ?', [c.id, empresaId()]);
    res.json({ success: true, link });
}, 'Erro ao enviar contrato'));

router.post('/:id/cancelar', handler(async (req, res, conn) => {
    const [c] = await conn.query('SELECT status FROM contratos WHERE id = ? AND empresa_id = ?', [parseId(req), empresaId()]);
    if (!c) throw new HttpError(404, 'Contrato não encontrado.');
    const r = await conn.query(`UPDATE contratos SET status = 'cancelado', cancelado_em = NOW() WHERE id = ? AND empresa_id = ? AND status = 'pendente'`, [parseId(req), empresaId()]);
    if (!r.affectedRows) throw new HttpError(400, 'Só contratos pendentes podem ser cancelados.');
    res.json({ success: true });
}, 'Erro ao cancelar contrato'));

export default router;
