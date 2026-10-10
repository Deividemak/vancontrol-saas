// Alertas de anomalia da operação: van parada fora do ponto, sem sinal, fora do trajeto, velocidade e rota não encerrada.
import pool from '../db.js';
import { lerConfig } from './config.js';
import { hojeBR, dataHora, paradasDoDia } from './viagens.js';
import { haversine, horaParaSeg } from '../lib/geo-math.js';
import { enfileirarTexto } from './notificacoes.js';
import { urlBase } from './responsaveis.js';
import { avisarDocumentos } from './documentos.js';
import { empresaId, comEmpresa } from '../lib/tenant.js';

const seg = (s) => Date.parse(`${String(s).replace(' ', 'T')}Z`) / 1000; // DATETIME local → segundos (só para diferenças)
const HHMM = (s) => String(s).slice(11, 16);

/** Distância (m) de um ponto até uma linha [[lat,lng],...]. */
export function distanciaAteLinha(p, linha) {
    if (!linha?.length) return null;
    if (linha.length === 1) return haversine(p, { lat: linha[0][0], lng: linha[0][1] });
    const kx = 111320 * Math.cos((p.lat * Math.PI) / 180), ky = 110540;
    let min = Infinity;
    for (let i = 0; i < linha.length - 1; i++) {
        const ax = (linha[i][1] - p.lng) * kx, ay = (linha[i][0] - p.lat) * ky;
        const bx = (linha[i + 1][1] - p.lng) * kx, by = (linha[i + 1][0] - p.lat) * ky;
        const dx = bx - ax, dy = by - ay;
        const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
        min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return min;
}

const cachePlano = new Map(); // viagem → { em, paradas, geometria }
async function planoDaViagem(conn, v) {
    const c = cachePlano.get(v.id);
    if (c && Date.now() - c.em < 10 * 60000) return c;
    const pres = await conn.query(`SELECT aluno_id, status FROM presencas WHERE viagem_id = ?`, [v.id]);
    const fora = new Set(pres.filter(p => p.status === 'ausente_avisado').map(p => p.aluno_id));
    const { calculo } = await paradasDoDia(conn, v.rota_id, fora);
    const plano = {
        em: Date.now(),
        pontos: calculo.paradas.filter(p => p.lat != null).map(p => ({ lat: Number(p.lat), lng: Number(p.lng) })),
        geometria: calculo.geometria || [],
    };
    cachePlano.set(v.id, plano);
    return plano;
}

/** Cria/atualiza/reabre um alerta. Devolve true se é novo (para avisar). */
async function registrar(conn, a, agoraStr) {
    const [ex] = await conn.query('SELECT id, resolvido_em FROM alertas_operacao WHERE chave = ?', [a.chave]);
    if (!ex) {
        await conn.query(`INSERT INTO alertas_operacao (empresa_id, chave, viagem_id, rota_id, tipo, nivel, mensagem, lat, lng, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [empresaId(), a.chave, a.viagem_id, a.rota_id, a.tipo, a.nivel, a.mensagem.slice(0, 255), a.lat ?? null, a.lng ?? null, agoraStr, agoraStr]);
        return true;
    }
    if (ex.resolvido_em) {
        // voltou a acontecer depois de resolvido automaticamente: reabre
        await conn.query(`UPDATE alertas_operacao SET resolvido_em = NULL, resolvido_por = NULL, nivel = ?, mensagem = ?, lat = ?, lng = ?, criado_em = ?, atualizado_em = ? WHERE id = ?`,
            [a.nivel, a.mensagem.slice(0, 255), a.lat ?? null, a.lng ?? null, agoraStr, agoraStr, ex.id]);
        return true;
    }
    await conn.query(`UPDATE alertas_operacao SET nivel = ?, mensagem = ?, lat = ?, lng = ?, atualizado_em = ? WHERE id = ?`,
        [a.nivel, a.mensagem.slice(0, 255), a.lat ?? null, a.lng ?? null, agoraStr, ex.id]);
    return false;
}

async function resolverAuto(conn, chave, agoraStr) {
    await conn.query(`UPDATE alertas_operacao SET resolvido_em = ?, resolvido_por = 'automático' WHERE chave = ? AND resolvido_em IS NULL`, [agoraStr, chave]);
}

/**
 * Verifica todas as viagens em andamento. Pode ser chamada a qualquer momento (roda a cada minuto).
 * Retorna os alertas novos.
 */
export async function verificarAnomalias(conn, agora = new Date()) {
    const cfg = await lerConfig(conn, 'operacao');
    const agoraStr = dataHora(agora);
    const agoraS = seg(agoraStr);
    const hoje = hojeBR();
    const novos = [];

    // viagens já encerradas: fecha o que ficou aberto (menos velocidade, que fica para conferência)
    await conn.query(`
        UPDATE alertas_operacao a JOIN viagens v ON v.id = a.viagem_id
        SET a.resolvido_em = ?, a.resolvido_por = 'automático'
        WHERE a.empresa_id = ? AND a.resolvido_em IS NULL AND v.status <> 'em_andamento' AND a.tipo <> 'velocidade'`, [agoraStr, empresaId()]);

    const viagens = await conn.query(`
        SELECT v.id, v.rota_id, DATE_FORMAT(v.data,'%Y-%m-%d') AS data, DATE_FORMAT(v.iniciada_em,'%Y-%m-%d %H:%i:%s') AS iniciada,
               v.ultima_lat, v.ultima_lng, DATE_FORMAT(v.ultima_posicao_em,'%Y-%m-%d %H:%i:%s') AS ultima,
               r.nome AS rota_nome, TIME_FORMAT(r.hora_fim,'%H:%i') AS hora_fim, f.placa, m.nome AS motorista_nome,
               r.tipo AS rota_tipo, r.periodo, r.velocidade_media_kmh, r.tempo_parada_seg
        FROM viagens v JOIN rotas r ON r.id = v.rota_id LEFT JOIN frota f ON f.id = v.veiculo_id LEFT JOIN motoristas m ON m.id = v.motorista_id
        WHERE v.status = 'em_andamento' AND v.empresa_id = ?`, [empresaId()]);

    for (const v of viagens) {
        const base = { viagem_id: v.id, rota_id: v.rota_id };
        const quem = `${v.rota_nome}${v.placa ? ` · ${v.placa}` : ''}${v.motorista_nome ? ` · ${v.motorista_nome}` : ''}`;
        const alertar = async (a) => { if (await registrar(conn, { ...base, ...a }, agoraStr)) novos.push({ ...a, quem }); };

        // 1) rota não encerrada
        const chaveFim = `nao_encerrada:v${v.id}`;
        const fimS = v.hora_fim ? seg(`${v.data} ${v.hora_fim}:00`) : null;
        if (v.data < hoje) {
            await alertar({ chave: chaveFim, tipo: 'nao_encerrada', nivel: 'critico', mensagem: `Viagem de ${v.data.split('-').reverse().join('/')} não foi encerrada. Confira se não ficou criança na van.` });
        } else if (fimS && agoraS > fimS + Number(cfg.fim_atrasado_min) * 60) {
            await alertar({ chave: chaveFim, tipo: 'nao_encerrada', nivel: 'critico', mensagem: `Passou do fim previsto (${v.hora_fim}) e a viagem não foi encerrada. Confira se não ficou criança na van.` });
        }

        // 2) sem sinal
        const ref = v.ultima || v.iniciada;
        const semSinalMin = ref ? Math.round((agoraS - seg(ref)) / 60) : 0;
        const chaveSinal = `sem_sinal:v${v.id}`;
        if (ref && semSinalMin > Number(cfg.sem_sinal_min)) {
            await alertar({ chave: chaveSinal, tipo: 'sem_sinal', nivel: semSinalMin > 3 * cfg.sem_sinal_min ? 'critico' : 'aviso',
                mensagem: `Sem posição do celular do motorista há ${semSinalMin} min${v.ultima ? ` (última às ${HHMM(v.ultima)})` : ''}.`, lat: v.ultima_lat, lng: v.ultima_lng });
        } else {
            await resolverAuto(conn, chaveSinal, agoraStr);
        }
        if (!v.ultima || semSinalMin > Number(cfg.sem_sinal_min)) continue; // sem posição recente não dá para avaliar o resto

        const pos = (await conn.query(`
            SELECT lat, lng, precisao_m, velocidade_kmh, DATE_FORMAT(registrado_em,'%Y-%m-%d %H:%i:%s') AS em
            FROM viagem_posicoes WHERE viagem_id = ? AND registrado_em >= ? ORDER BY registrado_em`,
            [v.id, dataHora(new Date(agora.getTime() - 60 * 60000))])).map(p => ({ lat: Number(p.lat), lng: Number(p.lng), prec: p.precisao_m, vel: p.velocidade_kmh === null ? null : Number(p.velocidade_kmh), s: seg(p.em) }));
        if (!pos.length) continue;
        const ult = pos[pos.length - 1];
        let plano = null;
        try { plano = await planoDaViagem(conn, v); } catch (err) { console.warn('[monitor] plano:', err.message); }

        // 3) parada fora de ponto
        let i = pos.length - 1;
        while (i > 0 && haversine(pos[i - 1], ult) <= 60) i--;
        const paradoMin = Math.round((ult.s - pos[i].s) / 60) + Math.round((agoraS - ult.s) / 60);
        const pertoDePonto = plano?.pontos.some(p => haversine(p, ult) <= 150);
        const chaveParada = `parada:v${v.id}`;
        if (paradoMin >= Number(cfg.parada_min) && !pertoDePonto) {
            await alertar({ chave: chaveParada, tipo: 'parada', nivel: paradoMin >= 2 * cfg.parada_min ? 'critico' : 'aviso',
                mensagem: `Van parada há ${paradoMin} min fora dos pontos da rota.`, lat: ult.lat, lng: ult.lng });
        } else {
            await resolverAuto(conn, chaveParada, agoraStr);
        }

        // 4) fora do trajeto previsto
        const chaveDesvio = `desvio:v${v.id}`;
        const dist = plano && (ult.prec == null || ult.prec <= 100) ? distanciaAteLinha(ult, plano.geometria) : null;
        if (dist !== null && dist > Number(cfg.desvio_m)) {
            await alertar({ chave: chaveDesvio, tipo: 'desvio', nivel: dist > 3 * cfg.desvio_m ? 'critico' : 'aviso',
                mensagem: `Van fora do trajeto previsto (a ${dist >= 1000 ? `${(dist / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(dist)} m`} do caminho).`, lat: ult.lat, lng: ult.lng });
        } else if (dist !== null) {
            await resolverAuto(conn, chaveDesvio, agoraStr);
        }

        // 6) previsão de atraso na escola (ida): posição atual + paradas que faltam x horário de entrada
        if (v.rota_tipo === 'ida' && v.data === hoje) {
            const chaveAtraso = `atraso_previsto:v${v.id}`;
            const escolas = await conn.query(`
                SELECT e.nome, e.lat, e.lng, MIN(TIME_FORMAT(h.entrada,'%H:%i')) AS entrada
                FROM rota_escolas re JOIN escolas e ON e.id = re.escola_id JOIN escola_horarios h ON h.escola_id = e.id AND h.turno = ?
                WHERE re.rota_id = ? AND e.lat IS NOT NULL AND h.entrada IS NOT NULL GROUP BY e.id, e.nome, e.lat, e.lng ORDER BY entrada LIMIT 1`, [v.periodo, v.rota_id]);
            const [{ faltam }] = await conn.query(`SELECT COUNT(*) faltam FROM presencas WHERE viagem_id = ? AND status = 'previsto'`, [v.id]);
            const e = escolas[0];
            if (e) {
                const vel = Number(v.velocidade_media_kmh) || 25;
                const resta = (haversine(ult, { lat: Number(e.lat), lng: Number(e.lng) }) * 1.35) / (vel / 3.6) + Number(faltam) * (Number(v.tempo_parada_seg) || 60);
                const chegada = agoraS + resta;
                const entrada = seg(`${v.data} ${e.entrada}:00`);
                const minutos = Math.round((chegada - entrada) / 60);
                if (minutos >= 3) {
                    await alertar({ chave: chaveAtraso, tipo: 'atraso_previsto', nivel: minutos >= 15 ? 'critico' : 'aviso',
                        mensagem: `Previsão de chegar na ${e.nome} às ${HHMM(dataHora(new Date(Date.now() + resta * 1000)))}, ${minutos} min depois da entrada (${e.entrada}).`, lat: ult.lat, lng: ult.lng });
                } else {
                    await resolverAuto(conn, chaveAtraso, agoraStr);
                }
            }
        }

        // 5) velocidade (últimos 3 min): velocidade do GPS ou calculada entre pontos
        const max = Number(cfg.velocidade_max_kmh);
        let pico = 0, onde = null;
        for (let k = 0; k < pos.length; k++) {
            const p = pos[k];
            if (p.s < agoraS - 180) continue;
            let vel = p.vel;
            if (vel == null && k > 0 && p.s - pos[k - 1].s >= 10 && (p.prec == null || p.prec <= 50)) vel = (haversine(pos[k - 1], p) / (p.s - pos[k - 1].s)) * 3.6;
            if (vel != null && vel > pico) { pico = vel; onde = p; }
        }
        if (pico > max) {
            await alertar({ chave: `velocidade:v${v.id}`, tipo: 'velocidade', nivel: pico > max + 20 ? 'critico' : 'aviso',
                mensagem: `Velocidade de ${Math.round(pico)} km/h (limite ${max} km/h).`, lat: onde.lat, lng: onde.lng });
        }
    }

    // aviso no WhatsApp do gestor
    const tel = cfg.telefone_alertas;
    if (tel && novos.length) {
        for (const a of novos.filter(a => a.tipo !== 'sem_sinal' || a.nivel === 'critico')) {
            const icone = a.nivel === 'critico' ? '🚨' : '⚠️';
            await enfileirarTexto(conn, { telefone: tel, texto: `${icone} ${a.quem}\n${a.mensagem}\n\nAcompanhe: ${urlBase()}`, tipo: 'alerta' });
        }
    }
    return novos;
}

let rodando = false;
export function iniciarMonitor(intervaloMs = 60000) {
    const tick = async () => {
        if (rodando) return;
        rodando = true;
        let conn;
        try {
            conn = await pool.getConnection();
            const horaBR = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()));
            const empresas = await conn.query('SELECT id FROM empresas WHERE ativo = 1');
            for (const e of empresas) {
                await comEmpresa(e.id, async () => {
                    try {
                        await verificarAnomalias(conn);
                        if (horaBR >= 8) await avisarDocumentos(conn);
                    } catch (err) {
                        console.error(`[monitor] empresa ${e.id}:`, err.message);
                    }
                });
            }
        } catch (err) {
            console.error('[monitor] erro:', err.message);
        } finally {
            if (conn) conn.release();
            rodando = false;
        }
    };
    setTimeout(tick, 8000);
    return setInterval(tick, intervaloMs);
}

/** Resumo das viagens em andamento para o mapa da frota. */
export async function frotaAoVivo(conn) {
    const cfg = await lerConfig(conn, 'operacao');
    const agoraS = seg(dataHora());
    const viagens = await conn.query(`
        SELECT v.id, v.rota_id, v.status, DATE_FORMAT(v.data,'%Y-%m-%d') AS data, r.nome AS rota_nome, r.tipo, TIME_FORMAT(r.hora_fim,'%H:%i') AS hora_fim,
               f.placa, f.modelo, m.nome AS motorista_nome, m.telefone AS motorista_telefone, mo.nome AS monitor_nome,
               v.ultima_lat, v.ultima_lng, v.ultima_velocidade, DATE_FORMAT(v.ultima_posicao_em,'%Y-%m-%d %H:%i:%s') AS ultima,
               (SELECT COUNT(*) FROM presencas p WHERE p.viagem_id = v.id AND p.status = 'embarcou') AS a_bordo,
               (SELECT COUNT(*) FROM presencas p WHERE p.viagem_id = v.id AND p.status = 'previsto') AS aguardando,
               (SELECT COUNT(*) FROM ocorrencias o WHERE o.viagem_id = v.id AND o.tipo = 'emergencia' AND o.status = 'aberta') AS emergencias
        FROM viagens v JOIN rotas r ON r.id = v.rota_id LEFT JOIN frota f ON f.id = v.veiculo_id
        LEFT JOIN motoristas m ON m.id = v.motorista_id LEFT JOIN monitores mo ON mo.id = v.monitor_id
        WHERE v.status = 'em_andamento' AND v.empresa_id = ? ORDER BY r.nome`, [empresaId()]);
    const alertas = viagens.length ? await conn.query(`
        SELECT viagem_id, tipo, nivel, mensagem FROM alertas_operacao WHERE empresa_id = ? AND resolvido_em IS NULL AND viagem_id IN (?)`, [empresaId(), viagens.map(v => v.id)]) : [];
    return viagens.map(v => {
        const min = v.ultima ? Math.round((agoraS - seg(v.ultima)) / 60) : null;
        const meus = alertas.filter(a => a.viagem_id === v.id);
        let estado = 'movendo';
        if (Number(v.emergencias)) estado = 'emergencia';
        else if (min === null || min > Number(cfg.sem_sinal_min)) estado = 'sem_sinal';
        else if (meus.some(a => a.nivel === 'critico')) estado = 'alerta';
        else if (meus.some(a => a.tipo === 'parada') || (v.ultima_velocidade !== null && Number(v.ultima_velocidade) < 3)) estado = 'parada';
        return {
            viagem_id: v.id, rota_id: v.rota_id, rota_nome: v.rota_nome, tipo: v.tipo, placa: v.placa, modelo: v.modelo,
            motorista_nome: v.motorista_nome, motorista_telefone: v.motorista_telefone, monitor_nome: v.monitor_nome,
            posicao: v.ultima_lat != null ? { lat: Number(v.ultima_lat), lng: Number(v.ultima_lng) } : null,
            velocidade: v.ultima_velocidade === null ? null : Number(v.ultima_velocidade), minutos_desde_posicao: min,
            a_bordo: Number(v.a_bordo), aguardando: Number(v.aguardando), estado, alertas: meus, atrasada_dia: v.data < hojeBR(),
        };
    });
}
