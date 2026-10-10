// LGPD: registro de acessos a dados pessoais, exportação, anonimização e política de retenção.
import pool from '../db.js';
import { empresaId, usuarioAtual, comEmpresa } from '../lib/tenant.js';
import { lerConfig } from './config.js';

const ABERTAS = "('Pendente','Atrasado')";

/** Registra quem acessou dados pessoais (nunca derruba a operação). */
export async function registrarAcesso(conn, { acao, alunoId = null, responsavelId = null, detalhe = null, usuario = usuarioAtual(), ip = null }) {
    try {
        await conn.query(
            `INSERT INTO lgpd_acessos (empresa_id, usuario_id, usuario_nome, papel, acao, aluno_id, responsavel_id, detalhe, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [empresaId(), usuario?.id || null, usuario?.nome?.slice(0, 150) || null, usuario?.papel || null, acao,
                alunoId, responsavelId, detalhe ? String(detalhe).slice(0, 255) : null, ip ? String(ip).slice(0, 60) : null]);
    } catch (err) {
        console.error('[lgpd] falha ao registrar acesso:', err.message);
    }
}

/** Texto do termo com os dados da empresa e da política de retenção. */
export async function termoAtual(conn) {
    const cfg = await lerConfig(conn, 'lgpd');
    const emp = await lerConfig(conn, 'empresa');
    const texto = String(cfg.termo_texto || '')
        .replaceAll('{{empresa}}', emp.razao_social || emp.nome_fantasia)
        .replaceAll('{{retencao_meses}}', String(cfg.retencao_meses_inativos))
        .replaceAll('{{retencao_gps}}', String(cfg.retencao_dias_gps));
    return { versao: Number(cfg.termo_versao) || 1, texto };
}

/** Tudo o que a empresa guarda sobre um responsável e seus filhos (direito de acesso / portabilidade). */
export async function exportarResponsavel(conn, responsavelId) {
    const emp = empresaId();
    const [r] = await conn.query(
        `SELECT id, nome, cpf, email, telefone, endereco_residencial, status, whatsapp_ativo, consentimento_versao,
                DATE_FORMAT(consentimento_em,'%Y-%m-%dT%H:%i:%s') AS consentimento_em,
                DATE_FORMAT(portal_ultimo_acesso,'%Y-%m-%dT%H:%i:%s') AS portal_ultimo_acesso
         FROM responsaveis WHERE id = ? AND empresa_id = ?`, [responsavelId, emp]);
    if (!r) return null;
    const alunos = await conn.query(
        `SELECT a.id, a.nome, DATE_FORMAT(a.data_nascimento,'%Y-%m-%d') AS data_nascimento, a.turno, a.status, e.nome AS escola,
                a.cep, a.logradouro, a.numero, a.complemento, a.bairro, a.cidade, a.uf, a.lat, a.lng,
                a.alergias, a.condicoes_medicas, a.medicamentos, a.necessidades_especiais, a.tipo_sanguineo, a.observacoes,
                a.valor_mensalidade, a.dia_vencimento
         FROM alunos a LEFT JOIN escolas e ON e.id = a.escola_id WHERE a.responsavel_id = ? AND a.empresa_id = ?`, [responsavelId, emp]);
    const ids = [0, ...alunos.map(a => a.id)];
    const contatos = await conn.query('SELECT aluno_id, nome, parentesco, telefone FROM aluno_contatos_emergencia WHERE aluno_id IN (?)', [ids]);
    const autorizados = await conn.query('SELECT aluno_id, nome, parentesco, telefone, documento, origem, ativo FROM autorizados_retirada WHERE aluno_id IN (?)', [ids]);
    const num = (v) => (v === null || v === undefined ? v : Number(v));
    return {
        gerado_em: new Date().toISOString(),
        empresa: (await lerConfig(conn, 'empresa')).razao_social,
        responsavel: { ...r, whatsapp_ativo: !!r.whatsapp_ativo },
        alunos: alunos.map(a => ({
            ...a, lat: num(a.lat), lng: num(a.lng), valor_mensalidade: num(a.valor_mensalidade),
            contatos_emergencia: contatos.filter(c => c.aluno_id === a.id).map(({ aluno_id, ...c }) => c),
            autorizados_retirada: autorizados.filter(c => c.aluno_id === a.id).map(({ aluno_id, ...c }) => ({ ...c, ativo: !!c.ativo })),
        })),
        mensalidades: (await conn.query(
            `SELECT m.id, a.nome AS aluno, m.valor, DATE_FORMAT(m.data_vencimento,'%Y-%m-%d') AS vencimento, m.status, m.valor_pago,
                    DATE_FORMAT(m.data_pagamento,'%Y-%m-%d') AS pago_em, m.forma_pagamento
             FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id WHERE m.aluno_id IN (?) AND m.empresa_id = ? ORDER BY m.data_vencimento`, [ids, emp]))
            .map(m => ({ ...m, valor: num(m.valor), valor_pago: num(m.valor_pago) })),
        contratos: await conn.query(
            `SELECT id, aluno_id, status, valor, DATE_FORMAT(vigencia_inicio,'%Y-%m-%d') AS vigencia_inicio, DATE_FORMAT(vigencia_fim,'%Y-%m-%d') AS vigencia_fim,
                    DATE_FORMAT(assinado_em,'%Y-%m-%dT%H:%i:%s') AS assinado_em, assinatura_nome, hash_sha256
             FROM contratos WHERE (responsavel_id = ? OR aluno_id IN (?)) AND empresa_id = ?`, [responsavelId, ids, emp]),
        ausencias: await conn.query(
            `SELECT aluno_id, DATE_FORMAT(data_inicio,'%Y-%m-%d') AS data_inicio, DATE_FORMAT(data_fim,'%Y-%m-%d') AS data_fim, sentido, motivo, origem
             FROM ausencias WHERE aluno_id IN (?) AND empresa_id = ? ORDER BY data_inicio`, [ids, emp]),
        mensagens: await conn.query(
            `SELECT direcao, canal, texto, DATE_FORMAT(criado_em,'%Y-%m-%dT%H:%i:%s') AS criado_em
             FROM mensagens WHERE responsavel_id = ? AND empresa_id = ? ORDER BY id`, [responsavelId, emp]),
        consentimentos: await conn.query(
            `SELECT versao, DATE_FORMAT(criado_em,'%Y-%m-%dT%H:%i:%s') AS aceito_em, ip FROM lgpd_consentimentos WHERE responsavel_id = ? AND empresa_id = ? ORDER BY id`,
            [responsavelId, emp]),
    };
}

async function temDebito(conn, alunoIds) {
    if (!alunoIds.length) return false;
    const [r] = await conn.query(`SELECT COUNT(*) n FROM mensalidades WHERE aluno_id IN (?) AND empresa_id = ? AND status IN ${ABERTAS}`, [alunoIds, empresaId()]);
    return Number(r.n) > 0;
}

/**
 * Anonimiza um aluno: apaga nome, endereço, saúde, foto, contatos e autorizados.
 * Mensalidades e contratos assinados ficam (obrigação legal/fiscal), sem os dados da criança no cadastro.
 */
export async function anonimizarAluno(conn, alunoId, { forcar = false } = {}) {
    const emp = empresaId();
    if (!forcar && (await temDebito(conn, [alunoId]))) return { ok: false, motivo: 'Há mensalidades em aberto para este aluno.' };
    await conn.query(
        `UPDATE alunos SET nome = CONCAT('Aluno anonimizado #', id), data_nascimento = NULL, responsavel_telefone = NULL,
            cep = NULL, logradouro = NULL, numero = NULL, complemento = NULL, bairro = NULL, lat = NULL, lng = NULL, geo_status = 'pendente',
            alergias = NULL, condicoes_medicas = NULL, medicamentos = NULL, necessidades_especiais = NULL, tipo_sanguineo = NULL,
            observacoes = NULL, foto = NULL, foto_thumb = NULL, avatar_url = NULL, status = 'Inativo',
            inativado_em = COALESCE(inativado_em, NOW()), anonimizado_em = NOW()
         WHERE id = ? AND empresa_id = ?`, [alunoId, emp]);
    await conn.query('DELETE FROM aluno_contatos_emergencia WHERE aluno_id = ?', [alunoId]);
    await conn.query('DELETE FROM autorizados_retirada WHERE aluno_id = ?', [alunoId]);
    await conn.query('DELETE FROM rota_alunos WHERE aluno_id = ?', [alunoId]);
    await conn.query('UPDATE ausencias SET motivo = NULL WHERE aluno_id = ? AND empresa_id = ?', [alunoId, emp]);
    await registrarAcesso(conn, { acao: 'anonimizou_aluno', alunoId });
    return { ok: true };
}

/** Anonimiza o responsável (e os filhos dele). Só sem débitos em aberto. */
export async function anonimizarResponsavel(conn, responsavelId, { forcar = false } = {}) {
    const emp = empresaId();
    const alunos = (await conn.query('SELECT id, anonimizado_em FROM alunos WHERE responsavel_id = ? AND empresa_id = ?', [responsavelId, emp]));
    if (!forcar && (await temDebito(conn, alunos.map(a => a.id)))) return { ok: false, motivo: 'Há mensalidades em aberto.' };
    for (const a of alunos) if (!a.anonimizado_em) await anonimizarAluno(conn, a.id, { forcar: true });
    await conn.query(
        `UPDATE responsaveis SET nome = CONCAT('Responsável anonimizado #', id), cpf = NULL, email = NULL, telefone = '',
            endereco_residencial = NULL, cpf_assinatura = NULL, whatsapp_ativo = 0, status = 'Inativo',
            portal_versao = portal_versao + 1, anonimizado_em = NOW()
         WHERE id = ? AND empresa_id = ?`, [responsavelId, emp]);
    await conn.query('DELETE FROM mensagens WHERE responsavel_id = ? AND empresa_id = ?', [responsavelId, emp]);
    await conn.query(`UPDATE notificacoes SET telefone = '', mensagem = NULL, dados = NULL, alunos = NULL WHERE responsavel_id = ? AND empresa_id = ?`, [responsavelId, emp]);
    await registrarAcesso(conn, { acao: 'anonimizou_responsavel', responsavelId });
    return { ok: true };
}

/** Aplica a política de retenção da empresa atual. */
export async function executarRetencao(conn) {
    const emp = empresaId();
    const cfg = await lerConfig(conn, 'lgpd');
    const meses = Number(cfg.retencao_meses_inativos) || 24;
    const out = { alunos: 0, responsaveis: 0, posicoes: 0, acessos: 0 };

    const vencidos = await conn.query(
        `SELECT a.id FROM alunos a
         WHERE a.empresa_id = ? AND a.anonimizado_em IS NULL AND a.status <> 'Ativo'
           AND a.inativado_em IS NOT NULL AND a.inativado_em < NOW() - INTERVAL ? MONTH
           AND NOT EXISTS (SELECT 1 FROM mensalidades m WHERE m.aluno_id = a.id AND m.status IN ${ABERTAS})`, [emp, meses]);
    for (const a of vencidos) if ((await anonimizarAluno(conn, a.id)).ok) out.alunos++;

    // responsáveis sem nenhum filho ativo, todos já anonimizados
    const resps = await conn.query(
        `SELECT r.id FROM responsaveis r
         WHERE r.empresa_id = ? AND r.anonimizado_em IS NULL
           AND EXISTS (SELECT 1 FROM alunos a WHERE a.responsavel_id = r.id)
           AND NOT EXISTS (SELECT 1 FROM alunos a WHERE a.responsavel_id = r.id AND a.anonimizado_em IS NULL)`, [emp]);
    for (const r of resps) if ((await anonimizarResponsavel(conn, r.id)).ok) out.responsaveis++;

    const g = await conn.query(
        `DELETE FROM viagem_posicoes WHERE viagem_id IN (SELECT id FROM viagens WHERE empresa_id = ? AND data < CURDATE() - INTERVAL ? DAY)`,
        [emp, Number(cfg.retencao_dias_gps) || 180]);
    out.posicoes = Number(g.affectedRows || 0);
    const l = await conn.query('DELETE FROM lgpd_acessos WHERE empresa_id = ? AND criado_em < NOW() - INTERVAL ? DAY', [emp, Number(cfg.retencao_dias_acessos) || 730]);
    out.acessos = Number(l.affectedRows || 0);
    return out;
}

/** Retenção automática: uma vez por dia (de madrugada), para cada empresa. */
export function iniciarRetencao() {
    let ultimoDia = null;
    const rodar = async () => {
        const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const dia = agora.toISOString().slice(0, 10);
        if (agora.getHours() < 3 || ultimoDia === dia) return;
        ultimoDia = dia;
        let conn;
        try {
            conn = await pool.getConnection();
            const empresas = await conn.query('SELECT id FROM empresas WHERE ativo = 1');
            for (const e of empresas) {
                const r = await comEmpresa(e.id, () => executarRetencao(conn));
                if (r.alunos || r.responsaveis || r.posicoes) console.log(`[lgpd] empresa ${e.id}: retenção aplicada`, r);
            }
        } catch (err) {
            console.error('[lgpd] erro na retenção:', err.message);
        } finally {
            if (conn) conn.release();
        }
    };
    setTimeout(rodar, 60 * 1000);
    return setInterval(rodar, 60 * 60 * 1000);
}
