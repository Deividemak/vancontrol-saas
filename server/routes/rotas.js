import { Router } from 'express';
import { handler, HttpError, transacao, parseId, toId, str, hora, coord, limparLinha } from '../lib/http.js';
import { calcularRota, lugaresDoVeiculo, turnoCompativel } from '../services/rotaEngine.js';
import { sugerirOrdem, simularNaRota } from '../services/otimizacao.js';
import { precoSugerido } from '../services/precos.js';
import { formatarEndereco } from '../services/geocoding.js';
import { horaParaSeg, segParaHora } from '../lib/geo-math.js';
import { empresaId, daEmpresa, refDaEmpresa, todosDaEmpresa } from '../lib/tenant.js';

const router = Router();

const TURNOS = ['Manhã', 'Tarde', 'Integral', 'Noite'];
const TIPOS = ['ida', 'volta'];

// ---------- carregamento do contexto ----------

export async function carregarContexto(conn, rotaId) {
    const [rota] = await conn.query('SELECT * FROM rotas WHERE id = ? AND empresa_id = ?', [rotaId, empresaId()]);
    if (!rota) throw new HttpError(404, 'Rota não encontrada.');

    const alunos = (await conn.query(`
        SELECT ra.aluno_id, ra.ordem, ra.ponto_encontro_id,
               a.nome, a.turno, a.escola_id, a.responsavel_id, a.lat, a.lng, a.geo_status, a.foto_thumb, a.suspenso,
               a.logradouro, a.numero, a.complemento, a.bairro, a.cidade, a.uf, a.cep,
               e.nome AS escola_nome
        FROM rota_alunos ra
        JOIN alunos a ON a.id = ra.aluno_id AND a.empresa_id = ?
        LEFT JOIN escolas e ON e.id = a.escola_id AND e.empresa_id = a.empresa_id
        WHERE ra.rota_id = ?
    `, [empresaId(), rotaId])).map(r => ({ ...limparLinha(r), endereco: formatarEndereco(r) || null }));

    await sincronizarEscolas(conn, rotaId, alunos);

    const escolasRows = await conn.query(`
        SELECT re.escola_id, re.ordem, e.nome, e.lat, e.lng,
               e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.uf, e.cep, e.endereco AS endereco_texto
        FROM rota_escolas re JOIN escolas e ON e.id = re.escola_id AND e.empresa_id = ?
        WHERE re.rota_id = ?
    `, [empresaId(), rotaId]);
    const horarios = escolasRows.length
        ? await conn.query(`SELECT escola_id, turno, TIME_FORMAT(entrada,'%H:%i') AS entrada, TIME_FORMAT(saida,'%H:%i') AS saida
                            FROM escola_horarios WHERE escola_id IN (?)`, [escolasRows.map(e => e.escola_id)])
        : [];
    const escolas = escolasRows.map(e => {
        const hs = {};
        for (const h of horarios.filter(h => h.escola_id === e.escola_id)) hs[h.turno] = { entrada: h.entrada, saida: h.saida };
        return { ...limparLinha(e), endereco: formatarEndereco(e) || e.endereco_texto || null, horarios: hs };
    });

    const emp = empresaId();
    const pontos = new Map((await conn.query('SELECT * FROM pontos_encontro WHERE empresa_id = ?', [emp])).map(p => [p.id, p]));
    const areas = await conn.query('SELECT * FROM areas_restritas WHERE ativo = true AND empresa_id = ?', [emp]);
    const [veiculo] = rota.veiculo_id ? await conn.query('SELECT id, placa, modelo, capacidade FROM frota WHERE id = ? AND empresa_id = ?', [rota.veiculo_id, emp]) : [];
    const [motorista] = rota.motorista_id ? await conn.query('SELECT id, nome, telefone FROM motoristas WHERE id = ? AND empresa_id = ?', [rota.motorista_id, emp]) : [];

    return { rota: limparLinha(rota), alunos, escolas, pontos, areas, veiculo: veiculo || null, motorista: motorista || null };
}

/** Mantém rota_escolas igual ao conjunto de escolas dos alunos da rota. */
async function sincronizarEscolas(conn, rotaId, alunos) {
    const necessarias = [...new Set(alunos.map(a => a.escola_id).filter(Boolean))];
    const atuais = (await conn.query('SELECT escola_id, ordem FROM rota_escolas WHERE rota_id = ?', [rotaId]));
    const atuaisIds = new Set(atuais.map(r => r.escola_id));
    let maxOrdem = atuais.reduce((m, r) => Math.max(m, r.ordem), 0);
    for (const id of necessarias) {
        if (!atuaisIds.has(id)) await conn.query('INSERT INTO rota_escolas (rota_id, escola_id, ordem) VALUES (?, ?, ?)', [rotaId, id, ++maxOrdem]);
    }
    const sobrando = [...atuaisIds].filter(id => !necessarias.includes(id));
    if (sobrando.length) await conn.query('DELETE FROM rota_escolas WHERE rota_id = ? AND escola_id IN (?)', [rotaId, sobrando]);
}

/** Viagens do mesmo veículo/motorista que se sobrepõem no horário. */
async function conflitos(conn, rota) {
    const out = [];
    if (!rota.hora_saida || !rota.hora_fim) return out;
    const ini = horaParaSeg(rota.hora_saida), fim = horaParaSeg(rota.hora_fim);
    const outras = await conn.query(`
        SELECT r.id, r.nome, r.veiculo_id, r.motorista_id, r.hora_saida, r.hora_fim, f.placa, m.nome AS motorista_nome
        FROM rotas r LEFT JOIN frota f ON f.id = r.veiculo_id LEFT JOIN motoristas m ON m.id = r.motorista_id
        WHERE r.empresa_id = ? AND r.id <> ? AND r.status = 'Ativa' AND r.hora_saida IS NOT NULL AND r.hora_fim IS NOT NULL
          AND ((r.veiculo_id IS NOT NULL AND r.veiculo_id = ?) OR (r.motorista_id IS NOT NULL AND r.motorista_id = ?))
    `, [empresaId(), rota.id, rota.veiculo_id, rota.motorista_id]);
    for (const o of outras) {
        const oi = horaParaSeg(o.hora_saida), of = horaParaSeg(o.hora_fim);
        if (ini < of && oi < fim) {
            const quem = o.veiculo_id === rota.veiculo_id ? `o veículo ${o.placa}` : `o motorista ${o.motorista_nome}`;
            out.push({ nivel: 'erro', codigo: 'conflito_horario', rota_id: o.id,
                msg: `Conflito: ${quem} também está na rota "${o.nome}" das ${segParaHora(oi)} às ${segParaHora(of)}.` });
        }
    }
    return out;
}

/** Calcula e grava horários previstos, duração e distância. */
async function recalcular(conn, rotaId) {
    const ctx = await carregarContexto(conn, rotaId);
    const r = await calcularRota(ctx);
    await transacao(conn, async () => {
        for (const a of r._horarios.alunos) {
            await conn.query('UPDATE rota_alunos SET hora_prevista = ? WHERE rota_id = ? AND aluno_id = ?', [a.hora, rotaId, a.aluno_id]);
        }
        for (const e of r._horarios.escolas) {
            await conn.query('UPDATE rota_escolas SET hora_prevista = ? WHERE rota_id = ? AND escola_id = ?', [e.hora, rotaId, e.escola_id]);
        }
        await conn.query(
            'UPDATE rotas SET hora_fim = ?, duracao_seg = ?, distancia_m = ?, calculado_em = NOW() WHERE id = ? AND empresa_id = ?',
            [r._horarios.fim !== null && r._horarios.fim !== undefined ? segParaHora(r._horarios.fim) : null, r.resumo.duracao_seg, r.resumo.distancia_m, rotaId, empresaId()]
        );
    });
    ctx.rota.hora_fim = r._horarios.fim !== null && r._horarios.fim !== undefined ? segParaHora(r._horarios.fim) : null;
    return { ctx, r };
}

async function detalhe(conn, rotaId) {
    const { ctx, r } = await recalcular(conn, rotaId);
    const alertas = [...r.alertas, ...(await conflitos(conn, ctx.rota))];
    delete r._horarios;
    return {
        rota: formatarRota(ctx.rota),
        veiculo: ctx.veiculo ? { ...ctx.veiculo, lugares: lugaresDoVeiculo(ctx.veiculo.capacidade) } : null,
        motorista: ctx.motorista,
        escolas: ctx.escolas.map(e => ({ escola_id: e.escola_id, nome: e.nome, ordem: e.ordem, horarios: e.horarios, lat: e.lat, lng: e.lng })),
        ...r,
        alertas,
    };
}

function formatarRota(r) {
    const h = (v) => (v ? String(v).slice(0, 5) : null);
    return {
        id: r.id, nome: r.nome, periodo: r.periodo, tipo: r.tipo, status: r.status,
        veiculo_id: r.veiculo_id, motorista_id: r.motorista_id, monitor_id: r.monitor_id ?? null,
        hora_saida: h(r.hora_saida), hora_fim: h(r.hora_fim),
        partida_descricao: r.partida_descricao,
        partida_lat: r.partida_lat === null ? null : Number(r.partida_lat),
        partida_lng: r.partida_lng === null ? null : Number(r.partida_lng),
        tempo_parada_seg: r.tempo_parada_seg, velocidade_media_kmh: r.velocidade_media_kmh,
        folga_escola_min: r.folga_escola_min, tempo_max_bordo_min: r.tempo_max_bordo_min,
        observacoes: r.observacoes,
        duracao_seg: r.duracao_seg, distancia_m: r.distancia_m,
    };
}

function lerRota(body) {
    const nome = str(body.nome, 100);
    if (!nome) throw new HttpError(400, 'Informe o nome da rota.');
    const periodo = body.periodo || 'Manhã';
    if (!TURNOS.includes(periodo)) throw new HttpError(400, 'Turno inválido.');
    const tipo = body.tipo || 'ida';
    if (!TIPOS.includes(tipo)) throw new HttpError(400, 'Tipo inválido (ida ou volta).');
    const int = (v, padrao, min, max) => {
        if (v === undefined || v === null || v === '') return padrao;
        const n = Math.round(Number(v));
        if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, 'Valor numérico fora do limite.');
        return n;
    };
    return {
        nome, periodo, tipo,
        veiculo_id: toId(body.veiculo_id),
        motorista_id: toId(body.motorista_id),
        monitor_id: toId(body.monitor_id),
        hora_saida: hora(body.hora_saida),
        partida_descricao: str(body.partida_descricao),
        partida_lat: coord(body.partida_lat, 'lat'),
        partida_lng: coord(body.partida_lng, 'lng'),
        tempo_parada_seg: int(body.tempo_parada_seg, 60, 0, 900),
        velocidade_media_kmh: int(body.velocidade_media_kmh, 25, 5, 90),
        folga_escola_min: int(body.folga_escola_min, 10, 0, 60),
        tempo_max_bordo_min: int(body.tempo_max_bordo_min, 60, 10, 240),
        status: body.status === 'Inativa' ? 'Inativa' : 'Ativa',
        observacoes: str(body.observacoes, 2000),
    };
}

// ---------- rotas da API ----------

// Lista (também usada por Frota para o select de rotas)
router.get('/', handler(async (req, res, conn) => {
    const rows = await conn.query(`
        SELECT r.*, f.placa, f.modelo, f.capacidade, m.nome AS motorista_nome,
               (SELECT COUNT(*) FROM rota_alunos ra WHERE ra.rota_id = r.id) AS total_alunos,
               (SELECT COUNT(*) FROM rota_alunos ra JOIN alunos a ON a.id = ra.aluno_id
                 WHERE ra.rota_id = r.id AND ra.ponto_encontro_id IS NULL AND (a.lat IS NULL OR a.lng IS NULL)) AS alunos_sem_local
        FROM rotas r
        LEFT JOIN frota f ON f.id = r.veiculo_id AND f.empresa_id = r.empresa_id
        LEFT JOIN motoristas m ON m.id = r.motorista_id AND m.empresa_id = r.empresa_id
        WHERE r.empresa_id = ?
        ORDER BY r.hora_saida IS NULL, r.hora_saida, r.nome
    `, [empresaId()]);
    res.json(rows.map(r => {
        const x = limparLinha(r);
        return {
            ...formatarRota(x),
            placa: x.placa, modelo: x.modelo, lugares: lugaresDoVeiculo(x.capacidade),
            motorista_nome: x.motorista_nome,
            total_alunos: x.total_alunos, alunos_sem_local: x.alunos_sem_local,
        };
    }));
}, 'Erro ao buscar rotas'));

// Agenda da frota: viagens encadeadas de cada veículo no dia
router.get('/agenda', handler(async (req, res, conn) => {
    const rotas = (await conn.query(`
        SELECT r.id, r.nome, r.periodo, r.tipo, r.status, r.veiculo_id, r.motorista_id,
               TIME_FORMAT(r.hora_saida,'%H:%i') AS hora_saida, TIME_FORMAT(r.hora_fim,'%H:%i') AS hora_fim,
               r.duracao_seg, m.nome AS motorista_nome,
               (SELECT COUNT(*) FROM rota_alunos ra WHERE ra.rota_id = r.id) AS total_alunos
        FROM rotas r LEFT JOIN motoristas m ON m.id = r.motorista_id AND m.empresa_id = r.empresa_id
        WHERE r.status = 'Ativa' AND r.empresa_id = ?
    `, [empresaId()])).map(limparLinha);
    const veiculos = (await conn.query('SELECT id, placa, modelo, capacidade, status FROM frota WHERE empresa_id = ? ORDER BY placa', [empresaId()])).map(limparLinha);

    const montar = (lista) => {
        const ord = [...lista].sort((a, b) => (horaParaSeg(a.hora_saida) ?? 1e9) - (horaParaSeg(b.hora_saida) ?? 1e9));
        return ord.map((v, i) => {
            const prox = ord[i + 1];
            const fim = horaParaSeg(v.hora_fim);
            const ini2 = prox ? horaParaSeg(prox.hora_saida) : null;
            return {
                ...v,
                conflito_com_proxima: fim !== null && ini2 !== null && ini2 < fim,
                intervalo_ate_proxima_min: fim !== null && ini2 !== null ? Math.round((ini2 - fim) / 60) : null,
            };
        });
    };

    res.json({
        veiculos: veiculos.map(v => ({ ...v, lugares: lugaresDoVeiculo(v.capacidade), viagens: montar(rotas.filter(r => r.veiculo_id === v.id)) })),
        sem_veiculo: montar(rotas.filter(r => !r.veiculo_id)),
    });
}, 'Erro ao montar agenda da frota'));

// Simulação "e se": quanto cada rota aumenta com um aluno novo (antes de aceitar a matrícula)
router.post('/simular', handler(async (req, res, conn) => {
    const b = req.body || {};
    const lat = coord(b.lat, 'lat'), lng = coord(b.lng, 'lng');
    if (lat === null || lng === null) throw new HttpError(400, 'Informe o endereço ou marque o local no mapa.');
    const escolaId = await refDaEmpresa(conn, 'escolas', b.escola_id, 'Escola', false);
    const turno = TURNOS.includes(b.turno) ? b.turno : 'Manhã';
    const rotaId = await refDaEmpresa(conn, 'rotas', b.rota_id, 'Rota');
    const [esc] = await conn.query('SELECT id, nome, lat, lng, logradouro, numero, bairro, cidade, uf, cep, endereco FROM escolas WHERE id = ?', [escolaId]);
    const hs = await conn.query(`SELECT turno, TIME_FORMAT(entrada,'%H:%i') AS entrada, TIME_FORMAT(saida,'%H:%i') AS saida FROM escola_horarios WHERE escola_id = ?`, [escolaId]);
    const ids = rotaId ? [rotaId] : (await conn.query(`SELECT id, periodo FROM rotas WHERE empresa_id = ? AND status = 'Ativa'`, [empresaId()]))
        .filter(r => turnoCompativel(turno, r.periodo)).map(r => r.id).slice(0, 12);
    const novo = { aluno_id: -1, nome: 'Aluno novo', ordem: 0, ponto_encontro_id: null, lat, lng, geo_status: 'manual', turno, escola_id: escolaId, escola_nome: esc.nome, responsavel_id: null };
    const resultados = [];
    for (const id of ids) {
        const ctx = await carregarContexto(conn, id);
        if (!ctx.escolas.some(e => e.escola_id === escolaId)) {
            const horarios = {};
            for (const h of hs) horarios[h.turno] = { entrada: h.entrada, saida: h.saida };
            ctx.escolas = [...ctx.escolas, { escola_id: escolaId, nome: esc.nome, ordem: ctx.escolas.length + 1, lat: esc.lat, lng: esc.lng, endereco: formatarEndereco(esc) || esc.endereco, horarios }];
        }
        const r = await simularNaRota(ctx, novo);
        resultados.push({ rota_id: id, rota_nome: ctx.rota.nome, tipo: ctx.rota.tipo, periodo: ctx.rota.periodo, placa: ctx.veiculo?.placa || null, escola_nova: !ctx.alunos.some(a => a.escola_id === escolaId), ...r });
    }
    // melhores primeiro: sem problema novo e com menor acréscimo
    resultados.sort((a, b) => Number(b.viavel) - Number(a.viavel) || a.acrescimo_min - b.acrescimo_min);
    const preco = await precoSugerido(conn, { lat, lng, escolaId, turno });
    res.json({ turno, escola: esc.nome, rotas: resultados, preco });
}, 'Erro ao simular'));

router.get('/:id', handler(async (req, res, conn) => {
    res.json(await detalhe(conn, await daEmpresa(conn, 'rotas', parseId(req), { nome: 'Rota' })));
}, 'Erro ao carregar rota'));

/** Veículo, motorista e monitor da rota precisam ser da mesma empresa. */
async function conferirRefs(conn, d) {
    await refDaEmpresa(conn, 'frota', d.veiculo_id, 'Veículo');
    await refDaEmpresa(conn, 'motoristas', d.motorista_id, 'Motorista');
    await refDaEmpresa(conn, 'monitores', d.monitor_id, 'Monitor');
}

router.post('/', handler(async (req, res, conn) => {
    const d = lerRota(req.body);
    await conferirRefs(conn, d);
    const copiarDe = await refDaEmpresa(conn, 'rotas', req.body.copiar_alunos_de, 'Rota de origem');
    const r = await conn.query(`
        INSERT INTO rotas (empresa_id, nome, periodo, tipo, veiculo_id, motorista_id, monitor_id, hora_saida, partida_descricao, partida_lat, partida_lng,
                           tempo_parada_seg, velocidade_media_kmh, folga_escola_min, tempo_max_bordo_min, status, observacoes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [empresaId(), d.nome, d.periodo, d.tipo, d.veiculo_id, d.motorista_id, d.monitor_id, d.hora_saida, d.partida_descricao, d.partida_lat, d.partida_lng,
         d.tempo_parada_seg, d.velocidade_media_kmh, d.folga_escola_min, d.tempo_max_bordo_min, d.status, d.observacoes]);
    const id = Number(r.insertId);
    // Copiar alunos de outra rota (ex.: criar a "volta" a partir da "ida")
    if (copiarDe) {
        const alunos = await conn.query('SELECT aluno_id, ordem, ponto_encontro_id FROM rota_alunos WHERE rota_id = ? ORDER BY ordem', [copiarDe]);
        // na volta a ordem é invertida (o último a embarcar desce primeiro)
        const lista = d.tipo === 'volta' ? [...alunos].reverse() : alunos;
        let ordem = 0;
        for (const a of lista) {
            await conn.query('INSERT INTO rota_alunos (rota_id, aluno_id, ordem, ponto_encontro_id) VALUES (?, ?, ?, ?)', [id, a.aluno_id, ++ordem, a.ponto_encontro_id]);
        }
    }
    res.status(201).json(await detalhe(conn, id));
}, 'Erro ao criar rota'));

router.put('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'rotas', parseId(req), { nome: 'Rota' });
    const d = lerRota(req.body);
    await conferirRefs(conn, d);
    const r = await conn.query(`
        UPDATE rotas SET nome=?, periodo=?, tipo=?, veiculo_id=?, motorista_id=?, monitor_id=?, hora_saida=?, partida_descricao=?, partida_lat=?, partida_lng=?,
                         tempo_parada_seg=?, velocidade_media_kmh=?, folga_escola_min=?, tempo_max_bordo_min=?, status=?, observacoes=?
        WHERE id = ? AND empresa_id = ?`,
        [d.nome, d.periodo, d.tipo, d.veiculo_id, d.motorista_id, d.monitor_id, d.hora_saida, d.partida_descricao, d.partida_lat, d.partida_lng,
         d.tempo_parada_seg, d.velocidade_media_kmh, d.folga_escola_min, d.tempo_max_bordo_min, d.status, d.observacoes, id, empresaId()]);
    if (r.affectedRows === 0) throw new HttpError(404, 'Rota não encontrada.');
    res.json(await detalhe(conn, id));
}, 'Erro ao atualizar rota'));

router.delete('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'rotas', parseId(req), { nome: 'Rota' });
    await transacao(conn, async () => {
        await conn.query('DELETE FROM rota_alunos WHERE rota_id = ?', [id]);
        await conn.query('DELETE FROM rota_escolas WHERE rota_id = ?', [id]);
        const r = await conn.query('DELETE FROM rotas WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
        if (r.affectedRows === 0) throw new HttpError(404, 'Rota não encontrada.');
    });
    res.json({ success: true });
}, 'Erro ao excluir rota'));

// Adicionar alunos
router.post('/:id/alunos', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'rotas', parseId(req), { nome: 'Rota' });
    const ids = [...new Set((Array.isArray(req.body.aluno_ids) ? req.body.aluno_ids : []).map(toId).filter(Boolean))];
    if (!ids.length) throw new HttpError(400, 'Selecione ao menos um aluno.');
    await todosDaEmpresa(conn, 'alunos', ids, 'Aluno');
    await transacao(conn, async () => {
        const [{ m }] = await conn.query('SELECT COALESCE(MAX(ordem), 0) AS m FROM rota_alunos WHERE rota_id = ?', [id]);
        let ordem = Number(m);
        for (const alunoId of ids) {
            await conn.query('INSERT IGNORE INTO rota_alunos (rota_id, aluno_id, ordem) VALUES (?, ?, ?)', [id, alunoId, ++ordem]);
        }
    });
    res.json(await detalhe(conn, id));
}, 'Erro ao adicionar alunos à rota'));

router.delete('/:id/alunos/:alunoId', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'rotas', parseId(req), { nome: 'Rota' });
    await conn.query('DELETE FROM rota_alunos WHERE rota_id = ? AND aluno_id = ?', [id, parseId(req, 'alunoId')]);
    res.json(await detalhe(conn, id));
}, 'Erro ao remover aluno da rota'));

// Ponto de encontro de um aluno nesta rota (null = porta de casa)
router.put('/:id/alunos/:alunoId', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'rotas', parseId(req), { nome: 'Rota' });
    const pontoId = await refDaEmpresa(conn, 'pontos_encontro', req.body.ponto_encontro_id, 'Ponto de encontro');
    const r = await conn.query('UPDATE rota_alunos SET ponto_encontro_id = ? WHERE rota_id = ? AND aluno_id = ?', [pontoId, id, parseId(req, 'alunoId')]);
    if (r.affectedRows === 0) throw new HttpError(404, 'Aluno não está nesta rota.');
    res.json(await detalhe(conn, id));
}, 'Erro ao atualizar aluno na rota'));

// Nova ordem (arrastar e soltar): { alunos: [ids na ordem], escolas: [ids na ordem] }
router.put('/:id/ordem', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'rotas', parseId(req), { nome: 'Rota' });
    const alunos = (Array.isArray(req.body.alunos) ? req.body.alunos : []).map(toId).filter(Boolean);
    const escolas = (Array.isArray(req.body.escolas) ? req.body.escolas : []).map(toId).filter(Boolean);
    await transacao(conn, async () => {
        for (let i = 0; i < alunos.length; i++) {
            await conn.query('UPDATE rota_alunos SET ordem = ? WHERE rota_id = ? AND aluno_id = ?', [i + 1, id, alunos[i]]);
        }
        for (let i = 0; i < escolas.length; i++) {
            await conn.query('UPDATE rota_escolas SET ordem = ? WHERE rota_id = ? AND escola_id = ?', [i + 1, id, escolas[i]]);
        }
    });
    res.json(await detalhe(conn, id));
}, 'Erro ao reordenar paradas'));

// Sugestão de ordem por proximidade (não grava; o front decide se aplica)
router.post('/:id/sugerir-ordem', handler(async (req, res, conn) => {
    const ctx = await carregarContexto(conn, await daEmpresa(conn, 'rotas', parseId(req), { nome: 'Rota' }));
    res.json(sugerirOrdem(ctx));
}, 'Erro ao sugerir ordem'));

router.post('/:id/recalcular', handler(async (req, res, conn) => {
    res.json(await detalhe(conn, await daEmpresa(conn, 'rotas', parseId(req), { nome: 'Rota' })));
}, 'Erro ao recalcular rota'));

export default router;
