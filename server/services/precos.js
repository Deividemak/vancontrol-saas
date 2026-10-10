// Preço sugerido da mensalidade: base do turno + km extra − desconto de irmão.
import { haversine, FATOR_RUAS } from '../lib/geo-math.js';
import { lerConfig } from './config.js';
import { empresaId } from '../lib/tenant.js';

export function arredondar(v, passo) {
    return passo > 0 ? Math.round(v / passo) * passo : Math.round(v * 100) / 100;
}

/** Valor proporcional aos dias restantes do mês de entrada. */
export function proporcional(valor, inicioISO) {
    const d = new Date(`${inicioISO}T12:00:00Z`);
    const dias = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const restantes = dias - d.getUTCDate() + 1;
    return { valor: Math.round((valor * restantes / dias) * 100) / 100, dias, restantes };
}

export async function precoSugerido(conn, { lat, lng, escolaId, turno, responsavelId, alunoId }) {
    const cfg = await lerConfig(conn, 'precos');
    const base = Number(cfg.base_por_turno?.[turno] ?? cfg.base_por_turno?.['Manhã'] ?? 0);
    const itens = [{ descricao: `Valor base (${turno || 'turno'})`, valor: base }];

    let km = null;
    if (escolaId && lat != null && lng != null) {
        const [e] = await conn.query('SELECT lat, lng, nome FROM escolas WHERE id = ? AND empresa_id = ?', [escolaId, empresaId()]);
        if (e?.lat != null) {
            km = (haversine({ lat: Number(lat), lng: Number(lng) }, { lat: Number(e.lat), lng: Number(e.lng) }) * FATOR_RUAS) / 1000;
            const extra = Math.max(0, km - Number(cfg.km_incluso || 0));
            if (extra > 0) itens.push({ descricao: `Distância: ${km.toFixed(1)} km (${extra.toFixed(1)} km além dos ${cfg.km_incluso} inclusos)`, valor: Math.round(extra * Number(cfg.valor_km_extra || 0) * 100) / 100 });
        }
    }
    let subtotal = itens.reduce((s, i) => s + i.valor, 0);

    // irmão: a partir do 2º filho ativo do mesmo responsável (o mais antigo paga cheio)
    if (responsavelId && Number(cfg.desconto_irmao_pct) > 0) {
        const irmaos = await conn.query(`SELECT id FROM alunos WHERE empresa_id = ? AND responsavel_id = ? AND status = 'Ativo' ${alunoId ? 'AND id <> ?' : ''} ORDER BY id`,
            alunoId ? [empresaId(), responsavelId, alunoId] : [empresaId(), responsavelId]);
        const ehPrimeiro = !irmaos.length || (alunoId && irmaos.every(i => i.id > alunoId));
        if (!ehPrimeiro) {
            const d = -Math.round(subtotal * Number(cfg.desconto_irmao_pct)) / 100;
            itens.push({ descricao: `Desconto de irmão (${cfg.desconto_irmao_pct}%)`, valor: d });
            subtotal += d;
        }
    }
    const total = arredondar(subtotal, Number(cfg.arredondar_para || 0));
    return { itens, km: km === null ? null : Math.round(km * 10) / 10, subtotal: Math.round(subtotal * 100) / 100, valor_sugerido: total };
}
