// Frota: situação real de cada van, planos de manutenção preventiva, consumo e ficha completa.
import { empresaId } from '../lib/tenant.js';
import { hojeBR } from './viagens.js';
import { painelDocumentos } from './documentos.js';

const r2 = (v) => Math.round(v * 100) / 100;
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
function somarMeses(iso, m) {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + Number(m));
    return d.toISOString().slice(0, 10);
}

// Planos sugeridos para van escolar (o dono ajusta os intervalos)
export const PLANOS_PADRAO = [
    { nome: 'Troca de óleo e filtros', intervalo_km: 10000, intervalo_meses: 6 },
    { nome: 'Rodízio e calibragem dos pneus', intervalo_km: 10000, intervalo_meses: null },
    { nome: 'Revisão dos freios', intervalo_km: 20000, intervalo_meses: 12 },
    { nome: 'Revisão geral (suspensão, elétrica, ar)', intervalo_km: null, intervalo_meses: 12 },
    { nome: 'Vistoria do transporte escolar', intervalo_km: null, intervalo_meses: 6 },
];

/** Situação de um plano: vencido | proximo (≤10% do km ou ≤15 dias) | ok. */
export function situacaoPlano(p, kmAtual, hoje = hojeBR()) {
    const out = { proximo_km: null, faltam_km: null, proxima_data: null, faltam_dias: null, situacao: 'ok' };
    if (p.intervalo_km && p.ultimo_km !== null && p.ultimo_km !== undefined) {
        out.proximo_km = Number(p.ultimo_km) + Number(p.intervalo_km);
        out.faltam_km = out.proximo_km - Number(kmAtual || 0);
    }
    if (p.intervalo_meses && p.ultima_data) {
        out.proxima_data = somarMeses(p.ultima_data, p.intervalo_meses);
        out.faltam_dias = diasEntre(hoje, out.proxima_data);
    }
    const semBase = (p.intervalo_km && (p.ultimo_km === null || p.ultimo_km === undefined)) && (!p.intervalo_meses || !p.ultima_data);
    if (semBase) out.situacao = 'sem_registro';
    else if ((out.faltam_km !== null && out.faltam_km <= 0) || (out.faltam_dias !== null && out.faltam_dias < 0)) out.situacao = 'vencido';
    else if ((out.faltam_km !== null && out.faltam_km <= Number(p.intervalo_km) * 0.1) || (out.faltam_dias !== null && out.faltam_dias <= 15)) out.situacao = 'proximo';
    return out;
}

export async function planosDaEmpresa(conn, veiculoId = null) {
    const emp = empresaId();
    const rows = await conn.query(`
        SELECT p.id, p.veiculo_id, p.nome, p.intervalo_km, p.intervalo_meses, p.ultimo_km, DATE_FORMAT(p.ultima_data,'%Y-%m-%d') AS ultima_data,
               f.placa, f.km_atual
        FROM manutencao_planos p JOIN frota f ON f.id = p.veiculo_id AND f.empresa_id = p.empresa_id
        WHERE p.empresa_id = ? AND p.ativo = 1 ${veiculoId ? 'AND p.veiculo_id = ?' : ''}
        ORDER BY f.placa, p.nome`, veiculoId ? [emp, veiculoId] : [emp]);
    return rows.map(p => ({ ...p, ...situacaoPlano(p, p.km_atual) }));
}

/** Consumo (km/l) e custo por km a partir dos abastecimentos de um período. */
function consumo(abast) {
    const comKm = abast.filter(a => a.km_atual).sort((a, b) => a.km_atual - b.km_atual);
    const litros = abast.reduce((s, a) => s + Number(a.litros || 0), 0);
    const gasto = abast.reduce((s, a) => s + Number(a.custo_total || 0), 0);
    // o primeiro abastecimento do período só marca o km inicial (o combustível dele foi rodado antes)
    const km = comKm.length >= 2 ? comKm[comKm.length - 1].km_atual - comKm[0].km_atual : 0;
    const litrosRodados = comKm.length >= 2 ? comKm.slice(1).reduce((s, a) => s + Number(a.litros || 0), 0) : 0;
    return {
        litros: r2(litros), gasto: r2(gasto), km,
        km_por_litro: km > 0 && litrosRodados > 0 ? r2(km / litrosRodados) : null,
        custo_km: km > 0 ? r2(gasto / km) : null,
    };
}

/** Desempenho do mês atual comparado ao mês anterior (dados reais dos abastecimentos). */
export async function desempenho(conn, veiculoId, hoje = hojeBR()) {
    const ini = `${hoje.slice(0, 7)}-01`;
    const iniAnt = somarMeses(ini, -1);
    const rows = await conn.query(`
        SELECT litros, custo_total, km_atual, DATE_FORMAT(data_abastecimento,'%Y-%m-%d') AS data
        FROM abastecimentos WHERE empresa_id = ? AND veiculo_id = ? AND data_abastecimento >= ? ORDER BY data_abastecimento, id`,
        [empresaId(), veiculoId, iniAnt]);
    const atual = consumo(rows.filter(r => r.data >= ini));
    const anterior = consumo(rows.filter(r => r.data < ini));
    const variacao = (a, b) => (a !== null && b ? Math.round(((a - b) / b) * 100) : null);
    return {
        atual, anterior,
        variacao_consumo_pct: variacao(atual.km_por_litro, anterior.km_por_litro),
        variacao_custo_km_pct: variacao(atual.custo_km, anterior.custo_km),
    };
}

/**
 * Lista da frota com a situação real de cada van e os alertas:
 * em viagem agora · em manutenção · bloqueada (documento obrigatório vencido/faltando) · sem motorista · disponível.
 */
export async function painelFrota(conn) {
    const emp = empresaId(), hoje = hojeBR();
    const vans = await conn.query(`
        SELECT f.id, f.placa, f.modelo, f.ano, f.cor, f.lugares, f.capacidade, f.acessivel, f.status, f.km_atual, f.renavam, f.chassi,
               f.motorista_id, f.escola_id, f.rastreador_id, f.custo_fixo_mensal, (f.foto IS NOT NULL) AS tem_foto,
               m.nome AS motorista_nome, e.nome AS escola_nome
        FROM frota f LEFT JOIN motoristas m ON m.id = f.motorista_id AND m.empresa_id = f.empresa_id
        LEFT JOIN escolas e ON e.id = f.escola_id AND e.empresa_id = f.empresa_id
        WHERE f.empresa_id = ? ORDER BY f.placa`, [emp]);
    if (!vans.length) return [];
    const ids = vans.map(v => v.id);
    const rotas = await conn.query(`
        SELECT r.id, r.nome, r.veiculo_id, r.motorista_id, mo.nome AS motorista_nome, TIME_FORMAT(r.hora_saida,'%H:%i') AS saida,
               (SELECT COUNT(*) FROM rota_alunos ra WHERE ra.rota_id = r.id) AS alunos
        FROM rotas r LEFT JOIN motoristas mo ON mo.id = r.motorista_id
        WHERE r.empresa_id = ? AND r.status = 'Ativa' AND r.veiculo_id IN (?) ORDER BY r.hora_saida`, [emp, ids]);
    const emViagem = await conn.query(`
        SELECT v.id, v.veiculo_id, r.nome AS rota_nome FROM viagens v JOIN rotas r ON r.id = v.rota_id
        WHERE v.empresa_id = ? AND v.data = ? AND v.status = 'em_andamento'`, [emp, hoje]);
    const manut = await conn.query(`SELECT veiculo_id, status FROM manutencoes WHERE empresa_id = ? AND status IN ('Pendente','Em Andamento') AND veiculo_id IN (?)`, [emp, ids]);
    const docs = (await painelDocumentos(conn, { entidade: 'veiculo' })).itens;
    const planos = await planosDaEmpresa(conn);

    return vans.map(v => {
        const minhas = rotas.filter(r => r.veiculo_id === v.id);
        const viagem = emViagem.find(x => x.veiculo_id === v.id);
        const pend = docs.find(d => d.entidade_id === v.id)?.pendencias || [];
        const bloqueio = pend.filter(p => p.situacao === 'vencido' || p.situacao === 'faltando');
        const meusPlanos = planos.filter(p => p.veiculo_id === v.id);
        const emManut = v.status === 'Manutenção' || manut.some(m => m.veiculo_id === v.id && m.status === 'Em Andamento');
        const temMotorista = !!v.motorista_id || minhas.some(r => r.motorista_id);
        let situacao = 'disponivel', motivo = minhas.length ? `${minhas.length} rota(s)` : 'Sem rota';
        if (v.status === 'Inativa') { situacao = 'inativa'; motivo = 'Fora de uso'; }
        else if (viagem) { situacao = 'em_viagem'; motivo = viagem.rota_nome; }
        else if (emManut) { situacao = 'manutencao'; motivo = 'Em manutenção'; }
        else if (bloqueio.length) { situacao = 'bloqueada'; motivo = bloqueio.map(b => b.nome).join(', '); }
        else if (minhas.length && !temMotorista) { situacao = 'sem_motorista'; motivo = 'Rota sem motorista'; }
        const lugares = v.lugares || Number(String(v.capacidade || '').match(/\d+/)?.[0]) || null;
        const maiorRota = Math.max(0, ...minhas.map(r => Number(r.alunos)));
        return {
            ...v, acessivel: !!v.acessivel, tem_foto: !!Number(v.tem_foto), lugares,
            situacao, motivo, viagem_id: viagem?.id || null,
            rotas: minhas.map(r => ({ id: r.id, nome: r.nome, saida: r.saida, alunos: Number(r.alunos), motorista_nome: r.motorista_nome })),
            motorista_nome: v.motorista_nome || minhas.find(r => r.motorista_nome)?.motorista_nome || null,
            lotacao: lugares ? { alunos: maiorRota, lugares, pct: Math.round((maiorRota / lugares) * 100) } : null,
            alertas: {
                documentos: pend.map(p => ({ nome: p.nome, situacao: p.situacao, dias: p.dias })),
                manutencao: meusPlanos.filter(p => p.situacao === 'vencido' || p.situacao === 'proximo').map(p => ({ nome: p.nome, situacao: p.situacao, faltam_km: p.faltam_km, faltam_dias: p.faltam_dias })),
                pendentes: manut.filter(m => m.veiculo_id === v.id && m.status === 'Pendente').length,
            },
        };
    });
}

/** Ficha completa de uma van. */
export async function fichaVeiculo(conn, id) {
    const emp = empresaId();
    const painel = (await painelFrota(conn)).find(v => v.id === id);
    const docs = (await painelDocumentos(conn, { entidade: 'veiculo', ids: [id] })).itens[0]?.documentos || [];
    const manutencoes = await conn.query(`
        SELECT id, tipo, servico, status, custo, origem, km_execucao, observacao,
               DATE_FORMAT(data_agendada,'%Y-%m-%d') AS data_agendada, TIME_FORMAT(hora_agendada,'%H:%i') AS hora_agendada,
               DATE_FORMAT(data_conclusao,'%Y-%m-%d') AS data_conclusao
        FROM manutencoes WHERE empresa_id = ? AND veiculo_id = ? ORDER BY COALESCE(data_conclusao, data_agendada) DESC, id DESC LIMIT 50`, [emp, id]);
    const abastecimentos = await conn.query(`
        SELECT id, litros, valor_unitario, custo_total, km_atual, tipo_combustivel, posto, DATE_FORMAT(data_abastecimento,'%Y-%m-%d') AS data
        FROM abastecimentos WHERE empresa_id = ? AND veiculo_id = ? ORDER BY data_abastecimento DESC, id DESC LIMIT 30`, [emp, id]);
    const viagens = await conn.query(`
        SELECT v.id, DATE_FORMAT(v.data,'%Y-%m-%d') AS data, v.status, r.nome AS rota_nome, m.nome AS motorista_nome,
               DATE_FORMAT(v.iniciada_em,'%H:%i') AS inicio, DATE_FORMAT(v.concluida_em,'%H:%i') AS fim
        FROM viagens v JOIN rotas r ON r.id = v.rota_id LEFT JOIN motoristas m ON m.id = v.motorista_id
        WHERE v.empresa_id = ? AND v.veiculo_id = ? ORDER BY v.data DESC, v.id DESC LIMIT 15`, [emp, id]);
    const checklists = await conn.query(`
        SELECT c.id, DATE_FORMAT(c.data_registro,'%Y-%m-%dT%H:%i') AS data, c.resolvido, c.observacoes, m.nome AS motorista_nome,
               c.freios, c.pneus, c.oleo, c.luzes, c.limpeza, c.cintos, c.extintor
        FROM checklist_diario c LEFT JOIN motoristas m ON m.id = c.motorista_id
        WHERE c.empresa_id = ? AND c.veiculo_id = ? ORDER BY c.data_registro DESC LIMIT 15`, [emp, id]);
    const mes = hojeBR().slice(0, 7);
    const [[comb], [man]] = await Promise.all([
        conn.query(`SELECT COALESCE(SUM(custo_total),0) v FROM abastecimentos WHERE empresa_id = ? AND veiculo_id = ? AND DATE_FORMAT(data_abastecimento,'%Y-%m') = ?`, [emp, id, mes]),
        conn.query(`SELECT COALESCE(SUM(custo),0) v FROM manutencoes WHERE empresa_id = ? AND veiculo_id = ? AND status <> 'Cancelada' AND DATE_FORMAT(COALESCE(data_conclusao, data_agendada),'%Y-%m') = ?`, [emp, id, mes]),
    ]);
    const itens = ['freios', 'pneus', 'oleo', 'luzes', 'limpeza', 'cintos', 'extintor'];
    return {
        veiculo: painel,
        documentos: docs,
        planos: await planosDaEmpresa(conn, id),
        manutencoes: manutencoes.map(m => ({ ...m, custo: Number(m.custo || 0) })),
        abastecimentos: abastecimentos.map(a => ({ ...a, litros: Number(a.litros), custo_total: Number(a.custo_total), valor_unitario: Number(a.valor_unitario) })),
        desempenho: await desempenho(conn, id),
        custos_mes: { combustivel: Number(comb.v), manutencao: Number(man.v), fixo: Number(painel?.custo_fixo_mensal || 0), total: r2(Number(comb.v) + Number(man.v) + Number(painel?.custo_fixo_mensal || 0)) },
        viagens,
        checklists: checklists.map(c => ({ id: c.id, data: c.data, resolvido: !!c.resolvido, observacoes: c.observacoes, motorista_nome: c.motorista_nome, problemas: itens.filter(i => c[i] === 'error') })),
    };
}

/** Problema marcado no checklist vira manutenção pendente (para não ser esquecido). */
export async function manutencaoDoChecklist(conn, { veiculoId, checklistId, valores, observacoes }) {
    const NOMES = { freios: 'freios', pneus: 'pneus', oleo: 'óleo/água', luzes: 'luzes', limpeza: 'limpeza/portas', cintos: 'cintos', extintor: 'extintor/kit' };
    const problemas = Object.keys(NOMES).filter(k => valores[k] === 'error');
    if (!problemas.length) return null;
    const r = await conn.query(
        `INSERT INTO manutencoes (empresa_id, veiculo_id, tipo, servico, custo, status, data_agendada, origem, checklist_id, observacao)
         VALUES (?, ?, 'Corretiva', ?, 0, 'Pendente', ?, 'checklist', ?, ?)`,
        [empresaId(), veiculoId, `Checklist: problema em ${problemas.map(p => NOMES[p]).join(', ')}`.slice(0, 255), hojeBR(), checklistId, observacoes || null]);
    return Number(r.insertId);
}

/** Resumo diário de manutenção preventiva no WhatsApp do gestor (junto com o de documentos). */
export async function linhasManutencao(conn) {
    return (await planosDaEmpresa(conn))
        .filter(p => p.situacao === 'vencido' || (p.situacao === 'proximo' && (p.faltam_dias === 7 || p.faltam_dias === 1 || (p.faltam_km !== null && p.faltam_km <= 300))))
        .map(p => `• ${p.placa}: ${p.nome} — ${p.situacao === 'vencido' ? 'VENCIDA' : p.faltam_dias !== null && p.faltam_dias <= 15 ? `em ${p.faltam_dias} dia(s)` : `faltam ${p.faltam_km} km`}`);
}
