// Previsão de chegada da van na parada de cada aluno, a partir da última posição GPS.
import { haversine, FATOR_RUAS } from '../lib/geo-math.js';
import { paradasDoDia } from './viagens.js';
import { empresaId } from '../lib/tenant.js';

/**
 * Retorna Map(aluno_id -> { min, parada_seq, sentido: 'busca' | 'casa' })
 * Ida: alunos aguardando embarque. Volta: alunos a bordo indo para casa.
 */
export async function estimarChegadas(conn, viagemId) {
    const [v] = await conn.query(`
        SELECT v.id, v.rota_id, v.status, v.ultima_lat, v.ultima_lng, r.tipo, r.velocidade_media_kmh, r.tempo_parada_seg
        FROM viagens v JOIN rotas r ON r.id = v.rota_id WHERE v.id = ? AND v.empresa_id = ?`, [viagemId, empresaId()]);
    const out = new Map();
    if (!v || v.status !== 'em_andamento' || v.ultima_lat === null) return out;

    const pres = await conn.query('SELECT aluno_id, status FROM presencas WHERE viagem_id = ?', [viagemId]);
    const st = new Map(pres.map(p => [p.aluno_id, p.status]));
    const fora = new Set(pres.filter(p => p.status === 'ausente_avisado').map(p => p.aluno_id));
    const { calculo } = await paradasDoDia(conn, v.rota_id, fora);

    const volta = v.tipo === 'volta';
    // paradas que ainda faltam, na ordem da rota
    const pendentes = calculo.paradas.filter(p => {
        if (p.lat === null || p.tipo === 'partida') return false;
        if (p.tipo === 'escola') return volta
            ? p.alunos.some(a => st.get(a.aluno_id) === 'previsto')
            : p.alunos.some(a => st.get(a.aluno_id) === 'embarcou');
        return volta
            ? p.alunos.some(a => st.get(a.aluno_id) === 'embarcou')
            : p.alunos.some(a => st.get(a.aluno_id) === 'previsto');
    });

    const kmh = Number(v.velocidade_media_kmh) || 25;
    const dwell = Number(v.tempo_parada_seg ?? 60);
    let pos = { lat: Number(v.ultima_lat), lng: Number(v.ultima_lng) };
    let seg = 0;
    pendentes.forEach((p, i) => {
        seg += (haversine(pos, p) * FATOR_RUAS) / (kmh / 3.6) + (i > 0 ? dwell : 0);
        pos = { lat: p.lat, lng: p.lng };
        if (p.tipo === 'escola') return;
        for (const a of p.alunos) {
            const s = st.get(a.aluno_id);
            if ((!volta && s === 'previsto') || (volta && s === 'embarcou')) {
                out.set(a.aluno_id, { min: Math.max(1, Math.round(seg / 60)), parada_seq: p.seq, sentido: volta ? 'casa' : 'busca' });
            }
        }
    });
    return out;
}
