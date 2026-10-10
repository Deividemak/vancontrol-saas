// Documentos (veículos, motoristas, monitores) e cadastro de monitores
import { Router } from 'express';
import { handler, HttpError, parseId, toId, str, data as dataValida, limparLinha } from '../lib/http.js';
import { TIPOS_DOCUMENTO, ENTIDADES, painelDocumentos, avisarDocumentos } from '../services/documentos.js';
import { empresaId, daEmpresa } from '../lib/tenant.js';

export const documentosRouter = Router();
export const monitoresRouter = Router();

const MAX_ARQUIVO = 3 * 1024 * 1024; // data URL (≈ 2 MB de arquivo)

documentosRouter.get('/tipos', (req, res) => res.json(TIPOS_DOCUMENTO));

documentosRouter.get('/painel', handler(async (req, res, conn) => {
    const ent = ENTIDADES.includes(req.query.entidade) ? req.query.entidade : null;
    res.json(await painelDocumentos(conn, { entidade: ent }));
}, 'Erro ao carregar documentos'));

function lerDoc(b) {
    const entidade = ENTIDADES.includes(b.entidade) ? b.entidade : null;
    if (!entidade) throw new HttpError(400, 'Tipo de cadastro inválido.');
    const entidadeId = toId(b.entidade_id);
    if (!entidadeId) throw new HttpError(400, 'Informe a quem pertence o documento.');
    if (!TIPOS_DOCUMENTO[entidade].some(t => t.id === b.tipo)) throw new HttpError(400, 'Tipo de documento inválido.');
    const emissao = dataValida(b.emissao), validade = dataValida(b.validade);
    if (emissao && validade && validade < emissao) throw new HttpError(400, 'A validade é anterior à emissão.');
    let arquivo;
    if (b.arquivo === null || b.arquivo === '') arquivo = null;
    else if (b.arquivo !== undefined) {
        if (typeof b.arquivo !== 'string' || !/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(b.arquivo)) throw new HttpError(400, 'Envie uma foto (JPG/PNG) ou PDF.');
        if (b.arquivo.length > MAX_ARQUIVO) throw new HttpError(400, 'Arquivo muito grande (máximo 2 MB).');
        arquivo = b.arquivo;
    }
    return { entidade, entidadeId, tipo: b.tipo, numero: str(b.numero, 60), emissao, validade, arquivo, arquivo_nome: str(b.arquivo_nome, 150), observacao: str(b.observacao) };
}

async function existeEntidade(conn, entidade, id) {
    const tabela = { veiculo: 'frota', motorista: 'motoristas', monitor: 'monitores' }[entidade];
    const [r] = await conn.query(`SELECT id FROM ${tabela} WHERE id = ? AND empresa_id = ?`, [id, empresaId()]);
    if (!r) throw new HttpError(404, 'Cadastro não encontrado.');
}

// Lança ou renova (um documento atual por tipo)
documentosRouter.post('/', handler(async (req, res, conn) => {
    const d = lerDoc(req.body || {});
    await existeEntidade(conn, d.entidade, d.entidadeId);
    const comArquivo = d.arquivo !== undefined;
    await conn.query(`
        INSERT INTO documentos (empresa_id, entidade, entidade_id, tipo, numero, emissao, validade, observacao ${comArquivo ? ', arquivo, arquivo_nome' : ''})
        VALUES (?, ?, ?, ?, ?, ?, ?, ? ${comArquivo ? ', ?, ?' : ''})
        ON DUPLICATE KEY UPDATE numero = VALUES(numero), emissao = VALUES(emissao), validade = VALUES(validade), observacao = VALUES(observacao)
        ${comArquivo ? ', arquivo = VALUES(arquivo), arquivo_nome = VALUES(arquivo_nome)' : ''}`,
        [empresaId(), d.entidade, d.entidadeId, d.tipo, d.numero, d.emissao, d.validade, d.observacao, ...(comArquivo ? [d.arquivo, d.arquivo_nome] : [])]);
    // CNH: mantém o vencimento do cadastro do motorista em dia
    if (d.entidade === 'motorista' && d.tipo === 'cnh' && d.validade) {
        await conn.query('UPDATE motoristas SET vencimento_cnh = ? WHERE id = ? AND empresa_id = ?', [d.validade, d.entidadeId, empresaId()]);
    }
    res.status(201).json({ success: true });
}, 'Erro ao salvar documento'));

documentosRouter.post('/avisar', handler(async (req, res, conn) => {
    res.json({ itens: await avisarDocumentos(conn) });
}, 'Erro ao avisar'));

documentosRouter.get('/:id/arquivo', handler(async (req, res, conn) => {
    const [d] = await conn.query('SELECT arquivo, arquivo_nome FROM documentos WHERE id = ? AND empresa_id = ?', [parseId(req), empresaId()]);
    if (!d?.arquivo) throw new HttpError(404, 'Documento sem arquivo.');
    res.json({ arquivo: d.arquivo, nome: d.arquivo_nome });
}, 'Erro ao abrir arquivo'));

documentosRouter.delete('/:id', handler(async (req, res, conn) => {
    const r = await conn.query('DELETE FROM documentos WHERE id = ? AND empresa_id = ?', [parseId(req), empresaId()]);
    if (!r.affectedRows) throw new HttpError(404, 'Documento não encontrado.');
    res.json({ success: true });
}, 'Erro ao excluir documento'));

// ---------- monitores ----------
function lerMonitor(b) {
    const nome = str(b.nome, 150);
    if (!nome) throw new HttpError(400, 'Informe o nome.');
    return { nome, telefone: str(b.telefone, 20), cpf: str(b.cpf, 14), status: b.status === 'Inativo' ? 'Inativo' : 'Ativo', observacoes: str(b.observacoes) };
}

monitoresRouter.get('/', handler(async (req, res, conn) => {
    const rows = await conn.query(`
        SELECT m.*, (SELECT GROUP_CONCAT(r.nome ORDER BY r.nome SEPARATOR ', ') FROM rotas r WHERE r.monitor_id = m.id AND r.status = 'Ativa' AND r.empresa_id = m.empresa_id) AS rotas_nomes,
               (SELECT u.email FROM usuarios u WHERE u.monitor_id = m.id AND u.role = 'monitor' AND u.empresa_id = m.empresa_id LIMIT 1) AS app_email
        FROM monitores m WHERE m.empresa_id = ? ORDER BY m.status, m.nome`, [empresaId()]);
    res.json(rows.map(limparLinha));
}, 'Erro ao listar monitores'));

monitoresRouter.post('/', handler(async (req, res, conn) => {
    const m = lerMonitor(req.body || {});
    const r = await conn.query('INSERT INTO monitores (empresa_id, nome, telefone, cpf, status, observacoes) VALUES (?, ?, ?, ?, ?, ?)', [empresaId(), m.nome, m.telefone, m.cpf, m.status, m.observacoes]);
    res.status(201).json({ id: Number(r.insertId) });
}, 'Erro ao cadastrar monitor'));

monitoresRouter.put('/:id', handler(async (req, res, conn) => {
    const m = lerMonitor(req.body || {});
    const id = await daEmpresa(conn, 'monitores', parseId(req), { nome: 'Monitor' });
    await conn.query('UPDATE monitores SET nome = ?, telefone = ?, cpf = ?, status = ?, observacoes = ? WHERE id = ? AND empresa_id = ?', [m.nome, m.telefone, m.cpf, m.status, m.observacoes, id, empresaId()]);
    await conn.query(`UPDATE usuarios SET nome = ? WHERE monitor_id = ? AND role = 'monitor' AND empresa_id = ?`, [m.nome, id, empresaId()]);
    res.json({ success: true });
}, 'Erro ao salvar monitor'));

monitoresRouter.delete('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'monitores', parseId(req), { nome: 'Monitor' });
    await conn.query('UPDATE rotas SET monitor_id = NULL WHERE monitor_id = ? AND empresa_id = ?', [id, empresaId()]);
    await conn.query(`DELETE FROM documentos WHERE entidade = 'monitor' AND entidade_id = ? AND empresa_id = ?`, [id, empresaId()]);
    await conn.query(`DELETE FROM usuarios WHERE monitor_id = ? AND role = 'monitor' AND empresa_id = ?`, [id, empresaId()]);
    await conn.query('DELETE FROM monitores WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    res.json({ success: true });
}, 'Erro ao excluir monitor'));
