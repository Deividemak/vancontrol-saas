import pool from '../db.js';

export class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/**
 * Envolve um handler Express: abre/fecha a conexão do pool e padroniza erros.
 * Erros HttpError viram resposta com o status e mensagem deles;
 * qualquer outro erro vira 500 com a mensagem genérica informada.
 */
export function handler(fn, mensagemErro = 'Erro interno') {
    return async (req, res) => {
        let conn;
        try {
            conn = await pool.getConnection();
            await fn(req, res, conn);
        } catch (err) {
            if (err instanceof HttpError) {
                if (!res.headersSent) res.status(err.status).json({ error: err.message });
                return;
            }
            console.error(`[${req.method} ${req.originalUrl}]`, err);
            if (!res.headersSent) res.status(500).json({ error: mensagemErro });
        } finally {
            if (conn) conn.release();
        }
    };
}

/** Executa fn dentro de uma transação. */
export async function transacao(conn, fn) {
    await conn.beginTransaction();
    try {
        const r = await fn();
        await conn.commit();
        return r;
    } catch (err) {
        await conn.rollback();
        throw err;
    }
}

export const toNum = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
export const toId = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
};
export const str = (v, max = 255) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === '' ? null : s.slice(0, max);
};

/** Converte BigInt/Decimal vindos do driver em números comuns. */
export function limparLinha(row) {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        out[k] = typeof v === 'bigint' ? Number(v) : v;
    }
    return out;
}

export function parseId(req, nome = 'id') {
    const id = toId(req.params[nome]);
    if (!id) throw new HttpError(400, 'Identificador inválido.');
    return id;
}

/** Valida 'HH:MM' ou 'HH:MM:SS'. Retorna 'HH:MM:SS' ou null. */
export function hora(v) {
    if (!v) return null;
    const m = String(v).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) throw new HttpError(400, `Horário inválido: ${v}`);
    const h = Number(m[1]), mi = Number(m[2]), s = Number(m[3] || 0);
    if (h > 23 || mi > 59 || s > 59) throw new HttpError(400, `Horário inválido: ${v}`);
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Valida 'YYYY-MM-DD'. */
export function data(v) {
    if (!v) return null;
    const s = String(v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
        throw new HttpError(400, `Data inválida: ${v}`);
    }
    return s;
}

export function coord(v, tipo) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    const lim = tipo === 'lat' ? 90 : 180;
    if (!Number.isFinite(n) || Math.abs(n) > lim) throw new HttpError(400, `Coordenada inválida (${tipo}).`);
    return Math.round(n * 1e7) / 1e7;
}
