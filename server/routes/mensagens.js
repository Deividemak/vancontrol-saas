// Painel: conversas com os responsáveis (WhatsApp + portal), avisos enviados e configuração
import { Router } from 'express';
import crypto from 'crypto';
import { handler, HttpError, parseId, str, limparLinha } from '../lib/http.js';
import { provedorAtual, normalizarTelefone, enviarTexto, configWhatsapp } from '../services/whatsapp.js';
import { linkPortal, urlBase } from '../services/responsaveis.js';
import { lerConfig, salvarConfig } from '../services/config.js';
import { empresaId, daEmpresa } from '../lib/tenant.js';

const router = Router();

// chave da conversa: "r<id>" (responsável cadastrado) ou "t<telefone>" (número desconhecido)
function lerChave(chave) {
    const m = String(chave).match(/^(r)(\d+)$|^(t)(\d{10,13})$/);
    if (!m) throw new HttpError(400, 'Conversa inválida.');
    return m[1] ? { responsavelId: Number(m[2]) } : { telefone: m[4] };
}

router.get('/conversas', handler(async (req, res, conn) => {
    const rows = await conn.query(`
        SELECT COALESCE(CONCAT('r', m.responsavel_id), CONCAT('t', m.telefone)) AS chave,
               MAX(m.id) AS ultima_id,
               SUM(CASE WHEN m.lida = false AND m.direcao = 'entrada' THEN 1 ELSE 0 END) AS nao_lidas,
               MAX(m.responsavel_id) AS responsavel_id, MAX(m.telefone) AS telefone
        FROM mensagens m WHERE m.empresa_id = ?
        GROUP BY chave
        ORDER BY ultima_id DESC LIMIT 200`, [empresaId()]);
    if (!rows.length) return res.json([]);
    const ultimas = await conn.query(`SELECT id, texto, direcao, tipo, DATE_FORMAT(criado_em,'%Y-%m-%dT%H:%i:%s') AS criado_em FROM mensagens WHERE empresa_id = ? AND id IN (?)`, [empresaId(), rows.map(r => r.ultima_id)]);
    const resps = await conn.query(`
        SELECT r.id, r.nome, r.telefone, GROUP_CONCAT(a.nome ORDER BY a.nome SEPARATOR ', ') AS alunos
        FROM responsaveis r LEFT JOIN alunos a ON a.responsavel_id = r.id AND a.empresa_id = r.empresa_id
        WHERE r.empresa_id = ? AND r.id IN (?) GROUP BY r.id`, [empresaId(), [0, ...rows.map(r => r.responsavel_id).filter(Boolean)]]);
    res.json(rows.map(r => {
        const u = ultimas.find(x => x.id === r.ultima_id);
        const p = resps.find(x => x.id === r.responsavel_id);
        return {
            chave: r.chave, responsavel_id: r.responsavel_id, nome: p?.nome || null, alunos: p?.alunos || null,
            telefone: p?.telefone || r.telefone, nao_lidas: Number(r.nao_lidas),
            ultima: u ? { texto: u.texto, direcao: u.direcao, tipo: u.tipo, criado_em: u.criado_em } : null,
        };
    }));
}, 'Erro ao buscar conversas'));

router.get('/nao-lidas', handler(async (req, res, conn) => {
    const [r] = await conn.query(`SELECT COUNT(*) AS n FROM mensagens WHERE empresa_id = ? AND lida = false AND direcao = 'entrada'`, [empresaId()]);
    res.json({ total: Number(r.n) });
}, 'Erro'));

router.get('/conversas/:chave', handler(async (req, res, conn) => {
    const k = lerChave(req.params.chave);
    if (k.responsavelId) await daEmpresa(conn, 'responsaveis', k.responsavelId, { nome: 'Conversa' });
    const filtro = `m.empresa_id = ${Number(empresaId())} AND ` + (k.responsavelId ? 'm.responsavel_id = ?' : 'm.telefone = ? AND m.responsavel_id IS NULL');
    const valor = k.responsavelId ?? k.telefone;
    const msgs = await conn.query(`
        SELECT m.id, m.direcao, m.canal, m.tipo, m.texto, m.lida, DATE_FORMAT(m.criado_em,'%Y-%m-%dT%H:%i:%s') AS criado_em,
               u.nome AS usuario_nome, n.status AS envio_status, n.erro AS envio_erro
        FROM mensagens m LEFT JOIN usuarios u ON u.id = m.usuario_id LEFT JOIN notificacoes n ON n.id = m.notificacao_id
        WHERE ${filtro} ORDER BY m.criado_em DESC, m.id DESC LIMIT 300`, [valor]);
    await conn.query(`UPDATE mensagens m SET lida = true WHERE ${filtro} AND m.direcao = 'entrada' AND m.lida = false`, [valor]);
    let contato = null;
    if (k.responsavelId) {
        const [r] = await conn.query(`
            SELECT r.id, r.nome, r.telefone, r.whatsapp_ativo, DATE_FORMAT(r.portal_ultimo_acesso,'%Y-%m-%dT%H:%i:%s') AS portal_ultimo_acesso,
                   GROUP_CONCAT(a.nome ORDER BY a.nome SEPARATOR ', ') AS alunos
            FROM responsaveis r LEFT JOIN alunos a ON a.responsavel_id = r.id AND a.empresa_id = r.empresa_id
            WHERE r.id = ? AND r.empresa_id = ? GROUP BY r.id`, [k.responsavelId, empresaId()]);
        contato = r ? { ...limparLinha(r), whatsapp_ativo: !!r.whatsapp_ativo } : null;
    } else {
        contato = { telefone: k.telefone, nome: null };
    }
    res.json({ contato, mensagens: msgs.reverse().map(m => ({ ...m, lida: !!m.lida })) });
}, 'Erro ao abrir conversa'));

// resposta da empresa (vai pelo WhatsApp e fica registrada; o portal também mostra)
router.post('/conversas/:chave', handler(async (req, res, conn) => {
    const k = lerChave(req.params.chave);
    const texto = str(req.body.texto, 2000);
    if (!texto) throw new HttpError(400, 'Escreva a mensagem.');
    let telefone = k.telefone, responsavelId = k.responsavelId || null;
    if (responsavelId) {
        const [r] = await conn.query('SELECT telefone FROM responsaveis WHERE id = ? AND empresa_id = ? AND anonimizado_em IS NULL', [responsavelId, empresaId()]);
        if (!r) throw new HttpError(404, 'Responsável não encontrado.');
        telefone = r.telefone;
    }
    const tel = normalizarTelefone(telefone);
    let notifId = null;
    if (tel) {
        const n = await conn.query(`INSERT INTO notificacoes (empresa_id, responsavel_id, telefone, tipo, dados, mensagem, enviar_apos) VALUES (?, ?, ?, 'chat', ?, ?, NOW())`,
            [empresaId(), responsavelId, tel, JSON.stringify({ texto }), texto]);
        notifId = Number(n.insertId);
    }
    await conn.query(`INSERT INTO mensagens (empresa_id, responsavel_id, telefone, direcao, canal, tipo, texto, usuario_id, notificacao_id, lida) VALUES (?, ?, ?, 'saida', 'painel', 'mensagem', ?, ?, ?, true)`,
        [empresaId(), responsavelId, tel, texto, req.user.id, notifId]);
    res.status(201).json({ success: true, enviado_whatsapp: !!tel });
}, 'Erro ao enviar mensagem'));

// avisos automáticos (para conferir o que saiu e o que deu erro)
router.get('/notificacoes', handler(async (req, res, conn) => {
    const status = ['pendente', 'enviada', 'erro', 'cancelada'].includes(req.query.status) ? req.query.status : null;
    const rows = await conn.query(`
        SELECT n.id, n.tipo, n.telefone, n.status, n.tentativas, n.erro, n.alunos, n.mensagem,
               DATE_FORMAT(n.created_at,'%Y-%m-%dT%H:%i:%s') AS criada_em, DATE_FORMAT(n.enviada_em,'%Y-%m-%dT%H:%i:%s') AS enviada_em,
               r.nome AS responsavel_nome
        FROM notificacoes n LEFT JOIN responsaveis r ON r.id = n.responsavel_id
        WHERE n.empresa_id = ? ${status ? 'AND n.status = ?' : ''} ORDER BY n.id DESC LIMIT 200`, status ? [empresaId(), status] : [empresaId()]);
    res.json(rows.map(r => ({ ...r, alunos: JSON.parse(r.alunos || '[]').map(a => a.nome) })));
}, 'Erro ao buscar avisos'));

/** Segredo da URL de recebimento do WhatsApp desta empresa (criado na primeira vez). */
async function segredoWebhook(conn) {
    const emp = empresaId();
    if (emp === Number(process.env.EMPRESA_PRINCIPAL_ID || 1) && process.env.WHATSAPP_WEBHOOK_SEGREDO) return process.env.WHATSAPP_WEBHOOK_SEGREDO;
    const [e] = await conn.query('SELECT whatsapp_segredo FROM empresas WHERE id = ?', [emp]);
    if (e?.whatsapp_segredo) return e.whatsapp_segredo;
    const novo = crypto.randomBytes(24).toString('hex');
    await conn.query('UPDATE empresas SET whatsapp_segredo = ? WHERE id = ? AND whatsapp_segredo IS NULL', [novo, emp]);
    const [e2] = await conn.query('SELECT whatsapp_segredo FROM empresas WHERE id = ?', [emp]);
    return e2.whatsapp_segredo;
}

router.get('/status', handler(async (req, res, conn) => {
    const cfg = await configWhatsapp(conn, empresaId());
    const p = provedorAtual(cfg);
    const [c] = await conn.query(`
        SELECT SUM(status = 'pendente') AS pendentes, SUM(status = 'erro') AS erros,
               SUM(status = 'enviada' AND enviada_em >= NOW() - INTERVAL 1 DAY) AS enviadas_24h
        FROM notificacoes WHERE empresa_id = ?`, [empresaId()]);
    const segredo = await segredoWebhook(conn);
    res.json({
        provedor: p.nome, configurado: p.configurado, aviso: p.aviso, origem: cfg.origem,
        webhook_url: `${urlBase()}/api/publico/whatsapp/${segredo}`,
        webhook_configurado: true,
        pendentes: Number(c.pendentes || 0), erros: Number(c.erros || 0), enviadas_24h: Number(c.enviadas_24h || 0),
    });
}, 'Erro ao ler status'));

// configuração do WhatsApp da empresa (senhas nunca voltam para a tela)
const PROVEDORES = ['log', 'zapi', 'webhook'];
const SEGREDOS = ['zapi_token', 'zapi_client_token', 'webhook_token'];

router.get('/config', handler(async (req, res, conn) => {
    const cfg = await configWhatsapp(conn, empresaId());
    const out = { provedor: cfg.provedor || 'log', origem: cfg.origem, zapi_instance_id: cfg.zapi_instance_id || '', webhook_url: cfg.webhook_url || '' };
    for (const k of SEGREDOS) out[`${k}_configurado`] = !!cfg[k];
    res.json(out);
}, 'Erro ao ler configuração'));

router.put('/config', handler(async (req, res, conn) => {
    const b = req.body || {};
    const provedor = String(b.provedor || '').toLowerCase();
    if (!PROVEDORES.includes(provedor)) throw new HttpError(400, 'Escolha o provedor: modo teste, Z-API ou webhook.');
    const atual = await lerConfig(conn, 'whatsapp');
    const novo = { provedor, zapi_instance_id: str(b.zapi_instance_id, 120) || '', webhook_url: str(b.webhook_url, 500) || '' };
    if (novo.webhook_url && !/^https?:\/\//.test(novo.webhook_url)) throw new HttpError(400, 'A URL do webhook deve começar com http:// ou https://');
    // senha em branco = mantém a atual
    for (const k of SEGREDOS) novo[k] = b[k] === undefined || b[k] === '' ? (atual[k] || '') : str(b[k], 300) || '';
    if (provedor === 'zapi' && (!novo.zapi_instance_id || !novo.zapi_token)) throw new HttpError(400, 'Informe a instância e o token da Z-API.');
    if (provedor === 'webhook' && !novo.webhook_url) throw new HttpError(400, 'Informe a URL do webhook.');
    await salvarConfig(conn, 'whatsapp', novo);
    res.json({ success: true });
}, 'Erro ao salvar configuração'));

router.post('/teste', handler(async (req, res, conn) => {
    const tel = normalizarTelefone(req.body.telefone);
    if (!tel) throw new HttpError(400, 'Telefone inválido.');
    const cfg = await configWhatsapp(conn, empresaId());
    const nome = (await lerConfig(conn, 'empresa')).nome_fantasia;
    try {
        const r = await enviarTexto(cfg, tel, `✅ Teste do ${nome}: o WhatsApp está funcionando.`);
        res.json({ success: true, id: r.id, provedor: provedorAtual(cfg).nome });
    } catch (err) {
        throw new HttpError(502, `Falha ao enviar: ${err.message}`);
    }
}, 'Erro no teste'));

// link do portal de um responsável (e opcionalmente envia no WhatsApp)
router.post('/portal/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'responsaveis', parseId(req), { nome: 'Responsável' });
    if (req.body.novo) await conn.query('UPDATE responsaveis SET portal_versao = portal_versao + 1 WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    const link = await linkPortal(conn, id);
    if (!link) throw new HttpError(404, 'Responsável não encontrado.');
    if (req.body.enviar) {
        const [r] = await conn.query('SELECT nome, telefone FROM responsaveis WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
        const tel = normalizarTelefone(r.telefone);
        if (!tel) throw new HttpError(400, 'Telefone do responsável inválido.');
        const texto = `Olá, ${r.nome.split(' ')[0]}! Este é o seu acesso ao acompanhamento da van escolar:\n${link}\n\nPor ele você vê a van ao vivo, avisa faltas, cadastra quem pode buscar a criança e fala com a empresa. Não compartilhe este link.`;
        const n = await conn.query(`INSERT INTO notificacoes (empresa_id, responsavel_id, telefone, tipo, dados, mensagem, enviar_apos) VALUES (?, ?, ?, 'resposta', ?, ?, NOW())`,
            [empresaId(), id, tel, JSON.stringify({ texto }), texto]);
        res.json({ link, enviado: true, notificacao_id: Number(n.insertId) });
        return;
    }
    res.json({ link, enviado: false });
}, 'Erro ao gerar link'));

router.put('/whatsapp/:id', handler(async (req, res, conn) => {
    const r = await conn.query('UPDATE responsaveis SET whatsapp_ativo = ? WHERE id = ? AND empresa_id = ?', [req.body.ativo ? 1 : 0, parseId(req), empresaId()]);
    if (!r.affectedRows) throw new HttpError(404, 'Responsável não encontrado.');
    res.json({ success: true });
}, 'Erro ao atualizar'));

export default router;
