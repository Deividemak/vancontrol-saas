// Portal do responsável (acesso por link mágico enviado no WhatsApp)
import { Router } from 'express';
import pool from '../db.js';
import { handler, HttpError, parseId, toId, str, data as dataValida, limparLinha } from '../lib/http.js';
import { lerTokenPortal } from '../middleware/auth.js';
import { hojeBR, calendarioDoDia } from '../services/viagens.js';
import { estimarChegadas } from '../services/eta.js';
import { registrarAusencia } from '../services/responsaveis.js';
import { formatarEndereco } from '../services/geocoding.js';
import { lerConfig } from '../services/config.js';
import { dadosCobranca, valorAtualizado } from '../services/cobranca.js';
import { atualizarStatus } from '../services/financeiro.js';
import { dadosRecibo } from '../services/recibo.js';
import { listarContratos, carregarContrato, assinarContrato, cpfValido, sha256 } from '../services/contratos.js';
import { comEmpresa, empresaId } from '../lib/tenant.js';
import { termoAtual } from '../services/lgpd.js';

// LGPD: antes do aceite do termo, o portal só mostra o próprio termo
const LIVRES_SEM_ACEITE = ['/me', '/termo', '/consentimento'];

const router = Router();

router.use(async (req, res, next) => {
    const [tipo, token] = (req.headers.authorization || '').split(' ');
    const t = tipo === 'Bearer' ? lerTokenPortal(token) : null;
    if (!t) return res.status(401).json({ error: 'Link inválido ou expirado. Peça um novo link à empresa.' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [r] = await conn.query(
            `SELECT r.id, r.empresa_id, r.nome, r.telefone, r.portal_versao, r.status, r.consentimento_versao
             FROM responsaveis r JOIN empresas e ON e.id = r.empresa_id AND e.ativo = 1
             WHERE r.id = ? AND r.anonimizado_em IS NULL`, [t.responsavel_id]);
        if (!r || r.portal_versao !== t.versao) return res.status(401).json({ error: 'Este link foi desativado. Peça um novo link à empresa.' });
        const alunos = await conn.query(`SELECT id FROM alunos WHERE responsavel_id = ? AND empresa_id = ? AND status = 'Ativo'`, [r.id, r.empresa_id]);
        req.resp = r;
        req.alunoIds = alunos.map(a => a.id);
        const versaoTermo = Number((await lerConfig(conn, 'lgpd', r.empresa_id)).termo_versao) || 1;
        req.consentimentoPendente = !(Number(r.consentimento_versao) >= versaoTermo);
        conn.query('UPDATE responsaveis SET portal_ultimo_acesso = NOW() WHERE id = ?', [r.id]).catch(() => {});
    } catch (err) {
        console.error('[portal] autenticação:', err);
        return res.status(500).json({ error: 'Erro interno' });
    } finally {
        if (conn) conn.release();
    }
    if (req.consentimentoPendente && !LIVRES_SEM_ACEITE.includes(req.path)) {
        return res.status(428).json({ error: 'Leia e aceite o termo de privacidade para continuar.', consentimento_pendente: true });
    }
    return comEmpresa(req.resp.empresa_id, () => next());
});

// ---------- LGPD: termo de privacidade e consentimento ----------
router.get('/termo', handler(async (req, res, conn) => {
    const t = await termoAtual(conn);
    const [c] = await conn.query(`SELECT DATE_FORMAT(consentimento_em,'%Y-%m-%dT%H:%i:%s') AS em FROM responsaveis WHERE id = ?`, [req.resp.id]);
    res.json({ ...t, pendente: req.consentimentoPendente, aceito_em: req.consentimentoPendente ? null : c?.em || null });
}, 'Erro ao carregar o termo'));

router.post('/consentimento', handler(async (req, res, conn) => {
    if (req.body?.aceite !== true) throw new HttpError(400, 'Marque que leu e concorda com o termo.');
    const t = await termoAtual(conn);
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 60);
    await conn.query('INSERT INTO lgpd_consentimentos (empresa_id, responsavel_id, versao, texto_sha256, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
        [empresaId(), req.resp.id, t.versao, sha256(t.texto), ip, String(req.headers['user-agent'] || '').slice(0, 255)]);
    await conn.query('UPDATE responsaveis SET consentimento_versao = ?, consentimento_em = NOW() WHERE id = ? AND empresa_id = ?', [t.versao, req.resp.id, empresaId()]);
    res.json({ success: true, versao: t.versao });
}, 'Erro ao registrar o aceite'));

const meuAluno = (req, id) => {
    const a = toId(id);
    if (!a || !req.alunoIds.includes(a)) throw new HttpError(403, 'Aluno não encontrado.');
    return a;
};

router.get('/me', handler(async (req, res, conn) => {
    const alunos = req.alunoIds.length ? await conn.query(`
        SELECT a.id, a.nome, a.turno, a.foto_thumb, a.suspenso, e.nome AS escola_nome
        FROM alunos a LEFT JOIN escolas e ON e.id = a.escola_id WHERE a.id IN (?) ORDER BY a.nome`, [req.alunoIds]) : [];
    const pend = req.alunoIds.length ? await conn.query(`
        SELECT (SELECT COUNT(*) FROM contratos WHERE aluno_id IN (?) AND status = 'pendente') AS contratos,
               (SELECT COUNT(*) FROM mensalidades WHERE aluno_id IN (?) AND status = 'Atrasado') AS atrasadas`, [req.alunoIds, req.alunoIds]) : [{ contratos: 0, atrasadas: 0 }];
    res.json({
        responsavel: { id: req.resp.id, nome: req.resp.nome }, empresa: (await lerConfig(conn, 'empresa')).nome_fantasia, alunos,
        pendencias: { contratos: Number(pend[0].contratos), atrasadas: Number(pend[0].atrasadas) },
        consentimento_pendente: req.consentimentoPendente,
    });
}, 'Erro ao carregar'));

// Situação de hoje: viagens, presença, posição da van e previsão de chegada
router.get('/hoje', handler(async (req, res, conn) => {
    const data = hojeBR();
    const cal = await calendarioDoDia(conn, data);
    if (!req.alunoIds.length) return res.json({ data, calendario: cal, itens: [] });

    const rotas = await conn.query(`
        SELECT ra.aluno_id, ra.ponto_encontro_id, TIME_FORMAT(ra.hora_prevista, '%H:%i') AS hora_prevista,
               r.id AS rota_id, r.nome AS rota_nome, r.tipo, r.periodo, TIME_FORMAT(r.hora_saida, '%H:%i') AS hora_saida,
               f.placa, f.modelo, m.nome AS motorista_nome,
               a.nome AS aluno_nome, a.lat, a.lng, a.logradouro, a.numero, a.bairro, a.cidade, a.uf, a.cep, a.complemento,
               pe.nome AS ponto_nome, pe.lat AS ponto_lat, pe.lng AS ponto_lng, e.nome AS escola_nome, e.lat AS escola_lat, e.lng AS escola_lng
        FROM rota_alunos ra
        JOIN rotas r ON r.id = ra.rota_id AND r.status = 'Ativa'
        JOIN alunos a ON a.id = ra.aluno_id
        LEFT JOIN frota f ON f.id = r.veiculo_id LEFT JOIN motoristas m ON m.id = r.motorista_id
        LEFT JOIN pontos_encontro pe ON pe.id = ra.ponto_encontro_id
        LEFT JOIN escolas e ON e.id = a.escola_id
        WHERE ra.aluno_id IN (?) ORDER BY r.hora_saida`, [req.alunoIds]);

    // van/motorista do dia (substituições)
    if (rotas.length) {
        const { escalaDoDia } = await import('../services/escala.js');
        const esc = await escalaDoDia(conn, data);
        const frota = await conn.query('SELECT id, placa, modelo FROM frota WHERE empresa_id = ?', [empresaId()]);
        const mots = await conn.query('SELECT id, nome FROM motoristas WHERE empresa_id = ?', [empresaId()]);
        for (const r of rotas) {
            const e = esc.get(r.rota_id);
            if (!e?.substituicao_id) continue;
            const f = frota.find(x => x.id === e.veiculo_id), m = mots.find(x => x.id === e.motorista_id);
            Object.assign(r, { placa: f?.placa ?? r.placa, modelo: f?.modelo ?? r.modelo, motorista_nome: m?.nome ?? r.motorista_nome, substituida: true });
        }
    }
    const viagens = rotas.length ? await conn.query(`
        SELECT v.id, v.rota_id, v.status, v.ultima_lat, v.ultima_lng, DATE_FORMAT(v.ultima_posicao_em, '%Y-%m-%dT%H:%i:%s') AS ultima_posicao_em
        FROM viagens v WHERE v.empresa_id = ? AND v.data = ? AND v.rota_id IN (?)`, [empresaId(), data, [...new Set(rotas.map(r => r.rota_id))]]) : [];
    const presencas = viagens.length ? await conn.query(`
        SELECT viagem_id, aluno_id, status, DATE_FORMAT(embarque_em, '%H:%i') AS embarque, DATE_FORMAT(desembarque_em, '%H:%i') AS desembarque
        FROM presencas WHERE viagem_id IN (?) AND aluno_id IN (?)`, [viagens.map(v => v.id), req.alunoIds]) : [];
    const ausencias = await conn.query(`SELECT aluno_id, sentido FROM ausencias WHERE data_inicio <= ? AND data_fim >= ? AND aluno_id IN (?)`, [data, data, req.alunoIds]);
    const etasPorViagem = new Map();

    const itens = [];
    for (const r of rotas) {
        const v = viagens.find(x => x.rota_id === r.rota_id);
        const p = v ? presencas.find(x => x.viagem_id === v.id && x.aluno_id === r.aluno_id) : null;
        const ausente = ausencias.some(a => a.aluno_id === r.aluno_id && (a.sentido === 'ambos' || a.sentido === r.tipo));
        let eta = null;
        // posição da van só enquanto interessa a esta criança
        const relevante = v?.status === 'em_andamento' && p && (p.status === 'previsto' || p.status === 'embarcou');
        if (relevante) {
            if (!etasPorViagem.has(v.id)) etasPorViagem.set(v.id, await estimarChegadas(conn, v.id));
            eta = etasPorViagem.get(v.id).get(r.aluno_id)?.min ?? null;
        }
        const casa = r.ponto_lat !== null && r.ponto_lat !== undefined
            ? { lat: Number(r.ponto_lat), lng: Number(r.ponto_lng), nome: r.ponto_nome }
            : r.lat !== null ? { lat: Number(r.lat), lng: Number(r.lng), nome: formatarEndereco(r) } : null;
        itens.push({
            aluno_id: r.aluno_id, aluno_nome: r.aluno_nome, rota_nome: r.rota_nome, tipo: r.tipo, periodo: r.periodo,
            hora_saida: r.hora_saida, hora_prevista: r.hora_prevista, placa: r.placa, modelo: r.modelo, motorista_nome: r.motorista_nome, substituida: !!r.substituida,
            escola_nome: r.escola_nome, escola: r.escola_lat !== null ? { lat: Number(r.escola_lat), lng: Number(r.escola_lng) } : null,
            parada: casa, ausente,
            viagem_status: v?.status || 'nao_iniciada',
            presenca: p ? { status: p.status, embarque: p.embarque, desembarque: p.desembarque } : null,
            van: relevante && v.ultima_lat !== null ? { lat: Number(v.ultima_lat), lng: Number(v.ultima_lng), em: v.ultima_posicao_em } : null,
            eta_min: eta,
        });
    }
    res.json({ data, calendario: { sem_aula_todas: cal.sem_aula_todas, motivo: cal.motivo }, itens });
}, 'Erro ao carregar o dia'));

// ---------- ausências ----------
router.get('/ausencias', handler(async (req, res, conn) => {
    if (!req.alunoIds.length) return res.json([]);
    const rows = await conn.query(`
        SELECT au.id, au.aluno_id, a.nome AS aluno_nome, au.sentido, au.motivo, au.origem,
               DATE_FORMAT(au.data_inicio,'%Y-%m-%d') AS data_inicio, DATE_FORMAT(au.data_fim,'%Y-%m-%d') AS data_fim
        FROM ausencias au JOIN alunos a ON a.id = au.aluno_id
        WHERE au.aluno_id IN (?) AND au.data_fim >= ? ORDER BY au.data_inicio`, [req.alunoIds, hojeBR()]);
    res.json(rows.map(limparLinha));
}, 'Erro ao buscar ausências'));

router.post('/ausencias', handler(async (req, res, conn) => {
    const ids = (Array.isArray(req.body.aluno_ids) ? req.body.aluno_ids : [req.body.aluno_id]).map(id => meuAluno(req, id));
    if (!ids.length) throw new HttpError(400, 'Selecione o aluno.');
    const inicio = dataValida(req.body.data_inicio);
    if (!inicio) throw new HttpError(400, 'Informe a data.');
    if (inicio < hojeBR()) throw new HttpError(400, 'Não é possível avisar falta em data passada.');
    const fim = dataValida(req.body.data_fim) || inicio;
    if (fim < inicio) throw new HttpError(400, 'A data final é anterior à inicial.');
    const sentido = ['ambos', 'ida', 'volta'].includes(req.body.sentido) ? req.body.sentido : 'ambos';
    await registrarAusencia(conn, { alunoIds: ids, inicio, fim, sentido, motivo: str(req.body.motivo), origem: 'portal' });
    res.status(201).json({ success: true });
}, 'Erro ao registrar ausência'));

router.delete('/ausencias/:id', handler(async (req, res, conn) => {
    const [a] = await conn.query(`SELECT aluno_id, DATE_FORMAT(data_fim,'%Y-%m-%d') AS fim FROM ausencias WHERE id = ? AND empresa_id = ?`, [parseId(req), empresaId()]);
    if (!a || !req.alunoIds.includes(a.aluno_id)) throw new HttpError(404, 'Ausência não encontrada.');
    if (a.fim < hojeBR()) throw new HttpError(400, 'Ausência já passou.');
    await conn.query('DELETE FROM ausencias WHERE id = ?', [parseId(req)]);
    res.json({ success: true });
}, 'Erro ao cancelar ausência'));

// ---------- autorizados a buscar/receber ----------
router.get('/autorizados', handler(async (req, res, conn) => {
    if (!req.alunoIds.length) return res.json([]);
    const rows = await conn.query(`
        SELECT au.id, au.aluno_id, a.nome AS aluno_nome, au.nome, au.parentesco, au.telefone, au.documento, au.observacao, au.origem,
               DATE_FORMAT(au.valido_ate,'%Y-%m-%d') AS valido_ate
        FROM autorizados_retirada au JOIN alunos a ON a.id = au.aluno_id
        WHERE au.aluno_id IN (?) AND au.ativo = true ORDER BY a.nome, au.nome`, [req.alunoIds]);
    res.json(rows.map(limparLinha));
}, 'Erro ao buscar autorizados'));

router.post('/autorizados', handler(async (req, res, conn) => {
    const ids = (Array.isArray(req.body.aluno_ids) ? req.body.aluno_ids : [req.body.aluno_id]).map(id => meuAluno(req, id));
    const nome = str(req.body.nome, 150);
    if (!nome) throw new HttpError(400, 'Informe o nome da pessoa autorizada.');
    const validoAte = dataValida(req.body.valido_ate);
    for (const alunoId of ids) {
        await conn.query(`INSERT INTO autorizados_retirada (aluno_id, nome, parentesco, telefone, documento, valido_ate, observacao, origem) VALUES (?, ?, ?, ?, ?, ?, ?, 'portal')`,
            [alunoId, nome, str(req.body.parentesco, 60), str(req.body.telefone, 20), str(req.body.documento, 30), validoAte, str(req.body.observacao)]);
    }
    res.status(201).json({ success: true });
}, 'Erro ao salvar autorizado'));

router.delete('/autorizados/:id', handler(async (req, res, conn) => {
    const [a] = await conn.query('SELECT aluno_id FROM autorizados_retirada WHERE id = ?', [parseId(req)]);
    if (!a || !req.alunoIds.includes(a.aluno_id)) throw new HttpError(404, 'Autorizado não encontrado.');
    await conn.query('UPDATE autorizados_retirada SET ativo = false WHERE id = ?', [parseId(req)]);
    res.json({ success: true });
}, 'Erro ao remover autorizado'));

// ---------- mensalidades, Pix, recibos e contrato ----------
router.get('/mensalidades', handler(async (req, res, conn) => {
    if (!req.alunoIds.length) return res.json([]);
    await atualizarStatus(conn);
    const cfg = await lerConfig(conn, 'cobranca');
    const hoje = hojeBR();
    const rows = await conn.query(`
        SELECT m.id, a.nome AS aluno_nome, m.valor, m.status, m.descricao, m.recibo_numero, m.valor_pago,
               DATE_FORMAT(m.data_vencimento,'%Y-%m-%d') AS vencimento, DATE_FORMAT(m.data_pagamento,'%Y-%m-%d') AS pagamento
        FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id
        WHERE m.aluno_id IN (?) AND m.status <> 'Cancelado' ORDER BY m.data_vencimento DESC LIMIT 36`, [req.alunoIds]);
    res.json(rows.map(r => {
        const atual = valorAtualizado(r, cfg, hoje);
        return { ...limparLinha(r), valor: Number(r.valor), valor_pago: r.valor_pago === null ? null : Number(r.valor_pago), valor_atualizado: atual.valor, dias_atraso: atual.dias_atraso };
    }));
}, 'Erro ao buscar mensalidades'));

async function minhaMensalidade(req, conn) {
    const [m] = await conn.query('SELECT id, aluno_id, status FROM mensalidades WHERE id = ? AND empresa_id = ?', [parseId(req), empresaId()]);
    if (!m || !req.alunoIds.includes(m.aluno_id)) throw new HttpError(404, 'Mensalidade não encontrada.');
    return m;
}

router.get('/mensalidades/:id/pagar', handler(async (req, res, conn) => {
    const m = await minhaMensalidade(req, conn);
    if (m.status === 'Pago' || m.status === 'Cancelado') throw new HttpError(400, 'Esta mensalidade não está em aberto.');
    try {
        const c = await dadosCobranca(conn, m.id, hojeBR());
        const emp = await lerConfig(conn, 'cobranca');
        res.json({ ...c, recebedor: emp.pix_nome || null });
    } catch (err) {
        throw new HttpError(400, 'Pagamento online indisponível no momento. Fale com a empresa.');
    }
}, 'Erro ao gerar Pix'));

router.get('/mensalidades/:id/recibo', handler(async (req, res, conn) => {
    const m = await minhaMensalidade(req, conn);
    const r = await dadosRecibo(conn, m.id);
    if (!r) throw new HttpError(404, 'Recibo disponível depois da confirmação do pagamento.');
    res.json(r);
}, 'Erro ao gerar recibo'));

router.get('/contratos', handler(async (req, res, conn) => {
    if (!req.alunoIds.length) return res.json([]);
    res.json(await listarContratos(conn, `c.aluno_id IN (?) AND c.status IN ('pendente','assinado')`, [req.alunoIds]));
}, 'Erro ao listar contratos'));

router.get('/contratos/:id', handler(async (req, res, conn) => {
    const c = await carregarContrato(conn, parseId(req));
    if (!c || !req.alunoIds.includes(c.aluno_id) || c.status === 'cancelado') throw new HttpError(404, 'Contrato não encontrado.');
    delete c.assinatura_ip; delete c.assinatura_user_agent;
    res.json(c);
}, 'Erro ao carregar contrato'));

router.post('/contratos/:id/assinar', handler(async (req, res, conn) => {
    const c = await carregarContrato(conn, parseId(req));
    if (!c || !req.alunoIds.includes(c.aluno_id)) throw new HttpError(404, 'Contrato não encontrado.');
    const nome = str(req.body?.nome, 150);
    if (!nome || nome.split(/\s+/).length < 2) throw new HttpError(400, 'Digite seu nome completo.');
    if (!cpfValido(req.body?.cpf)) throw new HttpError(400, 'CPF inválido.');
    if (req.body?.aceite !== true) throw new HttpError(400, 'Marque que leu e concorda com o contrato.');
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const r = await assinarContrato(conn, c.id, { nome, cpf: req.body.cpf, ip, userAgent: req.headers['user-agent'] });
    if (r.erro) throw new HttpError(r.status, r.erro);
    res.json({ success: true });
}, 'Erro ao assinar contrato'));

// ---------- conversa com a empresa ----------
router.get('/mensagens', handler(async (req, res, conn) => {
    const rows = await conn.query(`
        SELECT id, direcao, canal, tipo, texto, DATE_FORMAT(criado_em,'%Y-%m-%dT%H:%i:%s') AS criado_em
        FROM mensagens WHERE responsavel_id = ? AND empresa_id = ? ORDER BY criado_em DESC, id DESC LIMIT 100`, [req.resp.id, empresaId()]);
    res.json(rows.reverse());
}, 'Erro ao buscar mensagens'));

router.post('/mensagens', handler(async (req, res, conn) => {
    const texto = str(req.body.texto, 2000);
    if (!texto) throw new HttpError(400, 'Escreva a mensagem.');
    await conn.query(`INSERT INTO mensagens (empresa_id, responsavel_id, telefone, direcao, canal, tipo, texto, lida) VALUES (?, ?, ?, 'entrada', 'portal', 'mensagem', ?, false)`,
        [empresaId(), req.resp.id, req.resp.telefone, texto]);
    res.status(201).json({ success: true });
}, 'Erro ao enviar mensagem'));

export default router;
