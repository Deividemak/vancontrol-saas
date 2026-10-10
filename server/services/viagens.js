// Regras da execução diária das rotas (viagens): presença, eventos, ausências e calendário.
import { HttpError } from '../lib/http.js';
import { carregarContexto } from '../routes/rotas.js';
import { calcularRota } from './rotaEngine.js';
import { TIPOS_SEM_AULA } from '../routes/calendario.js';
import { empresaId } from '../lib/tenant.js';

export const STATUS_PRESENCA = ['previsto', 'ausente_avisado', 'embarcou', 'desembarcou', 'nao_compareceu'];

/** Data de hoje no fuso do Brasil (YYYY-MM-DD). */
export function hojeBR() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TZ_APP || 'America/Sao_Paulo' }).format(new Date());
}

/** Converte data/hora vinda do aparelho para DATETIME do MySQL (no fuso do Brasil). */
export function dataHora(v) {
    const d = v ? new Date(v) : new Date();
    const t = Number.isNaN(d.getTime()) ? new Date() : d;
    // aparelho com relógio muito adiantado: limita ao horário do servidor + 5 min
    const lim = new Date(Date.now() + 5 * 60000);
    const final = t > lim ? lim : t;
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: process.env.TZ_APP || 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(final).reduce((o, x) => ({ ...o, [x.type]: x.value }), {});
    return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}

/** Alunos ausentes numa data para o sentido da rota. */
export async function ausentesNoDia(conn, data, tipoRota) {
    const rows = await conn.query(
        `SELECT DISTINCT aluno_id FROM ausencias
         WHERE empresa_id = ? AND data_inicio <= ? AND data_fim >= ? AND (sentido = 'ambos' OR sentido = ?)`,
        [empresaId(), data, data, tipoRota === 'volta' ? 'volta' : 'ida']);
    return new Set(rows.map(r => r.aluno_id));
}

/** Situação do calendário no dia: fim de semana / escolas sem aula. */
export async function calendarioDoDia(conn, data) {
    const semana = new Date(`${data}T12:00:00Z`).getUTCDay();
    const eventos = await conn.query(
        `SELECT escola_id, tipo, descricao FROM calendario_eventos WHERE empresa_id = ? AND data_inicio <= ? AND data_fim >= ? AND tipo IN (?)`,
        [empresaId(), data, data, TIPOS_SEM_AULA]);
    const geral = eventos.find(e => !e.escola_id);
    return {
        fim_de_semana: semana === 0 || semana === 6,
        sem_aula_todas: semana === 0 || semana === 6 || !!geral,
        motivo: semana === 0 || semana === 6 ? 'Fim de semana' : geral?.descricao || null,
        escolas_sem_aula: new Set(eventos.filter(e => e.escola_id).map(e => e.escola_id)),
    };
}

/** Uma rota roda no dia se ao menos uma das escolas dela tem aula. */
export async function rotaTemAula(conn, rotaId, cal) {
    if (cal.sem_aula_todas) return false;
    const escolas = await conn.query(
        `SELECT DISTINCT a.escola_id FROM rota_alunos ra JOIN alunos a ON a.id = ra.aluno_id WHERE ra.rota_id = ? AND a.escola_id IS NOT NULL`, [rotaId]);
    if (!escolas.length) return true;
    return escolas.some(e => !cal.escolas_sem_aula.has(e.escola_id));
}

/** Cria a viagem do dia (ou devolve a existente) e a lista de presença. */
export async function iniciarViagem(conn, { rotaId, data, motoristaId, checklistId, usuarioId, lat, lng, registradoEm, uuid }) {
    const [rota] = await conn.query('SELECT id, tipo, veiculo_id, motorista_id, status FROM rotas WHERE id = ? AND empresa_id = ?', [rotaId, empresaId()]);
    if (!rota) throw new HttpError(404, 'Rota não encontrada.');
    if (rota.status !== 'Ativa') throw new HttpError(400, 'Esta rota está inativa.');

    const [existente] = await conn.query('SELECT * FROM viagens WHERE rota_id = ? AND data = ?', [rotaId, data]);
    if (existente) return existente.id;
    const { escalaDoDia } = await import('./escala.js');
    const esc = (await escalaDoDia(conn, data)).get(rotaId);

    await conn.beginTransaction();
    try {
        const r = await conn.query(
            `INSERT INTO viagens (empresa_id, rota_id, data, motorista_id, veiculo_id, monitor_id, substituicao_id, status, checklist_id, iniciada_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'em_andamento', ?, ?)`,
            [empresaId(), rotaId, data, motoristaId ?? esc?.motorista_id ?? rota.motorista_id, esc?.veiculo_id ?? rota.veiculo_id, esc?.monitor_id ?? null,
             esc?.substituicao_id ?? null, checklistId || null, dataHora(registradoEm)]);
        const viagemId = Number(r.insertId);

        // suspensos (ex.: inadimplência) ficam fora da viagem até serem reativados
        const alunos = await conn.query('SELECT ra.aluno_id FROM rota_alunos ra JOIN alunos a ON a.id = ra.aluno_id WHERE ra.rota_id = ? AND a.empresa_id = ? AND a.suspenso = false', [rotaId, empresaId()]);
        const ausentes = await ausentesNoDia(conn, data, rota.tipo);
        for (const a of alunos) {
            await conn.query('INSERT INTO presencas (viagem_id, aluno_id, status) VALUES (?, ?, ?)',
                [viagemId, a.aluno_id, ausentes.has(a.aluno_id) ? 'ausente_avisado' : 'previsto']);
        }
        await registrarEvento(conn, viagemId, { uuid, tipo: 'inicio', lat, lng, registrado_em: registradoEm, dados: checklistId ? { checklist_id: checklistId } : null }, usuarioId);
        await conn.commit();
        return viagemId;
    } catch (err) {
        await conn.rollback();
        // duas chamadas ao mesmo tempo (ex.: reenvio offline): a outra já criou
        if (err.code === 'ER_DUP_ENTRY') {
            const [v] = await conn.query('SELECT id FROM viagens WHERE rota_id = ? AND data = ?', [rotaId, data]);
            if (v) return v.id;
        }
        throw err;
    }
}

/** Insere um evento na trilha de auditoria. Retorna false se o uuid já foi recebido (reenvio offline). */
export async function registrarEvento(conn, viagemId, ev, usuarioId) {
    try {
        await conn.query(
            `INSERT INTO viagem_eventos (viagem_id, uuid, tipo, aluno_id, parada_seq, lat, lng, dados, usuario_id, registrado_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [viagemId, ev.uuid || null, ev.tipo, ev.aluno_id || null, ev.parada_seq ?? null,
             num(ev.lat), num(ev.lng), ev.dados ? JSON.stringify(ev.dados) : null, usuarioId || null, dataHora(ev.registrado_em)]);
        return true;
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return false;
        throw err;
    }
}

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

const TRANSICOES = {
    embarque: { de: ['previsto', 'nao_compareceu', 'ausente_avisado', 'embarcou'], para: 'embarcou' },
    desembarque: { de: ['embarcou', 'desembarcou'], para: 'desembarcou' },
    nao_compareceu: { de: ['previsto', 'nao_compareceu', 'ausente_avisado'], para: 'nao_compareceu' },
    desfazer: { de: STATUS_PRESENCA, para: null }, // volta ao estado anterior lógico
};

/**
 * Aplica um evento de presença. Eventos repetidos (mesmo uuid) são ignorados.
 * Retorna { aplicado, erro? }.
 */
export async function aplicarEventoPresenca(conn, viagemId, ev, usuarioId) {
    const t = TRANSICOES[ev.tipo];
    if (!t) return { aplicado: false, erro: 'tipo inválido' };
    const [p] = await conn.query('SELECT * FROM presencas WHERE viagem_id = ? AND aluno_id = ?', [viagemId, ev.aluno_id]);
    if (!p) return { aplicado: false, erro: 'aluno não está nesta viagem' };
    if (!t.de.includes(p.status)) return { aplicado: false, erro: `transição inválida (${p.status} → ${ev.tipo})` };

    const novo = await registrarEvento(conn, viagemId, ev, usuarioId);
    if (!novo) return { aplicado: false, duplicado: true };

    const quando = dataHora(ev.registrado_em);
    if (ev.tipo === 'embarque') {
        await conn.query('UPDATE presencas SET status = ?, embarque_em = ?, embarque_lat = ?, embarque_lng = ? WHERE viagem_id = ? AND aluno_id = ?',
            ['embarcou', quando, num(ev.lat), num(ev.lng), viagemId, ev.aluno_id]);
    } else if (ev.tipo === 'desembarque') {
        await conn.query('UPDATE presencas SET status = ?, desembarque_em = ?, desembarque_lat = ?, desembarque_lng = ? WHERE viagem_id = ? AND aluno_id = ?',
            ['desembarcou', quando, num(ev.lat), num(ev.lng), viagemId, ev.aluno_id]);
    } else if (ev.tipo === 'nao_compareceu') {
        await conn.query('UPDATE presencas SET status = ? WHERE viagem_id = ? AND aluno_id = ?', ['nao_compareceu', viagemId, ev.aluno_id]);
    } else if (ev.tipo === 'desfazer') {
        // desfaz o último passo: desceu -> embarcou; embarcou/não veio -> previsto
        const volta = p.status === 'desembarcou' ? 'embarcou' : 'previsto';
        if (volta === 'embarcou') await conn.query('UPDATE presencas SET status = ?, desembarque_em = NULL, desembarque_lat = NULL, desembarque_lng = NULL WHERE viagem_id = ? AND aluno_id = ?', [volta, viagemId, ev.aluno_id]);
        else await conn.query('UPDATE presencas SET status = ?, embarque_em = NULL, embarque_lat = NULL, embarque_lng = NULL WHERE viagem_id = ? AND aluno_id = ?', [volta, viagemId, ev.aluno_id]);
    }
    return { aplicado: true };
}

/** Atualiza presenças "previsto" que receberam ausência depois do início da viagem. */
export async function sincronizarAusencias(conn, viagem, tipoRota) {
    const ausentes = await ausentesNoDia(conn, viagem.data_str || viagem.data, tipoRota);
    if (!ausentes.size) return;
    await conn.query(`UPDATE presencas SET status = 'ausente_avisado' WHERE viagem_id = ? AND status = 'previsto' AND aluno_id IN (?)`,
        [viagem.id, [...ausentes]]);
}

/** Paradas do dia (sem os ausentes) com horários previstos. */
export async function paradasDoDia(conn, rotaId, idsFora) {
    const ctx = await carregarContexto(conn, rotaId);
    ctx.alunos = ctx.alunos.filter(a => !idsFora.has(a.aluno_id) && !a.suspenso);
    const escolasUsadas = new Set(ctx.alunos.map(a => a.escola_id));
    ctx.escolas = ctx.escolas.filter(e => escolasUsadas.has(e.escola_id));
    const r = await calcularRota(ctx);
    return { ctx, calculo: r };
}

/** Detalhe completo de uma viagem (usado pelo app do motorista e pelo painel). */
export async function detalheViagem(conn, viagemId, { incluirSaude = true, incluirTrilha = false } = {}) {
    const [v] = await conn.query(`
        SELECT v.*, DATE_FORMAT(v.data, '%Y-%m-%d') AS data_str,
               DATE_FORMAT(v.iniciada_em, '%Y-%m-%dT%H:%i:%s') AS iniciada_em_str,
               DATE_FORMAT(v.concluida_em, '%Y-%m-%dT%H:%i:%s') AS concluida_em_str,
               DATE_FORMAT(v.ultima_posicao_em, '%Y-%m-%dT%H:%i:%s') AS ultima_posicao_em_str,
               r.nome AS rota_nome, r.tipo AS rota_tipo, r.periodo, TIME_FORMAT(r.hora_saida, '%H:%i') AS hora_saida,
               f.placa, f.modelo, m.nome AS motorista_nome, m.telefone AS motorista_telefone
        FROM viagens v
        JOIN rotas r ON r.id = v.rota_id
        LEFT JOIN frota f ON f.id = v.veiculo_id AND f.empresa_id = v.empresa_id
        LEFT JOIN motoristas m ON m.id = v.motorista_id AND m.empresa_id = v.empresa_id
        WHERE v.id = ? AND v.empresa_id = ?`, [viagemId, empresaId()]);
    if (!v) throw new HttpError(404, 'Viagem não encontrada.');

    if (v.status === 'em_andamento') await sincronizarAusencias(conn, v, v.rota_tipo);

    const presencas = (await conn.query(`
        SELECT p.aluno_id, p.status,
               DATE_FORMAT(p.embarque_em, '%H:%i') AS embarque_hora, DATE_FORMAT(p.desembarque_em, '%H:%i') AS desembarque_hora,
               a.nome, a.foto_thumb, a.turno, e.nome AS escola_nome,
               ${incluirSaude ? 'a.alergias, a.condicoes_medicas, a.medicamentos, a.necessidades_especiais, a.tipo_sanguineo,' : ''}
               COALESCE(r.nome, NULL) AS responsavel_nome, COALESCE(r.telefone, a.responsavel_telefone) AS responsavel_telefone
        FROM presencas p
        JOIN alunos a ON a.id = p.aluno_id
        LEFT JOIN escolas e ON e.id = a.escola_id AND e.empresa_id = a.empresa_id
        LEFT JOIN responsaveis r ON r.id = a.responsavel_id AND r.empresa_id = a.empresa_id
        WHERE p.viagem_id = ?
        ORDER BY a.nome`, [viagemId])).map(p => ({ ...p }));

    if (incluirSaude && presencas.length) {
        const contatos = await conn.query(
            'SELECT aluno_id, nome, parentesco, telefone FROM aluno_contatos_emergencia WHERE aluno_id IN (?) ORDER BY ordem', [presencas.map(p => p.aluno_id)]);
        for (const p of presencas) p.contatos_emergencia = contatos.filter(c => c.aluno_id === p.aluno_id).map(({ aluno_id, ...c }) => c);
        const aut = await conn.query(`
            SELECT aluno_id, nome, parentesco, telefone, documento, DATE_FORMAT(valido_ate,'%Y-%m-%d') AS valido_ate
            FROM autorizados_retirada WHERE ativo = true AND (valido_ate IS NULL OR valido_ate >= ?) AND aluno_id IN (?) ORDER BY nome`,
            [v.data_str, presencas.map(p => p.aluno_id)]);
        for (const p of presencas) p.autorizados = aut.filter(a => a.aluno_id === p.aluno_id).map(({ aluno_id, ...a }) => a);
    }

    const fora = new Set(presencas.filter(p => p.status === 'ausente_avisado').map(p => p.aluno_id));
    // alunos que não estão mais na rota (removidos depois do início) também saem das paradas
    const { calculo } = await paradasDoDia(conn, v.rota_id, fora);

    const chegadas = await conn.query(`SELECT DISTINCT parada_seq FROM viagem_eventos WHERE viagem_id = ? AND tipo = 'chegada_parada'`, [viagemId]);
    const ocorrencias = await conn.query(`
        SELECT o.id, o.uuid, o.tipo, o.gravidade, o.descricao, o.aluno_id, a.nome AS aluno_nome, o.status, o.resolucao,
               (o.foto IS NOT NULL) AS tem_foto, o.lat, o.lng,
               DATE_FORMAT(o.registrado_em, '%Y-%m-%dT%H:%i:%s') AS registrado_em
        FROM ocorrencias o LEFT JOIN alunos a ON a.id = o.aluno_id
        WHERE o.viagem_id = ? AND o.empresa_id = ? ORDER BY o.registrado_em DESC`, [viagemId, empresaId()]);

    const out = {
        viagem: {
            id: v.id, rota_id: v.rota_id, data: v.data_str, status: v.status,
            rota_nome: v.rota_nome, rota_tipo: v.rota_tipo, periodo: v.periodo, hora_saida: v.hora_saida,
            placa: v.placa, modelo: v.modelo, motorista_nome: v.motorista_nome, motorista_telefone: v.motorista_telefone,
            iniciada_em: v.iniciada_em_str, concluida_em: v.concluida_em_str, varredura_em: v.varredura_em,
            ultima_posicao: v.ultima_lat !== null ? { lat: Number(v.ultima_lat), lng: Number(v.ultima_lng), velocidade: v.ultima_velocidade === null ? null : Number(v.ultima_velocidade), em: v.ultima_posicao_em_str } : null,
        },
        presencas,
        paradas: calculo.paradas,
        geometria: calculo.geometria,
        paradas_com_chegada: chegadas.map(c => c.parada_seq),
        ocorrencias: ocorrencias.map(o => ({ ...o, tem_foto: !!Number(o.tem_foto), lat: o.lat === null ? null : Number(o.lat), lng: o.lng === null ? null : Number(o.lng) })),
        resumo: contarPresencas(presencas),
    };

    if (incluirTrilha) {
        out.eventos = (await conn.query(`
            SELECT ev.id, ev.tipo, ev.aluno_id, a.nome AS aluno_nome, ev.parada_seq, ev.lat, ev.lng, ev.dados,
                   DATE_FORMAT(ev.registrado_em, '%Y-%m-%dT%H:%i:%s') AS registrado_em,
                   DATE_FORMAT(ev.recebido_em, '%Y-%m-%dT%H:%i:%s') AS recebido_em,
                   u.nome AS usuario_nome
            FROM viagem_eventos ev LEFT JOIN alunos a ON a.id = ev.aluno_id LEFT JOIN usuarios u ON u.id = ev.usuario_id
            WHERE ev.viagem_id = ? ORDER BY ev.registrado_em, ev.id`, [viagemId]))
            .map(e => ({ ...e, lat: e.lat === null ? null : Number(e.lat), lng: e.lng === null ? null : Number(e.lng), dados: e.dados ? JSON.parse(e.dados) : null }));
        out.trilha = (await conn.query('SELECT lat, lng FROM viagem_posicoes WHERE viagem_id = ? ORDER BY registrado_em', [viagemId]))
            .map(p => [Number(p.lat), Number(p.lng)]);
    }
    return out;
}

export function contarPresencas(presencas) {
    const c = { total: presencas.length, previsto: 0, ausente_avisado: 0, embarcou: 0, desembarcou: 0, nao_compareceu: 0 };
    for (const p of presencas) c[p.status] = (c[p.status] || 0) + 1;
    return c;
}
