// Painel inicial: indicadores, alertas do sino, gestão da frota e alunos por escola (antes no index.js)
import { Router } from 'express';
import { handler } from '../lib/http.js';
import { empresaId } from '../lib/tenant.js';
import { planoDaEmpresa, PLANOS } from '../services/planos.js';

const router = Router();
const VE_FINANCEIRO = ['dono', 'financeiro'];

async function alertas(conn) {
    const emp = empresaId();
    const manutencoes = await conn.query(`
        SELECT f.placa, m.servico, m.data_agendada
        FROM manutencoes m JOIN frota f ON m.veiculo_id = f.id AND f.empresa_id = m.empresa_id
        WHERE m.empresa_id = ? AND m.status = 'Pendente' AND m.data_agendada IS NOT NULL AND m.data_agendada > '2000-01-01'
          AND m.data_agendada <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`, [emp]);
    const cnhVencendo = await conn.query(`
        SELECT nome, vencimento_cnh FROM motoristas
        WHERE empresa_id = ? AND status = 'Ativo' AND vencimento_cnh IS NOT NULL AND vencimento_cnh > '2000-01-01'
          AND vencimento_cnh <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)`, [emp]);
    const [inad] = await conn.query("SELECT COUNT(*) AS total FROM mensalidades WHERE empresa_id = ? AND status = 'Atrasado'", [emp]);
    return { manutencoes, cnhVencendo, inadimplentesCount: Number(inad.total || 0) };
}

router.get('/dashboard', handler(async (req, res, conn) => {
    const emp = empresaId();
    const financeiro = VE_FINANCEIRO.includes(req.user.papel);
    const [totalAlunos] = await conn.query("SELECT COUNT(*) AS total FROM alunos WHERE empresa_id = ? AND status = 'Ativo'", [emp]);
    const [vansAtivas] = await conn.query("SELECT COUNT(*) AS total FROM frota WHERE empresa_id = ? AND status IN ('Disponível', 'Em Rota')", [emp]);
    let receita = 0, atrasos = 0, grafico = [];
    if (financeiro) {
        const [r] = await conn.query(`
            SELECT SUM(valor) AS total FROM mensalidades
            WHERE empresa_id = ? AND status = 'Pago' AND DATE_FORMAT(data_pagamento, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`, [emp]);
        const [a] = await conn.query("SELECT SUM(valor) AS total FROM mensalidades WHERE empresa_id = ? AND status = 'Atrasado'", [emp]);
        receita = Number(r.total || 0); atrasos = Number(a.total || 0);
        grafico = (await conn.query(`
            SELECT DATE_FORMAT(data_pagamento, '%Y-%m') AS mes, SUM(valor) AS total FROM mensalidades
            WHERE empresa_id = ? AND status = 'Pago' AND data_pagamento >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY mes ORDER BY mes ASC`, [emp])).map(g => ({ mes: g.mes, total: Number(g.total || 0) }));
    }
    const al = await alertas(conn);
    res.json({
        kpis: { totalAlunos: Number(totalAlunos.total || 0), vansAtivas: Number(vansAtivas.total || 0), receitaMensal: receita, atrasos },
        financeiro_visivel: financeiro,
        grafico,
        alertas: { ...al, inadimplentesCount: financeiro ? al.inadimplentesCount : 0 },
    });
}, 'Erro ao buscar dados do dashboard'));

router.get('/notifications', handler(async (req, res, conn) => {
    const al = await alertas(conn);
    res.json({ ...al, inadimplentesCount: VE_FINANCEIRO.includes(req.user.papel) ? al.inadimplentesCount : 0 });
}, 'Erro ao buscar notificações'));

// Um veículo pode fazer várias viagens (rotas) por dia: as rotas são agregadas numa linha só
router.get('/fleet/management', handler(async (req, res, conn) => {
    const rows = await conn.query(`
        SELECT f.id AS veiculo_id, f.placa, f.modelo, f.ano, f.capacidade, f.status AS veiculo_status, f.rastreador_id,
               f.motorista_id AS motorista_fixo_id,
               COALESCE(m_fixo.nome, m_rota.nome) AS motorista_nome, COALESCE(m_fixo.telefone, m_rota.telefone) AS motorista_telefone,
               rr.rota_id, rr.rota_nome, rr.rota_periodo, rr.total_rotas, esc.id AS escola_id, esc.nome AS escola_nome
        FROM frota f
        LEFT JOIN motoristas m_fixo ON f.motorista_id = m_fixo.id AND m_fixo.empresa_id = f.empresa_id
        LEFT JOIN (
            SELECT veiculo_id, MIN(id) AS rota_id,
                   GROUP_CONCAT(nome ORDER BY hora_saida, nome SEPARATOR ', ') AS rota_nome,
                   GROUP_CONCAT(DISTINCT periodo ORDER BY periodo SEPARATOR ', ') AS rota_periodo,
                   COUNT(*) AS total_rotas, MIN(motorista_id) AS motorista_id
            FROM rotas WHERE veiculo_id IS NOT NULL AND empresa_id = ? GROUP BY veiculo_id
        ) rr ON rr.veiculo_id = f.id
        LEFT JOIN motoristas m_rota ON rr.motorista_id = m_rota.id AND m_rota.empresa_id = f.empresa_id
        LEFT JOIN escolas esc ON f.escola_id = esc.id AND esc.empresa_id = f.empresa_id
        WHERE f.empresa_id = ?
        ORDER BY f.modelo ASC`, [empresaId(), empresaId()]);
    res.json(rows.map(r => ({ ...r, total_rotas: Number(r.total_rotas || 0) })));
}, 'Erro ao buscar gestão da frota'));

router.get('/students/by-school', handler(async (req, res, conn) => {
    res.json(await conn.query(`
        SELECT a.nome, e.nome AS escola, a.responsavel_telefone, a.valor_mensalidade
        FROM alunos a JOIN escolas e ON a.escola_id = e.id AND e.empresa_id = a.empresa_id
        WHERE a.empresa_id = ? AND a.anonimizado_em IS NULL`, [empresaId()]));
}, 'Erro ao buscar alunos por escola'));

// Meu plano: uso atual e planos disponíveis
router.get('/plano', handler(async (req, res, conn) => {
    res.json({ atual: await planoDaEmpresa(conn, empresaId()), planos: Object.entries(PLANOS).filter(([id]) => id !== 'completo').map(([id, p]) => ({ id, ...p })) });
}, 'Erro ao ler o plano'));

export default router;
