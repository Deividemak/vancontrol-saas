import { Router } from 'express';
import { handler, HttpError, transacao, parseId, str, hora, coord, limparLinha } from '../lib/http.js';
import { formatarEndereco } from '../services/geocoding.js';
import { empresaId, daEmpresa } from '../lib/tenant.js';
import { assinarEscola } from '../middleware/auth.js';
import { urlBase } from '../services/responsaveis.js';

const router = Router();
const TURNOS = ['Manhã', 'Tarde', 'Integral', 'Noite'];
const GEO_STATUS = ['pendente', 'automatico', 'manual', 'falhou'];

async function horariosPorEscola(conn) {
    const rows = await conn.query(`
        SELECT h.escola_id, h.turno, TIME_FORMAT(h.entrada,'%H:%i') AS entrada, TIME_FORMAT(h.saida,'%H:%i') AS saida
        FROM escola_horarios h JOIN escolas e ON e.id = h.escola_id WHERE e.empresa_id = ?`, [empresaId()]);
    const map = new Map();
    for (const r of rows) {
        if (!map.has(r.escola_id)) map.set(r.escola_id, []);
        map.get(r.escola_id).push({ turno: r.turno, entrada: r.entrada, saida: r.saida });
    }
    return map;
}

function ler(body) {
    const nome = str(body.nome);
    if (!nome) throw new HttpError(400, 'Informe o nome da escola.');
    const lat = coord(body.lat, 'lat'), lng = coord(body.lng, 'lng');
    let geo_status = GEO_STATUS.includes(body.geo_status) ? body.geo_status : 'pendente';
    const semCoord = lat === null || lng === null;
    if (semCoord && geo_status !== 'falhou') geo_status = 'pendente';
    const end = {
        cep: str(body.cep, 9), logradouro: str(body.logradouro), numero: str(body.numero, 20),
        complemento: str(body.complemento, 100), bairro: str(body.bairro, 100), cidade: str(body.cidade, 100),
        uf: str(body.uf, 2)?.toUpperCase() ?? null,
    };
    const horarios = (Array.isArray(body.horarios) ? body.horarios : [])
        .filter(h => TURNOS.includes(h.turno) && (h.entrada || h.saida))
        .map(h => ({ turno: h.turno, entrada: hora(h.entrada), saida: hora(h.saida) }));
    return {
        nome,
        // campo texto antigo continua preenchido (usado em buscas e telas antigas)
        endereco: formatarEndereco(end) || str(body.endereco, 1000),
        telefone: str(body.telefone, 20),
        responsavel_contato: str(body.responsavel_contato, 100),
        tipo: body.tipo === 'Pública' ? 'Pública' : 'Particular',
        ...end,
        lat: semCoord || geo_status === 'falhou' ? null : lat,
        lng: semCoord || geo_status === 'falhou' ? null : lng,
        geo_status,
        geo_precisao: str(body.geo_precisao, 20),
        horarios,
    };
}

const COLUNAS = ['nome', 'endereco', 'telefone', 'responsavel_contato', 'tipo', 'cep', 'logradouro', 'numero', 'complemento',
    'bairro', 'cidade', 'uf', 'lat', 'lng', 'geo_status', 'geo_precisao'];

async function salvarHorarios(conn, escolaId, horarios) {
    await conn.query('DELETE FROM escola_horarios WHERE escola_id = ?', [escolaId]);
    for (const h of horarios) {
        await conn.query('INSERT INTO escola_horarios (escola_id, turno, entrada, saida) VALUES (?, ?, ?, ?)', [escolaId, h.turno, h.entrada, h.saida]);
    }
}

router.get('/', handler(async (req, res, conn) => {
    const rows = await conn.query(`
        SELECT e.*,
            (SELECT COUNT(*) FROM alunos WHERE escola_id = e.id AND empresa_id = e.empresa_id AND anonimizado_em IS NULL) AS studentsCount,
            (SELECT COUNT(*) FROM frota WHERE escola_id = e.id AND empresa_id = e.empresa_id) AS activeVans,
            (SELECT GROUP_CONCAT(placa SEPARATOR ', ') FROM frota WHERE escola_id = e.id AND empresa_id = e.empresa_id) AS activeVansDetails
        FROM escolas e WHERE e.empresa_id = ?
        ORDER BY e.nome ASC
    `, [empresaId()]);
    const horarios = await horariosPorEscola(conn);
    res.json(rows.map(r => {
        const x = limparLinha(r);
        return {
            ...x,
            lat: x.lat === null ? null : Number(x.lat),
            lng: x.lng === null ? null : Number(x.lng),
            horarios: horarios.get(x.id) || [],
        };
    }));
}, 'Erro ao buscar escolas'));

router.post('/', handler(async (req, res, conn) => {
    const d = ler(req.body);
    const id = await transacao(conn, async () => {
        const r = await conn.query(`INSERT INTO escolas (empresa_id, ${COLUNAS.join(', ')}) VALUES (?, ${COLUNAS.map(() => '?').join(', ')})`, [empresaId(), ...COLUNAS.map(c => d[c])]);
        const novoId = Number(r.insertId);
        await salvarHorarios(conn, novoId, d.horarios);
        return novoId;
    });
    res.status(201).json({ id });
}, 'Erro ao criar escola'));

router.put('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'escolas', parseId(req), { nome: 'Escola' });
    const d = ler(req.body);
    await transacao(conn, async () => {
        const r = await conn.query(`UPDATE escolas SET ${COLUNAS.map(c => `${c} = ?`).join(', ')} WHERE id = ? AND empresa_id = ?`, [...COLUNAS.map(c => d[c]), id, empresaId()]);
        if (r.affectedRows === 0) throw new HttpError(404, 'Escola não encontrada.');
        await salvarHorarios(conn, id, d.horarios);
    });
    res.json({ message: 'Escola atualizada com sucesso' });
}, 'Erro ao atualizar escola'));

router.delete('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'escolas', parseId(req), { nome: 'Escola' });
    const check = await conn.query('SELECT id FROM alunos WHERE escola_id = ? LIMIT 1', [id]);
    if (check.length > 0) throw new HttpError(400, 'Não é possível excluir escola com alunos vinculados.');
    await conn.query('DELETE FROM escolas WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    res.json({ message: 'Escola excluída com sucesso' });
}, 'Erro ao excluir escola'));

// link do portal da escola (novo = desativa o link anterior)
router.post('/:id/portal', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'escolas', parseId(req), { nome: 'Escola' });
    if (req.body?.novo) await conn.query('UPDATE escolas SET portal_versao = portal_versao + 1 WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    const [e] = await conn.query('SELECT portal_versao FROM escolas WHERE id = ?', [id]);
    res.json({ link: `${urlBase()}/escola#${assinarEscola(id, e.portal_versao)}` });
}, 'Erro ao gerar link'));

export default router;
