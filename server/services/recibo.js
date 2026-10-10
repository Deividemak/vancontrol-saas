// Dados do recibo de uma mensalidade paga (impressão no painel e no portal).
import { lerConfig } from './config.js';
import { valorPorExtenso } from './contratos.js';
import { empresaId } from '../lib/tenant.js';

const FORMAS = { pix: 'Pix', dinheiro: 'Dinheiro', transferencia: 'Transferência', cartao: 'Cartão', boleto: 'Boleto', outro: 'Outro' };

export async function dadosRecibo(conn, mensalidadeId) {
    const [m] = await conn.query(`
        SELECT m.id, m.recibo_numero, m.valor, m.valor_pago, m.forma_pagamento, m.descricao, m.gateway,
               DATE_FORMAT(m.data_vencimento,'%Y-%m-%d') AS vencimento, DATE_FORMAT(m.data_pagamento,'%Y-%m-%d') AS pagamento,
               a.id AS aluno_id, a.nome AS aluno_nome, e.nome AS escola_nome,
               r.nome AS responsavel_nome, COALESCE(r.cpf, r.cpf_assinatura) AS responsavel_cpf
        FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id
        LEFT JOIN escolas e ON e.id = a.escola_id LEFT JOIN responsaveis r ON r.id = a.responsavel_id
        WHERE m.id = ? AND m.empresa_id = ? AND m.status = 'Pago'`, [mensalidadeId, empresaId()]);
    if (!m) return null;
    const emp = await lerConfig(conn, 'empresa');
    const valor = Number(m.valor_pago ?? m.valor);
    return {
        numero: m.recibo_numero, mensalidade_id: m.id, aluno_id: m.aluno_id,
        valor, valor_extenso: valorPorExtenso(valor),
        forma: FORMAS[m.forma_pagamento] || (m.gateway === 'asaas' ? 'Asaas' : '—'),
        pagamento: m.pagamento, vencimento: m.vencimento,
        competencia: `${m.vencimento.slice(5, 7)}/${m.vencimento.slice(0, 4)}`,
        referente: `Transporte escolar de ${m.aluno_nome}${m.escola_nome ? ` (${m.escola_nome})` : ''} — ${m.vencimento.slice(5, 7)}/${m.vencimento.slice(0, 4)}${m.descricao ? ` — ${m.descricao}` : ''}`,
        pagador: { nome: m.responsavel_nome || `Responsável de ${m.aluno_nome}`, cpf: m.responsavel_cpf || null },
        empresa: { nome: emp.razao_social || emp.nome_fantasia, documento: emp.cnpj_cpf || null, endereco: [emp.endereco, emp.cidade && `${emp.cidade}/${emp.uf || ''}`].filter(Boolean).join(' — '), telefone: emp.telefone || null },
    };
}
