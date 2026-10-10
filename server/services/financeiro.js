// Mensalidades: geração do mês, baixa com recibo, régua de cobrança no WhatsApp e suspensão por inadimplência.
import pool from '../db.js';
import { lerConfig } from './config.js';
import { proporcional } from './precos.js';
import { dadosCobranca, valorAtualizado, proximoRecibo } from './cobranca.js';
import { gerarPixCopiaCola } from './pix.js';
import { enfileirarTexto } from './notificacoes.js';
import { normalizarTelefone } from './whatsapp.js';
import { linkPortal } from './responsaveis.js';
import { hojeBR } from './viagens.js';
import { empresaId, comEmpresa } from '../lib/tenant.js';

/** Nome que assina as mensagens (nome fantasia da empresa atual). */
const nomeEmpresa = async (conn) => (await lerConfig(conn, 'empresa')).nome_fantasia;
export const BRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const DMY = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const DM = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '');

export function somarDias(iso, n) {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** Dia de vencimento dentro do mês (dia 31 em mês de 30 dias vira dia 30). */
export function vencimentoNoMes(anoMes, dia) {
    const [a, m] = anoMes.split('-').map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return `${anoMes}-${String(Math.min(Math.max(1, Number(dia) || 10), ultimo)).padStart(2, '0')}`;
}

/**
 * Cria as mensalidades do mês para os alunos ativos que ainda não têm.
 * Respeita o início do contrato (não cobra antes) e, se configurado, cobra proporcional no 1º mês.
 */
export async function gerarMensalidadesDoMes(conn, anoMes) {
    const precos = await lerConfig(conn, 'precos');
    const alunos = await conn.query(`
        SELECT a.id, a.valor_mensalidade, a.dia_vencimento, DATE_FORMAT(a.inicio_contrato, '%Y-%m-%d') AS inicio
        FROM alunos a
        WHERE a.empresa_id = ? AND a.status = 'Ativo' AND a.valor_mensalidade > 0
          AND NOT EXISTS (SELECT 1 FROM mensalidades m WHERE m.aluno_id = a.id AND DATE_FORMAT(m.data_vencimento, '%Y-%m') = ?)`, [empresaId(), anoMes]);
    let geradas = 0;
    for (const a of alunos) {
        if (a.inicio && a.inicio.slice(0, 7) > anoMes) continue; // contrato começa depois
        let valor = Number(a.valor_mensalidade);
        let descricao = null;
        if (a.inicio && a.inicio.slice(0, 7) === anoMes && precos.proporcional_entrada && a.inicio.slice(8) !== '01') {
            const p = proporcional(valor, a.inicio);
            valor = p.valor;
            descricao = `Proporcional: ${p.restantes} de ${p.dias} dias`;
        }
        if (valor <= 0) continue;
        await conn.query(`INSERT INTO mensalidades (empresa_id, aluno_id, valor, data_vencimento, status, descricao) VALUES (?, ?, ?, ?, 'Pendente', ?)`,
            [empresaId(), a.id, valor, vencimentoNoMes(anoMes, a.dia_vencimento), descricao]);
        geradas++;
    }
    return { geradas, ignoradas: alunos.length - geradas };
}

/** Pendente vencida vira Atrasado (e volta para Pendente se o vencimento foi adiado). */
export async function atualizarStatus(conn, hoje = hojeBR()) {
    await conn.query(`UPDATE mensalidades SET status = 'Atrasado' WHERE empresa_id = ? AND status = 'Pendente' AND data_vencimento < ?`, [empresaId(), hoje]);
    await conn.query(`UPDATE mensalidades SET status = 'Pendente' WHERE empresa_id = ? AND status = 'Atrasado' AND data_vencimento >= ?`, [empresaId(), hoje]);
}

/** Mês atual e, perto da virada, o próximo (para o lembrete antes do vencimento). */
export async function prepararMes(conn, hoje = hojeBR()) {
    await gerarMensalidadesDoMes(conn, hoje.slice(0, 7));
    const adiante = somarDias(hoje, 5).slice(0, 7);
    if (adiante !== hoje.slice(0, 7)) await gerarMensalidadesDoMes(conn, adiante);
    await atualizarStatus(conn, hoje);
}

// ---------------------------------------------------------------- pagamento

/** Dá baixa: guarda forma, valor, data e número de recibo. Avisa o responsável no WhatsApp. */
export async function registrarPagamento(conn, mensalidadeId, { valor, forma = 'pix', data, observacao = null, usuarioId = null, gateway = null, avisar = true }) {
    const [m] = await conn.query(`SELECT m.*, a.nome AS aluno_nome FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id WHERE m.id = ? AND m.empresa_id = ?`, [mensalidadeId, empresaId()]);
    if (!m) return null;
    if (m.status === 'Pago') return { ja_pago: true, recibo_numero: m.recibo_numero };
    if (m.status === 'Cancelado') throw Object.assign(new Error('Mensalidade cancelada.'), { status: 400 });
    const recibo = await proximoRecibo(conn);
    const quando = data || hojeBR();
    await conn.query(`
        UPDATE mensalidades SET status = 'Pago', data_pagamento = ?, pago_em = NOW(), valor_pago = ?, forma_pagamento = ?,
               recibo_numero = ?, observacao = COALESCE(?, observacao), registrado_por = ?, gateway = COALESCE(?, gateway)
        WHERE id = ? AND empresa_id = ? AND status <> 'Pago'`,
        [quando, valor ?? m.valor, forma, recibo, observacao, usuarioId, gateway, mensalidadeId, empresaId()]);
    if (avisar) await avisarPagamento(conn, mensalidadeId);
    return { recibo_numero: recibo };
}

async function destinatario(conn, alunoId) {
    const [r] = await conn.query(`
        SELECT a.responsavel_id, r.nome, r.whatsapp_ativo, COALESCE(r.telefone, a.responsavel_telefone) AS telefone
        FROM alunos a LEFT JOIN responsaveis r ON r.id = a.responsavel_id AND r.empresa_id = a.empresa_id WHERE a.id = ? AND a.empresa_id = ?`, [alunoId, empresaId()]);
    if (!r || (r.responsavel_id && !r.whatsapp_ativo)) return null;
    const tel = normalizarTelefone(r.telefone);
    return tel ? { telefone: tel, responsavel_id: r.responsavel_id || null, nome: r.nome } : null;
}

async function avisarPagamento(conn, mensalidadeId) {
    try {
        const [m] = await conn.query(`
            SELECT m.id, m.aluno_id, m.valor_pago, m.recibo_numero, DATE_FORMAT(m.data_vencimento,'%Y-%m-%d') AS venc, a.nome
            FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id WHERE m.id = ? AND m.empresa_id = ?`, [mensalidadeId, empresaId()]);
        const d = await destinatario(conn, m.aluno_id);
        if (!d) return;
        const link = d.responsavel_id ? await linkPortal(conn, d.responsavel_id) : null;
        const texto = `✅ Pagamento recebido: ${BRL(m.valor_pago)} — transporte de ${m.nome.split(' ')[0]} (${m.venc.slice(5, 7)}/${m.venc.slice(0, 4)}).\nRecibo nº ${m.recibo_numero}.${link ? `\nVer recibo: ${link}` : ''}\nObrigado!\n\n_${await nomeEmpresa(conn)}_`;
        await enfileirarTexto(conn, { telefone: d.telefone, responsavelId: d.responsavel_id, texto, tipo: 'pagamento' });
    } catch (err) {
        console.error('[financeiro] aviso de pagamento:', err.message);
    }
}

// ---------------------------------------------------------------- cobrança no WhatsApp

/** Mensalidades em aberto agrupadas por quem paga (um responsável pode ter vários filhos). */
async function abertasPorPagador(conn, filtroSql, params) {
    const rows = await conn.query(`
        SELECT m.id, m.aluno_id, m.valor, m.status, DATE_FORMAT(m.data_vencimento,'%Y-%m-%d') AS vencimento, m.gateway_id,
               a.nome AS aluno_nome, a.responsavel_id
        FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id
        WHERE m.empresa_id = ? AND m.status IN ('Pendente','Atrasado') AND ${filtroSql}
        ORDER BY m.data_vencimento, a.nome`, [empresaId(), ...params]);
    const grupos = new Map();
    for (const r of rows) {
        const k = r.responsavel_id ? `r${r.responsavel_id}` : `a${r.aluno_id}`;
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(r);
    }
    return [...grupos.values()];
}

/** Texto + Pix (separado, para copiar fácil) de um grupo de mensalidades de um mesmo pagador. */
async function montarCobranca(conn, itens, hoje, diasRelativo = null) {
    const cfg = await lerConfig(conn, 'cobranca');
    const linhas = [];
    let total = 0;
    const pixes = [];
    const links = [];
    for (const m of itens) {
        const atual = valorAtualizado({ ...m, vencimento: m.vencimento }, cfg, hoje);
        total += atual.valor;
        const comp = `${m.vencimento.slice(5, 7)}/${m.vencimento.slice(0, 4)}`;
        linhas.push(`• ${m.aluno_nome.split(' ')[0]} (${comp}) — venc. ${DM(m.vencimento)} — ${BRL(atual.valor)}${atual.dias_atraso ? ' c/ multa e juros' : ''}`);
        if (cfg.provedor === 'asaas') {
            try {
                const c = await dadosCobranca(conn, m.id, hoje);
                if (c?.pix_copia_cola) pixes.push(c.pix_copia_cola);
                if (c?.link_fatura) links.push(c.link_fatura);
            } catch (err) {
                console.warn('[cobranca] Asaas:', err.message);
            }
        }
    }
    total = Math.round(total * 100) / 100;
    if (cfg.provedor !== 'asaas') {
        try {
            const nomes = [...new Set(itens.map(i => i.aluno_nome.split(' ')[0]))].join(' ');
            pixes.push(gerarPixCopiaCola({
                chave: cfg.pix_chave, tipo: cfg.pix_tipo, nome: cfg.pix_nome, cidade: cfg.pix_cidade, valor: total,
                txid: `VC${itens.map(i => i.id).join('N')}`, descricao: nomes,
            }));
        } catch { /* chave Pix não configurada: vai só com o link do portal */ }
    }

    const venc = itens[0].vencimento;
    let abertura;
    if (diasRelativo === null || diasRelativo === undefined) abertura = itens.length > 1 ? '💳 Mensalidades do transporte em aberto:' : '💳 Mensalidade do transporte em aberto:';
    else if (diasRelativo < 0) abertura = `🔔 Lembrete: a mensalidade do transporte vence em ${-diasRelativo} dia${diasRelativo === -1 ? '' : 's'} (${DM(venc)}).`;
    else if (diasRelativo === 0) abertura = '🔔 A mensalidade do transporte vence *hoje*.';
    else abertura = `⚠️ A mensalidade do transporte venceu em ${DM(venc)} e ainda não identificamos o pagamento.`;

    return { abertura, linhas, total, pixes, links, cfg };
}

/**
 * Envia a cobrança de um grupo (mesmo pagador). Retorna quantas mensagens foram para a fila.
 * chaveDedupe evita mandar o mesmo passo da régua duas vezes.
 */
async function enviarCobrancaGrupo(conn, itens, hoje, { diasRelativo = null, chaveDedupe = null } = {}) {
    const d = await destinatario(conn, itens[0].aluno_id);
    if (!d) return 0;
    if (chaveDedupe) {
        const ja = await conn.query('SELECT 1 FROM notificacoes_registro WHERE chave = ?', [chaveDedupe]);
        if (ja.length) return 0;
    }
    const c = await montarCobranca(conn, itens, hoje, diasRelativo);
    const link = d.responsavel_id ? await linkPortal(conn, d.responsavel_id) : null;
    let texto = `${c.abertura}\n\n${c.linhas.join('\n')}`;
    if (itens.length > 1) texto += `\n*Total: ${BRL(c.total)}*`;
    if (c.pixes.length) texto += `\n\nPix copia e cola na${c.pixes.length > 1 ? 's' : ''} próxima${c.pixes.length > 1 ? 's' : ''} mensage${c.pixes.length > 1 ? 'ns' : 'm'} 👇`;
    if (c.links.length) texto += `\n\nBoleto/cartão: ${c.links.join('\n')}`;
    if (link) texto += `\n\nPagar ou ver recibos no portal: ${link}`;
    if (diasRelativo !== null && diasRelativo > 0) texto += '\n\nSe já pagou, pode desconsiderar — ou responda esta mensagem com o comprovante.';
    texto += `\n\n_${await nomeEmpresa(conn)}_`;
    const id = await enfileirarTexto(conn, { telefone: d.telefone, responsavelId: d.responsavel_id, texto, tipo: 'cobranca' });
    for (const p of c.pixes) await enfileirarTexto(conn, { telefone: d.telefone, responsavelId: d.responsavel_id, texto: p, tipo: 'cobranca', atrasoSeg: 2 });
    if (chaveDedupe) await conn.query('INSERT IGNORE INTO notificacoes_registro (chave, notificacao_id) VALUES (?, ?)', [chaveDedupe, id]);
    return 1 + c.pixes.length;
}

/** "Cobrar agora" do painel: tudo que está em aberto de um responsável (ou de um aluno sem responsável). */
export async function cobrarAgora(conn, { responsavelId = null, alunoId = null, mensalidadeId = null }, hoje = hojeBR()) {
    let filtro, params;
    if (mensalidadeId) { filtro = 'm.id = ?'; params = [mensalidadeId]; }
    else if (responsavelId) { filtro = 'a.responsavel_id = ?'; params = [responsavelId]; }
    else { filtro = 'a.id = ?'; params = [alunoId]; }
    const grupos = await abertasPorPagador(conn, filtro, params);
    let enviadas = 0;
    for (const g of grupos) enviadas += await enviarCobrancaGrupo(conn, g, hoje);
    return { enviadas, sem_whatsapp: grupos.length > 0 && enviadas === 0 };
}

/**
 * Régua do dia: para cada passo (ex.: -3, 0, 1, 5, 10 dias do vencimento), cobra quem está em aberto.
 * Irmãos do mesmo responsável vão numa mensagem só.
 */
export async function executarRegua(conn, hoje = hojeBR()) {
    const cfg = await lerConfig(conn, 'cobranca');
    await prepararMes(conn, hoje);
    if (!cfg.regua_ativa) return { enviadas: 0 };
    let enviadas = 0;
    const passos = [...new Set((cfg.regua || []).map(Number).filter(Number.isInteger))];
    for (const dias of passos) {
        const venc = somarDias(hoje, -dias);
        const grupos = await abertasPorPagador(conn, 'm.data_vencimento = ? AND a.suspenso = false', [venc]);
        for (const g of grupos) {
            const chave = `cobranca:${g.map(m => `m${m.id}`).join('')}:e${dias}`.slice(0, 120);
            enviadas += await enviarCobrancaGrupo(conn, g, hoje, { diasRelativo: dias, chaveDedupe: chave });
        }
    }
    return { enviadas };
}

const ultimoDiaRegua = new Map(); // empresa → dia em que a régua já rodou
let rodandoRegua = false;

/** Verifica a cada minuto; roda uma vez por dia a partir da hora configurada (horário de Brasília). */
export function iniciarRegua(intervaloMs = 60000) {
    const tick = async () => {
        if (rodandoRegua) return;
        rodandoRegua = true;
        let conn;
        try {
            conn = await pool.getConnection();
            const hoje = hojeBR();
            const horaBR = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()));
            const empresas = await conn.query('SELECT id FROM empresas WHERE ativo = 1');
            for (const e of empresas) {
                if (ultimoDiaRegua.get(e.id) === hoje) continue;
                await comEmpresa(e.id, async () => {
                    try {
                        const cfg = await lerConfig(conn, 'cobranca');
                        if (horaBR < Number(cfg.regua_hora ?? 9)) return;
                        const r = await executarRegua(conn, hoje);
                        ultimoDiaRegua.set(e.id, hoje);
                        if (r.enviadas) console.log(`[regua] empresa ${e.id}: ${r.enviadas} mensagem(ns) de cobrança na fila`);
                    } catch (err) {
                        console.error(`[regua] empresa ${e.id}:`, err.message);
                    }
                });
            }
        } catch (err) {
            console.error('[regua] erro:', err.message);
        } finally {
            if (conn) conn.release();
            rodandoRegua = false;
        }
    };
    setTimeout(tick, 5000);
    return setInterval(tick, intervaloMs);
}

// ---------------------------------------------------------------- inadimplência

export async function painelInadimplencia(conn, hoje = hojeBR()) {
    const cfg = await lerConfig(conn, 'cobranca');
    await atualizarStatus(conn, hoje);
    const rows = await conn.query(`
        SELECT m.id, m.aluno_id, m.valor, m.status, DATE_FORMAT(m.data_vencimento,'%Y-%m-%d') AS vencimento,
               a.nome AS aluno_nome, a.suspenso, a.suspensao_motivo, a.responsavel_id,
               r.nome AS responsavel_nome, COALESCE(r.telefone, a.responsavel_telefone) AS telefone
        FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id LEFT JOIN responsaveis r ON r.id = a.responsavel_id
        WHERE m.empresa_id = ? AND m.status = 'Atrasado' ORDER BY m.data_vencimento`, [empresaId()]);
    const grupos = new Map();
    for (const r of rows) {
        const k = r.responsavel_id ? `r${r.responsavel_id}` : `a${r.aluno_id}`;
        if (!grupos.has(k)) grupos.set(k, {
            chave: k, responsavel_id: r.responsavel_id, aluno_id: r.responsavel_id ? null : r.aluno_id,
            nome: r.responsavel_nome || `Responsável de ${r.aluno_nome}`, telefone: r.telefone, mensalidades: [], alunos: new Map(),
        });
        const g = grupos.get(k);
        const atual = valorAtualizado(r, cfg, hoje);
        g.mensalidades.push({ id: r.id, aluno_nome: r.aluno_nome, vencimento: r.vencimento, valor: Number(r.valor), valor_atualizado: atual.valor, dias_atraso: atual.dias_atraso });
        g.alunos.set(r.aluno_id, { id: r.aluno_id, nome: r.aluno_nome, suspenso: !!r.suspenso, motivo: r.suspensao_motivo });
    }
    const lista = [...grupos.values()].map(g => {
        const dias = Math.max(...g.mensalidades.map(m => m.dias_atraso));
        return {
            ...g, alunos: [...g.alunos.values()], dias_atraso: dias,
            total: Math.round(g.mensalidades.reduce((s, m) => s + m.valor, 0) * 100) / 100,
            total_atualizado: Math.round(g.mensalidades.reduce((s, m) => s + m.valor_atualizado, 0) * 100) / 100,
            critico: dias >= Number(cfg.dias_alerta_inadimplencia || 10),
        };
    }).sort((a, b) => b.dias_atraso - a.dias_atraso);
    // alunos suspensos sem dívida (já pagaram e falta reativar)
    const suspensos = await conn.query(`
        SELECT a.id, a.nome, a.suspensao_motivo, DATE_FORMAT(a.suspenso_em,'%Y-%m-%d') AS suspenso_em
        FROM alunos a WHERE a.empresa_id = ? AND a.suspenso = true
          AND NOT EXISTS (SELECT 1 FROM mensalidades m WHERE m.aluno_id = a.id AND m.status = 'Atrasado')`, [empresaId()]);
    return {
        resumo: {
            pagadores: lista.length,
            total: Math.round(lista.reduce((s, g) => s + g.total, 0) * 100) / 100,
            criticos: lista.filter(g => g.critico).length,
            suspensos: lista.reduce((s, g) => s + g.alunos.filter(a => a.suspenso).length, 0) + suspensos.length,
        },
        grupos: lista,
        suspensos_quitados: suspensos,
        dias_alerta: Number(cfg.dias_alerta_inadimplencia || 10),
    };
}

/** Suspende o transporte (decisão sempre manual). O aluno sai das viagens até ser reativado. */
export async function suspenderAluno(conn, alunoId, { motivo, avisar = true }) {
    const r = await conn.query('UPDATE alunos SET suspenso = true, suspensao_motivo = ?, suspenso_em = NOW() WHERE id = ? AND empresa_id = ? AND suspenso = false', [motivo, alunoId, empresaId()]);
    if (!r.affectedRows) return false;
    if (avisar) {
        const [a] = await conn.query('SELECT nome FROM alunos WHERE id = ?', [alunoId]);
        const d = await destinatario(conn, alunoId);
        if (d) {
            const texto = `⛔ O transporte de ${a.nome.split(' ')[0]} está suspenso a partir de agora.${motivo ? `\nMotivo: ${motivo}` : ''}\nPara regularizar, responda esta mensagem ou fale com a gente.\n\n_${await nomeEmpresa(conn)}_`;
            await enfileirarTexto(conn, { telefone: d.telefone, responsavelId: d.responsavel_id, texto, tipo: 'cobranca' });
        }
    }
    return true;
}

export async function reativarAluno(conn, alunoId, { avisar = true } = {}) {
    const r = await conn.query('UPDATE alunos SET suspenso = false, suspensao_motivo = NULL, suspenso_em = NULL WHERE id = ? AND empresa_id = ? AND suspenso = true', [alunoId, empresaId()]);
    if (!r.affectedRows) return false;
    if (avisar) {
        const [a] = await conn.query('SELECT nome FROM alunos WHERE id = ?', [alunoId]);
        const d = await destinatario(conn, alunoId);
        if (d) {
            const texto = `✅ O transporte de ${a.nome.split(' ')[0]} foi reativado. A van volta a passar normalmente.\n\n_${await nomeEmpresa(conn)}_`;
            await enfileirarTexto(conn, { telefone: d.telefone, responsavelId: d.responsavel_id, texto, tipo: 'cobranca' });
        }
    }
    return true;
}

export { DMY };
