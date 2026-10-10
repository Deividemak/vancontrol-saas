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

export function dadosResponsavel(b) {
    const nome = str(b.nome, 255), telefone = str(b.telefone, 20);
    if (!nome) throw new HttpError(400, 'Informe o nome do responsável.');
    if (!telefone) throw new HttpError(400, 'Informe o telefone do responsável.');
    return { nome, telefone, cpf: str(b.cpf, 20), email: str(b.email, 255), endereco_residencial: str(b.endereco_residencial, 500), status: str(b.status, 20) || 'Ativo' };
}

const soDigitos = (v) => String(v || '').replace(/\D/g, '');
// telefone sem o 55 do Brasil, para comparar "(61) 99999-0000" com "5561999990000"
const telefoneBase = (v) => { const d = soDigitos(v); return d.length >= 12 && d.startsWith('55') ? d.slice(2) : d; };

/**
 * Cria o responsável (usado pelo cadastro do aluno com "responsável novo").
 * Recusa telefone ou CPF que já são de outro responsável da empresa, para não duplicar a família.
 */
export async function inserirResponsavel(conn, d) {
    const existentes = await conn.query('SELECT id, nome, telefone, cpf FROM responsaveis WHERE empresa_id = ? AND anonimizado_em IS NULL', [empresaId()]);
    const tel = telefoneBase(d.telefone), cpf = soDigitos(d.cpf);
    const mesmoTel = tel.length >= 10 && existentes.find(r => telefoneBase(r.telefone) === tel);
    if (mesmoTel) throw new HttpError(409, `Esse telefone já é de ${mesmoTel.nome}. Escolha esse responsável em vez de cadastrar outro.`);
    const mesmoCpf = cpf.length === 11 && existentes.find(r => soDigitos(r.cpf) === cpf);
    if (mesmoCpf) throw new HttpError(409, `Esse CPF já é de ${mesmoCpf.nome}. Escolha esse responsável em vez de cadastrar outro.`);
    try {
        const r = await conn.query(
            'INSERT INTO responsaveis (empresa_id, nome, cpf, email, telefone, endereco_residencial, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [empresaId(), d.nome, d.cpf, d.email, d.telefone, d.endereco_residencial, 'Ativo']);
        return Number(r.insertId);
    } catch (err) {
        if (duplicado(err)) throw new HttpError(400, 'Este CPF já está cadastrado.');
        throw err;
    }
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

// Família do responsável (só leitura): filhos com escola, rota e mensalidade.
// Valores só para quem vê o financeiro (dono e financeiro).
responsaveisRouter.get('/:id/familia', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'responsaveis', parseId(req), { nome: 'Responsável' });
    const emp = empresaId();
    const veValores = ['dono', 'financeiro'].includes(req.user?.papel);
    const alunos = await conn.query(`
        SELECT a.id, a.nome, a.turno, a.status, a.suspenso, a.valor_mensalidade, a.dia_vencimento, e.nome AS escola_nome
        FROM alunos a LEFT JOIN escolas e ON e.id = a.escola_id AND e.empresa_id = a.empresa_id
        WHERE a.empresa_id = ? AND a.responsavel_id = ? AND a.anonimizado_em IS NULL ORDER BY a.nome`, [emp, id]);
    const ids = alunos.map(a => a.id);
    const rotas = ids.length ? await conn.query(`
        SELECT ra.aluno_id, r.nome, r.tipo, TIME_FORMAT(ra.hora_prevista, '%H:%i') AS hora
        FROM rota_alunos ra JOIN rotas r ON r.id = ra.rota_id AND r.empresa_id = ?
        WHERE ra.aluno_id IN (?) AND r.status = 'Ativa' ORDER BY r.hora_saida`, [emp, ids]) : [];
    const abertas = veValores && ids.length ? await conn.query(`
        SELECT aluno_id, COUNT(*) AS qtd, COALESCE(SUM(valor), 0) AS total, SUM(status = 'Atrasado') AS atrasadas
        FROM mensalidades WHERE empresa_id = ? AND aluno_id IN (?) AND status IN ('Pendente', 'Atrasado') GROUP BY aluno_id`, [emp, ids]) : [];

    const lista = alunos.map(a => {
        const ab = abertas.find(x => x.aluno_id === a.id);
        return {
            id: a.id, nome: a.nome, turno: a.turno, status: a.status, suspenso: !!a.suspenso, escola_nome: a.escola_nome,
            rotas: rotas.filter(r => r.aluno_id === a.id).map(r => ({ nome: r.nome, tipo: r.tipo, hora: r.hora })),
            ...(veValores ? {
                mensalidade: Number(a.valor_mensalidade || 0), dia_vencimento: a.dia_vencimento,
                em_aberto: { qtd: Number(ab?.qtd || 0), total: Number(ab?.total || 0), atrasadas: Number(ab?.atrasadas || 0) },
            } : {}),
        };
    });
    const cobrados = lista.filter(a => a.status === 'Ativo' && !a.suspenso);
    res.json({
        alunos: lista,
        ve_valores: veValores,
        total: veValores ? {
            mensalidades: cobrados.reduce((s, a) => s + (a.mensalidade || 0), 0),
            em_aberto: lista.reduce((s, a) => s + (a.em_aberto?.total || 0), 0),
            atrasadas: lista.reduce((s, a) => s + (a.em_aberto?.atrasadas || 0), 0),
        } : null,
    });
}, 'Erro ao buscar a família do responsável'));

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
