// Inteligência de rota (Fase 6): otimização da ordem com restrições e simulação de aluno novo.
//  - Otimização: menor distância, mas antes respeita a entrada nas escolas (janela de horário)
//    e o tempo máximo que a criança pode ficar na van. Também avisa quando falta lugar.
//  - Simulação "e se": quanto cada rota aumenta se um aluno novo entrar (antes de aceitar a matrícula).
import { montarParadas, calcularRota, lugaresDoVeiculo, turnoCompativel } from './rotaEngine.js';
import { haversine, estimarTrecho, FATOR_RUAS, ordenarPorProximidade, horaParaSeg, segParaHora } from '../lib/geo-math.js';

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const temCoord = (p) => p && Number.isFinite(num(p.lat)) && Number.isFinite(num(p.lng));

function horarioEscola(e, turno, campo) {
    const hs = Object.entries(e.horarios || {})
        .filter(([t]) => !turno || turnoCompativel(t, turno) || turnoCompativel(turno, t))
        .map(([, h]) => horaParaSeg(h?.[campo])).filter(v => v !== null && v !== undefined);
    return hs.length ? Math.min(...hs) : null;
}

/**
 * Simulação rápida (linha reta × fator das ruas) de uma ordem de paradas.
 * Retorna distância, atraso nas escolas (ida), tempo a bordo e o quanto passa do limite.
 */
export function avaliarOrdem(rota, partida, alunosSeq, escolasSeq) {
    const volta = rota.tipo === 'volta';
    const vel = Number(rota.velocidade_media_kmh) || 25;
    const parada = Number(rota.tempo_parada_seg ?? 60);
    const folga = Number(rota.folga_escola_min ?? 10) * 60;
    const limite = Number(rota.tempo_max_bordo_min ?? 60) * 60;
    const escolas = escolasSeq.filter(temCoord);
    const seq = [...(partida ? [partida] : []), ...(volta ? [...escolas, ...alunosSeq] : [...alunosSeq, ...escolas])];

    let t = 0, dist = 0;
    const tempos = new Map(); // parada → {chegada, saida}
    seq.forEach((p, i) => {
        if (i > 0) {
            const tr = estimarTrecho(seq[i - 1], p, vel);
            t += tr.segundos; dist += tr.metros;
        }
        const chegada = t;
        if (i < seq.length - 1 && p.tipo !== 'partida') t += p.tipo === 'escola' ? Math.max(parada, 120) : parada;
        tempos.set(p, { chegada, saida: t });
    });

    // atraso (ida, com horário de saída definido)
    const t0 = horaParaSeg(rota.hora_saida);
    let atraso = 0;
    const offsets = [];
    for (const e of escolas) {
        const ent = horarioEscola(e, rota.periodo, 'entrada');
        if (volta || ent === null) continue;
        offsets.push(ent - folga - tempos.get(e).chegada);
        if (t0 !== null) atraso += Math.max(0, t0 + tempos.get(e).chegada - (ent - folga));
    }
    // horário de saída para chegar com folga em todas as escolas (arredonda para 5 min)
    const saidaIdeal = !volta && offsets.length ? Math.floor(Math.min(...offsets) / 300) * 300 : null;

    let excesso = 0, maxBordo = 0, acima = 0;
    for (const p of alunosSeq) {
        for (const a of p.alunos) {
            const e = escolas.find(x => x.escola_id === a.escola_id);
            if (!e) continue;
            const bordo = volta ? tempos.get(p).chegada - tempos.get(e).saida : tempos.get(e).chegada - tempos.get(p).saida;
            maxBordo = Math.max(maxBordo, bordo);
            if (bordo > limite) { excesso += bordo - limite; acima++; }
        }
    }
    return { dist, atraso, excesso, maxBordo, acima, saidaIdeal, duracao: t };
}

/** Prioridade: não atrasar na escola > não passar do tempo de van > menor distância. */
const comparar = (a, b) =>
    (Math.abs(a.atraso - b.atraso) > 30 ? a.atraso - b.atraso : 0) ||
    (Math.abs(a.excesso - b.excesso) > 30 ? a.excesso - b.excesso : 0) ||
    a.dist - b.dist;

/** Busca local: troca trechos (2-opt) e muda paradas de lugar até não melhorar mais. */
function buscaLocal(rota, partida, inicial, escolas) {
    let atual = [...inicial];
    let melhor = avaliarOrdem(rota, partida, atual, escolas);
    const n = atual.length;
    for (let rodada = 0; rodada < 40; rodada++) {
        let melhorou = false;
        for (let i = 0; i < n - 1; i++) {
            for (let k = i + 1; k < n; k++) {
                const candidatos = [
                    atual.slice(0, i).concat(atual.slice(i, k + 1).reverse(), atual.slice(k + 1)),
                ];
                // mover a parada i para a posição k (e vice-versa)
                const m1 = [...atual]; const [x] = m1.splice(i, 1); m1.splice(k, 0, x); candidatos.push(m1);
                const m2 = [...atual]; const [y] = m2.splice(k, 1); m2.splice(i, 0, y); candidatos.push(m2);
                for (const c of candidatos) {
                    const r = avaliarOrdem(rota, partida, c, escolas);
                    if (comparar(r, melhor) < -1) { atual = c; melhor = r; melhorou = true; }
                }
            }
        }
        if (!melhorou) break;
    }
    return { alunosSeq: atual, ...melhor };
}

/** Sugere a ordem das paradas e das escolas (não grava; o painel decide se aplica). */
export function sugerirOrdem(ctx) {
    const { rota } = ctx;
    const volta = rota.tipo === 'volta';
    const { paradasAluno, paradasEscola } = montarParadas(ctx);
    const partida = temCoord({ lat: rota.partida_lat, lng: rota.partida_lng }) ? { tipo: 'partida', lat: num(rota.partida_lat), lng: num(rota.partida_lng) } : null;

    const porHorario = [...paradasEscola].sort((a, b) =>
        (horarioEscola(a, rota.periodo, volta ? 'saida' : 'entrada') ?? 1e9) - (horarioEscola(b, rota.periodo, volta ? 'saida' : 'entrada') ?? 1e9));
    const ordensEscola = [paradasEscola, porHorario];

    const atual = avaliarOrdem(rota, partida, paradasAluno, paradasEscola);
    let melhor = { ...atual, alunosSeq: paradasAluno, escolasOrd: paradasEscola };
    for (const escolas of ordensEscola) {
        const loc = escolas.filter(temCoord);
        const inicio = volta ? (loc[loc.length - 1] || partida) : partida;
        const fim = volta ? null : (loc[0] || null);
        const porDistancia = ordenarPorProximidade(paradasAluno, { inicio, fim }).map(i => paradasAluno[i]);
        for (const inicial of [porDistancia, paradasAluno]) {
            const r = buscaLocal(rota, partida, inicial, escolas);
            if (comparar(r, melhor) < -1) melhor = { ...r, escolasOrd: escolas };
        }
    }

    const min = (s) => Math.round(s / 60);
    const lugares = lugaresDoVeiculo(ctx.veiculo?.capacidade);
    const motivos = [];
    if (melhor.atraso < atual.atraso - 30) motivos.push('reduz o atraso na entrada das escolas');
    if (melhor.excesso < atual.excesso - 30) motivos.push(`menos tempo de van para as crianças (máx. ${min(atual.maxBordo)} → ${min(melhor.maxBordo)} min)`);
    if (melhor.dist < atual.dist - 50) motivos.push('trajeto mais curto');
    const mudouEscolas = melhor.escolasOrd.some((e, i) => e.escola_id !== paradasEscola[i]?.escola_id);
    if (mudouEscolas) motivos.push('ordem das escolas pelo horário');

    const avisos = [];
    if (melhor.acima) avisos.push(`${melhor.acima} aluno(s) ainda ficam mais de ${rota.tempo_max_bordo_min ?? 60} min na van: considere dividir a rota ou mudar o ponto de partida.`);
    if (lugares && ctx.alunos.length > lugares) {
        avisos.push(`${ctx.alunos.length} alunos para ${lugares} lugares: são necessárias ${Math.ceil(ctx.alunos.length / lugares)} viagens/vans para esta rota.`);
    }
    if (!volta && melhor.saidaIdeal !== null && horaParaSeg(rota.hora_saida) !== null && melhor.atraso > 30) {
        avisos.push(`Para chegar com folga, saia às ${segParaHora(melhor.saidaIdeal)}.`);
    }

    return {
        alunos: melhor.alunosSeq.flatMap(p => p.alunos.map(a => a.aluno_id)),
        escolas: melhor.escolasOrd.map(e => e.escola_id),
        distancia_atual_m: Math.round(atual.dist),
        distancia_sugerida_m: Math.round(melhor.dist),
        atraso_atual_min: min(atual.atraso),
        atraso_sugerido_min: min(melhor.atraso),
        bordo_max_atual_min: min(atual.maxBordo),
        bordo_max_sugerido_min: min(melhor.maxBordo),
        acima_limite_atual: atual.acima,
        acima_limite_sugerido: melhor.acima,
        hora_saida_sugerida: segParaHora(melhor.saidaIdeal),
        motivo: motivos.length ? `Sugestão: ${motivos.join(', ')}.` : 'A ordem atual já é a melhor encontrada.',
        avisos,
    };
}

/**
 * Coloca um aluno "de mentira" na melhor posição da rota (a que menos piora).
 * Devolve o contexto novo (para calcular a rota completa) e a posição escolhida.
 */
export function inserirNaMelhorPosicao(ctx, novo) {
    const base = [...ctx.alunos].sort((a, b) => a.ordem - b.ordem || a.aluno_id - b.aluno_id).map((a, i) => ({ ...a, ordem: i + 1 }));
    const partida = temCoord({ lat: ctx.rota.partida_lat, lng: ctx.rota.partida_lng }) ? { tipo: 'partida', lat: num(ctx.rota.partida_lat), lng: num(ctx.rota.partida_lng) } : null;
    let melhor = null;
    for (let k = 0; k <= base.length; k++) {
        const c = { ...ctx, alunos: [...base, { ...novo, ordem: k + 0.5 }] };
        const { paradasAluno, paradasEscola } = montarParadas(c);
        const r = avaliarOrdem(ctx.rota, partida, paradasAluno, paradasEscola);
        if (!melhor || comparar(r, melhor.r) < 0) melhor = { r, ctx: c, k };
    }
    const ordenados = [...melhor.ctx.alunos].sort((a, b) => a.ordem - b.ordem);
    const i = ordenados.findIndex(a => a.aluno_id === novo.aluno_id);
    return {
        ctx: melhor.ctx,
        depois_de: ordenados[i - 1]?.nome || null,
        antes_de: ordenados[i + 1]?.nome || null,
    };
}

/** Compara a rota antes e depois do aluno novo (com o cálculo completo, igual ao da tela de Rotas). */
export async function simularNaRota(ctx, novo) {
    const antes = await calcularRota(ctx);
    const ins = inserirNaMelhorPosicao(ctx, novo);
    const depois = await calcularRota(ins.ctx);
    const chave = (a) => `${a.codigo}:${a.msg}`;
    const ja = new Set(antes.alertas.map(chave));
    const novos = depois.alertas.filter(a => !ja.has(chave(a)) && a.codigo !== 'turno');
    const parada = depois.paradas.find(p => p.alunos?.some(a => a.aluno_id === novo.aluno_id));
    const bordoNovo = depois.resumo.tempo_bordo.find(b => b.aluno_id === novo.aluno_id);
    return {
        acrescimo_min: Math.round((depois.resumo.duracao_seg - antes.resumo.duracao_seg) / 60),
        acrescimo_km: Math.round((depois.resumo.distancia_m - antes.resumo.distancia_m) / 100) / 10,
        antes: { duracao_min: Math.round(antes.resumo.duracao_seg / 60), distancia_km: Math.round(antes.resumo.distancia_m / 100) / 10, hora_fim: antes.resumo.hora_fim, bordo_max_min: Math.round((antes.resumo.tempo_bordo_max_seg || 0) / 60), alunos: antes.resumo.total_alunos },
        depois: { duracao_min: Math.round(depois.resumo.duracao_seg / 60), distancia_km: Math.round(depois.resumo.distancia_m / 100) / 10, hora_fim: depois.resumo.hora_fim, bordo_max_min: Math.round((depois.resumo.tempo_bordo_max_seg || 0) / 60), alunos: depois.resumo.total_alunos },
        horario_previsto: parada?.chegada || null,
        tempo_van_min: bordoNovo ? Math.round(bordoNovo.segundos / 60) : null,
        depois_de: ins.depois_de, antes_de: ins.antes_de,
        lugares: depois.resumo.lugares,
        alertas_novos: novos.map(a => ({ nivel: a.nivel, msg: a.msg })),
        viavel: !novos.some(a => a.nivel === 'erro'),
    };
}

export { haversine, FATOR_RUAS };
