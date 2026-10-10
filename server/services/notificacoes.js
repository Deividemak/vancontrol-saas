// Notificações aos responsáveis: fila com agrupamento de irmãos, sem repetir o mesmo aviso.
import pool from '../db.js';
import { enviarTexto, normalizarTelefone, configWhatsapp } from './whatsapp.js';
import { lerConfig } from './config.js';
import { empresaId, comEmpresa } from '../lib/tenant.js';

const ATRASO_SEG = Number(process.env.NOTIF_ATRASO_SEG ?? 10);  // espera para juntar irmãos / permitir "desfazer"
const MAX_TENTATIVAS = 5;

// tipos ligados à presença (desfazer cancela estes)
export const TIPOS_PRESENCA = ['embarcou', 'nao_embarcou', 'chegou_escola', 'embarcou_volta', 'nao_embarcou_volta', 'entregue_casa'];

function primeiros(alunos) {
    const n = alunos.map(a => String(a.nome).split(' ')[0]);
    return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
}

const DATA_BR = (iso) => iso ? iso.split('-').reverse().slice(0, 2).join('/') : '';

/** Texto final da mensagem (montado na hora do envio, já com todos os irmãos). */
export function renderizar(tipo, alunos, dados = {}, empresa = 'VanControl') {
    const nomes = primeiros(alunos);
    const pl = alunos.length > 1;
    const hora = dados.hora ? ` às ${dados.hora}` : '';
    const v = (s, p) => (pl ? p : s);
    const assin = `\n\n_${empresa}_`;
    switch (tipo) {
        case 'a_caminho_busca': return `🚐 A van chega para buscar ${nomes} em cerca de ${dados.min} min.${assin}`;
        case 'chegada_busca': return `🚐 A van chegou no ponto de ${nomes}.${assin}`;
        case 'embarcou': return `✅ ${nomes} ${v('embarcou', 'embarcaram')} na van${hora}.${assin}`;
        case 'nao_embarcou': return `⚠️ ${nomes} não ${v('embarcou', 'embarcaram')} hoje. A van passou no ponto${hora}.\nSe for engano, responda esta mensagem.${assin}`;
        case 'chegou_escola': return `🏫 ${nomes} ${v('chegou', 'chegaram')} na escola${hora}.${assin}`;
        case 'embarcou_volta': return `🚐 ${nomes} ${v('embarcou', 'embarcaram')} na saída da escola${hora}.${assin}`;
        case 'nao_embarcou_volta': return `⚠️ ${nomes} não ${v('embarcou', 'embarcaram')} na van na saída da escola hoje${hora}.\nSe precisar, responda esta mensagem.${assin}`;
        case 'a_caminho_casa': return `🏠 A van chega com ${nomes} em cerca de ${dados.min} min.${assin}`;
        case 'entregue_casa': return `🏠 ${nomes} ${v('foi entregue', 'foram entregues')}${hora}.${assin}`;
        case 'ausencia_registrada': {
            const quando = dados.inicio === dados.fim ? `em ${DATA_BR(dados.inicio)}` : `de ${DATA_BR(dados.inicio)} a ${DATA_BR(dados.fim)}`;
            const sentido = dados.sentido === 'ida' ? ' (só na ida)' : dados.sentido === 'volta' ? ' (só na volta)' : '';
            return `📝 Anotado: ${nomes} não ${v('vai', 'vão')} ${quando}${sentido}.${dados.desfazer ? '\nPara cancelar, responda *DESFAZER*.' : ''}${assin}`;
        }
        default: return dados.texto || '';
    }
}

/** Destinatários dos alunos: responsável cadastrado (se aceita WhatsApp) ou telefone avulso. */
async function destinatarios(conn, alunoIds) {
    if (!alunoIds.length) return [];
    const rows = await conn.query(`
        SELECT a.id AS aluno_id, a.nome, a.responsavel_id, r.telefone AS resp_tel, r.whatsapp_ativo, a.responsavel_telefone
        FROM alunos a LEFT JOIN responsaveis r ON r.id = a.responsavel_id AND r.empresa_id = a.empresa_id
        WHERE a.id IN (?) AND a.empresa_id = ? AND a.anonimizado_em IS NULL`, [alunoIds, empresaId()]);
    const out = [];
    for (const r of rows) {
        if (r.responsavel_id && !r.whatsapp_ativo) continue;
        const tel = normalizarTelefone(r.responsavel_id ? r.resp_tel : r.responsavel_telefone);
        if (!tel) continue;
        out.push({ aluno_id: r.aluno_id, nome: r.nome, responsavel_id: r.responsavel_id || null, telefone: tel });
    }
    return out;
}

/**
 * Enfileira um aviso para os responsáveis dos alunos.
 * Não repete o mesmo aviso (tipo + viagem + aluno) e junta irmãos numa mensagem só.
 */
export async function notificar(conn, { viagemId = null, alunoIds, tipo, dados = {}, unico = true, atrasoSeg = ATRASO_SEG }) {
    try {
        const dest = await destinatarios(conn, [...new Set(alunoIds)]);
        for (const d of dest) {
            const chave = unico ? `${tipo}:v${viagemId ?? 0}:a${d.aluno_id}${dados.chave_extra ? ':' + dados.chave_extra : ''}` : null;
            if (chave) {
                const ja = await conn.query('SELECT 1 FROM notificacoes_registro WHERE chave = ?', [chave]);
                if (ja.length) continue;
            }
            // mesma mensagem ainda esperando na fila para este telefone? junta
            const [pend] = await conn.query(`
                SELECT id, alunos FROM notificacoes
                WHERE empresa_id = ? AND status = 'pendente' AND telefone = ? AND tipo = ? AND (viagem_id <=> ?) AND created_at >= NOW() - INTERVAL 90 SECOND
                ORDER BY id DESC LIMIT 1`, [empresaId(), d.telefone, tipo, viagemId]);
            let notifId;
            if (pend) {
                const lista = JSON.parse(pend.alunos || '[]');
                if (!lista.some(a => a.id === d.aluno_id)) lista.push({ id: d.aluno_id, nome: d.nome });
                await conn.query('UPDATE notificacoes SET alunos = ? WHERE id = ?', [JSON.stringify(lista), pend.id]);
                notifId = pend.id;
            } else {
                const r = await conn.query(`
                    INSERT INTO notificacoes (empresa_id, viagem_id, responsavel_id, telefone, tipo, alunos, dados, enviar_apos)
                    VALUES (?, ?, ?, ?, ?, ?, ?, NOW() + INTERVAL ? SECOND)`,
                    [empresaId(), viagemId, d.responsavel_id, d.telefone, tipo, JSON.stringify([{ id: d.aluno_id, nome: d.nome }]), JSON.stringify(dados), atrasoSeg]);
                notifId = Number(r.insertId);
            }
            if (chave) await conn.query('INSERT IGNORE INTO notificacoes_registro (chave, notificacao_id) VALUES (?, ?)', [chave, notifId]);
        }
    } catch (err) {
        // aviso aos pais nunca pode derrubar a operação do motorista
        console.error('[notificacoes] falha ao enfileirar:', err.message);
    }
}

/** "Desfazer" no app: tira o aluno dos avisos que ainda não saíram. */
export async function cancelarPendentes(conn, viagemId, alunoId, tipos = TIPOS_PRESENCA) {
    try {
        const pend = await conn.query(`SELECT id, tipo, alunos FROM notificacoes WHERE empresa_id = ? AND status = 'pendente' AND viagem_id = ? AND tipo IN (?)`, [empresaId(), viagemId, tipos]);
        for (const n of pend) {
            const lista = JSON.parse(n.alunos || '[]');
            if (!lista.some(a => a.id === alunoId)) continue;
            const resto = lista.filter(a => a.id !== alunoId);
            if (resto.length) await conn.query('UPDATE notificacoes SET alunos = ? WHERE id = ?', [JSON.stringify(resto), n.id]);
            else await conn.query(`UPDATE notificacoes SET status = 'cancelada' WHERE id = ?`, [n.id]);
            await conn.query('DELETE FROM notificacoes_registro WHERE chave = ?', [`${n.tipo}:v${viagemId}:a${alunoId}`]);
        }
    } catch (err) {
        console.error('[notificacoes] falha ao cancelar:', err.message);
    }
}

/** Mensagem avulsa (resposta automática, chat do painel). */
export async function enfileirarTexto(conn, { telefone, responsavelId = null, texto, tipo = 'resposta', atrasoSeg = 0, extra = {} }) {
    const tel = normalizarTelefone(telefone);
    if (!tel) return null;
    const r = await conn.query(
        `INSERT INTO notificacoes (empresa_id, responsavel_id, telefone, tipo, dados, mensagem, enviar_apos) VALUES (?, ?, ?, ?, ?, ?, NOW() + INTERVAL ? SECOND)`,
        [empresaId(), responsavelId, tel, tipo, JSON.stringify({ texto, ...extra }), texto, atrasoSeg]);
    return Number(r.insertId);
}

let processando = false;

/** Envia o que estiver vencido na fila. Roda a cada poucos segundos. */
export async function processarFila() {
    if (processando) return;
    processando = true;
    let conn;
    try {
        conn = await pool.getConnection();
        const lote = await conn.query(`SELECT * FROM notificacoes WHERE status = 'pendente' AND enviar_apos <= NOW() ORDER BY enviar_apos, id LIMIT 20`);
        // WhatsApp e nome de cada empresa (lidos uma vez por lote)
        const cfgs = new Map();
        const daEmpresa = async (emp) => {
            if (!cfgs.has(emp)) cfgs.set(emp, { wa: await configWhatsapp(conn, emp), nome: (await lerConfig(conn, 'empresa', emp)).nome_fantasia });
            return cfgs.get(emp);
        };
        for (const n of lote) {
            const pega = await conn.query(`UPDATE notificacoes SET status = 'enviando' WHERE id = ? AND status = 'pendente'`, [n.id]);
            if (!pega.affectedRows) continue;
            const alunos = JSON.parse(n.alunos || '[]');
            const dados = JSON.parse(n.dados || '{}');
            const emp = await daEmpresa(n.empresa_id);
            const texto = n.mensagem || renderizar(n.tipo, alunos, dados, emp.nome);
            if (!texto) { await conn.query(`UPDATE notificacoes SET status = 'cancelada' WHERE id = ?`, [n.id]); continue; }
            try {
                const r = await enviarTexto(emp.wa, n.telefone, texto, { tipo: n.tipo, alunos: alunos.map(a => a.nome) });
                await conn.query(`UPDATE notificacoes SET status = 'enviada', mensagem = ?, enviada_em = NOW(), provedor_id = ?, erro = NULL WHERE id = ?`, [texto, r.id, n.id]);
                // conversa: avisos automáticos ficam registrados no histórico do responsável
                if (n.tipo !== 'chat') {
                    await conn.query(`INSERT INTO mensagens (empresa_id, responsavel_id, telefone, direcao, canal, tipo, texto, notificacao_id, lida) VALUES (?, ?, ?, 'saida', 'whatsapp', ?, ?, ?, true)`,
                        [n.empresa_id, n.responsavel_id, n.telefone, n.tipo === 'resposta' ? 'resposta' : 'notificacao', texto, n.id]);
                }
            } catch (err) {
                const tent = n.tentativas + 1;
                const final = tent >= MAX_TENTATIVAS;
                await conn.query(
                    `UPDATE notificacoes SET status = ?, tentativas = ?, erro = ?, enviar_apos = NOW() + INTERVAL ? SECOND WHERE id = ?`,
                    [final ? 'erro' : 'pendente', tent, String(err.message).slice(0, 500), 30 * 2 ** tent, n.id]);
                console.warn(`[whatsapp] falha ao enviar notificação ${n.id} (tentativa ${tent}):`, err.message);
            }
        }
    } catch (err) {
        console.error('[notificacoes] erro na fila:', err.message);
    } finally {
        if (conn) conn.release();
        processando = false;
    }
}

export function iniciarFila(intervaloMs = Number(process.env.NOTIF_INTERVALO_MS || 5000)) {
    // devolve à fila o que ficou "enviando" se o servidor caiu no meio
    pool.query(`UPDATE notificacoes SET status = 'pendente' WHERE status = 'enviando'`).catch(() => {});
    return setInterval(processarFila, intervaloMs);
}
