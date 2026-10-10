// Portal da escola (link mágico): a escola vê quais alunos dela estão chegando e em qual van.
// Só nome, turno e situação — nada de endereço ou dados de saúde (LGPD).
import { Router } from 'express';
import pool from '../db.js';
import { handler } from '../lib/http.js';
import { lerTokenEscola } from '../middleware/auth.js';
import { comEmpresa, empresaId } from '../lib/tenant.js';
import { hojeBR, dataHora } from '../services/viagens.js';
import { estimarTrecho } from '../lib/geo-math.js';
import { lerConfig } from '../services/config.js';
import { escalaDoDia } from '../services/escala.js';

const router = Router();

router.use(async (req, res, next) => {
    const [tipo, token] = (req.headers.authorization || '').split(' ');
    const t = tipo === 'Bearer' ? lerTokenEscola(token) : null;
    if (!t) return res.status(401).json({ error: 'Link inválido ou expirado. Peça um novo link à empresa de transporte.' });
    let e;
    try {
        [e] = await pool.query('SELECT id, empresa_id, nome, lat, lng, portal_versao FROM escolas WHERE id = ?', [t.escola_id]);
    } catch (err) {
        console.error('[escola-portal]', err.message);
        return res.status(500).json({ error: 'Erro interno' });
    }
    if (!e || e.portal_versao !== t.versao) return res.status(401).json({ error: 'Este link foi desativado. Peça um novo link à empresa de transporte.' });
    req.escola = e;
    return comEmpresa(e.empresa_id, () => next());
});

const ROTULO = { previsto: 'Aguardando a van', ausente_avisado: 'Falta avisada', embarcou: 'Na van', desembarcou: 'Entregue', nao_compareceu: 'Não embarcou' };

router.get('/hoje', handler(async (req, res, conn) => {
    const e = req.escola, data = hojeBR();
    const alunos = await conn.query(`
        SELECT a.id, a.nome, a.turno, ra.rota_id, r.nome AS rota_nome, r.tipo, r.velocidade_media_kmh, r.tempo_parada_seg,
               TIME_FORMAT(r.hora_saida,'%H:%i') AS hora_saida, TIME_FORMAT(re.hora_prevista,'%H:%i') AS previsto_escola
        FROM alunos a JOIN rota_alunos ra ON ra.aluno_id = a.id
        JOIN rotas r ON r.id = ra.rota_id AND r.status = 'Ativa' AND r.empresa_id = a.empresa_id
        LEFT JOIN rota_escolas re ON re.rota_id = r.id AND re.escola_id = a.escola_id
        WHERE a.escola_id = ? AND a.empresa_id = ? AND a.status = 'Ativo' AND a.suspenso = false
        ORDER BY r.hora_saida, a.nome`, [e.id, empresaId()]);
    const rotaIds = [...new Set(alunos.map(a => a.rota_id))];
    const viagens = rotaIds.length ? await conn.query(`
        SELECT v.id, v.rota_id, v.status, v.ultima_lat, v.ultima_lng, DATE_FORMAT(v.ultima_posicao_em,'%Y-%m-%d %H:%i:%s') AS ultima
        FROM viagens v WHERE v.empresa_id = ? AND v.data = ? AND v.rota_id IN (?)`, [empresaId(), data, rotaIds]) : [];
    const pres = viagens.length ? await conn.query(`SELECT viagem_id, aluno_id, status, DATE_FORMAT(desembarque_em,'%H:%i') AS desembarque, DATE_FORMAT(embarque_em,'%H:%i') AS embarque FROM presencas WHERE viagem_id IN (?)`, [viagens.map(v => v.id)]) : [];
    const ausentes = alunos.length ? await conn.query(`SELECT aluno_id, sentido FROM ausencias WHERE empresa_id = ? AND data_inicio <= ? AND data_fim >= ? AND aluno_id IN (?)`, [empresaId(), data, data, alunos.map(a => a.id)]) : [];
    const esc = await escalaDoDia(conn, data);
    const frota = await conn.query('SELECT id, placa, modelo FROM frota WHERE empresa_id = ?', [empresaId()]);
    const mots = await conn.query('SELECT id, nome, telefone FROM motoristas WHERE empresa_id = ?', [empresaId()]);
    const agora = dataHora();

    const vans = rotaIds.map(rid => {
        const lista = alunos.filter(a => a.rota_id === rid);
        const r = lista[0];
        const v = viagens.find(x => x.rota_id === rid);
        const e2 = esc.get(rid) || {};
        const f = frota.find(x => x.id === e2.veiculo_id), m = mots.find(x => x.id === e2.motorista_id);
        let eta = null;
        // ida a caminho: tempo da posição atual até a escola + paradas que faltam
        if (v?.status === 'em_andamento' && r.tipo === 'ida' && v.ultima_lat !== null && e.lat !== null) {
            const faltam = pres.filter(p => p.viagem_id === v.id && p.status === 'previsto').length;
            const s = estimarTrecho({ lat: Number(v.ultima_lat), lng: Number(v.ultima_lng) }, { lat: Number(e.lat), lng: Number(e.lng) }, Number(r.velocidade_media_kmh) || 25).segundos
                + faltam * (Number(r.tempo_parada_seg) || 60);
            eta = Math.max(1, Math.round(s / 60));
        }
        return {
            rota_nome: r.rota_nome, tipo: r.tipo, hora_saida: r.hora_saida, previsto_escola: r.previsto_escola,
            placa: f?.placa || null, modelo: f?.modelo || null, motorista: m?.nome || null, motorista_telefone: m?.telefone || null,
            situacao: v ? v.status : 'nao_iniciada', eta_min: eta,
            posicao: v?.ultima_lat != null ? { lat: Number(v.ultima_lat), lng: Number(v.ultima_lng), em: v.ultima } : null,
            alunos: lista.map(a => {
                const p = v ? pres.find(x => x.viagem_id === v.id && x.aluno_id === a.id) : null;
                const aus = ausentes.some(x => x.aluno_id === a.id && (x.sentido === 'ambos' || x.sentido === r.tipo));
                const st = p?.status || (aus ? 'ausente_avisado' : 'previsto');
                // na ida, "desembarcou" = chegou na escola; na volta, "embarcou" = saiu da escola
                const rotulo = r.tipo === 'ida' && st === 'desembarcou' ? `Chegou na escola${p?.desembarque ? ` às ${p.desembarque}` : ''}`
                    : r.tipo === 'volta' && st === 'embarcou' ? `Saiu na van${p?.embarque ? ` às ${p.embarque}` : ''}`
                        : r.tipo === 'volta' && st === 'previsto' ? 'Aguardando na escola' : ROTULO[st];
                return { nome: a.nome, turno: a.turno, status: st, rotulo };
            }),
        };
    });
    res.json({ escola: e.nome, empresa: (await lerConfig(conn, 'empresa')).nome_fantasia, data, agora: agora.slice(11, 16), vans });
}, 'Erro ao carregar'));

export default router;
