// Lucro por rota no mês: receita das mensalidades x custos do veículo e do motorista rateados.
import { lugaresDoVeiculo } from './rotaEngine.js';
import { empresaId } from '../lib/tenant.js';

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Regras de rateio:
 *  - receita: mensalidades do mês de cada aluno, divididas entre as rotas ativas dele (ida e volta = metade cada);
 *  - veículo: abastecimentos + manutenções do mês + custo fixo mensal, divididos entre as rotas do veículo pela distância;
 *  - motorista: custo mensal dividido entre as rotas dele pela duração.
 */
export async function lucroPorRota(conn, anoMes) {
    const emp = empresaId();
    const rotas = await conn.query(`
        SELECT r.id, r.nome, r.tipo, r.periodo, r.veiculo_id, r.motorista_id, r.distancia_m, r.duracao_seg,
               f.placa, f.capacidade, m.nome AS motorista_nome
        FROM rotas r LEFT JOIN frota f ON f.id = r.veiculo_id LEFT JOIN motoristas m ON m.id = r.motorista_id
        WHERE r.status = 'Ativa' AND r.empresa_id = ? ORDER BY r.nome`, [emp]);
    const vinculos = await conn.query(`
        SELECT ra.rota_id, ra.aluno_id FROM rota_alunos ra
        JOIN rotas r ON r.id = ra.rota_id AND r.status = 'Ativa' AND r.empresa_id = ?
        JOIN alunos a ON a.id = ra.aluno_id AND a.status = 'Ativo'`, [emp]);
    const mens = await conn.query(`
        SELECT aluno_id, SUM(valor) AS faturado, SUM(CASE WHEN status = 'Pago' THEN COALESCE(valor_pago, valor) ELSE 0 END) AS recebido
        FROM mensalidades WHERE empresa_id = ? AND status <> 'Cancelado' AND DATE_FORMAT(data_vencimento, '%Y-%m') = ? GROUP BY aluno_id`, [emp, anoMes]);
    const veiculos = await conn.query(`
        SELECT f.id, f.placa, COALESCE(f.custo_fixo_mensal, 0) AS fixo,
               COALESCE((SELECT SUM(custo_total) FROM abastecimentos ab WHERE ab.veiculo_id = f.id AND DATE_FORMAT(ab.data_abastecimento, '%Y-%m') = ?), 0) AS combustivel,
               COALESCE((SELECT SUM(custo) FROM manutencoes mn WHERE mn.veiculo_id = f.id AND mn.status <> 'Cancelada' AND DATE_FORMAT(mn.data_agendada, '%Y-%m') = ?), 0) AS manutencao
        FROM frota f WHERE f.empresa_id = ?`, [anoMes, anoMes, emp]);
    const motoristas = await conn.query('SELECT id, nome, COALESCE(custo_mensal, 0) AS custo FROM motoristas WHERE empresa_id = ?', [emp]);

    const rotasDoAluno = new Map();
    for (const v of vinculos) {
        if (!rotasDoAluno.has(v.aluno_id)) rotasDoAluno.set(v.aluno_id, []);
        rotasDoAluno.get(v.aluno_id).push(v.rota_id);
    }
    const receitaAluno = new Map(mens.map(m => [m.aluno_id, { faturado: Number(m.faturado), recebido: Number(m.recebido) }]));

    const linhas = new Map(rotas.map(r => [r.id, {
        rota_id: r.id, nome: r.nome, tipo: r.tipo, periodo: r.periodo, placa: r.placa, motorista_nome: r.motorista_nome,
        alunos: 0, lugares: lugaresDoVeiculo(r.capacidade), receita: 0, recebido: 0, custo_veiculo: 0, custo_motorista: 0,
    }]));
    for (const v of vinculos) {
        const l = linhas.get(v.rota_id);
        l.alunos++;
        const rec = receitaAluno.get(v.aluno_id);
        if (!rec) continue;
        const n = rotasDoAluno.get(v.aluno_id).length;
        l.receita += rec.faturado / n;
        l.recebido += rec.recebido / n;
    }

    // rateio genérico: peso de cada rota (distância/duração); sem peso conhecido, divide igual
    const ratear = (total, rotasDoGrupo, peso, campo) => {
        if (!total || !rotasDoGrupo.length) return;
        const pesos = rotasDoGrupo.map(r => Number(r[peso]) || 0);
        const soma = pesos.reduce((s, p) => s + p, 0);
        rotasDoGrupo.forEach((r, i) => { linhas.get(r.id)[campo] += total * (soma > 0 ? pesos[i] / soma : 1 / rotasDoGrupo.length); });
    };

    const semRota = [];
    for (const v of veiculos) {
        const total = Number(v.fixo) + Number(v.combustivel) + Number(v.manutencao);
        const rs = rotas.filter(r => r.veiculo_id === v.id);
        if (total > 0 && !rs.length) semRota.push({ tipo: 'veiculo', nome: v.placa, valor: r2(total) });
        ratear(total, rs, 'distancia_m', 'custo_veiculo');
    }
    for (const m of motoristas) {
        const total = Number(m.custo);
        const rs = rotas.filter(r => r.motorista_id === m.id);
        if (total > 0 && !rs.length) semRota.push({ tipo: 'motorista', nome: m.nome, valor: r2(total) });
        ratear(total, rs, 'duracao_seg', 'custo_motorista');
    }

    const resultado = [...linhas.values()].map(l => {
        const custo = l.custo_veiculo + l.custo_motorista;
        const lucro = l.receita - custo;
        return {
            ...l, receita: r2(l.receita), recebido: r2(l.recebido), custo_veiculo: r2(l.custo_veiculo), custo_motorista: r2(l.custo_motorista),
            custo_total: r2(custo), lucro: r2(lucro),
            margem_pct: l.receita > 0 ? Math.round((lucro / l.receita) * 1000) / 10 : null,
            custo_por_aluno: l.alunos ? r2(custo / l.alunos) : null,
            ocupacao_pct: l.lugares ? Math.round((l.alunos / l.lugares) * 100) : null,
        };
    });
    const soma = (k) => r2(resultado.reduce((s, l) => s + l[k], 0));
    const totais = { receita: soma('receita'), recebido: soma('recebido'), custo_total: soma('custo_total') + r2(semRota.reduce((s, x) => s + x.valor, 0)) };
    totais.lucro = r2(totais.receita - totais.custo_total);
    totais.margem_pct = totais.receita > 0 ? Math.round((totais.lucro / totais.receita) * 1000) / 10 : null;

    // receita de alunos que não estão em nenhuma rota (entra no total, fora do rateio)
    const foraDeRota = mens.filter(m => !rotasDoAluno.has(m.aluno_id)).reduce((s, m) => s + Number(m.faturado), 0);
    if (foraDeRota) { totais.receita = r2(totais.receita + foraDeRota); totais.lucro = r2(totais.receita - totais.custo_total); totais.margem_pct = totais.receita > 0 ? Math.round((totais.lucro / totais.receita) * 1000) / 10 : null; }

    return { mes: anoMes, rotas: resultado, totais, custos_sem_rota: semRota, receita_sem_rota: r2(foraDeRota) };
}

/** Custos fixos editáveis: custo mensal de cada motorista e custo fixo de cada veículo. */
export async function listarCustos(conn) {
    const veiculos = await conn.query('SELECT id, placa, modelo, custo_fixo_mensal FROM frota WHERE empresa_id = ? ORDER BY placa', [empresaId()]);
    const motoristas = await conn.query(`SELECT id, nome, custo_mensal FROM motoristas WHERE status = 'Ativo' AND empresa_id = ? ORDER BY nome`, [empresaId()]);
    return {
        veiculos: veiculos.map(v => ({ ...v, custo_fixo_mensal: v.custo_fixo_mensal === null ? null : Number(v.custo_fixo_mensal) })),
        motoristas: motoristas.map(m => ({ ...m, custo_mensal: m.custo_mensal === null ? null : Number(m.custo_mensal) })),
    };
}
