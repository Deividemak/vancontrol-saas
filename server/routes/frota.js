// Frota: veículos, manutenção, abastecimentos e checklists (antes ficavam no index.js)
import { Router } from 'express';
import { handler, HttpError, parseId, str, toId, transacao, data as dataValida } from '../lib/http.js';
import { painelFrota, fichaVeiculo, planosDaEmpresa, desempenho, manutencaoDoChecklist, PLANOS_PADRAO } from '../services/frota.js';
import { hojeBR } from '../services/viagens.js';
import { empresaId, daEmpresa, refDaEmpresa } from '../lib/tenant.js';
import { conferirLimiteVans } from '../services/planos.js';
import { urlBase } from '../services/responsaveis.js';
import crypto from 'crypto';

export const frotaRouter = Router();
export const manutencoesRouter = Router();
export const abastecimentosRouter = Router();
export const checklistsRouter = Router();

// ---------- Veículos ----------
frotaRouter.get('/', handler(async (req, res, conn) => {
    res.json(await conn.query('SELECT * FROM frota WHERE empresa_id = ? ORDER BY placa', [empresaId()]));
}, 'Erro ao buscar frota'));

const PLACA_ANTIGA = /^[A-Z]{3}-?\d{4}$/, PLACA_MERCOSUL = /^[A-Z]{3}\d[A-Z]\d{2}$/;
const STATUS_VAN = ['Disponível', 'Em Rota', 'Manutenção', 'Inativa'];

async function dadosVeiculo(conn, b) {
    let placa = str(b.placa, 20)?.toUpperCase().replace(/\s/g, '');
    const modelo = str(b.modelo, 100);
    if (!placa || !modelo) throw new HttpError(400, 'Informe placa e modelo.');
    if (!PLACA_ANTIGA.test(placa) && !PLACA_MERCOSUL.test(placa)) throw new HttpError(400, 'Placa inválida. Use o formato ABC-1234 ou ABC1D23 (Mercosul).');
    if (PLACA_ANTIGA.test(placa)) placa = `${placa.slice(0, 3)}-${placa.slice(-4)}`;
    const ano = toId(b.ano) || new Date().getFullYear();
    if (ano < 1980 || ano > new Date().getFullYear() + 1) throw new HttpError(400, 'Ano do veículo inválido.');
    const lugares = toId(b.lugares) || Number(String(b.capacidade || '').match(/\d+/)?.[0]) || null;
    if (lugares !== null && (lugares < 1 || lugares > 80)) throw new HttpError(400, 'Número de lugares inválido.');
    const renavam = str(b.renavam, 20)?.replace(/\D/g, '') || null;
    if (renavam && renavam.length !== 11) throw new HttpError(400, 'O RENAVAM tem 11 números.');
    const chassi = str(b.chassi, 20)?.toUpperCase().replace(/\s/g, '') || null;
    if (chassi && chassi.length !== 17) throw new HttpError(400, 'O chassi tem 17 caracteres.');
    const foto = b.foto ? String(b.foto) : null;
    if (foto && (!/^data:image\/(png|jpe?g|webp);base64,/.test(foto) || foto.length > 1_500_000)) throw new HttpError(400, 'Foto inválida ou muito grande (máx. 1 MB).');
    const status = STATUS_VAN.includes(b.status) ? b.status : 'Disponível';
    return {
        placa, modelo, ano, lugares, capacidade: lugares ? `${lugares} lugares` : (str(b.capacidade, 50) || ''),
        acessivel: b.acessivel ? 1 : 0, renavam, chassi, cor: str(b.cor, 30), foto, status,
        custo_fixo_mensal: Number(b.custo_fixo_mensal) >= 0 ? Number(b.custo_fixo_mensal || 0) : 0,
        motorista_id: await refDaEmpresa(conn, 'motoristas', b.motorista_id, 'Motorista'),
        escola_id: await refDaEmpresa(conn, 'escolas', b.escola_id, 'Escola'),
        rota_id: await refDaEmpresa(conn, 'rotas', b.rota_id, 'Rota'),
        rastreador_id: str(b.rastreador_id, 40),
    };
}
const CAMPOS = ['placa', 'modelo', 'ano', 'lugares', 'capacidade', 'acessivel', 'renavam', 'chassi', 'cor', 'status', 'custo_fixo_mensal', 'motorista_id', 'escola_id', 'rastreador_id'];

frotaRouter.get('/painel', handler(async (req, res, conn) => {
    res.json(await painelFrota(conn));
}, 'Erro ao montar o painel da frota'));

// ---------- Planos de manutenção preventiva ----------
frotaRouter.get('/planos', handler(async (req, res, conn) => {
    res.json({ planos: await planosDaEmpresa(conn, toId(req.query.veiculo_id)), padrao: PLANOS_PADRAO });
}, 'Erro ao ler planos'));

function dadosPlano(b) {
    const nome = str(b.nome, 120);
    const intervalo_km = toId(b.intervalo_km), intervalo_meses = toId(b.intervalo_meses);
    if (!nome) throw new HttpError(400, 'Informe o nome do serviço.');
    if (!intervalo_km && !intervalo_meses) throw new HttpError(400, 'Informe a cada quantos km ou meses.');
    const ultimo_km = b.ultimo_km === '' || b.ultimo_km === null || b.ultimo_km === undefined ? null : Math.max(0, Math.round(Number(b.ultimo_km)) || 0);
    return { nome, intervalo_km, intervalo_meses, ultimo_km, ultima_data: dataValida(b.ultima_data) };
}

frotaRouter.post('/planos', handler(async (req, res, conn) => {
    const veiculoId = await refDaEmpresa(conn, 'frota', req.body?.veiculo_id, 'Veículo', false);
    const d = dadosPlano(req.body || {});
    const r = await conn.query('INSERT INTO manutencao_planos (empresa_id, veiculo_id, nome, intervalo_km, intervalo_meses, ultimo_km, ultima_data) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [empresaId(), veiculoId, d.nome, d.intervalo_km, d.intervalo_meses, d.ultimo_km, d.ultima_data]);
    res.status(201).json({ id: Number(r.insertId) });
}, 'Erro ao criar plano'));

// cria os planos sugeridos para a van (os que ainda não existem), contando a partir de hoje e do km atual
frotaRouter.post('/planos/padrao', handler(async (req, res, conn) => {
    const veiculoId = await refDaEmpresa(conn, 'frota', req.body?.veiculo_id, 'Veículo', false);
    const [v] = await conn.query('SELECT km_atual FROM frota WHERE id = ?', [veiculoId]);
    const ja = (await conn.query('SELECT nome FROM manutencao_planos WHERE empresa_id = ? AND veiculo_id = ? AND ativo = 1', [empresaId(), veiculoId])).map(p => p.nome);
    let criados = 0;
    for (const p of PLANOS_PADRAO.filter(p => !ja.includes(p.nome))) {
        await conn.query('INSERT INTO manutencao_planos (empresa_id, veiculo_id, nome, intervalo_km, intervalo_meses, ultimo_km, ultima_data) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [empresaId(), veiculoId, p.nome, p.intervalo_km, p.intervalo_meses, Number(v?.km_atual || 0), hojeBR()]);
        criados++;
    }
    res.status(201).json({ criados });
}, 'Erro ao criar planos sugeridos'));

frotaRouter.put('/planos/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'manutencao_planos', parseId(req), { nome: 'Plano' });
    const d = dadosPlano(req.body || {});
    await conn.query('UPDATE manutencao_planos SET nome=?, intervalo_km=?, intervalo_meses=?, ultimo_km=?, ultima_data=? WHERE id=? AND empresa_id=?',
        [d.nome, d.intervalo_km, d.intervalo_meses, d.ultimo_km, d.ultima_data, id, empresaId()]);
    res.json({ success: true });
}, 'Erro ao salvar plano'));

frotaRouter.delete('/planos/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'manutencao_planos', parseId(req), { nome: 'Plano' });
    await conn.query('UPDATE manutencao_planos SET ativo = 0 WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    res.json({ success: true });
}, 'Erro ao remover plano'));

// serviço do plano feito: registra a manutenção concluída e reinicia a contagem
frotaRouter.post('/planos/:id/feito', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'manutencao_planos', parseId(req), { nome: 'Plano' });
    const [p] = await conn.query('SELECT p.*, f.km_atual FROM manutencao_planos p JOIN frota f ON f.id = p.veiculo_id WHERE p.id = ?', [id]);
    const data = dataValida(req.body?.data) || hojeBR();
    const km = req.body?.km !== undefined && req.body.km !== '' ? Math.max(0, Math.round(Number(req.body.km)) || 0) : Number(p.km_atual || 0);
    const custo = Math.max(0, Number(req.body?.custo) || 0);
    await transacao(conn, async () => {
        await conn.query(`INSERT INTO manutencoes (empresa_id, veiculo_id, tipo, servico, custo, status, data_agendada, data_conclusao, km_execucao, plano_id, origem, observacao)
            VALUES (?, ?, 'Preventiva', ?, ?, 'Concluída', ?, ?, ?, ?, 'plano', ?)`, [empresaId(), p.veiculo_id, p.nome, custo, data, data, km, id, str(req.body?.observacao, 2000)]);
        await conn.query('UPDATE manutencao_planos SET ultimo_km = ?, ultima_data = ? WHERE id = ?', [km, data, id]);
        await conn.query('UPDATE frota SET km_atual = GREATEST(COALESCE(km_atual,0), ?) WHERE id = ? AND empresa_id = ?', [km, p.veiculo_id, empresaId()]);
    });
    res.json({ success: true });
}, 'Erro ao registrar serviço'));

frotaRouter.get('/:id/ficha', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'frota', parseId(req), { nome: 'Veículo' });
    res.json(await fichaVeiculo(conn, id));
}, 'Erro ao abrir a ficha da van'));

frotaRouter.get('/:id/foto', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'frota', parseId(req), { nome: 'Veículo' });
    const [v] = await conn.query('SELECT foto FROM frota WHERE id = ?', [id]);
    res.json({ foto: v?.foto || null });
}, 'Erro ao ler foto'));

const placaDuplicada = (err) => err.code === 'ER_DUP_ENTRY' || err.errno === 1062;

// endereço para o rastreador veicular desta empresa (criado na primeira vez)
frotaRouter.get('/rastreador', handler(async (req, res, conn) => {
    const [e] = await conn.query('SELECT rastreador_segredo FROM empresas WHERE id = ?', [empresaId()]);
    let segredo = e?.rastreador_segredo;
    if (!segredo) {
        segredo = crypto.randomBytes(24).toString('hex');
        await conn.query('UPDATE empresas SET rastreador_segredo = ? WHERE id = ? AND rastreador_segredo IS NULL', [segredo, empresaId()]);
        segredo = (await conn.query('SELECT rastreador_segredo FROM empresas WHERE id = ?', [empresaId()]))[0].rastreador_segredo;
    }
    const comRastreador = await conn.query('SELECT placa, rastreador_id FROM frota WHERE empresa_id = ? AND rastreador_id IS NOT NULL', [empresaId()]);
    res.json({ url: `${urlBase()}/api/publico/rastreador/${segredo}`, veiculos: comRastreador });
}, 'Erro ao ler rastreador'));

frotaRouter.post('/', handler(async (req, res, conn) => {
    const d = await dadosVeiculo(conn, req.body || {});
    const [dup] = await conn.query('SELECT id FROM frota WHERE empresa_id = ? AND placa = ?', [empresaId(), d.placa]);
    if (dup) throw new HttpError(400, 'Esta placa já está cadastrada em outro veículo.');
    const limite = await conferirLimiteVans(conn, empresaId());
    if (limite) throw new HttpError(402, limite);
    try {
        const id = await transacao(conn, async () => {
            const r = await conn.query(
                `INSERT INTO frota (empresa_id, ${CAMPOS.join(', ')}, foto) VALUES (?, ${CAMPOS.map(() => '?').join(', ')}, ?)`,
                [empresaId(), ...CAMPOS.map(c => d[c]), d.foto]);
            const id = Number(r.insertId);
            // vincula a rota escolhida (um veículo pode fazer várias viagens)
            if (d.rota_id) await conn.query('UPDATE rotas SET veiculo_id = ? WHERE id = ? AND empresa_id = ?', [id, d.rota_id, empresaId()]);
            return id;
        });
        res.status(201).json({ id });
    } catch (err) {
        if (placaDuplicada(err)) throw new HttpError(400, 'Esta placa já está cadastrada em outro veículo.');
        throw err;
    }
}, 'Erro ao criar veículo'));

frotaRouter.put('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'frota', parseId(req), { nome: 'Veículo' });
    const d = await dadosVeiculo(conn, req.body || {});
    try {
        await transacao(conn, async () => {
            // foto: só troca se veio uma nova; "remover_foto" apaga
            const foto = d.foto ? ', foto = ?' : req.body?.remover_foto ? ', foto = NULL' : '';
            await conn.query(`UPDATE frota SET ${CAMPOS.map(c => `${c}=?`).join(', ')}${foto} WHERE id=? AND empresa_id=?`,
                [...CAMPOS.map(c => d[c]), ...(d.foto ? [d.foto] : []), id, empresaId()]);
            // vincula a rota escolhida sem desvincular as outras viagens do veículo
            if (d.rota_id) await conn.query('UPDATE rotas SET veiculo_id = ? WHERE id = ? AND empresa_id = ?', [id, d.rota_id, empresaId()]);
        });
    } catch (err) {
        if (placaDuplicada(err)) throw new HttpError(400, 'Esta placa já está cadastrada em outro veículo.');
        throw err;
    }
    res.json({ message: 'Veículo atualizado com sucesso' });
}, 'Erro ao atualizar veículo'));

frotaRouter.delete('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'frota', parseId(req), { nome: 'Veículo' });
    const rotas = await conn.query("SELECT nome FROM rotas WHERE empresa_id = ? AND veiculo_id = ? AND status = 'Ativa'", [empresaId(), id]);
    if (rotas.length) throw new HttpError(409, `Esta van está nas rotas: ${rotas.map(r => r.nome).join(', ')}. Troque a van dessas rotas antes de excluir.`);
    const [hist] = await conn.query('SELECT COUNT(*) n FROM viagens WHERE empresa_id = ? AND veiculo_id = ?', [empresaId(), id]);
    if (Number(hist.n)) throw new HttpError(409, 'Esta van tem viagens no histórico. Em vez de excluir, edite e mude a situação para "Inativa".');
    await transacao(conn, async () => {
        await conn.query('UPDATE rotas SET veiculo_id = NULL WHERE veiculo_id = ? AND empresa_id = ?', [id, empresaId()]);
        await conn.query('DELETE FROM manutencao_planos WHERE veiculo_id = ? AND empresa_id = ?', [id, empresaId()]);
        await conn.query('DELETE FROM frota WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    });
    res.json({ message: 'Veículo excluído com sucesso' });
}, 'Erro ao excluir veículo'));

frotaRouter.put('/:id/km', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'frota', parseId(req), { nome: 'Veículo' });
    const km = Number(req.body.km_atual);
    if (!Number.isFinite(km) || km < 0) throw new HttpError(400, 'KM inválido.');
    await conn.query('UPDATE frota SET km_atual = ? WHERE id = ? AND empresa_id = ?', [Math.round(km), id, empresaId()]);
    res.json({ success: true });
}, 'Erro ao atualizar KM'));

frotaRouter.get('/:id/next-maintenance', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'frota', parseId(req), { nome: 'Veículo' });
    const [veiculo] = await conn.query('SELECT km_atual, km_proxima_revisao, status FROM frota WHERE id = ?', [id]);
    const [manutencao] = await conn.query(`
        SELECT servico, data_agendada, tipo FROM manutencoes
        WHERE veiculo_id = ? AND empresa_id = ? AND status IN ('Pendente', 'Em Andamento')
        ORDER BY data_agendada ASC LIMIT 1`, [id, empresaId()]);
    const km_restantes = veiculo.km_proxima_revisao ? (veiculo.km_proxima_revisao - (veiculo.km_atual || 0)) : null;
    res.json({
        veiculo: { km_atual: veiculo.km_atual, km_proxima_revisao: veiculo.km_proxima_revisao, km_restantes: km_restantes > 0 ? km_restantes : 0, status: veiculo.status },
        next_maintenance: manutencao || null,
    });
}, 'Erro ao buscar próxima manutenção do veículo'));

frotaRouter.get('/:id/performance', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'frota', parseId(req), { nome: 'Veículo' });
    res.json(await desempenho(conn, id));
}, 'Erro ao buscar dados de performance'));

// ---------- Manutenção ----------
manutencoesRouter.get('/dashboard', handler(async (req, res, conn) => {
    const emp = empresaId();
    const [totalFrota] = await conn.query('SELECT COUNT(*) AS total FROM frota WHERE empresa_id = ?', [emp]);
    const [emManutencao] = await conn.query("SELECT COUNT(*) AS total FROM frota WHERE empresa_id = ? AND status = 'Manutenção'", [emp]);
    const [custo] = await conn.query("SELECT COALESCE(SUM(custo), 0) AS total FROM manutencoes WHERE empresa_id = ? AND status IN ('Pendente', 'Em Andamento')", [emp]);
    const veiculos = await conn.query('SELECT id, placa, modelo, km_atual, km_ultima_revisao, km_proxima_revisao, status FROM frota WHERE empresa_id = ?', [emp]);
    res.json({
        stats: { total_veiculos: Number(totalFrota?.total || 0), em_manutencao: Number(emManutencao?.total || 0), custo_mensal: parseFloat(custo?.total || 0) },
        veiculos,
    });
}, 'Erro ao buscar dashboard de manutenção'));

manutencoesRouter.get('/agenda', handler(async (req, res, conn) => {
    res.json(await conn.query(`
        SELECT m.*, f.placa, f.modelo FROM manutencoes m JOIN frota f ON m.veiculo_id = f.id AND f.empresa_id = m.empresa_id
        WHERE m.empresa_id = ? AND m.status IN ('Pendente', 'Em Andamento')
        ORDER BY m.data_agendada ASC, m.hora_agendada ASC LIMIT 10`, [empresaId()]));
}, 'Erro ao buscar agenda'));

manutencoesRouter.post('/', handler(async (req, res, conn) => {
    const b = req.body || {};
    const veiculoId = await refDaEmpresa(conn, 'frota', b.veiculo_id, 'Veículo', false);
    const r = await conn.query(
        'INSERT INTO manutencoes (empresa_id, veiculo_id, tipo, servico, custo, status, data_agendada, hora_agendada) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [empresaId(), veiculoId, str(b.tipo, 50), str(b.servico, 255), Number(b.custo) || 0, str(b.status, 30) || 'Pendente', b.data_agendada || null, b.hora_agendada || null]);
    res.status(201).json({ id: Number(r.insertId) });
}, 'Erro ao registrar manutenção'));

// muda a situação da manutenção (concluir registra data, km e custo)
manutencoesRouter.put('/:id/status', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'manutencoes', parseId(req), { nome: 'Manutenção' });
    const status = ['Pendente', 'Em Andamento', 'Concluída', 'Cancelada'].includes(req.body?.status) ? req.body.status : null;
    if (!status) throw new HttpError(400, 'Situação inválida.');
    const [m] = await conn.query('SELECT veiculo_id, checklist_id, custo FROM manutencoes WHERE id = ?', [id]);
    const custo = req.body?.custo !== undefined && req.body.custo !== '' ? Math.max(0, Number(req.body.custo) || 0) : Number(m.custo || 0);
    const km = req.body?.km !== undefined && req.body.km !== '' ? Math.max(0, Math.round(Number(req.body.km)) || 0) : null;
    await transacao(conn, async () => {
        await conn.query(`UPDATE manutencoes SET status = ?, custo = ?, km_execucao = COALESCE(?, km_execucao), data_conclusao = ${status === 'Concluída' ? 'COALESCE(?, CURDATE())' : 'NULL'} WHERE id = ? AND empresa_id = ?`,
            status === 'Concluída' ? [status, custo, km, dataValida(req.body?.data) || null, id, empresaId()] : [status, custo, km, id, empresaId()]);
        if (status === 'Concluída' && m.checklist_id) await conn.query('UPDATE checklist_diario SET resolvido = true WHERE id = ? AND empresa_id = ?', [m.checklist_id, empresaId()]);
        if (km) await conn.query('UPDATE frota SET km_atual = GREATEST(COALESCE(km_atual,0), ?) WHERE id = ? AND empresa_id = ?', [km, m.veiculo_id, empresaId()]);
    });
    res.json({ success: true });
}, 'Erro ao atualizar manutenção'));

// ---------- Abastecimentos ----------
abastecimentosRouter.get('/', handler(async (req, res, conn) => {
    res.json(await conn.query(`
        SELECT a.*, f.placa, m.nome AS motorista_nome
        FROM abastecimentos a
        LEFT JOIN frota f ON a.veiculo_id = f.id AND f.empresa_id = a.empresa_id
        LEFT JOIN motoristas m ON a.motorista_id = m.id AND m.empresa_id = a.empresa_id
        WHERE a.empresa_id = ? ORDER BY a.data_abastecimento DESC, a.id DESC LIMIT 50`, [empresaId()]));
}, 'Erro ao buscar abastecimentos'));

abastecimentosRouter.post('/', handler(async (req, res, conn) => {
    const b = req.body || {};
    const veiculoId = await refDaEmpresa(conn, 'frota', b.veiculo_id, 'Veículo', false);
    const motoristaId = await refDaEmpresa(conn, 'motoristas', b.motorista_id, 'Motorista');
    const r = await conn.query(`
        INSERT INTO abastecimentos (empresa_id, veiculo_id, motorista_id, litros, valor_unitario, custo_total, km_atual, tipo_combustivel, data_abastecimento)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()))`,
        [empresaId(), veiculoId, motoristaId, b.litros, b.valor_unitario, b.custo_total, b.km_atual, b.tipo_combustivel || 'Não Especificado', b.data_abastecimento || null]);
    // o km do painel da van acompanha o último abastecimento
    const km = Math.round(Number(b.km_atual));
    if (km > 0) await conn.query('UPDATE frota SET km_atual = GREATEST(COALESCE(km_atual,0), ?) WHERE id = ? AND empresa_id = ?', [km, veiculoId, empresaId()]);
    res.status(201).json({ success: true, id: Number(r.insertId) });
}, 'Erro ao registrar abastecimento'));

abastecimentosRouter.delete('/:id', handler(async (req, res, conn) => {
    const r = await conn.query('DELETE FROM abastecimentos WHERE id = ? AND empresa_id = ?', [parseId(req), empresaId()]);
    if (!r.affectedRows) throw new HttpError(404, 'Registro não encontrado');
    res.json({ success: true });
}, 'Erro interno ao deletar'));

// ---------- Checklists ----------
checklistsRouter.get('/', handler(async (req, res, conn) => {
    res.json(await conn.query(`
        SELECT c.id, c.veiculo_id, c.motorista_id, c.data_registro, c.resolvido,
               c.freios, c.pneus, c.oleo, c.luzes, c.limpeza, c.cintos, c.extintor, c.observacoes,
               f.placa AS veiculo_placa, m.nome AS motorista_nome
        FROM checklist_diario c
        JOIN frota f ON c.veiculo_id = f.id AND f.empresa_id = c.empresa_id
        JOIN motoristas m ON c.motorista_id = m.id AND m.empresa_id = c.empresa_id
        WHERE c.empresa_id = ? ORDER BY c.data_registro DESC`, [empresaId()]));
}, 'Erro ao buscar checklists'));

checklistsRouter.post('/', handler(async (req, res, conn) => {
    const b = req.body || {};
    const veiculoId = await refDaEmpresa(conn, 'frota', b.veiculo_id, 'Veículo', false);
    const motoristaId = await refDaEmpresa(conn, 'motoristas', b.motorista_id, 'Motorista', false);
    const r = await conn.query(
        'INSERT INTO checklist_diario (empresa_id, veiculo_id, motorista_id, freios, pneus, oleo, luzes, limpeza, cintos, extintor, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [empresaId(), veiculoId, motoristaId, b.freios || 'ok', b.pneus || 'ok', b.oleo || 'ok', b.luzes || 'ok', b.limpeza || 'ok', b.cintos || 'ok', b.extintor || 'ok', b.observacoes || null]);
    await manutencaoDoChecklist(conn, { veiculoId, checklistId: Number(r.insertId), valores: b, observacoes: b.observacoes });
    res.status(201).json({ id: Number(r.insertId) });
}, 'Erro ao criar checklist'));

checklistsRouter.put('/:id/resolve', handler(async (req, res, conn) => {
    const r = await conn.query('UPDATE checklist_diario SET resolvido = true WHERE id = ? AND empresa_id = ?', [parseId(req), empresaId()]);
    if (!r.affectedRows) throw new HttpError(404, 'Checklist não encontrado');
    res.json({ success: true });
}, 'Erro ao resolver alerta'));
