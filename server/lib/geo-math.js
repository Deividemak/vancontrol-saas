// Funções geográficas puras (sem dependências), usadas no cálculo de rotas.

const R = 6371000; // raio da Terra em metros

export function haversine(a, b) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}

/** Distância estimada por ruas: linha reta × fator de tortuosidade urbana. */
export const FATOR_RUAS = 1.35;

export function estimarTrecho(a, b, velocidadeKmh) {
    const metros = haversine(a, b) * FATOR_RUAS;
    const segundos = metros / ((velocidadeKmh * 1000) / 3600);
    return { metros, segundos };
}

/**
 * Ordena pontos para minimizar a distância (vizinho mais próximo + 2-opt).
 * inicio: ponto fixo de partida (opcional); fim: ponto fixo de chegada (opcional).
 * Retorna os índices de `pontos` na nova ordem.
 */
export function ordenarPorProximidade(pontos, { inicio = null, fim = null } = {}) {
    const n = pontos.length;
    if (n <= 1) return pontos.map((_, i) => i);

    const d = (a, b) => haversine(a, b);

    // Vizinho mais próximo a partir do início (ou do ponto mais distante do fim)
    const restantes = new Set(pontos.map((_, i) => i));
    const ordem = [];
    let atual = inicio;
    if (!atual) {
        let primeiro = 0;
        if (fim) {
            let maior = -1;
            pontos.forEach((p, i) => { const x = d(p, fim); if (x > maior) { maior = x; primeiro = i; } });
        }
        ordem.push(primeiro);
        restantes.delete(primeiro);
        atual = pontos[primeiro];
    }
    while (restantes.size) {
        let melhor = -1, melhorD = Infinity;
        for (const i of restantes) {
            const x = d(atual, pontos[i]);
            if (x < melhorD) { melhorD = x; melhor = i; }
        }
        ordem.push(melhor);
        restantes.delete(melhor);
        atual = pontos[melhor];
    }

    // 2-opt
    const custo = (seq) => {
        let total = 0;
        let prev = inicio;
        for (const i of seq) { if (prev) total += d(prev, pontos[i]); prev = pontos[i]; }
        if (fim && prev) total += d(prev, fim);
        return total;
    };
    let melhorou = true;
    let melhorCusto = custo(ordem);
    let iter = 0;
    while (melhorou && iter++ < 200) {
        melhorou = false;
        for (let i = 0; i < n - 1; i++) {
            for (let k = i + 1; k < n; k++) {
                const nova = ordem.slice(0, i).concat(ordem.slice(i, k + 1).reverse(), ordem.slice(k + 1));
                const c = custo(nova);
                if (c + 0.5 < melhorCusto) {
                    ordem.splice(0, n, ...nova);
                    melhorCusto = c;
                    melhorou = true;
                }
            }
        }
    }
    return ordem;
}

export function custoSequencia(seq, { inicio = null, fim = null } = {}) {
    let total = 0;
    let prev = inicio;
    for (const p of seq) { if (prev) total += haversine(prev, p); prev = p; }
    if (fim && prev) total += haversine(prev, fim);
    return total * FATOR_RUAS;
}

/** 'HH:MM[:SS]' -> segundos do dia */
export function horaParaSeg(h) {
    if (!h) return null;
    const [a, b, c] = String(h).split(':').map(Number);
    return a * 3600 + b * 60 + (c || 0);
}

/** segundos do dia -> 'HH:MM' */
export function segParaHora(s) {
    if (s === null || s === undefined) return null;
    const t = ((Math.round(s / 60) % 1440) + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
