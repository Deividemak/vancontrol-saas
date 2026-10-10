// Geocodificação: CEP (ViaCEP) e endereço -> coordenadas.
// Padrão: Nominatim/OpenStreetMap (grátis, 1 requisição/segundo, exige User-Agent).
// Se GOOGLE_MAPS_API_KEY estiver definido, usa a Geocoding API do Google (mais precisa no Brasil).

const TIMEOUT_MS = 8000;
const cache = new Map(); // chave -> resultado (memória do processo)

const USER_AGENT = process.env.GEOCODER_USER_AGENT || 'VanControl/1.0 (gestao de transporte escolar)';
const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

async function getJson(url, headers = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR', ...headers }, signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

// Nominatim permite no máximo 1 requisição por segundo: fila simples
let fila = Promise.resolve();
let ultima = 0;
function agendarNominatim(fn) {
    const exec = fila.then(async () => {
        const espera = Math.max(0, ultima + 1100 - Date.now());
        if (espera) await new Promise(r => setTimeout(r, espera));
        ultima = Date.now();
        return fn();
    });
    fila = exec.catch(() => {});
    return exec;
}

export function soDigitos(v) {
    return String(v || '').replace(/\D/g, '');
}

export async function buscarCep(cep) {
    const c = soDigitos(cep);
    if (c.length !== 8) return null;
    const chave = `cep:${c}`;
    if (cache.has(chave)) return cache.get(chave);
    const d = await getJson(`https://viacep.com.br/ws/${c}/json/`);
    if (!d || d.erro) return null;
    const r = {
        cep: `${c.slice(0, 5)}-${c.slice(5)}`,
        logradouro: d.logradouro || '',
        complemento: d.complemento || '',
        bairro: d.bairro || '',
        cidade: d.localidade || '',
        uf: d.uf || '',
    };
    cache.set(chave, r);
    return r;
}

export function formatarEndereco(e) {
    if (!e) return '';
    const linha1 = [e.logradouro, e.numero].filter(Boolean).join(', ');
    const partes = [linha1, e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join(' - '), e.cep];
    return partes.filter(Boolean).join(', ');
}

/**
 * Retorna { lat, lng, descricao, precisao, fonte } ou null.
 * precisao: 'endereco' (casa/número), 'rua', 'bairro' ou 'cidade'.
 */
export async function geocodificar(e) {
    if (!e || (!e.logradouro && !e.cep)) return null;
    const chave = `geo:${formatarEndereco(e).toLowerCase()}`;
    if (cache.has(chave)) return cache.get(chave);

    const r = process.env.GOOGLE_MAPS_API_KEY ? await viaGoogle(e) : await viaNominatim(e);
    if (r) cache.set(chave, r);
    return r;
}

async function viaGoogle(e) {
    const q = encodeURIComponent(`${formatarEndereco(e)}, Brasil`);
    const d = await getJson(`https://maps.googleapis.com/maps/api/geocode/json?address=${q}&region=br&language=pt-BR&key=${process.env.GOOGLE_MAPS_API_KEY}`);
    const g = d?.results?.[0];
    if (!g) return null;
    const tipo = g.geometry.location_type;
    return {
        lat: g.geometry.location.lat,
        lng: g.geometry.location.lng,
        descricao: g.formatted_address,
        precisao: tipo === 'ROOFTOP' ? 'endereco' : tipo === 'RANGE_INTERPOLATED' ? 'endereco' : 'rua',
        fonte: 'google',
    };
}

async function viaNominatim(e) {
    const tentativas = [];
    if (e.logradouro && e.cidade) {
        const p = new URLSearchParams({
            street: [e.numero, e.logradouro].filter(Boolean).join(' '),
            city: e.cidade,
            state: e.uf || '',
            country: 'Brasil',
            format: 'jsonv2',
            limit: '1',
            addressdetails: '1',
        });
        if (e.cep) p.set('postalcode', soDigitos(e.cep));
        tentativas.push(p);
        // sem CEP (às vezes o CEP atrapalha a busca no OSM)
        if (e.cep) { const p2 = new URLSearchParams(p); p2.delete('postalcode'); tentativas.push(p2); }
    }
    // texto livre como último recurso
    tentativas.push(new URLSearchParams({ q: `${formatarEndereco(e)}, Brasil`, format: 'jsonv2', limit: '1', countrycodes: 'br', addressdetails: '1' }));
    if (e.bairro && e.cidade) {
        tentativas.push(new URLSearchParams({ q: `${e.bairro}, ${e.cidade} ${e.uf || ''}, Brasil`, format: 'jsonv2', limit: '1', countrycodes: 'br' }));
    }

    for (const p of tentativas) {
        const d = await agendarNominatim(() => getJson(`${NOMINATIM_URL}/search?${p.toString()}`));
        const g = Array.isArray(d) ? d[0] : null;
        if (!g) continue;
        const temNumero = !!g.address?.house_number;
        const tipo = g.addresstype || g.type;
        let precisao = 'cidade';
        if (temNumero || ['house', 'building'].includes(tipo)) precisao = 'endereco';
        else if (['road', 'street', 'residential', 'highway'].includes(tipo) || g.category === 'highway') precisao = 'rua';
        else if (['suburb', 'neighbourhood', 'quarter'].includes(tipo)) precisao = 'bairro';
        return { lat: Number(g.lat), lng: Number(g.lon), descricao: g.display_name, precisao, fonte: 'openstreetmap' };
    }
    return null;
}
