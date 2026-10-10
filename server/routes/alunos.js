import { Router } from 'express';
import { handler, HttpError, transacao, parseId, toId, str, data, coord, limparLinha } from '../lib/http.js';
import { formatarEndereco } from '../services/geocoding.js';
import { hojeBR } from '../services/viagens.js';
import { vencimentoNoMes } from '../services/financeiro.js';
import { empresaId, daEmpresa, refDaEmpresa } from '../lib/tenant.js';
import { registrarAcesso } from '../services/lgpd.js';

const router = Router();

const TURNOS = ['Manhã', 'Tarde', 'Integral', 'Noite'];
const GEO_STATUS = ['pendente', 'automatico', 'manual', 'falhou'];
const MAX_FOTO = 400 * 1024;      // data URL da foto (já redimensionada no navegador)
const MAX_THUMB = 20 * 1024;

const CAMPOS_LISTA = `
    a.id, a.nome, a.responsavel_telefone, a.valor_mensalidade, a.dia_vencimento,
    a.escola_id, a.responsavel_id, a.turno, a.status,
    DATE_FORMAT(a.data_nascimento, '%Y-%m-%d') AS data_nascimento,
    DATE_FORMAT(a.inicio_contrato, '%Y-%m-%d') AS inicio_contrato, a.suspenso, a.suspensao_motivo,
    a.cep, a.logradouro, a.numero, a.complemento, a.bairro, a.cidade, a.uf,
    a.lat, a.lng, a.geo_status, a.geo_precisao, a.foto_thumb,
    (a.alergias IS NOT NULL AND a.alergias <> '') AS tem_alergia,
    (a.necessidades_especiais IS NOT NULL AND a.necessidades_especiais <> '') AS tem_necessidade,
    e.nome AS escola_nome, r.nome AS responsavel_nome,
    (SELECT GROUP_CONCAT(ro.nome ORDER BY ro.nome SEPARATOR ', ') FROM rota_alunos ra JOIN rotas ro ON ro.id = ra.rota_id WHERE ra.aluno_id = a.id) AS rotas_nomes
`;

function normalizar(row) {
    const r = limparLinha(row);
    r.lat = r.lat === null ? null : Number(r.lat);
    r.lng = r.lng === null ? null : Number(r.lng);
    r.tem_alergia = !!r.tem_alergia;
    r.tem_necessidade = !!r.tem_necessidade;
    r.suspenso = !!r.suspenso;
    r.endereco = formatarEndereco(r) || null;
    return r;
}

function validarFoto(v, max) {
    if (v === undefined) return undefined;          // não mexer
    if (v === null || v === '') return null;        // remover
    if (typeof v !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(v)) throw new HttpError(400, 'Formato de foto inválido.');
    if (v.length > max) throw new HttpError(400, 'Foto muito grande.');
    return v;
}

function ler(body) {
    const nome = str(body.nome, 150);
    if (!nome) throw new HttpError(400, 'Informe o nome do aluno.');
    const valor = Number(body.valor_mensalidade);
    if (!Number.isFinite(valor) || valor < 0) throw new HttpError(400, 'Valor da mensalidade inválido.');
    const turno = TURNOS.includes(body.turno) ? body.turno : 'Manhã';
    const lat = coord(body.lat, 'lat'), lng = coord(body.lng, 'lng');
    let geo_status = GEO_STATUS.includes(body.geo_status) ? body.geo_status : 'pendente';
    if (lat === null || lng === null) geo_status = geo_status === 'falhou' ? 'falhou' : 'pendente';

    const contatos = (Array.isArray(body.contatos_emergencia) ? body.contatos_emergencia : [])
        .map(c => ({ nome: str(c.nome, 150), parentesco: str(c.parentesco, 60), telefone: str(c.telefone, 20) }))
        .filter(c => c.nome || c.telefone);
    for (const c of contatos) if (!c.nome || !c.telefone) throw new HttpError(400, 'Cada contato de emergência precisa de nome e telefone.');
    if (contatos.length > 5) throw new HttpError(400, 'Máximo de 5 contatos de emergência.');

    return {
        nome,
        responsavel_telefone: str(body.responsavel_telefone, 20),
        valor_mensalidade: valor,
        dia_vencimento: Math.min(31, Math.max(1, Number(body.dia_vencimento) || 10)),
        escola_id: toId(body.escola_id),
        responsavel_id: toId(body.responsavel_id),
        turno,
        status: body.status === 'Inativo' ? 'Inativo' : 'Ativo',
        data_nascimento: data(body.data_nascimento),
        inicio_contrato: data(body.inicio_contrato),
        cep: str(body.cep, 9), logradouro: str(body.logradouro), numero: str(body.numero, 20),
        complemento: str(body.complemento, 100), bairro: str(body.bairro, 100), cidade: str(body.cidade, 100),
        uf: str(body.uf, 2)?.toUpperCase() ?? null,
        lat: geo_status === 'pendente' || geo_status === 'falhou' ? null : lat,
        lng: geo_status === 'pendente' || geo_status === 'falhou' ? null : lng,
        geo_status,
        geo_precisao: str(body.geo_precisao, 20),
        alergias: str(body.alergias, 2000),
        condicoes_medicas: str(body.condicoes_medicas, 2000),
        medicamentos: str(body.medicamentos, 2000),
        necessidades_especiais: str(body.necessidades_especiais, 2000),
        tipo_sanguineo: str(body.tipo_sanguineo, 5),
        observacoes: str(body.observacoes, 2000),
        foto: validarFoto(body.foto, MAX_FOTO),
        foto_thumb: validarFoto(body.foto_thumb, MAX_THUMB),
        contatos,
    };
}

const COLUNAS = ['nome', 'responsavel_telefone', 'valor_mensalidade', 'dia_vencimento', 'escola_id', 'responsavel_id', 'turno', 'status',
    'data_nascimento', 'inicio_contrato', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'lat', 'lng', 'geo_status', 'geo_precisao',
    'alergias', 'condicoes_medicas', 'medicamentos', 'necessidades_especiais', 'tipo_sanguineo', 'observacoes'];

async function salvarContatos(conn, alunoId, contatos) {
    await conn.query('DELETE FROM aluno_contatos_emergencia WHERE aluno_id = ?', [alunoId]);
    for (let i = 0; i < contatos.length; i++) {
        const c = contatos[i];
        await conn.query('INSERT INTO aluno_contatos_emergencia (aluno_id, nome, parentesco, telefone, ordem) VALUES (?, ?, ?, ?, ?)',
            [alunoId, c.nome, c.parentesco, c.telefone, i]);
    }
}

router.get('/', handler(async (req, res, conn) => {
    const rows = await conn.query(`
        SELECT ${CAMPOS_LISTA}
        FROM alunos a
        LEFT JOIN escolas e ON a.escola_id = e.id AND e.empresa_id = a.empresa_id
        LEFT JOIN responsaveis r ON a.responsavel_id = r.id AND r.empresa_id = a.empresa_id
        WHERE a.empresa_id = ? AND a.anonimizado_em IS NULL
        ORDER BY a.nome ASC
    `, [empresaId()]);
    res.json(rows.map(normalizar));
}, 'Erro ao buscar alunos'));

router.get('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'alunos', parseId(req), { nome: 'Aluno' });
    const [row] = await conn.query(`
        SELECT ${CAMPOS_LISTA}, a.alergias, a.condicoes_medicas, a.medicamentos, a.necessidades_especiais,
               a.tipo_sanguineo, a.observacoes, a.foto
        FROM alunos a
        LEFT JOIN escolas e ON a.escola_id = e.id AND e.empresa_id = a.empresa_id
        LEFT JOIN responsaveis r ON a.responsavel_id = r.id AND r.empresa_id = a.empresa_id
        WHERE a.id = ? AND a.empresa_id = ? AND a.anonimizado_em IS NULL`, [id, empresaId()]);
    if (!row) throw new HttpError(404, 'Aluno não encontrado.');
    // LGPD: a ficha tem dados de saúde da criança — fica registrado quem abriu
    await registrarAcesso(conn, { acao: 'viu_ficha', alunoId: id, ip: req.ip });
    const contatos = await conn.query('SELECT nome, parentesco, telefone FROM aluno_contatos_emergencia WHERE aluno_id = ? ORDER BY ordem', [id]);
    res.json({ ...normalizar(row), contatos_emergencia: contatos });
}, 'Erro ao buscar aluno'));

/** Escola e responsável precisam ser da mesma empresa. */
async function conferirRefs(conn, d) {
    await refDaEmpresa(conn, 'escolas', d.escola_id, 'Escola');
    await refDaEmpresa(conn, 'responsaveis', d.responsavel_id, 'Responsável');
}

router.post('/', handler(async (req, res, conn) => {
    const d = ler(req.body);
    await conferirRefs(conn, d);
    const id = await transacao(conn, async () => {
        const cols = [...COLUNAS, 'foto', 'foto_thumb'];
        const r = await conn.query(
            `INSERT INTO alunos (empresa_id, inativado_em, ${cols.join(', ')}) VALUES (?, ${d.status === 'Ativo' ? 'NULL' : 'NOW()'}, ${cols.map(() => '?').join(', ')})`,
            [empresaId(), ...cols.map(c => d[c] === undefined ? null : d[c])]);
        const novoId = Number(r.insertId);
        await salvarContatos(conn, novoId, d.contatos);
        return novoId;
    });
    res.status(201).json({ id });
}, 'Erro ao criar aluno'));

router.put('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'alunos', parseId(req), { nome: 'Aluno' });
    const d = ler(req.body);
    await conferirRefs(conn, d);
    await transacao(conn, async () => {
        const cols = [...COLUNAS];
        if (d.foto !== undefined) cols.push('foto');
        if (d.foto_thumb !== undefined) cols.push('foto_thumb');
        // LGPD: a contagem do prazo de retenção começa quando o aluno fica inativo
        const r = await conn.query(
            `UPDATE alunos SET ${cols.map(c => `${c} = ?`).join(', ')},
                inativado_em = ${d.status === 'Ativo' ? 'NULL' : 'COALESCE(inativado_em, NOW())'}
             WHERE id = ? AND empresa_id = ?`, [...cols.map(c => d[c]), id, empresaId()]);
        if (r.affectedRows === 0) throw new HttpError(404, 'Aluno não encontrado.');
        await salvarContatos(conn, id, d.contatos);

        // Se mudou o dia de vencimento, ajusta a mensalidade em aberto do mês atual (sem cobrança já emitida no gateway)
        const anoMes = hojeBR().slice(0, 7);
        await conn.query(`
            UPDATE mensalidades SET data_vencimento = ?
            WHERE aluno_id = ? AND empresa_id = ? AND status IN ('Pendente', 'Atrasado') AND gateway_id IS NULL AND DATE_FORMAT(data_vencimento, '%Y-%m') = ?`,
            [vencimentoNoMes(anoMes, d.dia_vencimento), id, empresaId(), anoMes]);
    });
    res.json({ message: 'Aluno atualizado com sucesso' });
}, 'Erro ao atualizar aluno'));

router.delete('/:id', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'alunos', parseId(req), { nome: 'Aluno' });
    const check = await conn.query('SELECT id FROM mensalidades WHERE aluno_id = ? LIMIT 1', [id]);
    if (check.length > 0) throw new HttpError(400, 'Não é possível excluir aluno com mensalidades registradas. Marque-o como Inativo.');
    await transacao(conn, async () => {
        await conn.query('DELETE FROM rota_alunos WHERE aluno_id = ?', [id]);
        await conn.query('DELETE FROM alunos WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    });
    res.json({ message: 'Aluno excluído com sucesso' });
}, 'Erro ao excluir aluno'));

// Família do aluno (só leitura): responsável ligado e irmãos com o mesmo responsável
router.get('/:id/familia', handler(async (req, res, conn) => {
    const id = await daEmpresa(conn, 'alunos', parseId(req), { nome: 'Aluno' });
    const emp = empresaId();
    const [a] = await conn.query('SELECT responsavel_id, responsavel_telefone FROM alunos WHERE id = ? AND empresa_id = ?', [id, emp]);
    const responsaveis = a.responsavel_id ? await conn.query(`
        SELECT id, nome, telefone, email, status, whatsapp_ativo, DATE_FORMAT(portal_ultimo_acesso, '%Y-%m-%dT%H:%i:%s') AS portal_ultimo_acesso
        FROM responsaveis WHERE id = ? AND empresa_id = ? AND anonimizado_em IS NULL`, [a.responsavel_id, emp]) : [];
    const irmaos = a.responsavel_id ? await conn.query(`
        SELECT id, nome, status FROM alunos
        WHERE empresa_id = ? AND responsavel_id = ? AND id <> ? AND anonimizado_em IS NULL ORDER BY nome`, [emp, a.responsavel_id, id]) : [];
    res.json({
        // o responsável ligado ao aluno é o principal: recebe os avisos e as cobranças
        responsaveis: responsaveis.map(r => ({ ...r, principal: true, whatsapp_ativo: r.whatsapp_ativo === null || r.whatsapp_ativo === undefined ? true : !!r.whatsapp_ativo })),
        telefone_avulso: a.responsavel_id ? null : (a.responsavel_telefone || null),
        irmaos,
    });
}, 'Erro ao buscar a família do aluno'));

// Autorizados a buscar/receber o aluno
router.get('/:id/autorizados', handler(async (req, res, conn) => {
    const rows = await conn.query(`
        SELECT id, nome, parentesco, telefone, documento, observacao, origem, DATE_FORMAT(valido_ate,'%Y-%m-%d') AS valido_ate
        FROM autorizados_retirada WHERE aluno_id = ? AND ativo = true ORDER BY nome`, [await daEmpresa(conn, 'alunos', parseId(req), { nome: 'Aluno' })]);
    res.json(rows);
}, 'Erro ao buscar autorizados'));

router.post('/:id/autorizados', handler(async (req, res, conn) => {
    const nome = str(req.body.nome, 150);
    if (!nome) throw new HttpError(400, 'Informe o nome.');
    const r = await conn.query(`INSERT INTO autorizados_retirada (aluno_id, nome, parentesco, telefone, documento, valido_ate, observacao, origem) VALUES (?, ?, ?, ?, ?, ?, ?, 'painel')`,
        [await daEmpresa(conn, 'alunos', parseId(req), { nome: 'Aluno' }), nome, str(req.body.parentesco, 60), str(req.body.telefone, 20), str(req.body.documento, 30), data(req.body.valido_ate), str(req.body.observacao)]);
    res.status(201).json({ id: Number(r.insertId) });
}, 'Erro ao salvar autorizado'));

router.delete('/:id/autorizados/:autId', handler(async (req, res, conn) => {
    const alunoId = await daEmpresa(conn, 'alunos', parseId(req), { nome: 'Aluno' });
    await conn.query('UPDATE autorizados_retirada SET ativo = false WHERE id = ? AND aluno_id = ?', [parseId(req, 'autId'), alunoId]);
    res.json({ success: true });
}, 'Erro ao remover autorizado'));

export default router;
