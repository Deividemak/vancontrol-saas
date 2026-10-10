// Motoristas e responsáveis (antes ficavam no index.js)
import { Router } from 'express';
import { handler, HttpError, parseId, str, data } from '../lib/http.js';
import { empresaId, daEmpresa } from '../lib/tenant.js';

export const motoristasRouter = Router();
export const responsaveisRouter = Router();

const duplicado = (err) => err.code === 'ER_DUP_ENTRY' || err.errno === 1062;

// ---------- Motoristas ----------
motoristasRouter.get('/', handler(async (req, res, conn) => {
    res.json(await conn.query('SELECT * FROM motoristas WHERE empresa_id = ? ORDER BY nome ASC', [empresaId()]));
}, 'Erro ao buscar motoristas'));

function dadosMotorista(b) {
    const nome = str(b.nome, 255), cnh = str(b.cnh, 20);
    if (!nome) throw new HttpError(400, 'Informe o nome do motorista.');
    if (!cnh) throw new HttpError(400, 'Informe a CNH.');
    const venc = data(b.vencimento_cnh);
    if (!venc) throw new HttpError(400, 'Informe o vencimento da CNH.');
    return { nome, telefone: str(b.telefone, 20), cnh, vencimento_cnh: venc, categoria: str(b.categoria, 10), status: str(b.status, 20) || 'Ativo' };
}

motoristasRouter.post('/', handler(async (req, res, conn) => {
    const d = dadosMotorista(req.body || {});
    try {
        const r = await conn.query(
            'INSERT INTO motoristas (empresa_id, nome, telefone, cnh, vencimento_cnh, categoria, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [empresaId(), d.nome, d.telefone, d.cnh, d.vencimento_cnh, d.categoria, d.status]);
        res.status(201).json({ id: Number(r.insertId), ...d });
    } catch (err) {
        if (duplicado(err)) throw new HttpError(400, 'Esta CNH já está cadastrada para outro motorista.');
        throw err;
    }
}, 'Erro ao criar motorista'));

motoristasRouter.put('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'motoristas', parseId(req), { nome: 'Motorista' });
    const d = dadosMotorista(req.body || {});
    try {
        await conn.query('UPDATE motoristas SET nome=?, telefone=?, cnh=?, vencimento_cnh=?, categoria=?, status=? WHERE id=? AND empresa_id=?',
            [d.nome, d.telefone, d.cnh, d.vencimento_cnh, d.categoria, d.status, id, empresaId()]);
    } catch (err) {
        if (duplicado(err)) throw new HttpError(400, 'Esta CNH já está cadastrada para outro motorista.');
        throw err;
    }
    // o nome do acesso ao app acompanha o cadastro
    await conn.query(`UPDATE usuarios SET nome = ? WHERE motorista_id = ? AND role = 'motorista' AND empresa_id = ?`, [d.nome, id, empresaId()]);
    res.json({ message: 'Motorista atualizado com sucesso' });
}, 'Erro ao atualizar motorista'));

motoristasRouter.delete('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'motoristas', parseId(req), { nome: 'Motorista' });
    const rotas = await conn.query('SELECT id FROM rotas WHERE motorista_id = ? AND empresa_id = ?', [id, empresaId()]);
    if (rotas.length) throw new HttpError(400, 'Não é possível excluir um motorista vinculado a uma rota.');
    await conn.query(`DELETE FROM usuarios WHERE motorista_id = ? AND role = 'motorista' AND empresa_id = ?`, [id, empresaId()]);
    await conn.query('DELETE FROM motoristas WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    res.json({ message: 'Motorista excluído com sucesso' });
}, 'Erro ao excluir motorista'));

// ---------- Responsáveis ----------
responsaveisRouter.get('/', handler(async (req, res, conn) => {
    const rows = await conn.query(`
        SELECT r.id, r.nome, r.cpf, r.telefone, r.email, r.endereco_residencial, r.status, r.whatsapp_ativo,
               DATE_FORMAT(r.portal_ultimo_acesso, '%Y-%m-%dT%H:%i:%s') AS portal_ultimo_acesso,
               r.consentimento_versao, DATE_FORMAT(r.consentimento_em, '%Y-%m-%dT%H:%i:%s') AS consentimento_em,
               COUNT(a.id) AS total_alunos, GROUP_CONCAT(a.nome SEPARATOR ', ') AS alunos_nomes
        FROM responsaveis r
        LEFT JOIN alunos a ON r.id = a.responsavel_id AND a.empresa_id = r.empresa_id AND a.anonimizado_em IS NULL
        WHERE r.empresa_id = ? AND r.anonimizado_em IS NULL
        GROUP BY r.id ORDER BY r.nome ASC`, [empresaId()]);
    res.json(rows.map(row => ({ ...row, whatsapp_ativo: row.whatsapp_ativo === undefined ? true : !!row.whatsapp_ativo, total_alunos: Number(row.total_alunos) })));
}, 'Erro ao buscar responsáveis'));

function dadosResponsavel(b) {
    const nome = str(b.nome, 255), telefone = str(b.telefone, 20);
    if (!nome) throw new HttpError(400, 'Informe o nome do responsável.');
    if (!telefone) throw new HttpError(400, 'Informe o telefone do responsável.');
    return { nome, telefone, cpf: str(b.cpf, 20), email: str(b.email, 255), endereco_residencial: str(b.endereco_residencial, 500), status: str(b.status, 20) || 'Ativo' };
}

responsaveisRouter.post('/', handler(async (req, res, conn) => {
    const d = dadosResponsavel(req.body || {});
    try {
        const r = await conn.query(
            'INSERT INTO responsaveis (empresa_id, nome, cpf, email, telefone, endereco_residencial, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [empresaId(), d.nome, d.cpf, d.email, d.telefone, d.endereco_residencial, 'Ativo']);
        res.status(201).json({ id: Number(r.insertId), ...d, status: 'Ativo' });
    } catch (err) {
        if (duplicado(err)) throw new HttpError(400, 'Este CPF já está cadastrado.');
        throw err;
    }
}, 'Erro ao criar responsável'));

responsaveisRouter.put('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'responsaveis', parseId(req), { nome: 'Responsável' });
    const d = dadosResponsavel(req.body || {});
    try {
        await conn.query('UPDATE responsaveis SET nome=?, cpf=?, email=?, telefone=?, endereco_residencial=?, status=? WHERE id=? AND empresa_id=?',
            [d.nome, d.cpf, d.email, d.telefone, d.endereco_residencial, d.status, id, empresaId()]);
    } catch (err) {
        if (duplicado(err)) throw new HttpError(400, 'Este CPF já está cadastrado em outro responsável.');
        throw err;
    }
    res.json({ message: 'Responsável atualizado com sucesso' });
}, 'Erro ao atualizar responsável'));

responsaveisRouter.delete('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'responsaveis', parseId(req), { nome: 'Responsável' });
    const filhos = await conn.query('SELECT id FROM alunos WHERE responsavel_id = ? AND empresa_id = ?', [id, empresaId()]);
    if (filhos.length) throw new HttpError(400, 'Não é possível excluir um responsável que possui alunos vinculados.');
    await conn.query('DELETE FROM responsaveis WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    res.json({ message: 'Responsável excluído com sucesso' });
}, 'Erro ao excluir responsável'));
