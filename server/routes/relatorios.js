// Relatórios do período: pontualidade, ocupação, km rodado e custo por aluno
import { Router } from 'express';
import { handler, HttpError, data as dataValida } from '../lib/http.js';
import { empresaId } from '../lib/tenant.js';
import { hojeBR } from '../services/viagens.js';
import { lugaresDoVeiculo } from '../services/rotaEngine.js';
import { haversine, horaParaSeg } from '../lib/geo-math.js';

const router = Router();
const r1 = (v) => Math.round(v * 10) / 10;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const seg = (iso) => (iso ? horaParaSeg(String(iso).slice(11, 19)) : null);

router.get('/', handler(async (req, res, conn) => {
    const hoje = hojeBR();
    const de = dataValida(req.query.de) || `${hoje.slice(0, 7)}-01`;
    const ate = dataValida(req.query.ate) || hoje;
    if (ate < de) throw new HttpError(400, 'A data final é anterior à inicial.');
    const emp = empresaId();

    const viagens = await conn.query(`
        SELECT v.id, v.rota_id, v.veiculo_id, v.status, DATE_FORMAT(v.data,'%Y-%m-%d') AS data,
               DATE_FORMAT(v.iniciada_em,'%Y-%m-%d %H:%i:%s') AS iniciada, DATE_FORMAT(v.concluida_em,'%Y-%m-%d %H:%i:%s') AS concluida,
               r.nome AS rota_nome, TIME_FORMAT(r.hora_saida,'%H:%i:%s') AS hora_saida, TIME_FORMAT(r.hora_fim,'%H:%i:%s') AS hora_fim, r.distancia_m
        FROM viagens v JOIN rotas r ON r.id = v.rota_id
        WHERE v.empresa_id = ? AND v.data BETWEEN ? AND ?`, [emp, de, ate]);
    const ids = viagens.map(v => v.id);
    const pres = ids.length ? await conn.query(`SELECT viagem_id, status FROM presencas WHERE viagem_id IN (?)`, [ids]) : [];
    const posicoes = ids.length ? await conn.query(`SELECT viagem_id, lat, lng, registrado_em FROM viagem_posicoes WHERE viagem_id IN (?) ORDER BY viagem_id, registrado_em`, [ids]) : [];

    // km medido pelo GPS (ignora saltos impossíveis); sem GPS, usa a distância planejada da rota
    const kmGps = new Map();
    for (let i = 1; i < posicoes.length; i++) {
        const a = posicoes[i - 1], b = posicoes[i];
        if (a.viagem_id !== b.viagem_id) continue;
        const d = haversine({ lat: Number(a.lat), lng: Number(a.lng) }, { lat: Number(b.lat), lng: Number(b.lng) });
        const dt = (new Date(b.registrado_em) - new Date(a.registrado_em)) / 1000;
        if (dt > 0 && (d / dt) * 3.6 < 150) kmGps.set(a.viagem_id, (kmGps.get(a.viagem_id) || 0) + d / 1000);
    }
    const kmDaViagem = (v) => (kmGps.get(v.id) > 0.3 ? kmGps.get(v.id) : v.status === 'concluida' ? Number(v.distancia_m || 0) / 1000 : 0);

    // pontualidade por rota: saiu até 5 min depois do horário e terminou até 10 min depois do previsto
    const porRota = new Map();
    for (const v of viagens) {
        if (!porRota.has(v.rota_id)) porRota.set(v.rota_id, { rota_id: v.rota_id, rota_nome: v.rota_nome, viagens: 0, saida_no_horario: 0, fim_no_horario: 0, embarques: 0, previstos: 0, km: 0 });
        const r = porRota.get(v.rota_id);
        r.viagens++;
        const s0 = horaParaSeg(v.hora_saida), sf = horaParaSeg(v.hora_fim);
        if (s0 !== null && seg(v.iniciada) !== null && seg(v.iniciada) <= s0 + 300) r.saida_no_horario++;
        if (v.status === 'concluida' && sf !== null && seg(v.concluida) !== null && seg(v.concluida) <= sf + 600) r.fim_no_horario++;
        const p = pres.filter(x => x.viagem_id === v.id);
        r.previstos += p.filter(x => x.status !== 'ausente_avisado').length;
        r.embarques += p.filter(x => x.status === 'embarcou' || x.status === 'desembarcou').length;
        r.km += kmDaViagem(v);
    }
    const pontualidade = [...porRota.values()].map(r => ({
        ...r, km: r1(r.km), pct_saida: pct(r.saida_no_horario, r.viagens), pct_fim: pct(r.fim_no_horario, r.viagens), pct_presenca: pct(r.embarques, r.previstos),
    })).sort((a, b) => a.rota_nome.localeCompare(b.rota_nome));

    // ocupação e km por veículo
    const frota = await conn.query('SELECT id, placa, modelo, capacidade FROM frota WHERE empresa_id = ? ORDER BY placa', [emp]);
    const lotacao = await conn.query(`
        SELECT r.veiculo_id, MAX(c.n) AS maior FROM rotas r
        JOIN (SELECT ra.rota_id, COUNT(*) n FROM rota_alunos ra GROUP BY ra.rota_id) c ON c.rota_id = r.id
        WHERE r.empresa_id = ? AND r.status = 'Ativa' GROUP BY r.veiculo_id`, [emp]);
    const veiculos = frota.map(f => {
        const vs = viagens.filter(v => v.veiculo_id === f.id);
        const lugares = lugaresDoVeiculo(f.capacidade);
        const maior = Number(lotacao.find(l => l.veiculo_id === f.id)?.maior || 0);
        const p = pres.filter(x => vs.some(v => v.id === x.viagem_id));
        const embarcados = p.filter(x => x.status === 'embarcou' || x.status === 'desembarcou').length;
        return {
            veiculo_id: f.id, placa: f.placa, modelo: f.modelo, lugares, alunos_maior_rota: maior, ocupacao_pct: pct(maior, lugares),
            viagens: vs.length, media_a_bordo: vs.length ? r1(embarcados / vs.length) : null,
            ocupacao_real_pct: vs.length && lugares ? pct(embarcados / vs.length, lugares) : null,
            km: r1(vs.reduce((s, v) => s + kmDaViagem(v), 0)),
        };
    });

    const totais = {
        viagens: viagens.length, concluidas: viagens.filter(v => v.status === 'concluida').length,
        km: r1(veiculos.reduce((s, v) => s + v.km, 0)),
        pct_saida: pct(pontualidade.reduce((s, r) => s + r.saida_no_horario, 0), viagens.length),
        pct_presenca: pct(pontualidade.reduce((s, r) => s + r.embarques, 0), pontualidade.reduce((s, r) => s + r.previstos, 0)),
    };

    // custo por aluno (só quem vê o financeiro)
    let custos = null;
    if (['dono', 'financeiro'].includes(req.user.papel)) {
        const meses = Math.max(1, Math.round((Date.parse(ate) - Date.parse(de)) / (30.4 * 86400000)));
        const [[c], [m], [fx], [mo], [al]] = await Promise.all([
            conn.query('SELECT COALESCE(SUM(custo_total),0) v FROM abastecimentos WHERE empresa_id = ? AND data_abastecimento BETWEEN ? AND ?', [emp, de, ate]),
            conn.query("SELECT COALESCE(SUM(custo),0) v FROM manutencoes WHERE empresa_id = ? AND status <> 'Cancelada' AND data_agendada BETWEEN ? AND ?", [emp, de, ate]),
            conn.query('SELECT COALESCE(SUM(custo_fixo_mensal),0) v FROM frota WHERE empresa_id = ?', [emp]),
            conn.query("SELECT COALESCE(SUM(custo_mensal),0) v FROM motoristas WHERE empresa_id = ? AND status = 'Ativo'", [emp]),
            conn.query("SELECT COUNT(*) v FROM alunos WHERE empresa_id = ? AND status = 'Ativo' AND anonimizado_em IS NULL", [emp]),
        ]);
        const [rec] = await conn.query(`SELECT COALESCE(SUM(COALESCE(valor_pago, valor)),0) v FROM mensalidades WHERE empresa_id = ? AND status = 'Pago' AND data_pagamento BETWEEN ? AND ?`, [emp, de, ate]);
        const total = Number(c.v) + Number(m.v) + (Number(fx.v) + Number(mo.v)) * meses;
        const alunos = Number(al.v);
        custos = {
            combustivel: Number(c.v), manutencao: Number(m.v), fixos_veiculos: Number(fx.v) * meses, motoristas: Number(mo.v) * meses,
            total: Math.round(total * 100) / 100, alunos_ativos: alunos, meses,
            por_aluno_mes: alunos ? Math.round((total / alunos / meses) * 100) / 100 : null,
            por_km: totais.km ? Math.round((total / totais.km) * 100) / 100 : null,
            recebido: Number(rec.v),
        };
    }
    res.json({ de, ate, totais, pontualidade, veiculos, custos });
}, 'Erro ao gerar relatórios'));

export default router;
