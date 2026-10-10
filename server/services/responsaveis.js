// Utilidades ligadas aos responsáveis: ausências, link do portal, busca por telefone.
import { assinarPortal } from '../middleware/auth.js';
import { notificar } from './notificacoes.js';
import { chaveTelefone } from './whatsapp.js';
import { empresaId } from '../lib/tenant.js';

export async function registrarAusencia(conn, { alunoIds, inicio, fim, sentido = 'ambos', motivo = null, origem = 'painel', criadoPor = null }) {
    const ids = [];
    for (const alunoId of alunoIds) {
        const r = await conn.query(
            'INSERT INTO ausencias (empresa_id, aluno_id, data_inicio, data_fim, sentido, motivo, origem, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [empresaId(), alunoId, inicio, fim || inicio, sentido, motivo, origem, criadoPor]);
        ids.push(Number(r.insertId));
    }
    // confirmação para os pais (um aviso por pedido, com todos os irmãos)
    await notificar(conn, {
        alunoIds, tipo: 'ausencia_registrada', unico: false, atrasoSeg: 0,
        dados: { inicio, fim: fim || inicio, sentido, desfazer: origem === 'whatsapp' },
    });
    return ids;
}

export function urlBase() {
    return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export async function linkPortal(conn, responsavelId) {
    const [r] = await conn.query('SELECT id, portal_versao FROM responsaveis WHERE id = ? AND empresa_id = ? AND anonimizado_em IS NULL', [responsavelId, empresaId()]);
    if (!r) return null;
    // token depois do "#": o navegador não envia ao servidor (não aparece em logs nem quebra o roteamento)
    return `${urlBase()}/acompanhar#${assinarPortal(r.id, r.portal_versao)}`;
}

/** Acha o responsável (e alunos) pelo telefone; aceita número com/sem 9º dígito. */
export async function buscarPorTelefone(conn, telefone) {
    const chave = chaveTelefone(telefone);
    if (!chave) return null;
    const emp = empresaId();
    const resps = await conn.query('SELECT id, nome, telefone FROM responsaveis WHERE empresa_id = ? AND anonimizado_em IS NULL', [emp]);
    const resp = resps.find(r => chaveTelefone(r.telefone) === chave) || null;
    let alunos;
    if (resp) {
        alunos = await conn.query(`SELECT id, nome FROM alunos WHERE responsavel_id = ? AND empresa_id = ? AND status = 'Ativo' ORDER BY nome`, [resp.id, emp]);
    } else {
        const avulsos = await conn.query(`SELECT id, nome, responsavel_telefone FROM alunos WHERE responsavel_id IS NULL AND empresa_id = ? AND status = 'Ativo'`, [emp]);
        alunos = avulsos.filter(a => chaveTelefone(a.responsavel_telefone) === chave).map(({ id, nome }) => ({ id, nome }));
    }
    if (!resp && !alunos.length) return null;
    return { responsavel: resp, alunos };
}
