// Envio de WhatsApp. Cada empresa tem o seu (Mensagens → WhatsApp no painel). Provedores:
//   zapi     -> Z-API direto (instância, token e client-token)
//   webhook  -> POST para uma URL sua (ex.: fluxo do n8n)
//   log      -> não envia, só escreve no console (modo teste)
// A empresa principal pode usar as variáveis do .env (WHATSAPP_PROVIDER, ZAPI_*, WHATSAPP_WEBHOOK_*).

import { lerConfig } from './config.js';

const TIMEOUT_MS = 15000;
const EMPRESA_PRINCIPAL = Number(process.env.EMPRESA_PRINCIPAL_ID || 1);

/**
 * Configuração de WhatsApp da empresa. A empresa principal (a primeira, dona da instalação)
 * usa as variáveis do .env enquanto não salvar uma configuração própria no painel;
 * empresas novas começam em modo teste (não enviam nada).
 */
export async function configWhatsapp(conn, emp) {
    const c = await lerConfig(conn, 'whatsapp', emp);
    if (c.provedor) return { ...c, origem: 'painel' };
    if (emp === EMPRESA_PRINCIPAL) {
        return {
            origem: 'env',
            provedor: (process.env.WHATSAPP_PROVIDER || 'log').toLowerCase(),
            zapi_instance_id: process.env.ZAPI_INSTANCE_ID || '', zapi_token: process.env.ZAPI_TOKEN || '',
            zapi_client_token: process.env.ZAPI_CLIENT_TOKEN || '',
            webhook_url: process.env.WHATSAPP_WEBHOOK_URL || '', webhook_token: process.env.WHATSAPP_WEBHOOK_TOKEN || '',
        };
    }
    return { ...c, provedor: 'log', origem: 'padrao' };
}

export function provedorAtual(cfg) {
    const p = cfg?.provedor || 'log';
    const onde = cfg?.origem === 'env' ? 'no .env' : 'em Mensagens → WhatsApp';
    if (p === 'zapi') {
        const ok = !!(cfg.zapi_instance_id && cfg.zapi_token);
        return { nome: 'zapi', configurado: ok, aviso: ok ? null : `Informe a instância e o token da Z-API ${onde}.` };
    }
    if (p === 'webhook') {
        const ok = !!cfg.webhook_url;
        return { nome: 'webhook', configurado: ok, aviso: ok ? null : `Informe a URL do webhook ${onde}.` };
    }
    return { nome: 'log', configurado: true, aviso: 'Modo teste: as mensagens não são enviadas de verdade.' };
}

/** Só dígitos com DDI 55. Ex.: (61) 99999-0000 -> 5561999990000 */
export function normalizarTelefone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.startsWith('0')) d = d.replace(/^0+/, '');
    if (d.length === 10 || d.length === 11) d = `55${d}`;
    if (d.length < 12 || d.length > 13) return null;
    return d;
}

/** Chave para comparar números com/sem o nono dígito: DDD + 8 últimos dígitos. */
export function chaveTelefone(v) {
    const n = normalizarTelefone(v);
    if (!n) return null;
    return `${n.slice(2, 4)}${n.slice(-8)}`;
}

async function postJson(url, body, headers = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
        const texto = await res.text();
        let json = null;
        try { json = JSON.parse(texto); } catch { /* não é JSON */ }
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${texto.slice(0, 200)}`);
        return json;
    } finally {
        clearTimeout(t);
    }
}

/** Envia texto pelo WhatsApp configurado da empresa (cfg = configWhatsapp). Retorna { id } ou lança erro. */
export async function enviarTexto(cfg, telefone, mensagem, extra = {}) {
    const fone = normalizarTelefone(telefone);
    if (!fone) throw new Error(`Telefone inválido: ${telefone}`);
    const p = provedorAtual(cfg);
    if (!p.configurado) throw new Error(p.aviso);

    if (p.nome === 'zapi') {
        const url = `https://api.z-api.io/instances/${cfg.zapi_instance_id}/token/${cfg.zapi_token}/send-text`;
        const r = await postJson(url, { phone: fone, message: mensagem }, cfg.zapi_client_token ? { 'Client-Token': cfg.zapi_client_token } : {});
        return { id: r?.messageId || r?.zaapId || null };
    }
    if (p.nome === 'webhook') {
        const r = await postJson(cfg.webhook_url, { telefone: fone, mensagem, ...extra },
            cfg.webhook_token ? { Authorization: `Bearer ${cfg.webhook_token}` } : {});
        return { id: r?.id || r?.messageId || null };
    }
    console.log(`[whatsapp:log] para ${fone}:\n${mensagem}\n`);
    return { id: `log-${Date.now()}` };
}
