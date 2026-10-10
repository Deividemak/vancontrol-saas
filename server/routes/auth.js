// Login, cadastro de empresa nova (com o dono) e dados da conta
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { handler, HttpError, str, transacao } from '../lib/http.js';
import { signToken, loginRateLimit, resetLoginAttempts, usuarioPublico, papelDe } from '../middleware/auth.js';
import { comEmpresa, empresaId } from '../lib/tenant.js';
import { registrarAcesso } from '../services/lgpd.js';

const router = Router();
const emailValido = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// Cadastro: cria uma empresa nova e o usuário dono dela
router.post('/register', handler(async (req, res, conn) => {
    const nome = str(req.body.nome, 150);
    const email = str(req.body.email, 255)?.toLowerCase();
    const senha = req.body.senha ? String(req.body.senha) : '';
    const nomeEmpresa = str(req.body.empresa, 150) || (nome ? `Transporte de ${nome.split(' ')[0]}` : null);
    if (!nome || !email || !senha) throw new HttpError(400, 'Preencha nome, e-mail e senha.');
    if (!emailValido(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    if (senha.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');

    const [existe] = await conn.query('SELECT id FROM usuarios WHERE LOWER(email) = ?', [email]);
    if (existe) throw new HttpError(400, 'Este e-mail já está cadastrado.');

    const hash = await bcrypt.hash(senha, 10);
    const { empId, userId } = await transacao(conn, async () => {
        const e = await conn.query("INSERT INTO empresas (nome, plano, whatsapp_segredo) VALUES (?, 'gratis', ?)", [nomeEmpresa, crypto.randomBytes(24).toString('hex')]);
        const empId = Number(e.insertId);
        const u = await conn.query(`INSERT INTO usuarios (empresa_id, nome, email, senha, role) VALUES (?, ?, ?, ?, 'dono')`, [empId, nome, email, hash]);
        return { empId, userId: Number(u.insertId) };
    });
    const user = { id: userId, nome, email, role: 'dono', empresa_id: empId };
    res.status(201).json({ token: signToken(user), user: usuarioPublico(user, { nome: nomeEmpresa }) });
}, 'Erro ao registrar usuário'));

router.post('/login', loginRateLimit, handler(async (req, res, conn) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    const [user] = await conn.query(
        `SELECT u.*, e.nome AS empresa_nome, e.ativo AS empresa_ativa FROM usuarios u JOIN empresas e ON e.id = u.empresa_id WHERE LOWER(u.email) = ?`, [email]);
    if (!user || !(await bcrypt.compare(senha, user.senha))) throw new HttpError(400, 'E-mail ou senha incorretos.');
    if (!user.ativo) throw new HttpError(403, 'Acesso desativado. Fale com o responsável pela empresa.');
    if (!user.empresa_ativa) throw new HttpError(403, 'Empresa desativada.');

    const papel = papelDe(user.role);
    if (papel === 'motorista') {
        const [m] = await conn.query('SELECT status FROM motoristas WHERE id = ? AND empresa_id = ?', [user.motorista_id, user.empresa_id]);
        if (!m || m.status !== 'Ativo') throw new HttpError(403, 'Acesso do motorista desativado. Fale com a empresa.');
    }
    if (papel === 'monitor') {
        const [m] = await conn.query('SELECT status FROM monitores WHERE id = ? AND empresa_id = ?', [user.monitor_id, user.empresa_id]);
        if (!m || m.status !== 'Ativo') throw new HttpError(403, 'Acesso do monitor desativado. Fale com a empresa.');
    }

    resetLoginAttempts(req);
    await conn.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?', [user.id]);
    await comEmpresa(user.empresa_id, () => registrarAcesso(conn, { acao: 'login', usuario: { id: user.id, nome: user.nome, papel }, ip: req.ip }));
    res.json({ token: signToken(user), user: usuarioPublico(user, { nome: user.empresa_nome }) });
}, 'Erro ao fazer login'));

router.get('/me', handler(async (req, res, conn) => {
    const [u] = await conn.query(
        `SELECT u.id, u.nome, u.email, u.role, u.empresa_id, u.motorista_id, u.monitor_id, e.nome AS empresa_nome
         FROM usuarios u JOIN empresas e ON e.id = u.empresa_id WHERE u.id = ? AND u.empresa_id = ?`, [req.user.id, empresaId()]);
    if (!u) throw new HttpError(404, 'Usuário não encontrado.');
    res.json(usuarioPublico(u, { nome: u.empresa_nome }));
}, 'Erro ao carregar usuário'));

router.put('/profile', handler(async (req, res, conn) => {
    const nome = str(req.body.nome, 150);
    const email = str(req.body.email, 255)?.toLowerCase();
    if (!nome || !email || !emailValido(email)) throw new HttpError(400, 'Informe nome e um e-mail válido.');
    const [emUso] = await conn.query('SELECT id FROM usuarios WHERE LOWER(email) = ? AND id <> ?', [email, req.user.id]);
    if (emUso) throw new HttpError(400, 'Este e-mail já está em uso por outra conta.');
    await conn.query('UPDATE usuarios SET nome = ?, email = ? WHERE id = ?', [nome, email, req.user.id]);
    res.json({ message: 'Perfil atualizado com sucesso' });
}, 'Erro ao atualizar perfil'));

router.put('/password', handler(async (req, res, conn) => {
    const { senhaAtual, novaSenha } = req.body;
    if (!novaSenha || String(novaSenha).length < 8) throw new HttpError(400, 'A nova senha deve ter pelo menos 8 caracteres.');
    const [u] = await conn.query('SELECT senha FROM usuarios WHERE id = ?', [req.user.id]);
    if (!u) throw new HttpError(404, 'Usuário não encontrado.');
    if (!(await bcrypt.compare(String(senhaAtual || ''), u.senha))) throw new HttpError(400, 'Senha atual incorreta.');
    await conn.query('UPDATE usuarios SET senha = ? WHERE id = ?', [await bcrypt.hash(String(novaSenha), 10), req.user.id]);
    res.json({ message: 'Senha atualizada com sucesso' });
}, 'Erro ao alterar senha'));

export default router;
