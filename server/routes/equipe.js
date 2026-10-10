// Equipe da empresa: quem acessa o painel (dono, gestor, financeiro) e os acessos de monitor ao app
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { handler, HttpError, parseId, str } from '../lib/http.js';
import { empresaId, daEmpresa } from '../lib/tenant.js';
import { PAPEIS_PAINEL, papelDe } from '../middleware/auth.js';

const router = Router();
const emailValido = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

async function emailLivre(conn, email, menosId = 0) {
    const [u] = await conn.query('SELECT id FROM usuarios WHERE LOWER(email) = ? AND id <> ?', [email, menosId]);
    if (u) throw new HttpError(400, 'Este e-mail já é usado por outro acesso.');
}

async function donosAtivos(conn) {
    const [r] = await conn.query(`SELECT COUNT(*) n FROM usuarios WHERE empresa_id = ? AND role IN ('dono','admin') AND ativo = 1`, [empresaId()]);
    return Number(r.n);
}

router.get('/', handler(async (req, res, conn) => {
    const rows = await conn.query(`
        SELECT u.id, u.nome, u.email, u.role, u.ativo, u.motorista_id, u.monitor_id,
               DATE_FORMAT(u.ultimo_login,'%Y-%m-%dT%H:%i:%s') AS ultimo_login, DATE_FORMAT(u.created_at,'%Y-%m-%d') AS criado_em,
               COALESCE(m.nome, mo.nome) AS vinculado_nome
        FROM usuarios u
        LEFT JOIN motoristas m ON m.id = u.motorista_id AND m.empresa_id = u.empresa_id
        LEFT JOIN monitores mo ON mo.id = u.monitor_id AND mo.empresa_id = u.empresa_id
        WHERE u.empresa_id = ? ORDER BY FIELD(u.role,'dono','admin','gestor','financeiro','motorista','monitor'), u.nome`, [empresaId()]);
    res.json(rows.map(({ role, ...u }) => ({ ...u, papel: papelDe(role), ativo: !!u.ativo, voce: u.id === req.user.id })));
}, 'Erro ao buscar equipe'));

router.post('/', handler(async (req, res, conn) => {
    const nome = str(req.body.nome, 150);
    const email = str(req.body.email, 255)?.toLowerCase();
    const senha = req.body.senha ? String(req.body.senha) : '';
    const papel = req.body.papel;
    if (!nome) throw new HttpError(400, 'Informe o nome.');
    if (!email || !emailValido(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    if (senha.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
    if (!PAPEIS_PAINEL.includes(papel)) throw new HttpError(400, 'Escolha o perfil: dono, gestor ou financeiro.');
    await emailLivre(conn, email);
    const r = await conn.query('INSERT INTO usuarios (empresa_id, nome, email, senha, role) VALUES (?, ?, ?, ?, ?)',
        [empresaId(), nome, email, await bcrypt.hash(senha, 10), papel]);
    res.status(201).json({ id: Number(r.insertId) });
}, 'Erro ao cadastrar acesso'));

// acesso de monitor ao app (mesmo app do motorista, com permissões de monitor)
router.put('/monitor/:monitorId', handler(async (req, res, conn) => {
    const monitorId = await daEmpresa(conn, 'monitores', parseId(req, 'monitorId'), { nome: 'Monitor' });
    const [m] = await conn.query('SELECT nome FROM monitores WHERE id = ?', [monitorId]);
    const email = str(req.body.email, 255)?.toLowerCase();
    if (!email || !emailValido(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    const senha = req.body.senha ? String(req.body.senha) : '';
    const [atual] = await conn.query(`SELECT id FROM usuarios WHERE monitor_id = ? AND role = 'monitor' AND empresa_id = ?`, [monitorId, empresaId()]);
    await emailLivre(conn, email, atual?.id || 0);
    if ((!atual || senha) && senha.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
    if (atual) {
        await conn.query('UPDATE usuarios SET email = ?, nome = ?, ativo = 1 WHERE id = ?', [email, m.nome, atual.id]);
        if (senha) await conn.query('UPDATE usuarios SET senha = ? WHERE id = ?', [await bcrypt.hash(senha, 10), atual.id]);
    } else {
        await conn.query(`INSERT INTO usuarios (empresa_id, nome, email, senha, role, monitor_id) VALUES (?, ?, ?, ?, 'monitor', ?)`,
            [empresaId(), m.nome, email, await bcrypt.hash(senha, 10), monitorId]);
    }
    res.json({ success: true });
}, 'Erro ao salvar acesso do monitor'));

router.delete('/monitor/:monitorId', handler(async (req, res, conn) => {
    const monitorId = await daEmpresa(conn, 'monitores', parseId(req, 'monitorId'), { nome: 'Monitor' });
    await conn.query(`DELETE FROM usuarios WHERE monitor_id = ? AND role = 'monitor' AND empresa_id = ?`, [monitorId, empresaId()]);
    res.json({ success: true });
}, 'Erro ao remover acesso'));

router.put('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'usuarios', parseId(req), { nome: 'Acesso' });
    const [u] = await conn.query('SELECT id, role, ativo FROM usuarios WHERE id = ?', [id]);
    const papelAtual = papelDe(u.role);
    const b = req.body || {};
    const campos = [], valores = [];
    if (b.nome !== undefined) {
        const nome = str(b.nome, 150);
        if (!nome) throw new HttpError(400, 'Informe o nome.');
        campos.push('nome = ?'); valores.push(nome);
    }
    if (b.email !== undefined) {
        const email = str(b.email, 255)?.toLowerCase();
        if (!email || !emailValido(email)) throw new HttpError(400, 'Informe um e-mail válido.');
        await emailLivre(conn, email, id);
        campos.push('email = ?'); valores.push(email);
    }
    if (b.papel !== undefined && b.papel !== papelAtual) {
        if (!PAPEIS_PAINEL.includes(b.papel) || !PAPEIS_PAINEL.includes(papelAtual)) throw new HttpError(400, 'Perfil inválido.');
        if (papelAtual === 'dono' && (await donosAtivos(conn)) <= 1) throw new HttpError(400, 'A empresa precisa ter pelo menos um dono.');
        campos.push('role = ?'); valores.push(b.papel);
    }
    if (b.ativo !== undefined && !!b.ativo !== !!u.ativo) {
        if (!b.ativo && id === req.user.id) throw new HttpError(400, 'Você não pode desativar o próprio acesso.');
        if (!b.ativo && papelAtual === 'dono' && (await donosAtivos(conn)) <= 1) throw new HttpError(400, 'A empresa precisa ter pelo menos um dono.');
        campos.push('ativo = ?'); valores.push(b.ativo ? 1 : 0);
    }
    if (b.senha) {
        if (String(b.senha).length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
        campos.push('senha = ?'); valores.push(await bcrypt.hash(String(b.senha), 10));
    }
    if (campos.length) await conn.query(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ? AND empresa_id = ?`, [...valores, id, empresaId()]);
    res.json({ success: true });
}, 'Erro ao atualizar acesso'));

router.delete('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'usuarios', parseId(req), { nome: 'Acesso' });
    const [u] = await conn.query('SELECT role FROM usuarios WHERE id = ?', [id]);
    if (id === req.user.id) throw new HttpError(400, 'Você não pode remover o próprio acesso.');
    if (papelDe(u.role) === 'dono' && (await donosAtivos(conn)) <= 1) throw new HttpError(400, 'A empresa precisa ter pelo menos um dono.');
    await conn.query('DELETE FROM usuarios WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    res.json({ success: true });
}, 'Erro ao remover acesso'));

export default router;
