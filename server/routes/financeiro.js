// Financeiro do painel: mensalidades, cobrança, inadimplência, configurações, preços e lucro por rota.
import { Router } from 'express';
import { handler, HttpError, parseId, toId, str, data as dataValida, limparLinha } from '../lib/http.js';
import { lerConfig, salvarConfig, CHAVES_CONFIG } from '../services/config.js';
import { normalizarChave } from '../services/pix.js';
import { precoSugerido, proporcional } from '../services/precos.js';
import { dadosCobranca, configAsaas } from '../services/cobranca.js';
import { empresaId, daEmpresa } from '../lib/tenant.js';
import {
    prepararMes, gerarMensalidadesDoMes, registrarPagamento, cobrarAgora, executarRegua, painelInadimplencia,
    suspenderAluno, reativarAluno, atualizarStatus,
} from '../services/financeiro.js';
import { dadosRecibo } from '../services/recibo.js';
import { lucroPorRota, listarCustos } from '../services/lucro.js';
import { hojeBR } from '../services/viagens.js';
import { urlBase } from '../services/responsaveis.js';

const router = Router();
const FORMAS = ['pix', 'dinheiro', 'transferencia', 'cartao', 'boleto', 'outro'];
const num = (v, min = 0, max = 1e6) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

// Lista geral (mês atual gerado automaticamente; status atualizado)
router.get('/dashboard', handler(async (req, res, conn) => {
    await prepararMes(conn);
    const rows = await conn.query(`
        SELECT m.id, m.aluno_id, m.valor, m.status, m.descricao, m.recibo_numero, m.forma_pagamento, m.valor_pago, m.gateway,
               DATE_FORMAT(m.data_vencimento,'%Y-%m-%d') AS data_vencimento, DATE_FORMAT(m.data_pagamento,'%Y-%m-%d') AS data_pagamento,
               a.nome AS aluno, a.suspenso, a.responsavel_id, r.nome AS responsavel_nome,
               COALESCE(r.telefone, a.responsavel_telefone) AS responsavel_telefone
        FROM mensalidades m JOIN alunos a ON m.aluno_id = a.id LEFT JOIN responsaveis r ON a.responsavel_id = r.id
        WHERE m.empresa_id = ?
        ORDER BY m.data_vencimento DESC, a.nome`, [empresaId()]);
    res.json(rows.map(r => ({ ...limparLinha(r), valor: Number(r.valor), valor_pago: r.valor_pago === null ? null : Number(r.valor_pago), suspenso: !!r.suspenso })));
}, 'Erro ao buscar dados financeiros'));

router.post('/gerar', handler(async (req, res, conn) => {
    const mes = /^\d{4}-\d{2}$/.test(req.body?.mes || '') ? req.body.mes : hojeBR().slice(0, 7);
    const r = await gerarMensalidadesDoMes(conn, mes);
    await atualizarStatus(conn);
    res.json({ success: true, ...r });
}, 'Erro ao gerar cobranças'));

// ---------- configurações ----------
router.get('/config', handler(async (req, res, conn) => {
    const out = {};
    for (const k of CHAVES_CONFIG) out[k] = await lerConfig(conn, k);
    const as = await configAsaas(conn);
    out.asaas = {
        chave_configurada: !!as.api_key,
        webhook_token_configurado: !!as.webhook_token,
        webhook_url: `${urlBase()}/api/publico/asaas`,
        origem: as.origem,
    };
    res.json(out);
}, 'Erro ao carregar configurações'));

export function validarConfig(chave, v) {
    if (chave === 'empresa') {
        const o = {};
        for (const k of ['razao_social', 'nome_fantasia', 'cnpj_cpf', 'endereco', 'cidade', 'telefone', 'email']) if (k in v) o[k] = str(v[k], 200) || '';
        if ('uf' in v) o.uf = (str(v.uf, 2) || '').toUpperCase();
        return o;
    }
    if (chave === 'precos') {
        const o = {};
        if (v.base_por_turno) {
            o.base_por_turno = {};
            for (const t of ['Manhã', 'Tarde', 'Integral', 'Noite']) o.base_por_turno[t] = num(v.base_por_turno[t]) ?? 0;
        }
        for (const k of ['km_incluso', 'valor_km_extra']) if (k in v) o[k] = num(v[k]) ?? 0;
        if ('desconto_irmao_pct' in v) o.desconto_irmao_pct = num(v.desconto_irmao_pct, 0, 100) ?? 0;
        if ('arredondar_para' in v) o.arredondar_para = num(v.arredondar_para, 0, 100) ?? 0;
        if ('proporcional_entrada' in v) o.proporcional_entrada = !!v.proporcional_entrada;
        return o;
    }
    if (chave === 'cobranca') {
        const o = {};
        if ('provedor' in v) o.provedor = v.provedor === 'asaas' ? 'asaas' : 'pix_manual';
        if ('pix_tipo' in v) o.pix_tipo = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'].includes(v.pix_tipo) ? v.pix_tipo : 'cpf';
        if ('pix_chave' in v) {
            o.pix_chave = str(v.pix_chave, 77) || '';
            if (o.pix_chave && !normalizarChave(o.pix_chave, o.pix_tipo || v.pix_tipo)) throw new HttpError(400, 'Chave Pix inválida para o tipo escolhido.');
        }
        if ('pix_nome' in v) o.pix_nome = str(v.pix_nome, 25) || '';
        if ('pix_cidade' in v) o.pix_cidade = str(v.pix_cidade, 15) || '';
        if ('dia_vencimento_padrao' in v) o.dia_vencimento_padrao = Math.round(num(v.dia_vencimento_padrao, 1, 31) ?? 10);
        if ('multa_pct' in v) o.multa_pct = num(v.multa_pct, 0, 2) ?? 0;           // CDC: multa máx. 2%
        if ('juros_mes_pct' in v) o.juros_mes_pct = num(v.juros_mes_pct, 0, 1) ?? 0; // 1% ao mês
        if ('regua_ativa' in v) o.regua_ativa = !!v.regua_ativa;
        if ('regua_hora' in v) o.regua_hora = Math.round(num(v.regua_hora, 6, 21) ?? 9);
        if ('regua' in v) {
            const passos = (Array.isArray(v.regua) ? v.regua : String(v.regua).split(/[,; ]+/)).map(Number).filter(n => Number.isInteger(n) && n >= -15 && n <= 60);
            o.regua = [...new Set(passos)].sort((a, b) => a - b).slice(0, 8);
        }
        if ('dias_alerta_inadimplencia' in v) o.dias_alerta_inadimplencia = Math.round(num(v.dias_alerta_inadimplencia, 1, 120) ?? 10);
        if ('asaas_ambiente' in v) o.asaas_ambiente = v.asaas_ambiente === 'producao' ? 'producao' : 'sandbox';
        return o;
    }
    if (chave === 'contrato') {
        const o = {};
        if ('modelo' in v) {
            o.modelo = String(v.modelo || '').slice(0, 30000);
            if (o.modelo.trim().length < 50) throw new HttpError(400, 'O modelo de contrato está muito curto.');
        }
        if ('vigencia_meses' in v) o.vigencia_meses = Math.round(num(v.vigencia_meses, 1, 60) ?? 12);
        return o;
    }
    if (chave === 'operacao') {
        const o = {};
        const inteiro = (k, min, max) => { if (k in v) o[k] = Math.round(num(v[k], min, max) ?? min); };
        inteiro('alerta_docs_dias', 1, 120);
        inteiro('velocidade_max_kmh', 30, 140);
        inteiro('parada_min', 2, 120);
        inteiro('desvio_m', 100, 10000);
        inteiro('sem_sinal_min', 2, 120);
        inteiro('fim_atrasado_min', 5, 240);
        if ('bloquear_docs_vencidos' in v) o.bloquear_docs_vencidos = !!v.bloquear_docs_vencidos;
        if ('telefone_alertas' in v) o.telefone_alertas = String(v.telefone_alertas || '').replace(/\D/g, '').slice(0, 13);
        return o;
    }
    throw new HttpError(404, 'Configuração desconhecida.');
}

// chave e token do Asaas da empresa (em branco = mantém o atual; nunca voltam para a tela)
router.put('/config/asaas', handler(async (req, res, conn) => {
    const b = req.body || {};
    const novo = {};
    if (b.api_key !== undefined && b.api_key !== '') novo.api_key = str(b.api_key, 300) || '';
    if (b.webhook_token !== undefined && b.webhook_token !== '') novo.webhook_token = str(b.webhook_token, 200) || '';
    if (b.remover) { novo.api_key = ''; novo.webhook_token = ''; }
    await salvarConfig(conn, 'asaas', novo);
    const as = await configAsaas(conn);
    res.json({ chave_configurada: !!as.api_key, webhook_token_configurado: !!as.webhook_token, origem: as.origem });
}, 'Erro ao salvar Asaas'));

router.put('/config/:chave', handler(async (req, res, conn) => {
    const chave = req.params.chave;
    if (!CHAVES_CONFIG.includes(chave)) throw new HttpError(404, 'Configuração desconhecida.');
    const valor = validarConfig(chave, req.body || {});
    if (chave === 'cobranca' && valor.provedor === 'asaas' && !(await configAsaas(conn)).api_key) {
        throw new HttpError(400, 'Para usar o Asaas, cadastre antes a chave da API do Asaas.');
    }
    const salvo = await salvarConfig(conn, chave, valor);
    // o nome fantasia é o nome da empresa no sistema (cabeçalho, mensagens, login)
    if (chave === 'empresa' && salvo.nome_fantasia) await conn.query('UPDATE empresas SET nome = ? WHERE id = ?', [salvo.nome_fantasia.slice(0, 150), empresaId()]);
    res.json(salvo);
}, 'Erro ao salvar configurações'));

// ---------- preço sugerido (cadastro do aluno) ----------
router.post('/preco-sugerido', handler(async (req, res, conn) => {
    const b = req.body || {};
    const r = await precoSugerido(conn, {
        lat: b.lat ?? null, lng: b.lng ?? null, escolaId: toId(b.escola_id), turno: b.turno,
        responsavelId: toId(b.responsavel_id), alunoId: toId(b.aluno_id),
    });
    const inicio = dataValida(b.inicio_contrato);
    const precos = await lerConfig(conn, 'precos');
    if (inicio && precos.proporcional_entrada && inicio.slice(8) !== '01') r.primeiro_mes = { ...proporcional(r.valor_sugerido, inicio), inicio };
    res.json(r);
}, 'Erro ao calcular preço'));

// ---------- mensalidade ----------
async function aberta(conn, id) {
    const [m] = await conn.query('SELECT id, status, gateway_id FROM mensalidades WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    if (!m) throw new HttpError(404, 'Mensalidade não encontrada.');
    return m;
}

router.get('/mensalidades/:id/cobranca', handler(async (req, res, conn) => {
    const m = await aberta(conn, parseId(req));
    if (m.status === 'Pago' || m.status === 'Cancelado') throw new HttpError(400, `Mensalidade ${m.status === 'Pago' ? 'já paga' : 'cancelada'}.`);
    try {
        res.json(await dadosCobranca(conn, m.id, hojeBR()));
    } catch (err) {
        throw new HttpError(400, err.message);
    }
}, 'Erro ao gerar cobrança'));

router.post('/mensalidades/:id/cobrar', handler(async (req, res, conn) => {
    const m = await aberta(conn, parseId(req));
    if (m.status === 'Pago' || m.status === 'Cancelado') throw new HttpError(400, 'Mensalidade não está em aberto.');
    const r = await cobrarAgora(conn, { mensalidadeId: m.id });
    if (r.sem_whatsapp) throw new HttpError(400, 'Responsável sem WhatsApp cadastrado (ou com avisos desligados).');
    res.json(r);
}, 'Erro ao enviar cobrança'));

async function baixa(req, res, conn) {
    const id = parseId(req);
    const b = req.body || {};
    const valor = b.valor === undefined || b.valor === null || b.valor === '' ? undefined : num(b.valor, 0.01);
    if (valor === null) throw new HttpError(400, 'Valor inválido.');
    const data = dataValida(b.data) || hojeBR();
    if (data > hojeBR()) throw new HttpError(400, 'A data do pagamento não pode ser no futuro.');
    try {
        const r = await registrarPagamento(conn, id, {
            valor, forma: FORMAS.includes(b.forma) ? b.forma : 'pix', data, observacao: str(b.observacao), usuarioId: req.user?.id, avisar: b.avisar !== false,
        });
        if (!r) throw new HttpError(404, 'Mensalidade não encontrada.');
        res.json({ success: true, ...r });
    } catch (err) {
        if (err.status === 400) throw new HttpError(400, err.message);
        throw err;
    }
}
router.post('/mensalidades/:id/pagamento', handler(baixa, 'Erro ao registrar pagamento'));
router.put('/pagar/:id', handler(baixa, 'Erro ao registrar pagamento')); // compatibilidade

router.post('/mensalidades/:id/estornar', handler(async (req, res, conn) => {
    const id = parseId(req);
    const [m] = await conn.query('SELECT status, gateway FROM mensalidades WHERE id = ? AND empresa_id = ?', [id, empresaId()]);
    if (!m) throw new HttpError(404, 'Mensalidade não encontrada.');
    if (m.status !== 'Pago') throw new HttpError(400, 'Só dá para desfazer uma baixa de mensalidade paga.');
    await conn.query(`UPDATE mensalidades SET status = 'Pendente', data_pagamento = NULL, pago_em = NULL, valor_pago = NULL, forma_pagamento = NULL,
                      observacao = ? WHERE id = ? AND empresa_id = ?`, [str(req.body?.motivo) ? `Baixa desfeita: ${str(req.body.motivo)}` : 'Baixa desfeita', id, empresaId()]);
    await atualizarStatus(conn);
    res.json({ success: true });
}, 'Erro ao desfazer baixa'));

router.put('/mensalidades/:id', handler(async (req, res, conn) => {
    const m = await aberta(conn, parseId(req));
    if (m.status === 'Pago' || m.status === 'Cancelado') throw new HttpError(400, 'Só é possível editar mensalidades em aberto.');
    if (m.gateway_id) throw new HttpError(400, 'Esta cobrança já foi emitida no Asaas. Cancele e gere outra.');
    const valor = num(req.body?.valor, 0.01);
    const venc = dataValida(req.body?.vencimento);
    if (!valor || !venc) throw new HttpError(400, 'Informe valor e vencimento.');
    await conn.query('UPDATE mensalidades SET valor = ?, data_vencimento = ?, descricao = ?, pix_copia_cola = NULL WHERE id = ? AND empresa_id = ?',
        [valor, venc, str(req.body?.descricao), m.id, empresaId()]);
    await atualizarStatus(conn);
    res.json({ success: true });
}, 'Erro ao editar mensalidade'));

router.post('/mensalidades/:id/cancelar', handler(async (req, res, conn) => {
    const m = await aberta(conn, parseId(req));
    if (m.status === 'Pago') throw new HttpError(400, 'Mensalidade paga não pode ser cancelada. Desfaça a baixa antes.');
    await conn.query(`UPDATE mensalidades SET status = 'Cancelado', observacao = ? WHERE id = ? AND empresa_id = ?`, [str(req.body?.motivo) || 'Cancelada', m.id, empresaId()]);
    res.json({ success: true, aviso: m.gateway_id ? 'Cancele também a cobrança no painel do Asaas.' : null });
}, 'Erro ao cancelar mensalidade'));

router.get('/mensalidades/:id/recibo', handler(async (req, res, conn) => {
    const r = await dadosRecibo(conn, parseId(req));
    if (!r) throw new HttpError(404, 'Recibo não encontrado (a mensalidade precisa estar paga).');
    res.json(r);
}, 'Erro ao gerar recibo'));

// ---------- inadimplência ----------
router.get('/inadimplencia', handler(async (req, res, conn) => {
    res.json(await painelInadimplencia(conn));
}, 'Erro ao carregar inadimplência'));

router.post('/cobrar', handler(async (req, res, conn) => {
    const responsavelId = toId(req.body?.responsavel_id), alunoId = toId(req.body?.aluno_id);
    if (!responsavelId && !alunoId) throw new HttpError(400, 'Informe o responsável ou o aluno.');
    const r = await cobrarAgora(conn, { responsavelId, alunoId });
    if (r.sem_whatsapp) throw new HttpError(400, 'Responsável sem WhatsApp cadastrado (ou com avisos desligados).');
    res.json(r);
}, 'Erro ao enviar cobrança'));

router.post('/alunos/:id/suspender', handler(async (req, res, conn) => {
    const motivo = str(req.body?.motivo) || 'Mensalidade em atraso';
    const ok = await suspenderAluno(conn, await daEmpresa(conn, 'alunos', parseId(req), { nome: 'Aluno' }), { motivo, avisar: req.body?.avisar !== false });
    if (!ok) throw new HttpError(400, 'Aluno não encontrado ou já suspenso.');
    res.json({ success: true });
}, 'Erro ao suspender'));

router.post('/alunos/:id/reativar', handler(async (req, res, conn) => {
    const ok = await reativarAluno(conn, await daEmpresa(conn, 'alunos', parseId(req), { nome: 'Aluno' }), { avisar: req.body?.avisar !== false });
    if (!ok) throw new HttpError(400, 'Aluno não está suspenso.');
    res.json({ success: true });
}, 'Erro ao reativar'));

router.post('/regua/executar', handler(async (req, res, conn) => {
    res.json(await executarRegua(conn));
}, 'Erro ao executar a régua'));

// ---------- lucro por rota ----------
router.get('/lucro', handler(async (req, res, conn) => {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : hojeBR().slice(0, 7);
    res.json(await lucroPorRota(conn, mes));
}, 'Erro ao calcular lucro'));

router.get('/custos', handler(async (req, res, conn) => res.json(await listarCustos(conn)), 'Erro ao carregar custos'));

router.put('/custos', handler(async (req, res, conn) => {
    for (const v of Array.isArray(req.body?.veiculos) ? req.body.veiculos : []) {
        if (toId(v.id)) await conn.query('UPDATE frota SET custo_fixo_mensal = ? WHERE id = ? AND empresa_id = ?', [v.custo_fixo_mensal === '' || v.custo_fixo_mensal == null ? null : num(v.custo_fixo_mensal), toId(v.id), empresaId()]);
    }
    for (const m of Array.isArray(req.body?.motoristas) ? req.body.motoristas : []) {
        if (toId(m.id)) await conn.query('UPDATE motoristas SET custo_mensal = ? WHERE id = ? AND empresa_id = ?', [m.custo_mensal === '' || m.custo_mensal == null ? null : num(m.custo_mensal), toId(m.id), empresaId()]);
    }
    res.json(await listarCustos(conn));
}, 'Erro ao salvar custos'));

export default router;
