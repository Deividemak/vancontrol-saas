// Motor de cálculo de rotas: monta as paradas, agrupa irmãos/vizinhos,
// calcula horários previstos e gera alertas.
// É puro (não acessa o banco): recebe o contexto já carregado.

import { haversine, horaParaSeg, segParaHora, ordenarPorProximidade, custoSequencia, estimarTrecho } from '../lib/geo-math.js';
import { calcularTrajeto } from './routing.js';

/** Alunos a até esta distância (metros) viram uma única parada (irmãos, mesmo prédio). */
export const RAIO_AGRUPAMENTO_M = 25;

const num = (v) => (v === null || v === undefined ? null : Number(v));
const temCoord = (o) => o && Number.isFinite(num(o.lat)) && Number.isFinite(num(o.lng));

export function lugaresDoVeiculo(capacidade) {
    const m = String(capacidade ?? '').match(/\d+/);
    return m ? Number(m[0]) : null;
}

/**
 * ctx = {
 *   rota, alunos: [{aluno_id, nome, ordem, ponto_encontro_id, lat, lng, geo_status, turno, escola_id,
 *                   escola_nome, responsavel_id, endereco}],
 *   escolas: [{escola_id, nome, ordem, lat, lng, horarios: {turno: {entrada, saida}}}],
 *   pontos: Map(id -> ponto), areas: [area], veiculo: {placa, capacidade} | null
 * }
 */
export function montarParadas(ctx) {
    const { rota, alunos, pontos } = ctx;
    const ordenados = [...alunos].sort((a, b) => a.ordem - b.ordem || a.aluno_id - b.aluno_id);

    const paradasAluno = [];
    const semLocal = [];

    for (const a of ordenados) {
        const ponto = a.ponto_encontro_id ? pontos.get(a.ponto_encontro_id) : null;
        const local = ponto ? { lat: num(ponto.lat), lng: num(ponto.lng) } : temCoord(a) ? { lat: num(a.lat), lng: num(a.lng) } : null;
        if (!local) { semLocal.push(a); continue; }

        // Mesmo ponto de encontro => mesma parada; senão, agrupa por proximidade
        let alvo = null;
        if (ponto) alvo = paradasAluno.find(p => p.ponto_encontro_id === ponto.id);
        else alvo = paradasAluno.find(p => !p.ponto_encontro_id && haversine(p, local) <= RAIO_AGRUPAMENTO_M);

        if (alvo) {
            alvo.alunos.push(a);
        } else {
            paradasAluno.push({
                tipo: rota.tipo === 'volta' ? 'desembarque' : 'embarque',
                lat: local.lat,
                lng: local.lng,
                ponto_encontro_id: ponto ? ponto.id : null,
                ponto_nome: ponto ? ponto.nome : null,
                endereco: ponto ? (ponto.referencia || ponto.nome) : a.endereco,
                alunos: [a],
            });
        }
    }

    for (const p of paradasAluno) {
        const resp = new Set(p.alunos.map(a => a.responsavel_id).filter(Boolean));
        p.irmaos = p.alunos.length > 1 && resp.size === 1;
    }

    const paradasEscola = [...ctx.escolas]
        .sort((a, b) => a.ordem - b.ordem || a.escola_id - b.escola_id)
        .map(e => ({
            tipo: 'escola',
            escola_id: e.escola_id,
            nome: e.nome,
            lat: num(e.lat),
            lng: num(e.lng),
            endereco: e.endereco,
            horarios: e.horarios || {},
            alunos: alunos.filter(a => a.escola_id === e.escola_id),
        }));

    return { paradasAluno, paradasEscola, semLocal };
}

/** Calcula a rota completa com horários e alertas. */
export async function calcularRota(ctx) {
    const { rota } = ctx;
    const alertas = [];
    const { paradasAluno, paradasEscola, semLocal } = montarParadas(ctx);

    const partida = temCoord({ lat: rota.partida_lat, lng: rota.partida_lng })
        ? { tipo: 'partida', lat: num(rota.partida_lat), lng: num(rota.partida_lng), endereco: rota.partida_descricao || 'Partida', alunos: [] }
        : null;

    const sequencia = [
        ...(partida ? [partida] : []),
        ...(rota.tipo === 'volta' ? [...paradasEscola, ...paradasAluno] : [...paradasAluno, ...paradasEscola]),
    ];

    // Só paradas com coordenadas entram no trajeto
    const localizadas = sequencia.filter(temCoord);
    for (const e of paradasEscola) {
        if (!temCoord(e)) alertas.push({ nivel: 'erro', codigo: 'escola_sem_local', msg: `A escola ${e.nome} não tem localização no mapa. Edite o endereço da escola.` });
    }
    for (const a of semLocal) {
        alertas.push({ nivel: 'erro', codigo: 'aluno_sem_local', aluno_id: a.aluno_id, msg: `${a.nome} não tem localização. Complete o endereço no cadastro do aluno.` });
    }

    const velocidade = Number(rota.velocidade_media_kmh) || 25;
    const trajeto = await calcularTrajeto(localizadas.map(p => ({ lat: p.lat, lng: p.lng })), velocidade, horaParaSeg(rota.hora_saida));

    // Horários
    const parada = Number(rota.tempo_parada_seg ?? 60);
    const turnoRota = rota.periodo;
    let t = horaParaSeg(rota.hora_saida);
    let distancia = 0;
    let duracao = 0;
    const tInicio = t;

    localizadas.forEach((p, i) => {
        if (i > 0) {
            const tr = trajeto.trechos[i - 1];
            distancia += tr.metros;
            duracao += tr.segundos;
            p.trecho = { metros: Math.round(tr.metros), segundos: Math.round(tr.segundos) };
            if (t !== null) t += tr.segundos;
        }
        if (t !== null) p.chegada_seg = t;

        // Na volta, a van espera a escola liberar os alunos
        if (p.tipo === 'escola' && rota.tipo === 'volta' && t !== null) {
            const saidas = horariosDaEscolaNaRota(p, turnoRota).map(h => horaParaSeg(h.saida)).filter(v => v !== null);
            if (saidas.length) {
                const libera = Math.max(...saidas);
                if (t < libera) { duracao += libera - t; t = libera; }
            }
        }

        const espera = p.tipo === 'partida' ? 0 : p.tipo === 'escola' ? Math.max(parada, 120) : parada;
        if (i < localizadas.length - 1) { if (t !== null) t += espera; duracao += espera; }
        if (t !== null) p.saida_seg = t;
    });

    const fimSeg = localizadas.length ? localizadas[localizadas.length - 1].chegada_seg ?? null : null;

    // Alertas de horário nas escolas (ida: chegar antes da entrada com folga)
    const folga = Number(rota.folga_escola_min ?? 10) * 60;
    let horaSaidaSugerida = null;
    if (rota.tipo !== 'volta') {
        const primeiroAluno = localizadas.find(p => p.tipo !== 'partida');
        let menorMargem = null;
        for (const e of paradasEscola.filter(temCoord)) {
            const hs = horariosDaEscolaNaRota(e, turnoRota);
            if (!hs.length || hs.every(h => !h.entrada)) {
                alertas.push({ nivel: 'aviso', codigo: 'escola_sem_horario', msg: `Cadastre o horário de entrada da ${e.nome} para o turno ${turnoRota || 'da rota'}.` });
                continue;
            }
            const entrada = Math.min(...hs.map(h => horaParaSeg(h.entrada)).filter(v => v !== null));
            const limite = entrada - folga;
            if (e.chegada_seg !== undefined) {
                if (e.chegada_seg > entrada) {
                    alertas.push({ nivel: 'erro', codigo: 'atraso_escola', msg: `Chegada prevista na ${e.nome} às ${segParaHora(e.chegada_seg)}, depois da entrada (${segParaHora(entrada)}).` });
                } else if (e.chegada_seg > limite) {
                    alertas.push({ nivel: 'aviso', codigo: 'folga_curta', msg: `Chegada na ${e.nome} às ${segParaHora(e.chegada_seg)}: menos de ${folga / 60} min antes da entrada (${segParaHora(entrada)}).` });
                }
            }
            // horário de saída ideal para chegar com folga nesta escola
            if (tInicio !== null && e.chegada_seg !== undefined) {
                const margem = limite - e.chegada_seg;
                if (menorMargem === null || margem < menorMargem) menorMargem = margem;
            } else if (tInicio === null && primeiroAluno) {
                // sem horário de saída: calcula de trás pra frente
                const tempoAteEscola = tempoAte(localizadas, e, parada);
                const sug = limite - tempoAteEscola;
                horaSaidaSugerida = horaSaidaSugerida === null ? sug : Math.min(horaSaidaSugerida, sug);
            }
        }
        if (tInicio !== null && menorMargem !== null) horaSaidaSugerida = tInicio + menorMargem;
    } else {
        for (const e of paradasEscola.filter(temCoord)) {
            const hs = horariosDaEscolaNaRota(e, turnoRota);
            if (!hs.length || hs.every(h => !h.saida)) {
                alertas.push({ nivel: 'aviso', codigo: 'escola_sem_horario', msg: `Cadastre o horário de saída da ${e.nome} para o turno ${turnoRota || 'da rota'}.` });
            }
        }
    }
    if (rota.hora_saida === null || rota.hora_saida === undefined) {
        alertas.push({ nivel: 'aviso', codigo: 'sem_hora_saida', msg: 'Defina o horário de saída da rota para calcular os horários previstos.' });
    }

    // Tempo a bordo de cada aluno
    const bordo = [];
    const limiteBordo = Number(rota.tempo_max_bordo_min ?? 60) * 60;
    for (const p of paradasAluno) {
        for (const a of p.alunos) {
            const escola = paradasEscola.find(e => e.escola_id === a.escola_id);
            if (!escola || p.chegada_seg === undefined || escola.chegada_seg === undefined) continue;
            const seg = rota.tipo === 'volta' ? p.chegada_seg - (escola.saida_seg ?? escola.chegada_seg) : escola.chegada_seg - (p.saida_seg ?? p.chegada_seg);
            bordo.push({ aluno_id: a.aluno_id, nome: a.nome, segundos: Math.max(0, Math.round(seg)) });
            if (seg > limiteBordo) {
                alertas.push({ nivel: 'aviso', codigo: 'tempo_bordo', aluno_id: a.aluno_id, msg: `${a.nome} fica ${Math.round(seg / 60)} min na van (limite configurado: ${limiteBordo / 60} min).` });
            }
        }
    }

    // Capacidade
    const lugares = lugaresDoVeiculo(ctx.veiculo?.capacidade);
    if (lugares && ctx.alunos.length > lugares) {
        alertas.push({ nivel: 'erro', codigo: 'capacidade', msg: `${ctx.alunos.length} alunos para ${lugares} lugares no veículo ${ctx.veiculo.placa}.` });
    }
    if (!ctx.veiculo) alertas.push({ nivel: 'aviso', codigo: 'sem_veiculo', msg: 'Nenhum veículo vinculado a esta rota.' });

    // Turno do aluno x turno da rota
    for (const a of ctx.alunos) {
        if (turnoRota && a.turno && !turnoCompativel(a.turno, turnoRota)) {
            alertas.push({ nivel: 'aviso', codigo: 'turno', aluno_id: a.aluno_id, msg: `${a.nome} estuda no turno ${a.turno}, mas a rota é do turno ${turnoRota}.` });
        }
    }

    // Áreas restritas
    for (const p of paradasAluno) {
        if (p.ponto_encontro_id) continue;
        for (const area of ctx.areas) {
            if (haversine(p, { lat: num(area.lat), lng: num(area.lng) }) <= Number(area.raio_m)) {
                const nomes = p.alunos.map(a => a.nome).join(', ');
                alertas.push({ nivel: 'aviso', codigo: 'area_restrita', msg: `Parada de ${nomes} fica na área restrita "${area.nome}". Defina um ponto de encontro.` });
            }
        }
    }

    const paradas = sequencia.map((p, i) => ({
        seq: i + 1,
        tipo: p.tipo,
        escola_id: p.escola_id ?? null,
        nome: p.tipo === 'escola' ? p.nome : p.tipo === 'partida' ? 'Partida' : (p.ponto_nome || p.alunos.map(a => a.nome).join(', ')),
        endereco: p.endereco || null,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        ponto_encontro_id: p.ponto_encontro_id ?? null,
        irmaos: !!p.irmaos,
        alunos: p.alunos.map(a => ({ aluno_id: a.aluno_id, nome: a.nome, escola_id: a.escola_id, escola_nome: a.escola_nome, turno: a.turno, foto_thumb: a.foto_thumb || null, ponto_encontro_id: a.ponto_encontro_id || null })),
        chegada: segParaHora(p.chegada_seg),
        saida: segParaHora(p.saida_seg),
        trecho: p.trecho || null,
    }));

    return {
        paradas,
        sem_localizacao: semLocal.map(a => ({ aluno_id: a.aluno_id, nome: a.nome, escola_nome: a.escola_nome })),
        geometria: trajeto.geometria,
        fonte_trajeto: trajeto.fonte,
        transito: trajeto.transito || null,
        resumo: {
            total_alunos: ctx.alunos.length,
            lugares,
            distancia_m: Math.round(distancia),
            duracao_seg: Math.round(duracao),
            hora_saida: rota.hora_saida ? String(rota.hora_saida).slice(0, 5) : null,
            hora_fim: segParaHora(fimSeg),
            hora_saida_sugerida: segParaHora(horaSaidaSugerida),
            tempo_bordo_max_seg: bordo.length ? Math.max(...bordo.map(b => b.segundos)) : null,
            tempo_bordo: bordo,
        },
        alertas,
        // usado para persistir os horários
        _horarios: {
            alunos: paradasAluno.flatMap(p => p.alunos.map(a => ({ aluno_id: a.aluno_id, hora: segParaHora(rota.tipo === 'volta' ? p.chegada_seg : p.chegada_seg) }))),
            escolas: paradasEscola.map(e => ({ escola_id: e.escola_id, hora: segParaHora(e.chegada_seg) })),
            fim: fimSeg,
        },
    };
}

function tempoAte(localizadas, alvo, parada) {
    // soma dos trechos desde a primeira parada (sem partida) até o alvo
    let s = 0;
    let comecou = false;
    for (let i = 0; i < localizadas.length; i++) {
        const p = localizadas[i];
        if (!comecou && p.tipo !== 'partida') comecou = true;
        if (p === alvo) break;
        if (comecou && i + 1 < localizadas.length && localizadas[i + 1].trecho) s += localizadas[i + 1].trecho.segundos + parada;
    }
    return s;
}

export function turnoCompativel(turnoAluno, turnoRota) {
    if (turnoAluno === turnoRota) return true;
    // aluno integral entra de manhã e sai à tarde
    if (turnoAluno === 'Integral' && (turnoRota === 'Manhã' || turnoRota === 'Tarde')) return true;
    if (turnoRota === 'Integral' && (turnoAluno === 'Manhã' || turnoAluno === 'Tarde')) return false;
    return false;
}

/** Horários da escola relevantes para os alunos da rota (pelo turno de cada aluno). */
function horariosDaEscolaNaRota(escolaParada, turnoRota) {
    const turnos = new Set(escolaParada.alunos.map(a => a.turno).filter(Boolean));
    if (!turnos.size && turnoRota) turnos.add(turnoRota);
    return [...turnos].map(t => escolaParada.horarios[t]).filter(Boolean);
}

