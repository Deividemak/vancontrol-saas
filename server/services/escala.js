// Escala efetiva do dia: motorista/veículo/monitor de cada rota, já com as substituições.
import { enfileirarTexto } from './notificacoes.js';
import { normalizarTelefone } from './whatsapp.js';
import { horaParaSeg } from '../lib/geo-math.js';
import { empresaId } from '../lib/tenant.js';
import { lerConfig } from './config.js';

const DM = (iso) => iso.split('-').reverse().slice(0, 2).join('/');

/** Map rota_id → { motorista_id, veiculo_id, monitor_id, substituicao_id, trocado: {motorista, veiculo, monitor} } */
export async function escalaDoDia(conn, data) {
    const emp = empresaId();
    const rotas = await conn.query(`SELECT id, motorista_id, veiculo_id, monitor_id FROM rotas WHERE status = 'Ativa' AND empresa_id = ?`, [emp]);
    const subs = await conn.query(`
        SELECT id, rota_id, motorista_id, veiculo_id, monitor_id FROM substituicoes
        WHERE empresa_id = ? AND cancelada_em IS NULL AND data_inicio <= ? AND data_fim >= ? ORDER BY id`, [emp, data, data]);
    const mapa = new Map();
    for (const r of rotas) {
        mapa.set(r.id, { motorista_id: r.motorista_id, veiculo_id: r.veiculo_id, monitor_id: r.monitor_id ?? null, substituicao_id: null, trocado: { motorista: false, veiculo: false, monitor: false } });
    }
    for (const s of subs) {
        const e = mapa.get(s.rota_id);
        if (!e) continue;
        e.substituicao_id = s.id;
        if (s.motorista_id) { e.trocado.motorista = s.motorista_id !== e.motorista_id; e.motorista_id = s.motorista_id; }
        if (s.veiculo_id) { e.trocado.veiculo = s.veiculo_id !== e.veiculo_id; e.veiculo_id = s.veiculo_id; }
        if (s.monitor_id) { e.trocado.monitor = s.monitor_id !== e.monitor_id; e.monitor_id = s.monitor_id; }
    }
    return mapa;
}

function datas(inicio, fim) {
    const out = [];
    for (let d = new Date(`${inicio}T12:00:00Z`); d <= new Date(`${fim}T12:00:00Z`) && out.length < 62; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
    return out;
}

/** Conflitos: o motorista/veículo novo já está em outra rota com horário que se sobrepõe, em algum dia do período. */
export async function conflitos(conn, { rotaIds, inicio, fim, motoristaId, veiculoId }) {
    if (!motoristaId && !veiculoId) return [];
    const rotas = await conn.query(`SELECT id, nome, TIME_FORMAT(hora_saida,'%H:%i') AS saida, TIME_FORMAT(hora_fim,'%H:%i') AS fim FROM rotas WHERE status = 'Ativa' AND empresa_id = ?`, [empresaId()]);
    const porId = new Map(rotas.map(r => [r.id, r]));
    const janela = (r) => (r?.saida ? [horaParaSeg(r.saida), horaParaSeg(r.fim || r.saida) + 600] : null);
    const out = [];
    for (const dia of datas(inicio, fim)) {
        const esc = await escalaDoDia(conn, dia);
        for (const rid of rotaIds) {
            const j1 = janela(porId.get(rid));
            for (const [outra, e] of esc) {
                if (rotaIds.includes(outra)) continue;
                const mesmo = (motoristaId && e.motorista_id === motoristaId) ? 'motorista' : (veiculoId && e.veiculo_id === veiculoId) ? 'veículo' : null;
                if (!mesmo) continue;
                const j2 = janela(porId.get(outra));
                if (j1 && j2 && (j1[1] <= j2[0] || j2[1] <= j1[0])) continue; // horários não se cruzam
                const txt = `${DM(dia)}: ${mesmo} já está na rota ${porId.get(outra)?.nome}`;
                if (!out.includes(txt)) out.push(txt);
            }
        }
        if (out.length > 10) break;
    }
    return out;
}

/** Avisa os responsáveis dos alunos das rotas trocadas (irmãos numa mensagem só). */
export async function avisarSubstituicao(conn, subIds) {
    const subs = await conn.query(`
        SELECT s.id, s.rota_id, DATE_FORMAT(s.data_inicio,'%Y-%m-%d') AS inicio, DATE_FORMAT(s.data_fim,'%Y-%m-%d') AS fim,
               f.placa, f.modelo, m.nome AS motorista_nome, mo.nome AS monitor_nome, r.nome AS rota_nome
        FROM substituicoes s JOIN rotas r ON r.id = s.rota_id
        LEFT JOIN frota f ON f.id = s.veiculo_id LEFT JOIN motoristas m ON m.id = s.motorista_id LEFT JOIN monitores mo ON mo.id = s.monitor_id
        WHERE s.id IN (?) AND s.empresa_id = ?`, [subIds, empresaId()]);
    if (!subs.length) return 0;
    const alunos = await conn.query(`
        SELECT DISTINCT a.id, a.nome, a.responsavel_id, r.whatsapp_ativo, COALESCE(r.telefone, a.responsavel_telefone) AS telefone
        FROM rota_alunos ra JOIN alunos a ON a.id = ra.aluno_id AND a.status = 'Ativo' AND a.suspenso = false
        LEFT JOIN responsaveis r ON r.id = a.responsavel_id AND r.empresa_id = a.empresa_id
        WHERE ra.rota_id IN (?) AND a.empresa_id = ?`, [subs.map(s => s.rota_id), empresaId()]);
    const s = subs[0];
    const quando = s.inicio === s.fim ? `em ${DM(s.inicio)}` : `de ${DM(s.inicio)} a ${DM(s.fim)}`;
    const partes = [];
    if (s.placa) partes.push(`van placa *${s.placa}*${s.modelo ? ` (${s.modelo})` : ''}`);
    if (s.motorista_nome) partes.push(`motorista *${s.motorista_nome}*`);
    if (s.monitor_nome) partes.push(`monitor(a) *${s.monitor_nome}*`);
    const grupos = new Map();
    for (const a of alunos) {
        if (a.responsavel_id && !a.whatsapp_ativo) continue;
        const tel = normalizarTelefone(a.telefone);
        if (!tel) continue;
        if (!grupos.has(tel)) grupos.set(tel, { responsavel_id: a.responsavel_id, nomes: [] });
        grupos.get(tel).nomes.push(a.nome.split(' ')[0]);
    }
    let n = 0;
    const empresa = (await lerConfig(conn, 'empresa')).nome_fantasia;
    for (const [tel, g] of grupos) {
        const nomes = g.nomes.length > 1 ? `${g.nomes.slice(0, -1).join(', ')} e ${g.nomes.at(-1)}` : g.nomes[0];
        const texto = `🔄 Aviso: ${quando} o transporte de ${nomes} será feito pela ${partes.join(', ')}. Horários e pontos continuam os mesmos.\n\n_${empresa}_`;
        await enfileirarTexto(conn, { telefone: tel, responsavelId: g.responsavel_id, texto, tipo: 'aviso' });
        n++;
    }
    await conn.query('UPDATE substituicoes SET avisado_em = NOW() WHERE id IN (?) AND empresa_id = ?', [subIds, empresaId()]);
    return n;
}
