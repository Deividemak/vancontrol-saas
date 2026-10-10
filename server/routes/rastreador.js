// Rastreador veicular (GPS/OBD dedicado), além do celular do motorista.
// Configure o rastreador (ou o Traccar/plataforma dele) para enviar as posições para:
//   <APP_URL>/api/publico/rastreador/<segredo da empresa>   (Frota → Rastreador mostra o endereço)
// Formatos aceitos (JSON no corpo ou na URL):
//   { "id": "IMEI", "lat": -15.8, "lng": -47.9, "velocidade": 40, "data": "2026-10-10T07:15:00Z" }
//   Traccar/OsmAnd: ?id=IMEI&lat=-15.8&lon=-47.9&speed=21.6&timestamp=1791...   (speed em nós)
import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { comEmpresa } from '../lib/tenant.js';
import { hojeBR, dataHora } from '../services/viagens.js';

const router = Router();

async function empresaDoSegredo(segredo) {
    if (!segredo || String(segredo).length < 16) return null;
    const [e] = await pool.query('SELECT id, rastreador_segredo FROM empresas WHERE rastreador_segredo = ? AND ativo = 1', [String(segredo)]);
    if (!e) return null;
    const a = Buffer.from(String(segredo)), b = Buffer.from(e.rastreador_segredo);
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? e.id : null;
}

function lerPosicao(o) {
    const n = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
    const id = String(o.id ?? o.imei ?? o.deviceId ?? o.uniqueId ?? '').trim();
    const lat = n(o.lat ?? o.latitude), lng = n(o.lng ?? o.lon ?? o.longitude);
    let vel = n(o.velocidade ?? o.velocidade_kmh);
    if (vel === null && o.speed !== undefined) vel = n(o.speed) * 1.852; // Traccar/OsmAnd manda em nós
    let quando = o.data ?? o.fixTime ?? o.deviceTime ?? o.timestamp ?? null;
    if (quando !== null && /^\d+$/.test(String(quando))) quando = new Date(Number(quando) * (String(quando).length <= 10 ? 1000 : 1)).toISOString();
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { id: id.slice(0, 40), lat, lng, vel: Number.isFinite(vel) ? Math.round(vel * 10) / 10 : null, quando };
}

async function receber(req, res) {
    let emp;
    try { emp = await empresaDoSegredo(req.params.segredo); } catch (err) { console.error('[rastreador]', err.message); return res.status(500).end(); }
    if (!emp) return res.status(404).end();
    const corpo = Array.isArray(req.body) ? req.body : req.body?.posicoes || [{ ...req.query, ...(req.body || {}) }];
    let gravadas = 0;
    await comEmpresa(emp, async () => {
        let conn;
        try {
            conn = await pool.getConnection();
            for (const bruto of corpo.slice(0, 200)) {
                const p = lerPosicao(bruto || {});
                if (!p) continue;
                const [v] = await conn.query(`
                    SELECT vi.id FROM viagens vi JOIN frota f ON f.id = vi.veiculo_id AND f.empresa_id = vi.empresa_id
                    WHERE vi.empresa_id = ? AND f.rastreador_id = ? AND vi.data = ? AND vi.status = 'em_andamento' ORDER BY vi.id DESC LIMIT 1`, [emp, p.id, hojeBR()]);
                if (!v) continue; // van fora de viagem: não guarda (LGPD: só o necessário)
                const quando = dataHora(p.quando || undefined);
                await conn.query(`INSERT INTO viagem_posicoes (viagem_id, lat, lng, velocidade_kmh, registrado_em, fonte) VALUES (?, ?, ?, ?, ?, 'rastreador')`, [v.id, p.lat, p.lng, p.vel, quando]);
                await conn.query(`UPDATE viagens SET ultima_lat = ?, ultima_lng = ?, ultima_velocidade = ?, ultima_posicao_em = ? WHERE id = ? AND (ultima_posicao_em IS NULL OR ultima_posicao_em <= ?)`,
                    [p.lat, p.lng, p.vel, quando, v.id, quando]);
                gravadas++;
            }
        } catch (err) {
            console.error('[rastreador] erro:', err.message);
        } finally {
            if (conn) conn.release();
        }
    });
    res.json({ ok: true, gravadas });
}

router.post('/rastreador/:segredo', receber);
router.get('/rastreador/:segredo', receber);

export default router;
