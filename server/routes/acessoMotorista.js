// Acesso dos motoristas ao app (login próprio, perfil restrito)
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { handler, HttpError, parseId, str } from '../lib/http.js';
import { empresaId, daEmpresa } from '../lib/tenant.js';

const router = Router();

router.get('/', handler(async (req, res, conn) => {
    res.json(await conn.query(`SELECT id AS usuario_id, motorista_id, email FROM usuarios WHERE role = 'motorista' AND motorista_id IS NOT NULL AND empresa_id = ?`, [empresaId()]));
}, 'Erro ao buscar acessos'));

router.put('/:motoristaId', handler(async (req, res, conn) => {
    const motoristaId = await daEmpresa(conn, 'motoristas', parseId(req, 'motoristaId'), { nome: 'Motorista' });
    const [m] = await conn.query('SELECT id, nome FROM motoristas WHERE id = ?', [motoristaId]);
    if (!m) throw new HttpError(404, 'Motorista não encontrado.');
    const email = str(req.body.email, 255)?.toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    const senha = req.body.senha ? String(req.body.senha) : '';

    const [atual] = await conn.query(`SELECT id FROM usuarios WHERE motorista_id = ? AND role = 'motorista' AND empresa_id = ?`, [motoristaId, empresaId()]);
    const [emUso] = await conn.query('SELECT id FROM usuarios WHERE LOWER(email) = ? AND id <> ?', [email, atual?.id || 0]);
    if (emUso) throw new HttpError(400, 'Este e-mail já é usado por outro acesso.');

    if (!atual && senha.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
    if (atual && senha && senha.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');

    if (atual) {
        if (senha) await conn.query('UPDATE usuarios SET email = ?, nome = ?, senha = ?, ativo = 1 WHERE id = ?', [email, m.nome, await bcrypt.hash(senha, 10), atual.id]);
        else await conn.query('UPDATE usuarios SET email = ?, nome = ?, ativo = 1 WHERE id = ?', [email, m.nome, atual.id]);
    } else {
        await conn.query(`INSERT INTO usuarios (empresa_id, nome, email, senha, role, motorista_id) VALUES (?, ?, ?, ?, 'motorista', ?)`,
            [empresaId(), m.nome, email, await bcrypt.hash(senha, 10), motoristaId]);
    }
    res.json({ success: true });
}, 'Erro ao salvar acesso'));

router.delete('/:motoristaId', handler(async (req, res, conn) => {
    await conn.query(`DELETE FROM usuarios WHERE motorista_id = ? AND role = 'motorista' AND empresa_id = ?`, [parseId(req, 'motoristaId'), empresaId()]);
    res.json({ success: true });
}, 'Erro ao remover acesso'));

export default router;
