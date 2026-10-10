// Painel: operação do dia (viagens ao vivo, ocorrências, emergências e ausências)
import { Router } from 'express';
import { handler, HttpError, parseId, toId, str, data as dataValida, limparLinha } from '../lib/http.js';
import { hojeBR, calendarioDoDia, rotaTemAula, detalheViagem, contarPresencas } from '../services/viagens.js';
import { horaParaSeg } from '../lib/geo-math.js';
import { registrarAusencia } from '../services/responsaveis.js';
import { escalaDoDia, conflitos, avisarSubstituicao } from '../services/escala.js';
import { verificarAnomalias, frotaAoVivo } from '../services/monitor.js';
import { paradasDoDia } from '../services/viagens.js';
import { haversine } from '../lib/geo-math.js';
import { empresaId, daEmpresa, refDaEmpresa } from '../lib/tenant.js';
import { lerConfig, salvarConfig } from '../services/config.js';
import { validarConfig } from './financeiro.js';

const router = Router();

function agoraSegBR() {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: process.env.TZ_APP || 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    return horaParaSeg(p);
}

router.get('/dia', handler(async (req, res, conn) => {
    const data = dataValida(req.query.data) || hojeBR();
    const ehHoje = data === hojeBR();
    const cal = await calendarioDoDia(conn, data);
    const rotas = (await conn.query(`
        SELECT r.id, r.nome, r.tipo, r.periodo, TIME_FORMAT(r.hora_saida,'%H:%i') AS hora_saida, TIME_FORMAT(r.hora_fim,'%H:%i') AS hora_fim,
               f.placa, m.nome AS motorista_nome, m.telefone AS motorista_telefone,
               (SELECT COUNT(*) FROM rota_alunos ra WHERE ra.rota_id = r.id) AS total_alunos
        FROM rotas r LEFT JOIN frota f ON f.id = r.veiculo_id LEFT JOIN motoristas m ON m.id = r.motorista_id
        WHERE r.status = 'Ativa' AND r.empresa_id = ? ORDER BY r.hora_saida IS NULL, r.hora_saida, r.nome`, [empresaId()])).map(limparLinha);

    const viagens = await conn.query(`
        SELECT v.id, v.rota_id, v.status, DATE_FORMAT(v.iniciada_em,'%H:%i') AS iniciada, DATE_FORMAT(v.concluida_em,'%H:%i') AS concluida,
               v.ultima_lat, v.ultima_lng, DATE_FORMAT(v.ultima_posicao_em,'%Y-%m-%dT%H:%i:%s') AS ultima_posicao_em,
               (SELECT COUNT(*) FROM ocorrencias o WHERE o.viagem_id = v.id AND o.status = 'aberta') AS ocorrencias_abertas,
               (SELECT COUNT(*) FROM ocorrencias o WHERE o.viagem_id = v.id AND o.status = 'aberta' AND o.tipo = 'emergencia') AS emergencias
        FROM viagens v WHERE v.data = ? AND v.empresa_id = ?`, [data, empresaId()]);
    const agora = agoraSegBR();
    // escala do dia (com substituições) e o que de fato saiu (viagem iniciada)
    const escala = await escalaDoDia(conn, data);
    const emp = empresaId();
    const motoristas = await conn.query('SELECT id, nome, telefone FROM motoristas WHERE empresa_id = ?', [emp]);
    const frota = await conn.query('SELECT id, placa FROM frota WHERE empresa_id = ?', [emp]);
    const monitores = await conn.query('SELECT id, nome FROM monitores WHERE empresa_id = ?', [emp]);
    const viagensIds = await conn.query('SELECT rota_id, motorista_id, veiculo_id, monitor_id FROM viagens WHERE data = ? AND empresa_id = ?', [data, emp]);

    const lista = [];
    for (const r of rotas) {
        const v = viagens.find(x => x.rota_id === r.id);
        const temAula = await rotaTemAula(conn, r.id, cal);
        let situacao = v ? v.status : 'nao_iniciada';
        let atrasada = false;
        if (ehHoje && temAula) {
            if (!v && r.hora_saida && agora > horaParaSeg(r.hora_saida) + 15 * 60) atrasada = true;
            if (v?.status === 'em_andamento' && r.hora_fim && agora > horaParaSeg(r.hora_fim) + 20 * 60) atrasada = true;
        }
        const esc = escala.get(r.id);
        const real = viagensIds.find(x => x.rota_id === r.id);
        const motId = real?.motorista_id ?? esc?.motorista_id, veiId = real?.veiculo_id ?? esc?.veiculo_id, monId = real?.monitor_id ?? esc?.monitor_id;
        const mot = motoristas.find(m => m.id === motId);
        lista.push({
            rota_id: r.id, rota_nome: r.nome, tipo: r.tipo, periodo: r.periodo, hora_saida: r.hora_saida, hora_fim: r.hora_fim,
            placa: frota.find(f => f.id === veiId)?.placa || null, motorista_nome: mot?.nome || null, motorista_telefone: mot?.telefone || null,
            monitor_nome: monitores.find(m => m.id === monId)?.nome || null, total_alunos: r.total_alunos,
            substituicao: esc?.substituicao_id ? { id: esc.substituicao_id, ...esc.trocado } : null,
            tem_aula: temAula, situacao, atrasada,
            viagem_id: v?.id ?? null, iniciada: v?.iniciada ?? null, concluida: v?.concluida ?? null,
            resumo: v ? contarPresencas(await conn.query('SELECT status FROM presencas WHERE viagem_id = ?', [v.id])) : null,
            ultima_posicao: v?.ultima_lat != null ? { lat: Number(v.ultima_lat), lng: Number(v.ultima_lng), em: v.ultima_posicao_em } : null,
            ocorrencias_abertas: Number(v?.ocorrencias_abertas || 0),
            emergencias: Number(v?.emergencias || 0),
        });
    }
    res.json({ data, hoje: ehHoje, calendario: { sem_aula_todas: cal.sem_aula_todas, motivo: cal.motivo }, viagens: lista });
}, 'Erro ao carregar a operação do dia'));

router.get('/viagens/:id', handler(async (req, res, conn) => {
    res.json(await detalheViagem(conn, await daEmpresa(conn, 'viagens', parseId(req), { nome: 'Viagem' }), { incluirTrilha: true }));
}, 'Erro ao carregar a viagem'));

// ---------- substituição rápida de motorista / van / monitor ----------
router.get('/substituicoes', handler(async (req, res, conn) => {
    const data = dataValida(req.query.data) || hojeBR();
    const rows = await conn.query(`
        SELECT s.id, s.rota_id, r.nome AS rota_nome, DATE_FORMAT(s.data_inicio,'%Y-%m-%d') AS data_inicio, DATE_FORMAT(s.data_fim,'%Y-%m-%d') AS data_fim,
               s.motivo, m.nome AS motorista_nome, f.placa, mo.nome AS monitor_nome, DATE_FORMAT(s.avisado_em,'%Y-%m-%dT%H:%i:%s') AS avisado_em
        FROM substituicoes s JOIN rotas r ON r.id = s.rota_id
        LEFT JOIN motoristas m ON m.id = s.motorista_id LEFT JOIN frota f ON f.id = s.veiculo_id LEFT JOIN monitores mo ON mo.id = s.monitor_id
        WHERE s.empresa_id = ? AND s.cancelada_em IS NULL AND s.data_fim >= ? ORDER BY s.data_inicio, r.nome`, [empresaId(), data]);
    res.json(rows.map(limparLinha));
}, 'Erro ao listar substituições'));

router.post('/substituicoes', handler(async (req, res, conn) => {
    const b = req.body || {};
    const rotaId = toId(b.rota_id);
    const inicio = dataValida(b.data_inicio) || hojeBR();
    const fim = dataValida(b.data_fim) || inicio;
    if (fim < inicio) throw new HttpError(400, 'A data final é anterior à inicial.');
    if (inicio < hojeBR()) throw new HttpError(400, 'Não dá para substituir em data passada.');
    const motoristaId = toId(b.motorista_id), veiculoId = toId(b.veiculo_id), monitorId = toId(b.monitor_id);
    const [rota] = rotaId ? await conn.query('SELECT id, motorista_id, veiculo_id FROM rotas WHERE id = ? AND empresa_id = ?', [rotaId, empresaId()]) : [];
    if (!rota) throw new HttpError(404, 'Rota não encontrada.');
    if (!motoristaId && !veiculoId && !monitorId) throw new HttpError(400, 'Escolha quem/qual van assume.');
    await refDaEmpresa(conn, 'frota', veiculoId, 'Veículo');
    await refDaEmpresa(conn, 'monitores', monitorId, 'Monitor');
    if (motoristaId) {
        const [m] = await conn.query(`SELECT status FROM motoristas WHERE id = ? AND empresa_id = ?`, [motoristaId, empresaId()]);
        if (!m || m.status !== 'Ativo') throw new HttpError(400, 'Motorista não encontrado ou inativo.');
    }
    // aplicar em todas as rotas do mesmo motorista/van no período (ex.: motorista doente o dia todo)
    let rotaIds = [rotaId];
    const escIni = (await escalaDoDia(conn, inicio)).get(rotaId);
    if (b.todas_do_motorista && escIni?.motorista_id) {
        rotaIds = [...(await escalaDoDia(conn, inicio))].filter(([, e]) => e.motorista_id === escIni.motorista_id).map(([id]) => id);
    } else if (b.todas_do_veiculo && escIni?.veiculo_id) {
        rotaIds = [...(await escalaDoDia(conn, inicio))].filter(([, e]) => e.veiculo_id === escIni.veiculo_id).map(([id]) => id);
    }
    if (!b.forcar) {
        const c = await conflitos(conn, { rotaIds, inicio, fim, motoristaId, veiculoId });
        if (c.length) return res.status(409).json({ error: 'Conflito de horário.', conflitos: c });
    }
    // viagem já em andamento hoje não troca no meio
    const emAndamento = inicio === hojeBR() ? await conn.query(`SELECT r.nome FROM viagens v JOIN rotas r ON r.id = v.rota_id WHERE v.empresa_id = ? AND v.data = ? AND v.rota_id IN (?) AND v.status <> 'nao_iniciada'`, [empresaId(), inicio, rotaIds]) : [];
    const ids = [];
    for (const rid of rotaIds) {
        const r = await conn.query(`INSERT INTO substituicoes (empresa_id, rota_id, data_inicio, data_fim, motorista_id, veiculo_id, monitor_id, motivo, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [empresaId(), rid, inicio, fim, motoristaId, veiculoId, monitorId, str(b.motivo), req.user?.id || null]);
        ids.push(Number(r.insertId));
    }
    const avisados = b.avisar_pais === false ? 0 : await avisarSubstituicao(conn, ids);
    res.status(201).json({ ids, rotas: rotaIds.length, avisados, ja_iniciadas: emAndamento.map(x => x.nome) });
}, 'Erro ao registrar substituição'));

router.delete('/substituicoes/:id', handler(async (req, res, conn) => {
    const r = await conn.query('UPDATE substituicoes SET cancelada_em = NOW() WHERE id = ? AND empresa_id = ? AND cancelada_em IS NULL', [parseId(req), empresaId()]);
    if (!r.affectedRows) throw new HttpError(404, 'Substituição não encontrada.');
    res.json({ success: true });
}, 'Erro ao cancelar substituição'));

// ---------- mapa ao vivo e histórico ----------
router.get('/frota-ao-vivo', handler(async (req, res, conn) => {
    res.json(await frotaAoVivo(conn));
}, 'Erro ao carregar a frota'));

router.get('/viagens/:id/trajeto', handler(async (req, res, conn) => {
    const id = parseId(req);
    const [v] = await conn.query(`
        SELECT v.id, v.rota_id, v.status, DATE_FORMAT(v.data,'%Y-%m-%d') AS data, r.nome AS rota_nome, f.placa, m.nome AS motorista_nome,
               DATE_FORMAT(v.iniciada_em,'%Y-%m-%dT%H:%i:%s') AS iniciada_em, DATE_FORMAT(v.concluida_em,'%Y-%m-%dT%H:%i:%s') AS concluida_em
        FROM viagens v JOIN rotas r ON r.id = v.rota_id LEFT JOIN frota f ON f.id = v.veiculo_id LEFT JOIN motoristas m ON m.id = v.motorista_id
        WHERE v.id = ? AND v.empresa_id = ?`, [id, empresaId()]);
    if (!v) throw new HttpError(404, 'Viagem não encontrada.');
    let pos = (await conn.query(`SELECT lat, lng, velocidade_kmh AS vel, precisao_m AS prec, DATE_FORMAT(registrado_em,'%Y-%m-%dT%H:%i:%s') AS em
        FROM viagem_posicoes WHERE viagem_id = ? ORDER BY registrado_em`, [id])).map(p => ({ lat: Number(p.lat), lng: Number(p.lng), vel: p.vel === null ? null : Number(p.vel), prec: p.prec, em: p.em }));
    // estatísticas (ignora saltos de GPS impossíveis)
    let km = 0, velMax = 0;
    const paradas = [];
    let iniParada = 0;
    for (let i = 1; i < pos.length; i++) {
        const d = haversine(pos[i - 1], pos[i]);
        const dt = (Date.parse(pos[i].em) - Date.parse(pos[i - 1].em)) / 1000;
        const vel = dt > 0 ? (d / dt) * 3.6 : 0;
        if (dt > 0 && vel < 150) km += d;
        const vGps = pos[i].vel ?? (dt >= 10 && vel < 150 ? vel : 0);
        velMax = Math.max(velMax, vGps || 0);
        if (haversine(pos[iniParada], pos[i]) > 60) {
            const min = (Date.parse(pos[i - 1].em) - Date.parse(pos[iniParada].em)) / 60000;
            if (min >= 3) paradas.push({ lat: pos[iniParada].lat, lng: pos[iniParada].lng, inicio: pos[iniParada].em, minutos: Math.round(min) });
            iniParada = i;
        }
    }
    // parada que ainda está acontecendo (ou terminou no fim da viagem)
    if (pos.length > 1) {
        const min = (Date.parse(pos.at(-1).em) - Date.parse(pos[iniParada].em)) / 60000;
        if (min >= 3) paradas.push({ lat: pos[iniParada].lat, lng: pos[iniParada].lng, inicio: pos[iniParada].em, minutos: Math.round(min) });
    }
    // reduz para no máximo 3000 pontos (mantém o desenho)
    if (pos.length > 3000) { const passo = Math.ceil(pos.length / 3000); pos = pos.filter((_, i) => i % passo === 0 || i === pos.length - 1); }
    const eventos = (await conn.query(`
        SELECT ev.tipo, ev.lat, ev.lng, a.nome AS aluno_nome, DATE_FORMAT(ev.registrado_em,'%Y-%m-%dT%H:%i:%s') AS em
        FROM viagem_eventos ev LEFT JOIN alunos a ON a.id = ev.aluno_id WHERE ev.viagem_id = ? ORDER BY ev.registrado_em, ev.id`, [id]))
        .map(e => ({ ...e, lat: e.lat === null ? null : Number(e.lat), lng: e.lng === null ? null : Number(e.lng) }));
    let planejado = [];
    try {
        const { calculo } = await paradasDoDia(conn, v.rota_id, new Set());
        planejado = calculo.paradas.filter(p => p.lat != null).map(p => ({ lat: Number(p.lat), lng: Number(p.lng), tipo: p.tipo, nome: p.nome || p.endereco || '', chegada: p.chegada || null }));
    } catch { /* rota alterada/sem endereço */ }
    const alertas = await conn.query(`SELECT tipo, nivel, mensagem, lat, lng, DATE_FORMAT(criado_em,'%Y-%m-%dT%H:%i:%s') AS em FROM alertas_operacao WHERE viagem_id = ? AND empresa_id = ? ORDER BY criado_em`, [id, empresaId()]);
    res.json({
        viagem: v, posicoes: pos, eventos, planejado, paradas_longas: paradas,
        alertas: alertas.map(a => ({ ...a, lat: a.lat === null ? null : Number(a.lat), lng: a.lng === null ? null : Number(a.lng) })),
        resumo: {
            km: Math.round(km / 100) / 10, velocidade_max: Math.round(velMax),
            duracao_min: pos.length > 1 ? Math.round((Date.parse(pos.at(-1).em) - Date.parse(pos[0].em)) / 60000) : 0, pontos: pos.length,
        },
    });
}, 'Erro ao carregar o trajeto'));

// ---------- anomalias ----------
router.get('/anomalias', handler(async (req, res, conn) => {
    const todas = req.query.todas === '1';
    const rows = await conn.query(`
        SELECT a.id, a.viagem_id, a.rota_id, a.tipo, a.nivel, a.mensagem, a.lat, a.lng, a.resolvido_por,
               DATE_FORMAT(a.criado_em,'%Y-%m-%dT%H:%i:%s') AS criado_em, DATE_FORMAT(a.atualizado_em,'%Y-%m-%dT%H:%i:%s') AS atualizado_em,
               DATE_FORMAT(a.resolvido_em,'%Y-%m-%dT%H:%i:%s') AS resolvido_em, r.nome AS rota_nome, f.placa, m.nome AS motorista_nome, m.telefone AS motorista_telefone
        FROM alertas_operacao a LEFT JOIN viagens v ON v.id = a.viagem_id LEFT JOIN rotas r ON r.id = a.rota_id
        LEFT JOIN frota f ON f.id = v.veiculo_id LEFT JOIN motoristas m ON m.id = v.motorista_id
        WHERE a.empresa_id = ? AND ${todas ? 'a.criado_em >= NOW() - INTERVAL 7 DAY' : 'a.resolvido_em IS NULL'}
        ORDER BY a.resolvido_em IS NULL DESC, FIELD(a.nivel, 'critico', 'aviso'), a.criado_em DESC LIMIT 200`, [empresaId()]);
    res.json(rows.map(a => ({ ...a, lat: a.lat === null ? null : Number(a.lat), lng: a.lng === null ? null : Number(a.lng) })));
}, 'Erro ao listar alertas'));

router.put('/anomalias/:id/resolver', handler(async (req, res, conn) => {
    const r = await conn.query(`UPDATE alertas_operacao SET resolvido_em = NOW(), resolvido_por = ? WHERE id = ? AND empresa_id = ? AND resolvido_em IS NULL`,
        [str(req.user?.nome || req.user?.email || 'painel', 60), parseId(req), empresaId()]);
    if (!r.affectedRows) throw new HttpError(404, 'Alerta não encontrado ou já resolvido.');
    res.json({ success: true });
}, 'Erro ao resolver alerta'));

router.post('/anomalias/verificar', handler(async (req, res, conn) => {
    res.json({ novos: (await verificarAnomalias(conn)).length });
}, 'Erro ao verificar'));

router.get('/alertas', handler(async (req, res, conn) => {
    const emergencias = await conn.query(`
        SELECT o.id, o.viagem_id, o.descricao, o.lat, o.lng, DATE_FORMAT(o.registrado_em,'%Y-%m-%dT%H:%i:%s') AS registrado_em,
               r.nome AS rota_nome, m.nome AS motorista_nome, m.telefone AS motorista_telefone
        FROM ocorrencias o
        LEFT JOIN viagens v ON v.id = o.viagem_id LEFT JOIN rotas r ON r.id = v.rota_id LEFT JOIN motoristas m ON m.id = v.motorista_id
        WHERE o.empresa_id = ? AND o.tipo = 'emergencia' AND o.status = 'aberta' ORDER BY o.registrado_em DESC`, [empresaId()]);
    const [{ n }] = await conn.query(`SELECT COUNT(*) AS n FROM ocorrencias WHERE empresa_id = ? AND status = 'aberta' AND tipo <> 'emergencia'`, [empresaId()]);
    const [an] = await conn.query(`SELECT COUNT(*) AS total, COALESCE(SUM(nivel = 'critico'), 0) AS criticos FROM alertas_operacao WHERE empresa_id = ? AND resolvido_em IS NULL`, [empresaId()]);
    res.json({
        emergencias: emergencias.map(e => ({ ...e, lat: e.lat === null ? null : Number(e.lat), lng: e.lng === null ? null : Number(e.lng) })),
        ocorrencias_abertas: Number(n),
        anomalias_abertas: Number(an.total), anomalias_criticas: Number(an.criticos),
    });
}, 'Erro ao buscar alertas'));

router.get('/ocorrencias', handler(async (req, res, conn) => {
    const status = req.query.status === 'todas' ? null : 'aberta';
    const rows = await conn.query(`
        SELECT o.id, o.viagem_id, o.tipo, o.gravidade, o.descricao, o.status, o.resolucao, (o.foto IS NOT NULL) AS tem_foto,
               DATE_FORMAT(o.registrado_em,'%Y-%m-%dT%H:%i:%s') AS registrado_em, a.nome AS aluno_nome, r.nome AS rota_nome, m.nome AS motorista_nome
        FROM ocorrencias o LEFT JOIN alunos a ON a.id = o.aluno_id LEFT JOIN viagens v ON v.id = o.viagem_id
        LEFT JOIN rotas r ON r.id = v.rota_id LEFT JOIN motoristas m ON m.id = v.motorista_id
        WHERE o.empresa_id = ? ${status ? "AND o.status = 'aberta'" : ''} ORDER BY o.registrado_em DESC LIMIT 200`, [empresaId()]);
    res.json(rows.map(o => ({ ...limparLinha(o), tem_foto: !!Number(o.tem_foto) })));
}, 'Erro ao buscar ocorrências'));

router.get('/ocorrencias/:id/foto', handler(async (req, res, conn) => {
    const [o] = await conn.query('SELECT foto FROM ocorrencias WHERE id = ? AND empresa_id = ?', [parseId(req), empresaId()]);
    if (!o?.foto) throw new HttpError(404, 'Sem foto.');
    res.json({ foto: o.foto });
}, 'Erro ao buscar foto'));

router.put('/ocorrencias/:id/resolver', handler(async (req, res, conn) => {
    const r = await conn.query(`UPDATE ocorrencias SET status = 'resolvida', resolucao = ?, resolvida_em = NOW() WHERE id = ? AND empresa_id = ?`,
        [str(req.body.resolucao, 2000), parseId(req), empresaId()]);
    if (r.affectedRows === 0) throw new HttpError(404, 'Ocorrência não encontrada.');
    res.json({ success: true });
}, 'Erro ao resolver ocorrência'));

// ---------- Ausências ----------
router.get('/ausencias', handler(async (req, res, conn) => {
    const de = dataValida(req.query.de) || hojeBR();
    const ate = dataValida(req.query.ate) || de;
    const rows = await conn.query(`
        SELECT au.id, au.aluno_id, a.nome AS aluno_nome, e.nome AS escola_nome, au.sentido, au.motivo, au.origem,
               DATE_FORMAT(au.data_inicio,'%Y-%m-%d') AS data_inicio, DATE_FORMAT(au.data_fim,'%Y-%m-%d') AS data_fim
        FROM ausencias au JOIN alunos a ON a.id = au.aluno_id LEFT JOIN escolas e ON e.id = a.escola_id
        WHERE au.empresa_id = ? AND au.data_inicio <= ? AND au.data_fim >= ? ORDER BY a.nome`, [empresaId(), ate, de]);
    res.json(rows.map(limparLinha));
}, 'Erro ao buscar ausências'));

router.post('/ausencias', handler(async (req, res, conn) => {
    const alunoId = toId(req.body.aluno_id);
    if (!alunoId) throw new HttpError(400, 'Selecione o aluno.');
    await refDaEmpresa(conn, 'alunos', alunoId, 'Aluno');
    const inicio = dataValida(req.body.data_inicio);
    if (!inicio) throw new HttpError(400, 'Informe a data.');
    const fim = dataValida(req.body.data_fim) || inicio;
    if (fim < inicio) throw new HttpError(400, 'A data final é anterior à inicial.');
    const sentido = ['ambos', 'ida', 'volta'].includes(req.body.sentido) ? req.body.sentido : 'ambos';
    const [id] = await registrarAusencia(conn, { alunoIds: [alunoId], inicio, fim, sentido, motivo: str(req.body.motivo), origem: 'painel', criadoPor: req.user.id });
    res.status(201).json({ id });
}, 'Erro ao registrar ausência'));

router.delete('/ausencias/:id', handler(async (req, res, conn) => {
    await conn.query('DELETE FROM ausencias WHERE id = ? AND empresa_id = ?', [parseId(req), empresaId()]);
    res.json({ success: true });
}, 'Erro ao excluir ausência'));

// ---------- configuração dos alertas (gestor e dono) ----------
router.get('/config', handler(async (req, res, conn) => {
    res.json(await lerConfig(conn, 'operacao'));
}, 'Erro ao ler configuração'));

router.put('/config', handler(async (req, res, conn) => {
    res.json(await salvarConfig(conn, 'operacao', validarConfig('operacao', req.body || {})));
}, 'Erro ao salvar configuração'));

export default router;
