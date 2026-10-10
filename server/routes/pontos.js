// Pontos de encontro e áreas restritas (restrições de rota)
import { Router } from 'express';
import { handler, HttpError, parseId, str, coord, limparLinha } from '../lib/http.js';
import { empresaId, daEmpresa } from '../lib/tenant.js';

const norm = (r) => { const x = limparLinha(r); return { ...x, lat: Number(x.lat), lng: Number(x.lng), ativo: !!x.ativo }; };

export const pontosRouter = Router();

pontosRouter.get('/', handler(async (req, res, conn) => {
    const rows = await conn.query(`
        SELECT p.*, (SELECT COUNT(*) FROM rota_alunos ra WHERE ra.ponto_encontro_id = p.id) AS em_uso
        FROM pontos_encontro p WHERE p.empresa_id = ? ORDER BY p.nome`, [empresaId()]);
    res.json(rows.map(norm));
}, 'Erro ao buscar pontos de encontro'));

function lerPonto(b) {
    const nome = str(b.nome, 150);
    if (!nome) throw new HttpError(400, 'Informe o nome do ponto.');
    const lat = coord(b.lat, 'lat'), lng = coord(b.lng, 'lng');
    if (lat === null || lng === null) throw new HttpError(400, 'Marque o ponto no mapa.');
    return { nome, referencia: str(b.referencia), lat, lng, ativo: b.ativo !== false };
}

pontosRouter.post('/', handler(async (req, res, conn) => {
    const d = lerPonto(req.body);
    const r = await conn.query('INSERT INTO pontos_encontro (empresa_id, nome, referencia, lat, lng, ativo) VALUES (?, ?, ?, ?, ?, ?)', [empresaId(), d.nome, d.referencia, d.lat, d.lng, d.ativo]);
    res.status(201).json({ id: Number(r.insertId) });
}, 'Erro ao criar ponto'));

pontosRouter.put('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'pontos_encontro', parseId(req), { nome: 'Ponto' });
    const d = lerPonto(req.body);
    const r = await conn.query('UPDATE pontos_encontro SET nome=?, referencia=?, lat=?, lng=?, ativo=? WHERE id=? AND empresa_id=?', [d.nome, d.referencia, d.lat, d.lng, d.ativo, id, empresaId()]);
    if (r.affectedRows === 0) throw new HttpError(404, 'Ponto não encontrado.');
    res.json({ success: true });
}, 'Erro ao atualizar ponto'));

pontosRouter.delete('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'pontos_encontro', parseId(req), { nome: 'Ponto' });
    const uso = await conn.query('SELECT 1 FROM rota_alunos WHERE ponto_encontro_id = ? LIMIT 1', [id]);
    if (uso.length) throw new HttpError(400, 'Este ponto está em uso em alguma rota. Troque o ponto dos alunos antes de excluir.');
    await conn.query('DELETE FROM pontos_encontro WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    res.json({ success: true });
}, 'Erro ao excluir ponto'));

export const areasRouter = Router();

areasRouter.get('/', handler(async (req, res, conn) => {
    res.json((await conn.query('SELECT * FROM areas_restritas WHERE empresa_id = ? ORDER BY nome', [empresaId()])).map(norm));
}, 'Erro ao buscar áreas restritas'));

function lerArea(b) {
    const nome = str(b.nome, 150);
    if (!nome) throw new HttpError(400, 'Informe o nome da área.');
    const lat = coord(b.lat, 'lat'), lng = coord(b.lng, 'lng');
    if (lat === null || lng === null) throw new HttpError(400, 'Marque a área no mapa.');
    const raio = Math.round(Number(b.raio_m) || 100);
    if (raio < 10 || raio > 5000) throw new HttpError(400, 'O raio deve ficar entre 10 e 5000 metros.');
    return { nome, descricao: str(b.descricao), lat, lng, raio_m: raio, ativo: b.ativo !== false };
}

areasRouter.post('/', handler(async (req, res, conn) => {
    const d = lerArea(req.body);
    const r = await conn.query('INSERT INTO areas_restritas (empresa_id, nome, descricao, lat, lng, raio_m, ativo) VALUES (?, ?, ?, ?, ?, ?, ?)', [empresaId(), d.nome, d.descricao, d.lat, d.lng, d.raio_m, d.ativo]);
    res.status(201).json({ id: Number(r.insertId) });
}, 'Erro ao criar área'));

areasRouter.put('/:id', handler(async (req, res, conn) => {
    const d = lerArea(req.body);
    const r = await conn.query('UPDATE areas_restritas SET nome=?, descricao=?, lat=?, lng=?, raio_m=?, ativo=? WHERE id=? AND empresa_id=?', [d.nome, d.descricao, d.lat, d.lng, d.raio_m, d.ativo, parseId(req), empresaId()]);
    if (r.affectedRows === 0) throw new HttpError(404, 'Área não encontrada.');
    res.json({ success: true });
}, 'Erro ao atualizar área'));

areasRouter.delete('/:id', handler(async (req, res, conn) => {
    await conn.query('DELETE FROM areas_restritas WHERE id = ? AND empresa_id = ?', [parseId(req), empresaId()]);
    res.json({ success: true });
}, 'Erro ao excluir área'));
