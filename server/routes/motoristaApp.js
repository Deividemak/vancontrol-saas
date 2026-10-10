// API do app do motorista (e do monitor): só enxerga as rotas e viagens da escala da pessoa.
// Monitor acompanha a viagem (presença, ocorrências, emergência); iniciar, GPS e encerrar são do motorista.
import { Router } from 'express';
import pool from '../db.js';
import { handler, HttpError, parseId, toId, str, limparLinha } from '../lib/http.js';
import { notificar, cancelarPendentes } from '../services/notificacoes.js';
import { estimarChegadas } from '../services/eta.js';
import {
    hojeBR, dataHora, calendarioDoDia, rotaTemAula, iniciarViagem, registrarEvento, aplicarEventoPresenca,
    detalheViagem, contarPresencas,
} from '../services/viagens.js';
import { escalaDoDia } from '../services/escala.js';
import { bloqueiosDaViagem } from '../services/documentos.js';
import { lerConfig } from '../services/config.js';
import { empresaId } from '../lib/tenant.js';
import { registrarAcesso } from '../services/lgpd.js';
import { manutencaoDoChecklist } from '../services/frota.js';

const router = Router();
const ITENS_CHECKLIST = ['freios', 'pneus', 'oleo', 'luzes', 'limpeza', 'cintos', 'extintor'];
const TIPOS_OCORRENCIA = ['atraso', 'mal_estar', 'comportamento', 'mecanico', 'transito', 'acidente', 'outro'];
const MAX_FOTO = 1.5 * 1024 * 1024;

// Só motoristas e monitores com acesso válido (o acesso pode ter sido removido depois do login)
router.use(async (req, res, next) => {
    let conn;
    try {
        const ehMonitor = req.user.papel === 'monitor';
        if (ehMonitor ? !req.user.monitor_id : (req.user.papel !== 'motorista' || !req.user.motorista_id)) {
            throw new HttpError(403, 'Área exclusiva do app do motorista.');
        }
        conn = await pool.getConnection();
        const [m] = ehMonitor
            ? await conn.query(
                `SELECT m.id, m.nome, m.status FROM monitores m JOIN usuarios u ON u.monitor_id = m.id WHERE u.id = ? AND m.id = ? AND m.empresa_id = ?`,
                [req.user.id, req.user.monitor_id, empresaId()])
            : await conn.query(
                `SELECT m.id, m.nome, m.status FROM motoristas m JOIN usuarios u ON u.motorista_id = m.id WHERE u.id = ? AND m.id = ? AND m.empresa_id = ?`,
                [req.user.id, req.user.motorista_id, empresaId()]);
        if (!m) throw new HttpError(401, 'Acesso removido. Fale com a empresa.');
        if (m.status !== 'Ativo') throw new HttpError(403, `${ehMonitor ? 'Monitor' : 'Motorista'} inativo. Fale com a empresa.`);
        req.papelApp = ehMonitor ? 'monitor' : 'motorista';
        req.motorista = ehMonitor ? null : m;
        req.monitor = ehMonitor ? m : null;
        req.pessoa = m;
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        console.error('[motorista] verificação de acesso:', err);
        return res.status(500).json({ error: 'Erro ao verificar acesso' });
    } finally {
        if (conn) conn.release();
    }
    next();
});

const AVISO = {
    ida: { embarque: 'embarcou', nao_compareceu: 'nao_embarcou', desembarque: 'chegou_escola' },
    volta: { embarque: 'embarcou_volta', nao_compareceu: 'nao_embarcou_volta', desembarque: 'entregue_casa' },
};

/** Aviso no WhatsApp dos pais para cada mudança de presença. */
async function avisarPais(conn, v, ev) {
    if (ev.tipo === 'desfazer') return cancelarPendentes(conn, v.id, ev.aluno_id);
    const tipo = AVISO[v.tipo_rota === 'volta' ? 'volta' : 'ida'][ev.tipo];
    if (!tipo) return;
    const hora = dataHora(ev.registrado_em).slice(11, 16);
    await notificar(conn, { viagemId: v.id, alunoIds: [ev.aluno_id], tipo, dados: { hora } });
}

async function viagemDoMotorista(conn, req) {
    const id = parseId(req);
    const [v] = await conn.query(
        'SELECT v.id, v.status, v.motorista_id, v.monitor_id, v.rota_id, r.tipo AS tipo_rota FROM viagens v JOIN rotas r ON r.id = v.rota_id WHERE v.id = ? AND v.empresa_id = ?',
        [id, empresaId()]);
    if (!v) throw new HttpError(404, 'Viagem não encontrada.');
    const esc = (await escalaDoDia(conn, hojeBR())).get(v.rota_id);
    const minha = req.monitor
        ? v.monitor_id === req.monitor.id || esc?.monitor_id === req.monitor.id
        : v.motorista_id === req.motorista.id || esc?.motorista_id === req.motorista.id;
    if (!minha) throw new HttpError(403, 'Esta viagem não é sua.');
    return v;
}

const soMotorista = (req, acao) => {
    if (req.monitor) throw new HttpError(403, `Só o motorista pode ${acao}.`);
};

router.get('/hoje', handler(async (req, res, conn) => {
    const data = hojeBR();
    const cal = await calendarioDoDia(conn, data);
    // rotas da escala de hoje (inclui substituições: assume as do colega e deixa as que foram passadas a outro)
    const escala = await escalaDoDia(conn, data);
    const minhas = [...escala].filter(([, e]) => (req.monitor ? e.monitor_id === req.monitor.id : e.motorista_id === req.motorista.id)).map(([id]) => id);
    const rotas = minhas.length ? (await conn.query(`
        SELECT r.id, r.nome, r.tipo, r.periodo, TIME_FORMAT(r.hora_saida, '%H:%i') AS hora_saida, TIME_FORMAT(r.hora_fim, '%H:%i') AS hora_fim,
               (SELECT COUNT(*) FROM rota_alunos ra JOIN alunos al ON al.id = ra.aluno_id WHERE ra.rota_id = r.id AND al.suspenso = false) AS total_alunos
        FROM rotas r WHERE r.id IN (?) AND r.status = 'Ativa' AND r.empresa_id = ?
        ORDER BY r.hora_saida IS NULL, r.hora_saida, r.nome`, [minhas, empresaId()])).map(limparLinha) : [];
    const frota = await conn.query('SELECT id, placa, modelo FROM frota WHERE empresa_id = ?', [empresaId()]);
    for (const r of rotas) {
        const e = escala.get(r.id);
        const f = frota.find(x => x.id === e.veiculo_id);
        Object.assign(r, { veiculo_id: e.veiculo_id, placa: f?.placa || null, modelo: f?.modelo || null, substituicao: !!e.substituicao_id });
    }

    const viagens = rotas.length ? await conn.query(`SELECT id, rota_id, status FROM viagens WHERE empresa_id = ? AND data = ? AND rota_id IN (?)`, [empresaId(), data, rotas.map(r => r.id)]) : [];
    const veiculos = [...new Set(rotas.map(r => r.veiculo_id).filter(Boolean))];
    const checklists = veiculos.length
        ? await conn.query(`SELECT DISTINCT veiculo_id FROM checklist_diario WHERE empresa_id = ? AND DATE(data_registro) = ? AND veiculo_id IN (?)`, [empresaId(), data, veiculos])
        : [];
    const comChecklist = new Set(checklists.map(c => c.veiculo_id));

    const lista = [];
    for (const r of rotas) {
        const v = viagens.find(x => x.rota_id === r.id);
        let resumo = null;
        if (v) resumo = contarPresencas(await conn.query('SELECT status FROM presencas WHERE viagem_id = ?', [v.id]));
        lista.push({
            ...r,
            tem_aula: await rotaTemAula(conn, r.id, cal),
            checklist_feito: r.veiculo_id ? comChecklist.has(r.veiculo_id) : true,
            viagem: v ? { id: v.id, status: v.status, resumo } : null,
        });
    }
    res.json({ data, papel: req.papelApp, motorista: { id: req.pessoa.id, nome: req.pessoa.nome }, calendario: { sem_aula_todas: cal.sem_aula_todas, motivo: cal.motivo }, rotas: lista });
}, 'Erro ao carregar as viagens do dia'));

// Inicia a viagem (com o checklist de saída, se ainda não foi feito hoje para o veículo)
router.post('/viagens', handler(async (req, res, conn) => {
    const rotaId = toId(req.body.rota_id);
    const [rotaBase] = rotaId ? await conn.query('SELECT id FROM rotas WHERE id = ? AND empresa_id = ?', [rotaId, empresaId()]) : [];
    if (!rotaBase) throw new HttpError(404, 'Rota não encontrada.');
    soMotorista(req, 'iniciar a viagem');
    const data = hojeBR();
    const esc = (await escalaDoDia(conn, data)).get(rotaId);
    const rota = { id: rotaId, motorista_id: esc?.motorista_id ?? null, veiculo_id: esc?.veiculo_id ?? null };
    if (rota.motorista_id !== req.motorista.id) throw new HttpError(403, 'Esta rota não está atribuída a você hoje.');

    const [jaExiste] = await conn.query('SELECT id FROM viagens WHERE rota_id = ? AND data = ? AND empresa_id = ?', [rotaId, data, empresaId()]);
    if (!jaExiste && (await lerConfig(conn, 'operacao')).bloquear_docs_vencidos) {
        const motivos = await bloqueiosDaViagem(conn, { veiculoId: rota.veiculo_id, motoristaId: req.motorista.id });
        if (motivos.length) throw new HttpError(409, `Viagem bloqueada por documentos: ${motivos.join('; ')}. Fale com a empresa.`);
    }
    let checklistId = null;
    if (!jaExiste && rota.veiculo_id) {
        const [feito] = await conn.query('SELECT id FROM checklist_diario WHERE veiculo_id = ? AND empresa_id = ? AND DATE(data_registro) = ? ORDER BY id DESC LIMIT 1', [rota.veiculo_id, empresaId(), data]);
        const ck = req.body.checklist;
        if (ck) {
            const vals = ITENS_CHECKLIST.map(i => (ck[i] === 'error' ? 'error' : 'ok'));
            const r = await conn.query(
                `INSERT INTO checklist_diario (empresa_id, veiculo_id, motorista_id, ${ITENS_CHECKLIST.join(', ')}, observacoes) VALUES (?, ?, ?, ${ITENS_CHECKLIST.map(() => '?').join(', ')}, ?)`,
                [empresaId(), rota.veiculo_id, req.motorista.id, ...vals, str(ck.observacoes, 2000)]);
            checklistId = Number(r.insertId);
            await manutencaoDoChecklist(conn, { veiculoId: rota.veiculo_id, checklistId, valores: ck, observacoes: str(ck.observacoes, 2000) });
        } else if (feito) {
            checklistId = feito.id;
        } else {
            throw new HttpError(400, 'Faça o checklist do veículo antes de sair.');
        }
    }

    const id = await iniciarViagem(conn, {
        rotaId, data, motoristaId: req.motorista.id, checklistId, usuarioId: req.user.id,
        lat: req.body.lat, lng: req.body.lng, registradoEm: req.body.registrado_em, uuid: str(req.body.uuid, 64),
    });
    // LGPD: a lista da viagem leva dados de saúde e contatos das crianças para o celular
    if (!jaExiste) await registrarAcesso(conn, { acao: 'app_lista_viagem', detalhe: `viagem ${id}` });
    res.status(jaExiste ? 200 : 201).json(await detalheViagem(conn, id));
}, 'Erro ao iniciar a viagem'));

router.get('/viagens/:id', handler(async (req, res, conn) => {
    const v = await viagemDoMotorista(conn, req);
    if (req.monitor) await registrarAcesso(conn, { acao: 'app_lista_viagem', detalhe: `viagem ${v.id} (monitor)` });
    res.json(await detalheViagem(conn, v.id));
}, 'Erro ao carregar a viagem'));

// Eventos (podem chegar atrasados, em lote, quando o celular volta a ter sinal)
router.post('/viagens/:id/eventos', handler(async (req, res, conn) => {
    const v = await viagemDoMotorista(conn, req);
    const lista = (Array.isArray(req.body.eventos) ? req.body.eventos : []).slice(0, 200)
        .sort((a, b) => String(a.registrado_em).localeCompare(String(b.registrado_em)));
    const resultados = [];
    for (const ev of lista) {
        const uuid = str(ev.uuid, 64);
        const base = { uuid, tipo: str(ev.tipo, 30), aluno_id: toId(ev.aluno_id), parada_seq: ev.parada_seq ?? null, lat: ev.lat, lng: ev.lng, registrado_em: ev.registrado_em, dados: ev.dados || null };
        if (v.status !== 'em_andamento') { resultados.push({ uuid, ok: false, erro: 'viagem encerrada' }); continue; }
        if (base.tipo === 'chegada_parada') {
            const novo = await registrarEvento(conn, v.id, base, req.user.id);
            resultados.push({ uuid, ok: true, duplicado: !novo });
            // ida: avisa os pais que a van chegou no ponto (só de quem ainda não embarcou)
            const ids = Array.isArray(base.dados?.aluno_ids) ? base.dados.aluno_ids.map(toId).filter(Boolean) : [];
            if (novo && v.tipo_rota !== 'volta' && ids.length) {
                const aguardando = await conn.query(`SELECT aluno_id FROM presencas WHERE viagem_id = ? AND status = 'previsto' AND aluno_id IN (?)`, [v.id, ids]);
                if (aguardando.length) await notificar(conn, { viagemId: v.id, alunoIds: aguardando.map(a => a.aluno_id), tipo: 'chegada_busca', atrasoSeg: 0 });
            }
        } else if (['embarque', 'desembarque', 'nao_compareceu', 'desfazer'].includes(base.tipo) && base.aluno_id) {
            const r = await aplicarEventoPresenca(conn, v.id, base, req.user.id);
            resultados.push({ uuid, ok: r.aplicado || !!r.duplicado, duplicado: !!r.duplicado, erro: r.erro });
            if (r.aplicado) await avisarPais(conn, v, base);
        } else {
            resultados.push({ uuid, ok: false, erro: 'evento inválido' });
        }
    }
    const presencas = await conn.query('SELECT aluno_id, status FROM presencas WHERE viagem_id = ?', [v.id]);
    res.json({ resultados, presencas });
}, 'Erro ao registrar eventos'));

router.post('/viagens/:id/posicoes', handler(async (req, res, conn) => {
    const v = await viagemDoMotorista(conn, req);
    // posição da van vem do celular do motorista (o do monitor não manda)
    if (v.status !== 'em_andamento' || req.monitor) return res.json({ recebidas: 0 });
    const pos = (Array.isArray(req.body.posicoes) ? req.body.posicoes : []).slice(-500)
        .filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
        .sort((a, b) => String(a.registrado_em).localeCompare(String(b.registrado_em)));
    for (const p of pos) {
        await conn.query('INSERT INTO viagem_posicoes (viagem_id, lat, lng, precisao_m, velocidade_kmh, registrado_em) VALUES (?, ?, ?, ?, ?, ?)',
            [v.id, p.lat, p.lng, p.precisao_m != null ? Math.round(p.precisao_m) : null, p.velocidade_kmh != null ? Number(p.velocidade_kmh) : null, dataHora(p.registrado_em)]);
    }
    if (pos.length) {
        const u = pos[pos.length - 1];
        await conn.query('UPDATE viagens SET ultima_lat = ?, ultima_lng = ?, ultima_velocidade = ?, ultima_posicao_em = ? WHERE id = ? AND (ultima_posicao_em IS NULL OR ultima_posicao_em <= ?)',
            [u.lat, u.lng, u.velocidade_kmh ?? null, dataHora(u.registrado_em), v.id, dataHora(u.registrado_em)]);
        // "a van chega em ~5 min" (uma vez por aluno por viagem); só com posição recente
        const recente = Date.now() - new Date(u.registrado_em).getTime() < 3 * 60000;
        if (recente) {
            try {
                const limite = Number(process.env.AVISO_CHEGADA_MIN || 5);
                const etas = await estimarChegadas(conn, v.id);
                const busca = [], casa = [];
                for (const [alunoId, e] of etas) if (e.min <= limite) (e.sentido === 'casa' ? casa : busca).push({ alunoId, min: e.min });
                const minimo = (l) => Math.max(1, Math.min(...l.map(x => x.min)));
                if (busca.length) await notificar(conn, { viagemId: v.id, alunoIds: busca.map(x => x.alunoId), tipo: 'a_caminho_busca', dados: { min: minimo(busca) }, atrasoSeg: 0 });
                if (casa.length) await notificar(conn, { viagemId: v.id, alunoIds: casa.map(x => x.alunoId), tipo: 'a_caminho_casa', dados: { min: minimo(casa) }, atrasoSeg: 0 });
            } catch (err) {
                console.error('[eta] falha ao estimar:', err.message);
            }
        }
    }
    res.json({ recebidas: pos.length });
}, 'Erro ao registrar posição'));

async function criarOcorrencia(conn, req, v, { tipo, gravidade }) {
    const b = req.body;
    const uuid = str(b.uuid, 64);
    if (uuid) {
        const [ja] = await conn.query('SELECT id FROM ocorrencias WHERE uuid = ? AND empresa_id = ?', [uuid, empresaId()]);
        if (ja) return { id: ja.id, duplicado: true };
    }
    let foto = null;
    if (b.foto) {
        if (typeof b.foto !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(b.foto) || b.foto.length > MAX_FOTO) throw new HttpError(400, 'Foto inválida ou muito grande.');
        foto = b.foto;
    }
    const r = await conn.query(
        `INSERT INTO ocorrencias (empresa_id, viagem_id, uuid, tipo, gravidade, descricao, aluno_id, foto, lat, lng, usuario_id, registrado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [empresaId(), v.id, uuid, tipo, gravidade, str(b.descricao, 2000), toId(b.aluno_id), foto,
         Number.isFinite(Number(b.lat)) ? b.lat : null, Number.isFinite(Number(b.lng)) ? b.lng : null, req.user.id, dataHora(b.registrado_em)]);
    const id = Number(r.insertId);
    await registrarEvento(conn, v.id, { uuid: uuid ? `${uuid}-ev` : null, tipo: tipo === 'emergencia' ? 'emergencia' : 'ocorrencia', aluno_id: toId(b.aluno_id), lat: b.lat, lng: b.lng, registrado_em: b.registrado_em, dados: { ocorrencia_id: id, tipo } }, req.user.id);
    return { id, duplicado: false };
}

router.post('/viagens/:id/ocorrencias', handler(async (req, res, conn) => {
    const v = await viagemDoMotorista(conn, req);
    const tipo = TIPOS_OCORRENCIA.includes(req.body.tipo) ? req.body.tipo : 'outro';
    if (!str(req.body.descricao) && !req.body.foto) throw new HttpError(400, 'Descreva a ocorrência ou anexe uma foto.');
    const r = await criarOcorrencia(conn, req, v, { tipo, gravidade: tipo === 'acidente' ? 'alta' : 'normal' });
    res.status(r.duplicado ? 200 : 201).json(r);
}, 'Erro ao registrar ocorrência'));

// Botão de pânico
router.post('/viagens/:id/emergencia', handler(async (req, res, conn) => {
    const v = await viagemDoMotorista(conn, req);
    const r = await criarOcorrencia(conn, req, v, { tipo: 'emergencia', gravidade: 'alta' });
    if (!r.duplicado) console.warn(`[EMERGÊNCIA] viagem ${v.id} ${req.papelApp} ${req.pessoa.nome} lat=${req.body.lat} lng=${req.body.lng}`);
    res.status(r.duplicado ? 200 : 201).json(r);
}, 'Erro ao enviar emergência'));

// Encerrar: exige varredura do veículo e nenhum aluno "a bordo" sem desembarque
router.post('/viagens/:id/finalizar', handler(async (req, res, conn) => {
    const v = await viagemDoMotorista(conn, req);
    soMotorista(req, 'encerrar a viagem');
    if (v.status === 'concluida') return res.json(await detalheViagem(conn, v.id));
    if (req.body.varredura_confirmada !== true) {
        throw new HttpError(400, 'Confirme que percorreu o veículo e não ficou nenhuma criança a bordo.');
    }
    const aBordo = await conn.query(
        `SELECT a.nome FROM presencas p JOIN alunos a ON a.id = p.aluno_id WHERE p.viagem_id = ? AND p.status = 'embarcou'`, [v.id]);
    if (aBordo.length) {
        return res.status(409).json({ error: `Ainda constam a bordo: ${aBordo.map(a => a.nome).join(', ')}. Registre o desembarque antes de encerrar.`, a_bordo: aBordo.map(a => a.nome) });
    }
    const uuid = str(req.body.uuid, 64);
    const quando = dataHora(req.body.registrado_em);
    await registrarEvento(conn, v.id, { uuid: uuid ? `${uuid}-varredura` : null, tipo: 'varredura', lat: req.body.lat, lng: req.body.lng, registrado_em: req.body.registrado_em, dados: { confirmada: true } }, req.user.id);
    // previstos que não tiveram registro viram "não compareceu"
    await conn.query(`UPDATE presencas SET status = 'nao_compareceu' WHERE viagem_id = ? AND status = 'previsto'`, [v.id]);
    await registrarEvento(conn, v.id, { uuid, tipo: 'fim', lat: req.body.lat, lng: req.body.lng, registrado_em: req.body.registrado_em }, req.user.id);
    await conn.query(`UPDATE viagens SET status = 'concluida', concluida_em = ?, varredura_em = ? WHERE id = ? AND empresa_id = ?`, [quando, quando, v.id, empresaId()]);
    res.json(await detalheViagem(conn, v.id));
}, 'Erro ao encerrar a viagem'));

export default router;
