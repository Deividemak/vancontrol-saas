// Cálculo de trajeto entre paradas.
// Padrão: OSRM (rotas reais por ruas). Se o OSRM falhar ou ROUTING_PROVIDER=estimativa,
// usa estimativa por linha reta × fator urbano e velocidade média da rota.
// Atenção: o servidor público do OSRM (router.project-osrm.org) é só para testes/baixo volume.
// Em produção, hospede seu próprio OSRM e aponte OSRM_URL para ele.

import { estimarTrecho } from '../lib/geo-math.js';

const OSRM_URL = (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const PROVIDER = process.env.ROUTING_PROVIDER || 'osrm';
const TIMEOUT_MS = 8000;
const cache = new Map();
const MAX_CACHE = 500;
const PAUSA_APOS_FALHA_MS = 5 * 60 * 1000;
let osrmIndisponivelAte = 0;

/**
 * pontos: [{lat, lng}] em sequência (mínimo 2).
 * Retorna { trechos: [{metros, segundos}], geometria: [[lat,lng],...], fonte }
 */
// Trânsito: o OSRM calcula com a via livre. Aplicamos um fator de lentidão (ROUTING_FATOR_TRANSITO, padrão 1.2)
// e, nos horários de pico do trânsito escolar, multiplicamos por ROUTING_PICO_MULT (padrão 1.3).
// Picos padrão: 06:30–08:30, 11:30–13:30 e 17:00–19:00 (ROUTING_PICOS="06:30-08:30,11:30-13:30,17:00-19:00").
const hs = (h) => { const [a, b] = h.split(':').map(Number); return a * 3600 + (b || 0) * 60; };
const PICOS = (process.env.ROUTING_PICOS || '06:30-08:30,11:30-13:30,17:00-19:00')
    .split(',').map(f => f.trim().split('-')).filter(f => f.length === 2).map(([a, b]) => [hs(a), hs(b)]);

/** Fator de lentidão para um horário (segundos do dia; null = sem horário → fator base). */
export function fatorTransito(horaSeg = null) {
    const base = Number(process.env.ROUTING_FATOR_TRANSITO || 1.2);
    const pico = horaSeg !== null && horaSeg !== undefined && PICOS.some(([a, b]) => horaSeg >= a && horaSeg <= b);
    return { fator: Math.round(base * (pico ? Number(process.env.ROUTING_PICO_MULT || 1.3) : 1) * 100) / 100, pico };
}

export async function calcularTrajeto(pontos, velocidadeKmh = 25, horaSeg = null) {
    if (pontos.length < 2) return { trechos: [], geometria: pontos.map(p => [p.lat, p.lng]), fonte: 'nenhuma' };

    if (PROVIDER === 'osrm' && Date.now() >= osrmIndisponivelAte) {
        const chave = pontos.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
        if (cache.has(chave)) return ajustarVelocidade(cache.get(chave));
        try {
            const r = await viaOsrm(chave);
            if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
            cache.set(chave, r);
            return ajustarVelocidade(r);
        } catch (err) {
            // evita esperar o timeout em toda requisição enquanto o OSRM estiver fora
            osrmIndisponivelAte = Date.now() + PAUSA_APOS_FALHA_MS;
            console.warn('[routing] OSRM indisponível, usando estimativa pelos próximos 5 min:', err.message);
        }
    }
    return estimar(pontos, velocidadeKmh);

    // OSRM calcula com velocidades de via livre; para van escolar em horário de pico
    // aplicamos um fator de lentidão configurável.
    function ajustarVelocidade(r) {
        const { fator, pico } = fatorTransito(horaSeg);
        return { ...r, transito: { fator, pico }, trechos: r.trechos.map(t => ({ metros: t.metros, segundos: t.segundos * fator })) };
    }
}

async function viaOsrm(coords) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`, {
            headers: { 'User-Agent': 'VanControl/1.0' },
            signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if (d.code !== 'Ok' || !d.routes?.[0]) throw new Error(d.code || 'sem rota');
        const rota = d.routes[0];
        return {
            trechos: rota.legs.map(l => ({ metros: l.distance, segundos: l.duration })),
            geometria: rota.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
            fonte: 'osrm',
        };
    } finally {
        clearTimeout(t);
    }
}

export function estimar(pontos, velocidadeKmh) {
    const trechos = [];
    for (let i = 1; i < pontos.length; i++) trechos.push(estimarTrecho(pontos[i - 1], pontos[i], velocidadeKmh));
    return { trechos, geometria: pontos.map(p => [p.lat, p.lng]), fonte: 'estimativa' };
}
