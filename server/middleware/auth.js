import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { comEmpresa } from '../lib/tenant.js';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('[auth] JWT_SECRET ausente ou muito curto (mínimo 32 caracteres). Defina no arquivo .env.');
    process.exit(1);
}

// ---------- Perfis ----------
// dono: tudo · gestor: operação do dia a dia (sem financeiro, contratos, equipe e LGPD)
// financeiro: cobrança, contratos e responsáveis · motorista/monitor: só o app
export const PAPEIS_PAINEL = ['dono', 'gestor', 'financeiro'];
export const PAPEIS_APP = ['motorista', 'monitor'];
export const NOMES_PAPEIS = { dono: 'Dono', gestor: 'Gestor (operação)', financeiro: 'Financeiro', motorista: 'Motorista', monitor: 'Monitor' };

/** Papel efetivo de um registro de usuarios (contas antigas "admin" são donas). */
export function papelDe(role) {
    if (PAPEIS_PAINEL.includes(role) || PAPEIS_APP.includes(role)) return role;
    return 'dono';
}

const APP = [/^\/motorista(\/|$)/, /^\/auth\/(password|me)$/];
const SO_DONO = /^\/(equipe|lgpd)(\/|$)/;
const FINANCEIRO_SIM = /^\/(financeiro|contratos|responsaveis|mensagens|dashboard|notifications|auth|plano|relatorios)(\/|$)/;

/** O perfil pode acessar este caminho da API? */
export function podeAcessar(papel, metodo, caminho) {
    if (papel === 'dono') return true;
    if (PAPEIS_APP.includes(papel)) return APP.some(r => r.test(caminho));
    if (SO_DONO.test(caminho)) return false;
    // configuração do WhatsApp (senhas do provedor) só o dono altera
    if (/^\/mensagens\/config/.test(caminho) && metodo !== 'GET') return false;
    if (papel === 'gestor') return !/^\/(financeiro|contratos)(\/|$)/.test(caminho);
    if (papel === 'financeiro') {
        if (FINANCEIRO_SIM.test(caminho)) return true;
        return metodo === 'GET' && /^\/(alunos|escolas)$/.test(caminho);
    }
    return false;
}

// Rotas da API que não exigem login (caminho relativo a /api)
const PUBLIC_ROUTES = new Set([
    'POST /auth/login',
    'POST /auth/register',
]);

export function signToken(user) {
    const papel = papelDe(user.role);
    const app = PAPEIS_APP.includes(papel);
    return jwt.sign(
        { id: user.id, email: user.email, role: papel },
        JWT_SECRET,
        // motorista/monitor ficam logados mais tempo no celular (30 dias)
        { expiresIn: app ? '30d' : '7d' }
    );
}

/** Dados do usuário devolvidos no login e em /auth/me. */
export function usuarioPublico(u, empresa) {
    const papel = papelDe(u.role);
    return {
        id: u.id, nome: u.nome, email: u.email, papel,
        // compatibilidade: telas antigas usam role 'admin' para o painel
        role: PAPEIS_APP.includes(papel) ? papel : 'admin',
        motorista_id: u.motorista_id || null, monitor_id: u.monitor_id || null,
        empresa_id: u.empresa_id, empresa_nome: empresa?.nome || null,
    };
}

// Prefixos com autenticação própria: webhooks (segredo na URL) e portal dos pais (link mágico)
const PREFIXOS_PROPRIOS = ['/publico/', '/portal/', '/escola-portal/'];

/**
 * Confere o token e carrega o usuário do banco a cada requisição
 * (acesso desativado ou perfil alterado vale na hora). A requisição passa a rodar
 * "dentro" da empresa do usuário.
 */
export async function requireAuth(req, res, next) {
    if (req.method === 'OPTIONS') return next();
    if (PUBLIC_ROUTES.has(`${req.method} ${req.path}`)) return next();
    if (PREFIXOS_PROPRIOS.some(p => req.path.startsWith(p))) return next();

    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Não autenticado.' });

    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Sessão expirada ou inválida. Faça login novamente.' });
    }
    // token do portal dos pais nunca vale para o painel nem para o app
    if (payload.tipo === 'responsavel' || payload.tipo === 'escola' || !payload.id) return res.status(401).json({ error: 'Não autenticado.' });

    let u;
    let conn;
    try {
        conn = await pool.getConnection();
        [u] = await conn.query(
            `SELECT u.id, u.nome, u.email, u.role, u.empresa_id, u.motorista_id, u.monitor_id, u.ativo, e.ativo AS empresa_ativa
             FROM usuarios u JOIN empresas e ON e.id = u.empresa_id WHERE u.id = ?`, [payload.id]);
    } catch (err) {
        console.error('[auth] erro ao carregar usuário:', err);
        return res.status(500).json({ error: 'Erro ao verificar acesso' });
    } finally {
        if (conn) conn.release();
    }
    if (!u || !u.ativo) return res.status(401).json({ error: 'Acesso desativado. Fale com o responsável pela empresa.' });
    if (!u.empresa_ativa) return res.status(403).json({ error: 'Empresa desativada.' });

    const papel = papelDe(u.role);
    req.user = {
        id: u.id, nome: u.nome, email: u.email, papel,
        role: PAPEIS_APP.includes(papel) ? papel : 'admin',
        empresa_id: u.empresa_id, motorista_id: u.motorista_id || null, monitor_id: u.monitor_id || null,
    };
    return comEmpresa(u.empresa_id, () => next(), { usuario: req.user, ip: req.ip });
}

// Limite simples de tentativas de login (em memória): 10 tentativas a cada 15 min por IP + e-mail
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function loginRateLimit(req, res, next) {
    const key = `${req.ip}|${String(req.body?.email || '').toLowerCase()}`;
    const now = Date.now();
    const entry = attempts.get(key);

    if (entry && now - entry.start < WINDOW_MS && entry.count >= MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'Muitas tentativas de login. Aguarde alguns minutos.' });
    }
    if (!entry || now - entry.start >= WINDOW_MS) {
        attempts.set(key, { start: now, count: 1 });
    } else {
        entry.count++;
    }
    next();
}

export function resetLoginAttempts(req) {
    attempts.delete(`${req.ip}|${String(req.body?.email || '').toLowerCase()}`);
}

/** Bloqueia o que o perfil não pode acessar. */
export function restringirPapel(req, res, next) {
    if (!req.user) return next();
    if (podeAcessar(req.user.papel, req.method, req.path)) return next();
    return res.status(403).json({ error: 'Acesso não permitido para este perfil.' });
}

// ---------- Portal do responsável (link mágico, sem senha) ----------
export function assinarPortal(responsavelId, versao) {
    return jwt.sign({ tipo: 'responsavel', rid: responsavelId, v: versao }, JWT_SECRET, { expiresIn: '365d' });
}

// ---------- Portal da escola (link mágico) ----------
export function assinarEscola(escolaId, versao) {
    return jwt.sign({ tipo: 'escola', eid: escolaId, v: versao }, JWT_SECRET, { expiresIn: '365d' });
}

export function lerTokenEscola(token) {
    try {
        const p = jwt.verify(token, JWT_SECRET);
        if (p.tipo !== 'escola' || !p.eid) return null;
        return { escola_id: p.eid, versao: p.v };
    } catch {
        return null;
    }
}

export function lerTokenPortal(token) {
    try {
        const p = jwt.verify(token, JWT_SECRET);
        if (p.tipo !== 'responsavel' || !p.rid) return null;
        return { responsavel_id: p.rid, versao: p.v };
    } catch {
        return null;
    }
}
