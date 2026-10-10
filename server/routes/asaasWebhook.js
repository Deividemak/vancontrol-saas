// Webhook do Asaas: baixa automática quando o pagamento é recebido/confirmado.
// Configure no Asaas (Integrações → Webhooks) a URL <APP_URL>/api/publico/asaas e o token da empresa
// (Financeiro → Configurações; a empresa principal também aceita o ASAAS_WEBHOOK_TOKEN do .env).
import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { registrarPagamento } from '../services/financeiro.js';
import { configAsaas } from '../services/cobranca.js';
import { comEmpresa } from '../lib/tenant.js';

const router = Router();
const EVENTOS_PAGO = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH'];
const FORMA = { PIX: 'pix', BOLETO: 'boleto', CREDIT_CARD: 'cartao', DEBIT_CARD: 'cartao', TRANSFER: 'transferencia' };

function iguais(recebido, esperado) {
    if (!esperado || !recebido) return false;
    const a = Buffer.from(String(recebido)), b = Buffer.from(String(esperado));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Empresa dona do evento: a da mensalidade (com o token dela) ou, sem mensalidade, a dona do token. */
async function empresaDoEvento(conn, token, mensalidadeId) {
    if (mensalidadeId) {
        const [m] = await conn.query('SELECT empresa_id FROM mensalidades WHERE id = ?', [mensalidadeId]);
        if (!m) return null;
        return iguais(token, (await configAsaas(conn, m.empresa_id)).webhook_token) ? m.empresa_id : null;
    }
    const empresas = await conn.query('SELECT id FROM empresas WHERE ativo = 1');
    for (const e of empresas) if (iguais(token, (await configAsaas(conn, e.id)).webhook_token)) return e.id;
    return null;
}

router.post('/asaas', async (req, res) => {
    const ev = req.body || {};
    const p = ev.payment || {};
    const idEvento = String(ev.id || `${ev.event}:${p.id}`).slice(0, 80);
    const m = /^mens-(\d+)$/.exec(p.externalReference || '');
    let conn;
    try {
        conn = await pool.getConnection();
        const emp = await empresaDoEvento(conn, req.headers['asaas-access-token'], m ? Number(m[1]) : null);
        if (!emp) return res.status(401).json({ error: 'token inválido' });
        try {
            await conn.query('INSERT INTO pagamentos_eventos (id, empresa_id, gateway, evento, mensalidade_id, corpo) VALUES (?, ?, ?, ?, ?, ?)',
                [idEvento, emp, 'asaas', String(ev.event || '').slice(0, 40), m ? Number(m[1]) : null, JSON.stringify(ev).slice(0, 60000)]);
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.json({ ok: true, duplicado: true }); // Asaas reenviou
            throw err;
        }
        if (m && EVENTOS_PAGO.includes(ev.event)) {
            await comEmpresa(emp, () => registrarPagamento(conn, Number(m[1]), {
                valor: Number(p.value) || undefined, forma: FORMA[p.billingType] || 'outro',
                data: (p.clientPaymentDate || p.paymentDate || '').slice(0, 10) || undefined, gateway: 'asaas',
                observacao: `Asaas ${p.id || ''}`.trim(),
            }));
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('[asaas] webhook:', err);
        // 500 faz o Asaas tentar de novo; libera o id para reprocessar
        if (conn) await conn.query('DELETE FROM pagamentos_eventos WHERE id = ?', [idEvento]).catch(() => {});
        res.status(500).json({ error: 'erro' });
    } finally {
        if (conn) conn.release();
    }
});

export default router;
