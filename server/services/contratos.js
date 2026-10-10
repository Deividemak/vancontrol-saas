// Contrato digital: gerado do modelo, com hash SHA-256 do texto e aceite registrado (nome, CPF, IP, data).
import crypto from 'crypto';
import { lerConfig } from './config.js';
import { formatarEndereco } from './geocoding.js';
import { hojeBR } from './viagens.js';
import { empresaId } from '../lib/tenant.js';

export const sha256 = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

const UNID = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), resto = n % 100;
    const partes = [];
    if (c) partes.push(CEM[c]);
    if (resto < 20) { if (resto) partes.push(UNID[resto]); }
    else partes.push(DEZ[Math.floor(resto / 10)] + (resto % 10 ? ` e ${UNID[resto % 10]}` : ''));
    return partes.join(' e ');
}

function inteiroExtenso(n) {
    if (n === 0) return 'zero';
    const milhares = Math.floor(n / 1000), resto = n % 1000;
    const partes = [];
    if (milhares) partes.push(milhares === 1 ? 'mil' : `${ate999(milhares)} mil`);
    if (resto) partes.push(ate999(resto));
    // "mil e cem", "dois mil e quinhentos" / "mil duzentos e trinta"
    return partes.length === 2 && (resto < 100 || resto % 100 === 0) ? partes.join(' e ') : partes.join(' ');
}

/** 1234.5 → "mil duzentos e trinta e quatro reais e cinquenta centavos" (até 999.999). */
export function valorPorExtenso(v) {
    const total = Math.round(Number(v || 0) * 100);
    const reais = Math.floor(total / 100), cent = total % 100;
    const partes = [];
    if (reais) partes.push(`${inteiroExtenso(reais)} ${reais === 1 ? 'real' : 'reais'}`);
    if (cent) partes.push(`${inteiroExtenso(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`);
    return partes.join(' e ') || 'zero reais';
}

export function cpfValido(cpf) {
    const d = String(cpf || '').replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (const t of [9, 10]) {
        let s = 0;
        for (let i = 0; i < t; i++) s += Number(d[i]) * (t + 1 - i);
        if (((s * 10) % 11) % 10 !== Number(d[t])) return false;
    }
    return true;
}

const DMY = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const BRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function somarMeses(iso, meses) {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + Number(meses));
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

/** Monta o texto do contrato de um aluno a partir do modelo configurado. */
export async function montarContrato(conn, alunoId) {
    const [a] = await conn.query(`
        SELECT a.*, DATE_FORMAT(a.inicio_contrato,'%Y-%m-%d') AS inicio, e.nome AS escola_nome,
               r.id AS resp_id, r.nome AS resp_nome, r.cpf AS resp_cpf, r.telefone AS resp_tel
        FROM alunos a LEFT JOIN escolas e ON e.id = a.escola_id LEFT JOIN responsaveis r ON r.id = a.responsavel_id
        WHERE a.id = ? AND a.empresa_id = ? AND a.anonimizado_em IS NULL`, [alunoId, empresaId()]);
    if (!a) return null;
    const emp = await lerConfig(conn, 'empresa');
    const cob = await lerConfig(conn, 'cobranca');
    const ctr = await lerConfig(conn, 'contrato');
    const hoje = hojeBR();
    const inicio = a.inicio && a.inicio >= hoje.slice(0, 8) + '01' ? a.inicio : hoje;
    const fim = somarMeses(inicio, ctr.vigencia_meses || 12);
    const valor = Number(a.valor_mensalidade);
    const vars = {
        empresa_razao_social: emp.razao_social || emp.nome_fantasia, empresa_cnpj_cpf: emp.cnpj_cpf || '—',
        empresa_endereco: [emp.endereco, emp.cidade && `${emp.cidade}/${emp.uf || ''}`].filter(Boolean).join(', ') || '—',
        responsavel_nome: a.resp_nome || '—', responsavel_cpf: a.resp_cpf || '—', responsavel_telefone: a.resp_tel || a.responsavel_telefone || '—',
        aluno_nome: a.nome, escola_nome: a.escola_nome || '—', turno: a.turno || '—', aluno_endereco: formatarEndereco(a) || '—',
        valor: BRL(valor), valor_extenso: valorPorExtenso(valor), dia_vencimento: a.dia_vencimento || cob.dia_vencimento_padrao,
        multa_pct: cob.multa_pct, juros_mes_pct: cob.juros_mes_pct,
        vigencia_inicio: DMY(inicio), vigencia_fim: DMY(fim), cidade: emp.cidade || '', data_hoje: DMY(hoje),
    };
    const conteudo = String(ctr.modelo).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return { conteudo, valor, vigencia_inicio: inicio, vigencia_fim: fim, responsavel_id: a.resp_id || null, aluno_nome: a.nome };
}

export async function listarContratos(conn, filtroSql = '1=1', params = []) {
    const rows = await conn.query(`
        SELECT c.id, c.aluno_id, c.responsavel_id, c.status, c.valor, c.hash_sha256,
               DATE_FORMAT(c.vigencia_inicio,'%Y-%m-%d') AS vigencia_inicio, DATE_FORMAT(c.vigencia_fim,'%Y-%m-%d') AS vigencia_fim,
               DATE_FORMAT(c.criado_em,'%Y-%m-%dT%H:%i:%s') AS criado_em, DATE_FORMAT(c.enviado_em,'%Y-%m-%dT%H:%i:%s') AS enviado_em,
               DATE_FORMAT(c.assinado_em,'%Y-%m-%dT%H:%i:%s') AS assinado_em, c.assinatura_nome, c.assinatura_cpf,
               a.nome AS aluno_nome, r.nome AS responsavel_nome
        FROM contratos c JOIN alunos a ON a.id = c.aluno_id LEFT JOIN responsaveis r ON r.id = c.responsavel_id
        WHERE c.empresa_id = ? AND ${filtroSql} ORDER BY c.id DESC`, [empresaId(), ...params]);
    return rows.map(r => ({ ...r, valor: r.valor === null ? null : Number(r.valor) }));
}

export async function carregarContrato(conn, id) {
    const [c] = await conn.query(`
        SELECT c.*, DATE_FORMAT(c.vigencia_inicio,'%Y-%m-%d') AS vigencia_inicio_s, DATE_FORMAT(c.vigencia_fim,'%Y-%m-%d') AS vigencia_fim_s,
               DATE_FORMAT(c.assinado_em,'%Y-%m-%dT%H:%i:%s') AS assinado_em_s, DATE_FORMAT(c.criado_em,'%Y-%m-%dT%H:%i:%s') AS criado_em_s,
               a.nome AS aluno_nome, r.nome AS responsavel_nome
        FROM contratos c JOIN alunos a ON a.id = c.aluno_id LEFT JOIN responsaveis r ON r.id = c.responsavel_id WHERE c.id = ? AND c.empresa_id = ?`, [id, empresaId()]);
    if (!c) return null;
    return {
        id: c.id, aluno_id: c.aluno_id, responsavel_id: c.responsavel_id, status: c.status, conteudo: c.conteudo,
        hash_sha256: c.hash_sha256, integro: sha256(c.conteudo) === c.hash_sha256, valor: c.valor === null ? null : Number(c.valor),
        vigencia_inicio: c.vigencia_inicio_s, vigencia_fim: c.vigencia_fim_s, criado_em: c.criado_em_s, assinado_em: c.assinado_em_s,
        assinatura_nome: c.assinatura_nome, assinatura_cpf: c.assinatura_cpf, assinatura_ip: c.assinatura_ip,
        assinatura_user_agent: c.assinatura_user_agent, aluno_nome: c.aluno_nome, responsavel_nome: c.responsavel_nome,
    };
}

/** Aceite eletrônico (feito pelo responsável no portal). */
export async function assinarContrato(conn, id, { nome, cpf, ip, userAgent }) {
    const [c] = await conn.query('SELECT conteudo, hash_sha256, status, responsavel_id FROM contratos WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    if (!c) return { erro: 'Contrato não encontrado.', status: 404 };
    if (c.status !== 'pendente') return { erro: c.status === 'assinado' ? 'Este contrato já foi assinado.' : 'Este contrato foi cancelado.', status: 400 };
    if (sha256(c.conteudo) !== c.hash_sha256) return { erro: 'O texto do contrato foi alterado. Peça um novo contrato à empresa.', status: 409 };
    const cpfLimpo = String(cpf).replace(/\D/g, '');
    const cpfFmt = `${cpfLimpo.slice(0, 3)}.${cpfLimpo.slice(3, 6)}.${cpfLimpo.slice(6, 9)}-${cpfLimpo.slice(9)}`;
    await conn.query(`
        UPDATE contratos SET status = 'assinado', assinado_em = NOW(), assinatura_nome = ?, assinatura_cpf = ?, assinatura_ip = ?, assinatura_user_agent = ?
        WHERE id = ? AND empresa_id = ? AND status = 'pendente'`, [nome, cpfFmt, String(ip || '').slice(0, 60), String(userAgent || '').slice(0, 255), id, empresaId()]);
    if (c.responsavel_id) await conn.query('UPDATE responsaveis SET cpf_assinatura = ? WHERE id = ? AND empresa_id = ?', [cpfFmt, c.responsavel_id, empresaId()]);
    return { ok: true };
}
