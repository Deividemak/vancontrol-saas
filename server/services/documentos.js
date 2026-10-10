// Documentos com vencimento: veículos (CRLV, vistoria escolar, seguro APP...), motoristas e monitores.
import { lerConfig } from './config.js';
import { hojeBR } from './viagens.js';
import { empresaId } from '../lib/tenant.js';

export const TIPOS_DOCUMENTO = {
    veiculo: [
        { id: 'crlv', nome: 'CRLV (licenciamento)', obrigatorio: true, meses: 12 },
        { id: 'vistoria_escolar', nome: 'Vistoria / autorização de transporte escolar', obrigatorio: true, meses: 6 },
        { id: 'seguro_app', nome: 'Seguro APP (passageiros)', obrigatorio: true, meses: 12 },
        { id: 'cronotacografo', nome: 'Aferição do cronotacógrafo', obrigatorio: false, meses: 24 },
        { id: 'alvara_municipal', nome: 'Alvará / permissão municipal', obrigatorio: false, meses: 12 },
    ],
    motorista: [
        { id: 'cnh', nome: 'CNH (categoria D ou E)', obrigatorio: true, meses: 60 },
        { id: 'curso_escolar', nome: 'Curso de transporte escolar', obrigatorio: true, meses: 60 },
        { id: 'antecedentes', nome: 'Certidão de antecedentes criminais', obrigatorio: true, meses: 12 },
        { id: 'toxicologico', nome: 'Exame toxicológico', obrigatorio: true, meses: 30 },
    ],
    monitor: [
        { id: 'antecedentes', nome: 'Certidão de antecedentes criminais', obrigatorio: true, meses: 12 },
        { id: 'curso_monitor', nome: 'Curso de monitor escolar', obrigatorio: false, meses: 60 },
    ],
};
export const ENTIDADES = Object.keys(TIPOS_DOCUMENTO);

const diasAte = (iso, hoje) => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000);

/** Situação de um documento: vencido | vencendo | ok | sem_validade | faltando */
export function situacao(validade, hoje, alertaDias) {
    if (!validade) return { situacao: 'sem_validade', dias: null };
    const dias = diasAte(validade, hoje);
    if (dias < 0) return { situacao: 'vencido', dias };
    if (dias <= alertaDias) return { situacao: 'vencendo', dias };
    return { situacao: 'ok', dias };
}

async function entidades(conn, entidade, ids = null) {
    const filtro = ids ? 'AND id IN (?)' : '';
    const v = ids ? [empresaId(), ids] : [empresaId()];
    if (entidade === 'veiculo') {
        return (await conn.query(`SELECT id, placa AS nome, modelo AS detalhe, NULL AS categoria, NULL AS vencimento_cnh FROM frota WHERE empresa_id = ? ${filtro} ORDER BY placa`, v));
    }
    if (entidade === 'motorista') {
        return (await conn.query(`SELECT id, nome, telefone AS detalhe, categoria, DATE_FORMAT(vencimento_cnh,'%Y-%m-%d') AS vencimento_cnh FROM motoristas WHERE empresa_id = ? AND status = 'Ativo' ${filtro} ORDER BY nome`, v));
    }
    return (await conn.query(`SELECT id, nome, telefone AS detalhe, NULL AS categoria, NULL AS vencimento_cnh FROM monitores WHERE empresa_id = ? AND status = 'Ativo' ${filtro} ORDER BY nome`, v));
}

/**
 * Painel de documentos: cada veículo/motorista/monitor com seus documentos e pendências.
 * filtro opcional: { entidade, ids }
 */
export async function painelDocumentos(conn, { entidade = null, ids = null, hoje = hojeBR() } = {}) {
    const cfg = await lerConfig(conn, 'operacao');
    const alerta = Number(cfg.alerta_docs_dias || 30);
    const itens = [];
    for (const ent of entidade ? [entidade] : ENTIDADES) {
        const lista = await entidades(conn, ent, ids);
        if (!lista.length) continue;
        const docs = await conn.query(`
            SELECT id, entidade_id, tipo, numero, DATE_FORMAT(emissao,'%Y-%m-%d') AS emissao, DATE_FORMAT(validade,'%Y-%m-%d') AS validade,
                   (arquivo IS NOT NULL) AS tem_arquivo, arquivo_nome, observacao
            FROM documentos WHERE empresa_id = ? AND entidade = ? AND entidade_id IN (?)`, [empresaId(), ent, lista.map(e => e.id)]);
        for (const e of lista) {
            const meus = docs.filter(d => d.entidade_id === e.id);
            const documentos = [];
            const pendencias = [];
            for (const t of TIPOS_DOCUMENTO[ent]) {
                let d = meus.find(x => x.tipo === t.id);
                // CNH: usa o vencimento já cadastrado no motorista se o documento não foi lançado
                if (!d && t.id === 'cnh' && e.vencimento_cnh) d = { id: null, tipo: 'cnh', validade: e.vencimento_cnh, numero: null, emissao: null, tem_arquivo: 0, do_cadastro: true };
                if (!d) {
                    documentos.push({ tipo: t.id, nome: t.nome, obrigatorio: t.obrigatorio, situacao: 'faltando', dias: null });
                    if (t.obrigatorio) pendencias.push({ tipo: t.id, nome: t.nome, situacao: 'faltando', dias: null });
                    continue;
                }
                const s = situacao(d.validade, hoje, alerta);
                const doc = { ...d, tem_arquivo: !!Number(d.tem_arquivo), nome: t.nome, obrigatorio: t.obrigatorio, ...s };
                delete doc.entidade_id;
                documentos.push(doc);
                if (s.situacao === 'vencido' || s.situacao === 'vencendo') pendencias.push({ tipo: t.id, nome: t.nome, situacao: s.situacao, dias: s.dias, validade: d.validade });
            }
            if (ent === 'motorista' && e.categoria && !/[DE]/i.test(e.categoria)) {
                pendencias.unshift({ tipo: 'categoria', nome: `CNH categoria ${e.categoria} (precisa ser D ou E)`, situacao: 'irregular', dias: null });
            }
            itens.push({ entidade: ent, entidade_id: e.id, nome: e.nome, detalhe: e.detalhe, documentos, pendencias });
        }
    }
    const conta = (sit) => itens.reduce((n, i) => n + i.pendencias.filter(p => p.situacao === sit).length, 0);
    return {
        alerta_dias: alerta,
        resumo: { vencidos: conta('vencido'), vencendo: conta('vencendo'), faltando: conta('faltando'), irregulares: conta('irregular') },
        itens,
    };
}

/** Pendências que impedem a saída (documento obrigatório vencido/faltando ou CNH de categoria errada). */
export async function bloqueiosDaViagem(conn, { veiculoId, motoristaId }) {
    const motivos = [];
    if (veiculoId) {
        const p = await painelDocumentos(conn, { entidade: 'veiculo', ids: [veiculoId] });
        for (const x of p.itens[0]?.pendencias || []) if (x.situacao !== 'vencendo') motivos.push(`Van ${p.itens[0].nome}: ${x.nome} ${x.situacao}`);
    }
    if (motoristaId) {
        const p = await painelDocumentos(conn, { entidade: 'motorista', ids: [motoristaId] });
        for (const x of p.itens[0]?.pendencias || []) if (x.situacao !== 'vencendo') motivos.push(`Motorista: ${x.nome}${x.situacao === 'irregular' ? '' : ` ${x.situacao}`}`);
    }
    return motivos;
}

const MARCOS = [30, 15, 7, 3, 1, 0, -1]; // dias até vencer em que o gestor é avisado (-1 = venceu ontem)

/** Resumo diário no WhatsApp do gestor: documentos que chegaram a um marco de vencimento hoje. */
export async function avisarDocumentos(conn, hoje = hojeBR()) {
    const cfg = await lerConfig(conn, 'operacao');
    if (!cfg.telefone_alertas) return 0;
    const chave = `docs:e${empresaId()}:${hoje}`;
    if ((await conn.query('SELECT 1 FROM notificacoes_registro WHERE chave = ?', [chave])).length) return 0;
    const p = await painelDocumentos(conn, { hoje });
    const linhas = [];
    for (const i of p.itens) {
        for (const d of i.documentos) {
            if (d.dias === null || d.dias === undefined || !MARCOS.includes(d.dias)) continue;
            const quando = d.dias < 0 ? 'VENCEU' : d.dias === 0 ? 'vence HOJE' : `vence em ${d.dias} dia${d.dias > 1 ? 's' : ''}`;
            linhas.push(`• ${i.nome}: ${d.nome} — ${quando} (${d.validade.split('-').reverse().join('/')})`);
        }
    }
    const { linhasManutencao } = await import('./frota.js');
    const manut = await linhasManutencao(conn);
    if (!linhas.length && !manut.length) return 0;
    const partes = [];
    if (linhas.length) partes.push(`📄 Documentos da frota e equipe:\n${linhas.join('\n')}`);
    if (manut.length) partes.push(`🔧 Manutenção preventiva:\n${manut.join('\n')}`);
    const { enfileirarTexto } = await import('./notificacoes.js');
    const id = await enfileirarTexto(conn, { telefone: cfg.telefone_alertas, texto: `${partes.join('\n\n')}\n\nVeja em Documentos e Frota no VanControl.`, tipo: 'alerta' });
    await conn.query('INSERT IGNORE INTO notificacoes_registro (chave, notificacao_id) VALUES (?, ?)', [chave, id]);
    return linhas.length + manut.length;
}
