// Mensagens recebidas no WhatsApp (webhook da Z-API ou do seu fluxo no n8n).
// URL: /api/publico/whatsapp/<segredo da empresa> (Mensagens → WhatsApp mostra o endereço de cada empresa;
// a empresa principal também aceita o WHATSAPP_WEBHOOK_SEGREDO do .env)
// Formatos aceitos: Z-API ("ReceivedCallback": phone, fromMe, isGroup, text.message, messageId)
//                   ou simples: { telefone, texto, id }
import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { normalizarTelefone } from '../services/whatsapp.js';
import { enfileirarTexto } from '../services/notificacoes.js';
import { buscarPorTelefone, registrarAusencia, linkPortal } from '../services/responsaveis.js';
import { hojeBR } from '../services/viagens.js';
import { estimarChegadas } from '../services/eta.js';
import { comEmpresa, empresaId } from '../lib/tenant.js';
import { responderComIA, iaLigada } from '../services/ia.js';
import { lerConfig } from '../services/config.js';
import { valorAtualizado } from '../services/cobranca.js';

const router = Router();

function iguais(recebido, s) {
    if (!s || !recebido) return false;
    const a = Buffer.from(String(recebido)), b = Buffer.from(String(s));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Empresa dona do segredo da URL (ou null). */
export async function empresaDoSegredo(segredo) {
    if (!segredo || String(segredo).length < 16) return null;
    if (iguais(segredo, process.env.WHATSAPP_WEBHOOK_SEGREDO)) return Number(process.env.EMPRESA_PRINCIPAL_ID || 1);
    const [e] = await pool.query('SELECT id, whatsapp_segredo FROM empresas WHERE whatsapp_segredo = ? AND ativo = 1', [String(segredo)]);
    return e && iguais(segredo, e.whatsapp_segredo) ? e.id : null;
}

const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function somarDias(iso, n) {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
function horaBR() {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()));
}

/** Interpreta pedidos de falta: "a Ana não vai amanhã", "Beto falta hoje só na volta", "não vão dia 15/10". */
export function interpretarAusencia(texto, alunos, hoje = hojeBR(), hora = horaBR()) {
    const t = semAcento(texto);
    const ehFalta = /\b(nao|n)\s+(vai|vao|vou|ira|irao|precisa|precisam|vem|virao)\b|\bfalt(a|ar|ara|arao|ando)\b|\bausen|\bdoente\b|\bnao\s+tem\s+aula\b|\bfica(ra|rao|r)?\s+em\s+casa\b/.test(t);
    if (!ehFalta) return null;

    let inicio;
    const m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (/\bamanha\b/.test(t)) inicio = somarDias(hoje, 1);
    else if (/\bhoje\b/.test(t)) inicio = hoje;
    else if (m) {
        const ano = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : hoje.slice(0, 4);
        inicio = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        if (Number.isNaN(Date.parse(inicio))) inicio = null;
        else if (!m[3] && inicio < hoje) inicio = `${Number(ano) + 1}${inicio.slice(4)}`;
    } else {
        // sem data: de tarde/noite entende como amanhã
        inicio = hora >= 14 ? somarDias(hoje, 1) : hoje;
    }
    if (!inicio) return null;

    const soVolta = /\b(volta|saida|buscar na escola)\b/.test(t) && !/\bida\b/.test(t);
    const soIda = /\bida\b/.test(t) && !/\bvolta\b/.test(t);
    const sentido = soVolta ? 'volta' : soIda ? 'ida' : 'ambos';

    const citados = alunos.filter(a => {
        const primeiro = semAcento(a.nome.split(' ')[0]);
        return new RegExp(`\\b${primeiro}\\b`).test(t);
    });
    return { inicio, fim: inicio, sentido, alunos: citados.length ? citados : alunos, todos: !citados.length };
}

const ehOndeEsta = (t) => /\b(onde|cade|aonde)\b.*\b(van|perua|motorista|onibus)\b|\b(que horas|quanto tempo|previsao|ja passou|vai chegar|esta chegando|chega quando)\b/.test(semAcento(t));
const ehBoleto = (t) => /\b(boleto|mensalidade|pix|pagar|pagamento|pago|paguei|fatura|vencimento|vence|devendo|debito)\b/.test(semAcento(t));
const BRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const DM = (iso) => iso.split('-').reverse().slice(0, 2).join('/');

/** Mensalidades em aberto dos filhos (com multa/juros se vencidas). */
async function emAberto(conn, alunoIds) {
    const cfg = await lerConfig(conn, 'cobranca');
    const rows = await conn.query(`
        SELECT m.id, m.valor, m.status, DATE_FORMAT(m.data_vencimento,'%Y-%m-%d') AS vencimento, a.nome
        FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id
        WHERE m.empresa_id = ? AND m.aluno_id IN (?) AND m.status IN ('Pendente','Atrasado') ORDER BY m.data_vencimento`, [empresaId(), alunoIds]);
    return rows.map(m => ({ ...m, atual: valorAtualizado(m, cfg, hojeBR()).valor }));
}

const ehDesfazer = (t) => /^\s*(desfazer|cancelar|cancela|desfaz)\b/.test(semAcento(t));

// Mensagens do mesmo número são processadas uma de cada vez, na ordem de chegada
// (pais costumam mandar várias mensagens seguidas)
const filas = new Map();
function emOrdem(chave, tarefa) {
    const anterior = filas.get(chave) || Promise.resolve();
    const atual = anterior.then(tarefa, tarefa);
    filas.set(chave, atual);
    atual.finally(() => { if (filas.get(chave) === atual) filas.delete(chave); });
    return atual;
}

router.post('/whatsapp/:segredo', async (req, res) => {
    let emp;
    try { emp = await empresaDoSegredo(req.params.segredo); } catch (err) { console.error('[whatsapp] webhook:', err.message); return res.status(500).end(); }
    if (!emp) return res.status(404).end();
    // responde rápido para o provedor não reenviar
    res.json({ ok: true });

    const b = req.body || {};
    if (b.fromMe || b.isGroup || b.isNewsletter || b.broadcast) return;
    const telefone = normalizarTelefone(b.phone || b.telefone);
    const texto = String(b.text?.message ?? b.texto ?? b.message ?? '').trim();
    const externoId = b.messageId || b.id || null;
    if (!telefone || !texto) return;

    await emOrdem(`${emp}:${telefone}`, () => comEmpresa(emp, () => processar(telefone, texto, externoId)));
});

async function processar(telefone, texto, externoId) {
    let conn;
    try {
        conn = await pool.getConnection();
        const quem = await buscarPorTelefone(conn, telefone);
        const respId = quem?.responsavel?.id || null;
        try {
            await conn.query(`INSERT INTO mensagens (empresa_id, responsavel_id, telefone, direcao, canal, tipo, texto, externo_id, lida) VALUES (?, ?, ?, 'entrada', 'whatsapp', 'mensagem', ?, ?, false)`,
                [empresaId(), respId, telefone, texto.slice(0, 4000), externoId ? `${empresaId()}:${externoId}`.slice(0, 100) : null]);
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return; // o provedor reenviou a mesma mensagem
            throw err;
        }
        if (!quem || !quem.alunos.length) return; // número desconhecido: fica só registrado para a empresa ver

        const responder = (t) => enfileirarTexto(conn, { telefone, responsavelId: respId, texto: t });
        const link = respId ? await linkPortal(conn, respId) : null;

        if (ehDesfazer(texto)) {
            const ids = quem.alunos.map(a => a.id);
            const ultimas = await conn.query(`
                SELECT id, aluno_id, created_at FROM ausencias
                WHERE empresa_id = ? AND aluno_id IN (?) AND origem = 'whatsapp' AND created_at >= NOW() - INTERVAL 3 HOUR
                ORDER BY created_at DESC, id DESC`, [empresaId(), ids]);
            if (!ultimas.length) { await responder('Não encontrei nenhum aviso de falta recente para cancelar.'); return; }
            const marco = new Date(ultimas[0].created_at).getTime();
            const doMesmoPedido = ultimas.filter(u => Math.abs(new Date(u.created_at).getTime() - marco) < 5000);
            await conn.query('DELETE FROM ausencias WHERE empresa_id = ? AND id IN (?)', [empresaId(), doMesmoPedido.map(u => u.id)]);
            const nomes = quem.alunos.filter(a => doMesmoPedido.some(u => u.aluno_id === a.id)).map(a => a.nome.split(' ')[0]).join(' e ');
            await conn.query(`INSERT INTO mensagens (empresa_id, responsavel_id, telefone, direcao, canal, tipo, texto, lida) VALUES (?, ?, ?, 'saida', 'whatsapp', 'sistema', ?, true)`,
                [empresaId(), respId, telefone, `Aviso de falta cancelado pelo responsável (${nomes}).`]);
            await responder(`👍 Cancelado. ${nomes} continua na lista da van normalmente.`);
            return;
        }

        const aus = interpretarAusencia(texto, quem.alunos);
        if (aus) {
            await registrarAusencia(conn, { alunoIds: aus.alunos.map(a => a.id), inicio: aus.inicio, fim: aus.fim, sentido: aus.sentido, motivo: `WhatsApp: "${texto.slice(0, 200)}"`, origem: 'whatsapp' });
            if (aus.todos && quem.alunos.length > 1) {
                await responder(`Registrei para todos (${quem.alunos.map(a => a.nome.split(' ')[0]).join(' e ')}). Se era só um, responda *DESFAZER* e mande de novo com o nome. Ex.: "${quem.alunos[0].nome.split(' ')[0]} não vai amanhã".`);
            }
            return;
        }

        if (ehOndeEsta(texto)) {
            const hoje = hojeBR();
            const ids = quem.alunos.map(a => a.id);
            const ativas = await conn.query(`
                SELECT DISTINCT v.id, r.nome FROM viagens v JOIN rotas r ON r.id = v.rota_id JOIN presencas p ON p.viagem_id = v.id
                WHERE v.empresa_id = ? AND v.data = ? AND v.status = 'em_andamento' AND p.aluno_id IN (?) AND p.status IN ('previsto','embarcou')`, [empresaId(), hoje, ids]);
            const linhas = [];
            for (const v of ativas) {
                const etas = await estimarChegadas(conn, v.id);
                for (const a of quem.alunos) {
                    const e = etas.get(a.id);
                    if (e) linhas.push(`• ${a.nome.split(' ')[0]}: a van chega em cerca de *${e.min} min*${e.sentido === 'casa' ? ' em casa' : ''}.`);
                }
            }
            const corpo = linhas.length ? linhas.join('\n') : 'No momento a van não está a caminho de vocês.';
            await responder(`${corpo}${link ? `\n\nAcompanhe ao vivo: ${link}` : ''}`);
            return;
        }

        if (ehBoleto(texto)) {
            const abertas = await emAberto(conn, quem.alunos.map(a => a.id));
            const corpo = abertas.length
                ? `💳 Mensalidades em aberto:\n${abertas.map(m => `• ${m.nome.split(' ')[0]} — venc. ${DM(m.vencimento)} — ${BRL(m.atual)}${m.status === 'Atrasado' ? ' (vencida)' : ''}`).join('\n')}`
                : '✅ Não há mensalidades em aberto. Obrigado!';
            await responder(`${corpo}${link ? `\n\nPix, boleto e recibos no portal: ${link}` : ''}`);
            return;
        }

        // IA (Gemini): responde dúvidas com os dados do sistema (até 20 respostas por número por dia)
        if (iaLigada()) {
            const [{ n }] = await conn.query(`SELECT COUNT(*) n FROM notificacoes WHERE empresa_id = ? AND telefone = ? AND dados LIKE '%"ia":true%' AND created_at >= NOW() - INTERVAL 1 DAY`, [empresaId(), telefone]);
            if (Number(n) < 20) {
                const resposta = await responderComIA({ empresa: (await lerConfig(conn, 'empresa')).nome_fantasia, pergunta: texto, contexto: await contextoIA(conn, quem, link) });
                if (resposta) {
                    await enfileirarTexto(conn, { telefone, responsavelId: respId, texto: resposta, extra: { ia: true } });
                    return;
                }
            }
        }

        // conversa livre: a empresa responde pelo painel; resposta automática no máximo 1x a cada 12 h
        const [recente] = await conn.query(`SELECT 1 FROM notificacoes WHERE empresa_id = ? AND telefone = ? AND tipo = 'resposta' AND dados LIKE '%"auto":true%' AND created_at >= NOW() - INTERVAL 12 HOUR LIMIT 1`, [empresaId(), telefone]);
        if (!recente) {
            await enfileirarTexto(conn, {
                telefone, responsavelId: respId,
                extra: { auto: true },
                texto: `Recebemos sua mensagem e vamos responder em breve.\n\nPara avisar falta é só escrever, por exemplo: "${quem.alunos[0].nome.split(' ')[0]} não vai amanhã".\nPara saber onde está a van: "cadê a van?"${link ? `\n\nAcompanhe pelo portal: ${link}` : ''}`,
            });
        }
    } catch (err) {
        console.error('[whatsapp] erro ao processar mensagem recebida:', err);
    } finally {
        if (conn) conn.release();
    }
}

/** O que a IA pode usar para responder (só dados deste responsável). */
async function contextoIA(conn, quem, link) {
    const hoje = hojeBR();
    const ids = quem.alunos.map(a => a.id);
    const linhas = [`Responsável: ${quem.responsavel?.nome || 'não identificado'}`, `Filhos: ${quem.alunos.map(a => a.nome).join(', ')}`, `Hoje: ${hoje.split('-').reverse().join('/')}`];
    const rotas = await conn.query(`
        SELECT a.nome AS aluno, r.nome AS rota, r.tipo, TIME_FORMAT(ra.hora_prevista,'%H:%i') AS previsto, TIME_FORMAT(r.hora_saida,'%H:%i') AS saida,
               v.status AS viagem, p.status AS presenca
        FROM rota_alunos ra JOIN rotas r ON r.id = ra.rota_id AND r.status = 'Ativa' JOIN alunos a ON a.id = ra.aluno_id
        LEFT JOIN viagens v ON v.rota_id = r.id AND v.data = ? LEFT JOIN presencas p ON p.viagem_id = v.id AND p.aluno_id = a.id
        WHERE ra.aluno_id IN (?) AND a.empresa_id = ?`, [hoje, ids, empresaId()]);
    for (const r of rotas) {
        linhas.push(`${r.aluno}: rota ${r.rota} (${r.tipo === 'ida' ? 'ida para a escola' : 'volta para casa'}), van sai ${r.saida || '?'}, horário previsto no ponto ${r.previsto || '?'}; hoje: ${r.viagem === 'em_andamento' ? 'a caminho' : r.viagem === 'concluida' ? 'viagem concluída' : 'ainda não saiu'}${r.presenca ? `, situação: ${r.presenca}` : ''}`);
    }
    const aus = await conn.query(`SELECT a.nome, DATE_FORMAT(au.data_inicio,'%d/%m') di, DATE_FORMAT(au.data_fim,'%d/%m') df, au.sentido FROM ausencias au JOIN alunos a ON a.id = au.aluno_id WHERE au.empresa_id = ? AND au.aluno_id IN (?) AND au.data_fim >= ?`, [empresaId(), ids, hoje]);
    for (const a of aus) linhas.push(`Falta avisada: ${a.nome} de ${a.di} a ${a.df} (${a.sentido})`);
    const abertas = await emAberto(conn, ids);
    linhas.push(abertas.length ? `Mensalidades em aberto: ${abertas.map(m => `${m.nome} venc. ${DM(m.vencimento)} ${BRL(m.atual)}`).join('; ')}` : 'Nenhuma mensalidade em aberto.');
    if (link) linhas.push(`Link do portal (van ao vivo, Pix, recibos, faltas): ${link}`);
    return linhas.join('\n');
}

export default router;
