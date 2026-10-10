// Cobrança de mensalidades: Pix direto (sem taxa) ou Asaas (boleto/cartão/Pix com baixa automática).
import { lerConfig } from './config.js';
import { gerarPixCopiaCola } from './pix.js';
import { empresaId } from '../lib/tenant.js';

const ASAAS_URL = { sandbox: 'https://api-sandbox.asaas.com/v3', producao: 'https://api.asaas.com/v3' };

/**
 * Chave do Asaas da empresa. A empresa principal pode usar a do .env (ASAAS_API_KEY);
 * as demais cadastram a própria em Financeiro → Configurações.
 */
export async function configAsaas(conn, emp = empresaId()) {
    const c = await lerConfig(conn, 'asaas', emp);
    if (c.api_key) return { api_key: c.api_key, webhook_token: c.webhook_token || '', origem: 'painel' };
    if (emp === Number(process.env.EMPRESA_PRINCIPAL_ID || 1)) {
        return { api_key: process.env.ASAAS_API_KEY || '', webhook_token: process.env.ASAAS_WEBHOOK_TOKEN || '', origem: 'env' };
    }
    return { api_key: '', webhook_token: c.webhook_token || '', origem: 'painel' };
}

async function asaas(cfg, metodo, caminho, corpo) {
    const chave = cfg._chave;
    if (!chave) throw new Error('Cadastre a chave da API do Asaas em Financeiro → Configurações.');
    const base = process.env.ASAAS_URL || ASAAS_URL[cfg.asaas_ambiente === 'producao' ? 'producao' : 'sandbox'];
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
        const res = await fetch(`${base}${caminho}`, {
            method: metodo,
            headers: { 'Content-Type': 'application/json', access_token: chave, 'User-Agent': 'VanControl/1.0' },
            body: corpo ? JSON.stringify(corpo) : undefined,
            signal: ctrl.signal,
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Asaas ${res.status}: ${j?.errors?.map(e => e.description).join('; ') || JSON.stringify(j).slice(0, 200)}`);
        return j;
    } finally {
        clearTimeout(t);
    }
}

/** Cliente no Asaas para o responsável (reaproveita pelo externalReference). */
async function clienteAsaas(conn, cfg, m) {
    const ref = m.responsavel_id ? `resp-${m.responsavel_id}` : `aluno-${m.aluno_id}`;
    const busca = await asaas(cfg, 'GET', `/customers?externalReference=${encodeURIComponent(ref)}`);
    if (busca?.data?.[0]?.id) return busca.data[0].id;
    const doc = String(m.responsavel_cpf || '').replace(/\D/g, '');
    if (!doc) throw new Error('O Asaas exige CPF do responsável. Cadastre o CPF em Responsáveis.');
    const c = await asaas(cfg, 'POST', '/customers', {
        name: m.responsavel_nome || m.aluno_nome, cpfCnpj: doc, mobilePhone: String(m.responsavel_telefone || '').replace(/\D/g, '') || undefined,
        email: m.responsavel_email || undefined, externalReference: ref, notificationDisabled: true,
    });
    return c.id;
}

export async function carregarMensalidade(conn, id) {
    const [m] = await conn.query(`
        SELECT m.*, DATE_FORMAT(m.data_vencimento,'%Y-%m-%d') AS vencimento, DATE_FORMAT(m.data_pagamento,'%Y-%m-%d') AS pagamento,
               a.nome AS aluno_nome, a.responsavel_id, r.nome AS responsavel_nome, r.cpf AS responsavel_cpf, r.email AS responsavel_email,
               COALESCE(r.telefone, a.responsavel_telefone) AS responsavel_telefone
        FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id LEFT JOIN responsaveis r ON r.id = a.responsavel_id
        WHERE m.id = ? AND m.empresa_id = ?`, [id, empresaId()]);
    return m || null;
}

/** Valor atualizado com multa e juros (pro rata dia) se estiver vencida. */
export function valorAtualizado(m, cfg, hojeISO) {
    const valor = Number(m.valor);
    if (!m.vencimento || m.vencimento >= hojeISO || m.status === 'Pago') return { valor, multa: 0, juros: 0, dias_atraso: 0 };
    const dias = Math.round((Date.parse(`${hojeISO}T12:00:00Z`) - Date.parse(`${m.vencimento}T12:00:00Z`)) / 86400000);
    const multa = Math.round(valor * Number(cfg.multa_pct || 0)) / 100;
    const juros = Math.round(valor * (Number(cfg.juros_mes_pct || 0) / 100 / 30) * dias * 100) / 100;
    return { valor: Math.round((valor + multa + juros) * 100) / 100, multa, juros, dias_atraso: dias };
}

/** Dados para pagar: Pix copia e cola (+ QR do Asaas e links, se houver). */
export async function dadosCobranca(conn, mensalidadeId, hojeISO) {
    const cfg = await lerConfig(conn, 'cobranca');
    cfg._chave = (await configAsaas(conn)).api_key;
    const m = await carregarMensalidade(conn, mensalidadeId);
    if (!m) return null;
    const atual = valorAtualizado(m, cfg, hojeISO);
    const competencia = m.vencimento ? `${m.vencimento.slice(5, 7)}/${m.vencimento.slice(0, 4)}` : '';
    const base = { mensalidade_id: m.id, aluno_nome: m.aluno_nome, vencimento: m.vencimento, competencia, status: m.status, ...atual, valor_original: Number(m.valor) };

    if (cfg.provedor === 'asaas') {
        if (!m.gateway_id) {
            const cliente = await clienteAsaas(conn, cfg, m);
            const p = await asaas(cfg, 'POST', '/payments', {
                customer: cliente, billingType: 'UNDEFINED', value: Number(m.valor), dueDate: m.vencimento,
                description: `Transporte escolar ${m.aluno_nome} - ${competencia}`, externalReference: `mens-${m.id}`,
                fine: { value: Number(cfg.multa_pct || 0) }, interest: { value: Number(cfg.juros_mes_pct || 0) },
            });
            await conn.query(`UPDATE mensalidades SET gateway = 'asaas', gateway_id = ?, gateway_url = ?, boleto_url = ? WHERE id = ? AND empresa_id = ?`,
                [p.id, p.invoiceUrl || null, p.bankSlipUrl || null, m.id, empresaId()]);
            Object.assign(m, { gateway_id: p.id, gateway_url: p.invoiceUrl, boleto_url: p.bankSlipUrl });
        }
        let pix = null;
        try {
            pix = await asaas(cfg, 'GET', `/payments/${m.gateway_id}/pixQrCode`);
            await conn.query('UPDATE mensalidades SET pix_copia_cola = ? WHERE id = ? AND empresa_id = ?', [pix.payload, m.id, empresaId()]);
        } catch (err) {
            console.warn('[asaas] QR Pix indisponível:', err.message);
        }
        return { ...base, provedor: 'asaas', pix_copia_cola: pix?.payload || m.pix_copia_cola || null, pix_qr_base64: pix?.encodedImage || null, link_fatura: m.gateway_url, link_boleto: m.boleto_url };
    }

    // Pix direto para a chave da empresa (valor já com multa/juros quando vencida)
    const copia = gerarPixCopiaCola({
        chave: cfg.pix_chave, tipo: cfg.pix_tipo, nome: cfg.pix_nome, cidade: cfg.pix_cidade,
        valor: atual.valor, txid: `VC${m.id}`, descricao: `${m.aluno_nome.split(' ')[0]} ${competencia}`,
    });
    return { ...base, provedor: 'pix_manual', pix_copia_cola: copia, pix_qr_base64: null, link_fatura: null, link_boleto: null };
}

export async function proximoRecibo(conn) {
    // numeração de recibos própria de cada empresa
    const [r] = await conn.query('SELECT COALESCE(MAX(recibo_numero), 0) + 1 AS n FROM mensalidades WHERE empresa_id = ?', [empresaId()]);
    return Number(r.n);
}
