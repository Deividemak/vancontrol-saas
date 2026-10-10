// LGPD (só o dono): política de retenção, termo dos pais, registro de acessos, exportação e anonimização
import { Router } from 'express';
import { handler, HttpError, parseId, str, toId } from '../lib/http.js';
import { empresaId, daEmpresa } from '../lib/tenant.js';
import { lerConfig, salvarConfig } from '../services/config.js';
import { registrarAcesso, exportarResponsavel, anonimizarAluno, anonimizarResponsavel, executarRetencao, termoAtual } from '../services/lgpd.js';

const router = Router();

router.get('/config', handler(async (req, res, conn) => {
    const cfg = await lerConfig(conn, 'lgpd');
    const [c] = await conn.query(`
        SELECT COUNT(*) total, SUM(consentimento_versao >= ?) aceitos FROM responsaveis
        WHERE empresa_id = ? AND anonimizado_em IS NULL AND status = 'Ativo'`, [Number(cfg.termo_versao) || 1, empresaId()]);
    res.json({ ...cfg, termo_previa: (await termoAtual(conn)).texto, responsaveis_total: Number(c.total || 0), responsaveis_aceitaram: Number(c.aceitos || 0) });
}, 'Erro ao ler configuração'));

const faixa = (v, min, max, nome) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${nome}: use um valor entre ${min} e ${max}.`);
    return n;
};

router.put('/config', handler(async (req, res, conn) => {
    const b = req.body || {};
    const atual = await lerConfig(conn, 'lgpd');
    const novo = {};
    if (b.retencao_meses_inativos !== undefined) novo.retencao_meses_inativos = faixa(b.retencao_meses_inativos, 6, 120, 'Meses para anonimizar alunos inativos');
    if (b.retencao_dias_gps !== undefined) novo.retencao_dias_gps = faixa(b.retencao_dias_gps, 30, 1825, 'Dias de histórico de GPS');
    if (b.retencao_dias_acessos !== undefined) novo.retencao_dias_acessos = faixa(b.retencao_dias_acessos, 180, 3650, 'Dias do registro de acessos');
    if (b.termo_texto !== undefined) {
        const t = str(b.termo_texto, 20000);
        if (!t || t.length < 100) throw new HttpError(400, 'O termo está muito curto.');
        novo.termo_texto = t;
    }
    // nova versão do termo: os pais precisam aceitar de novo no portal
    if (b.nova_versao_termo) novo.termo_versao = (Number(atual.termo_versao) || 1) + 1;
    res.json(await salvarConfig(conn, 'lgpd', novo));
}, 'Erro ao salvar configuração'));

router.get('/acessos', handler(async (req, res, conn) => {
    const where = ['l.empresa_id = ?'], v = [empresaId()];
    const aluno = toId(req.query.aluno_id), resp = toId(req.query.responsavel_id), usuario = toId(req.query.usuario_id);
    if (aluno) { where.push('l.aluno_id = ?'); v.push(aluno); }
    if (resp) { where.push('l.responsavel_id = ?'); v.push(resp); }
    if (usuario) { where.push('l.usuario_id = ?'); v.push(usuario); }
    if (req.query.acao) { where.push('l.acao = ?'); v.push(String(req.query.acao).slice(0, 40)); }
    const rows = await conn.query(`
        SELECT l.id, l.usuario_id, l.usuario_nome, l.papel, l.acao, l.aluno_id, l.responsavel_id, l.detalhe, l.ip,
               DATE_FORMAT(l.criado_em,'%Y-%m-%dT%H:%i:%s') AS criado_em, a.nome AS aluno_nome, r.nome AS responsavel_nome
        FROM lgpd_acessos l
        LEFT JOIN alunos a ON a.id = l.aluno_id AND a.empresa_id = l.empresa_id
        LEFT JOIN responsaveis r ON r.id = l.responsavel_id AND r.empresa_id = l.empresa_id
        WHERE ${where.join(' AND ')} ORDER BY l.id DESC LIMIT 300`, v);
    res.json(rows);
}, 'Erro ao buscar acessos'));

router.get('/responsaveis/:id/exportar', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'responsaveis', parseId(req), { nome: 'Responsável' });
    const dados = await exportarResponsavel(conn, id);
    await registrarAcesso(conn, { acao: 'exportou_dados', responsavelId: id, ip: req.ip });
    res.json(dados);
}, 'Erro ao exportar dados'));

router.post('/alunos/:id/anonimizar', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'alunos', parseId(req), { nome: 'Aluno' });
    const r = await anonimizarAluno(conn, id);
    if (!r.ok) throw new HttpError(400, r.motivo);
    res.json({ success: true });
}, 'Erro ao anonimizar'));

router.post('/responsaveis/:id/anonimizar', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'responsaveis', parseId(req), { nome: 'Responsável' });
    const r = await anonimizarResponsavel(conn, id);
    if (!r.ok) throw new HttpError(400, r.motivo);
    res.json({ success: true });
}, 'Erro ao anonimizar'));

router.post('/retencao/executar', handler(async (req, res, conn) => {
    res.json(await executarRetencao(conn));
}, 'Erro ao aplicar a retenção'));

export default router;
