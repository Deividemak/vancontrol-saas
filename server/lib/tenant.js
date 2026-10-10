// Empresa (inquilino) da requisição atual.
// Cada requisição autenticada roda "dentro" da empresa do usuário; serviços e consultas
// usam empresaId() para filtrar os dados. Tarefas em segundo plano (régua, alertas, fila de avisos)
// rodam uma vez para cada empresa com comEmpresa().
import { AsyncLocalStorage } from 'node:async_hooks';
import { HttpError } from './http.js';

const als = new AsyncLocalStorage();

export function comEmpresa(empresaId, fn, extra = {}) {
    if (!empresaId) throw new Error('empresa não informada');
    return als.run({ empresaId: Number(empresaId), ...extra }, fn);
}

/** Id da empresa da requisição/tarefa atual (erro se não houver: evita vazar dados entre empresas). */
export function empresaId() {
    const s = als.getStore();
    if (!s || !s.empresaId) throw new Error('Operação sem empresa definida');
    return s.empresaId;
}

export function temEmpresa() {
    return !!als.getStore()?.empresaId;
}

/** Usuário logado (quando houver) — para registros de auditoria. */
export function usuarioAtual() {
    return als.getStore()?.usuario || null;
}

/**
 * Confere que o registro existe e é da empresa atual. Retorna o id (ou null se vazio e opcional).
 * Use para ids vindos da URL ou do corpo (escola_id, responsavel_id, veiculo_id...).
 */
export async function daEmpresa(conn, tabela, id, { opcional = false, status = 404, nome } = {}) {
    if (id === null || id === undefined || id === '') {
        if (opcional) return null;
        throw new HttpError(400, `${nome || 'Registro'} não informado.`);
    }
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identificador inválido.');
    const [r] = await conn.query(`SELECT id FROM \`${tabela}\` WHERE id = ? AND empresa_id = ?`, [n, empresaId()]);
    if (!r) throw new HttpError(status, status === 404 ? `${nome || 'Registro'} não encontrado.` : `${nome || 'Registro'} inválido.`);
    return n;
}

/** Igual a daEmpresa, mas para referências no corpo da requisição: responde 400 em vez de 404. */
export const refDaEmpresa = (conn, tabela, id, nome, opcional = true) =>
    daEmpresa(conn, tabela, id, { opcional, status: 400, nome });

/** Confere uma lista de ids de uma vez. */
export async function todosDaEmpresa(conn, tabela, ids, nome = 'Registro') {
    const lista = [...new Set((ids || []).map(Number))];
    if (!lista.length) return [];
    if (lista.some(n => !Number.isInteger(n) || n <= 0)) throw new HttpError(400, 'Identificador inválido.');
    const r = await conn.query(`SELECT id FROM \`${tabela}\` WHERE empresa_id = ? AND id IN (${lista.map(() => '?').join(',')})`, [empresaId(), ...lista]);
    if (r.length !== lista.length) throw new HttpError(400, `${nome} inválido.`);
    return lista;
}
