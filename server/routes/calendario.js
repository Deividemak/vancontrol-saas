import { Router } from 'express';
import { handler, HttpError, parseId, toId, str, data, limparLinha } from '../lib/http.js';
import { feriadosNacionais } from '../services/feriados.js';
import { empresaId, daEmpresa, refDaEmpresa } from '../lib/tenant.js';

const router = Router();
// feriado, recesso e sem_aula cancelam as aulas; evento é só informativo
export const TIPOS_SEM_AULA = ['feriado', 'recesso', 'sem_aula'];
const TIPOS = [...TIPOS_SEM_AULA, 'evento'];

const SELECT = `
    SELECT c.id, c.escola_id, e.nome AS escola_nome, c.tipo, c.descricao,
           DATE_FORMAT(c.data_inicio, '%Y-%m-%d') AS data_inicio,
           DATE_FORMAT(c.data_fim, '%Y-%m-%d') AS data_fim
    FROM calendario_eventos c LEFT JOIN escolas e ON e.id = c.escola_id AND e.empresa_id = c.empresa_id`;

function ler(body) {
    const inicio = data(body.data_inicio);
    if (!inicio) throw new HttpError(400, 'Informe a data.');
    const fim = data(body.data_fim) || inicio;
    if (fim < inicio) throw new HttpError(400, 'A data final é anterior à inicial.');
    const descricao = str(body.descricao);
    if (!descricao) throw new HttpError(400, 'Informe uma descrição.');
    const tipo = TIPOS.includes(body.tipo) ? body.tipo : 'feriado';
    return { escola_id: toId(body.escola_id), data_inicio: inicio, data_fim: fim, tipo, descricao };
}

// Eventos que tocam o intervalo [de, ate]
router.get('/', handler(async (req, res, conn) => {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const de = data(req.query.de) || `${ano}-01-01`;
    const ate = data(req.query.ate) || `${ano}-12-31`;
    const rows = await conn.query(`${SELECT} WHERE c.empresa_id = ? AND c.data_inicio <= ? AND c.data_fim >= ? ORDER BY c.data_inicio, c.id`, [empresaId(), ate, de]);
    res.json(rows.map(limparLinha));
}, 'Erro ao buscar calendário'));

// Situação de um dia: quais escolas não têm aula (usado pela operação diária)
router.get('/dia', handler(async (req, res, conn) => {
    const dia = data(req.query.data) || new Date().toISOString().slice(0, 10);
    const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
    const fimDeSemana = semana === 0 || semana === 6;
    const eventos = (await conn.query(`${SELECT} WHERE c.empresa_id = ? AND c.data_inicio <= ? AND c.data_fim >= ?`, [empresaId(), dia, dia])).map(limparLinha);
    const cancelam = eventos.filter(e => TIPOS_SEM_AULA.includes(e.tipo));
    const todas = fimDeSemana || cancelam.some(e => !e.escola_id);
    res.json({
        data: dia,
        fim_de_semana: fimDeSemana,
        sem_aula_todas: todas,
        escolas_sem_aula: todas ? [] : [...new Set(cancelam.map(e => e.escola_id))],
        eventos,
    });
}, 'Erro ao consultar o dia'));

router.post('/', handler(async (req, res, conn) => {
    const d = ler(req.body);
    await refDaEmpresa(conn, 'escolas', d.escola_id, 'Escola');
    const r = await conn.query('INSERT INTO calendario_eventos (empresa_id, escola_id, data_inicio, data_fim, tipo, descricao) VALUES (?, ?, ?, ?, ?, ?)',
        [empresaId(), d.escola_id, d.data_inicio, d.data_fim, d.tipo, d.descricao]);
    res.status(201).json({ id: Number(r.insertId) });
}, 'Erro ao criar evento'));

router.put('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'calendario_eventos', parseId(req), { nome: 'Evento' });
    const d = ler(req.body);
    await refDaEmpresa(conn, 'escolas', d.escola_id, 'Escola');
    const r = await conn.query('UPDATE calendario_eventos SET escola_id=?, data_inicio=?, data_fim=?, tipo=?, descricao=? WHERE id=? AND empresa_id=?',
        [d.escola_id, d.data_inicio, d.data_fim, d.tipo, d.descricao, id, empresaId()]);
    if (r.affectedRows === 0) throw new HttpError(404, 'Evento não encontrado.');
    res.json({ success: true });
}, 'Erro ao atualizar evento'));

router.delete('/:id', handler(async (req, res, conn) => {
    await conn.query('DELETE FROM calendario_eventos WHERE id = ? AND empresa_id = ?', [parseId(req), empresaId()]);
    res.json({ success: true });
}, 'Erro ao excluir evento'));

// Importa os feriados nacionais do ano (não duplica)
router.post('/importar-feriados', handler(async (req, res, conn) => {
    const ano = Number(req.body.ano) || new Date().getFullYear();
    if (ano < 2000 || ano > 2100) throw new HttpError(400, 'Ano inválido.');
    let criados = 0;
    for (const f of feriadosNacionais(ano)) {
        const existe = await conn.query(
            'SELECT id FROM calendario_eventos WHERE empresa_id = ? AND escola_id IS NULL AND data_inicio = ? AND tipo = ? LIMIT 1', [empresaId(), f.data, 'feriado']);
        if (existe.length) continue;
        await conn.query('INSERT INTO calendario_eventos (empresa_id, escola_id, data_inicio, data_fim, tipo, descricao) VALUES (?, NULL, ?, ?, ?, ?)',
            [empresaId(), f.data, f.data, 'feriado', f.descricao]);
        criados++;
    }
    res.json({ criados, ano });
}, 'Erro ao importar feriados'));

export default router;
