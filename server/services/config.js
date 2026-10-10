import { empresaId } from '../lib/tenant.js';

// Configurações da empresa guardadas no banco (editáveis pelo painel).
const PADROES = {
    empresa: {
        razao_social: process.env.EMPRESA_NOME || 'VanControl', nome_fantasia: process.env.EMPRESA_NOME || 'VanControl',
        cnpj_cpf: '', endereco: '', cidade: 'Brasília', uf: 'DF', telefone: '', email: '',
    },
    precos: {
        base_por_turno: { 'Manhã': 350, 'Tarde': 350, 'Integral': 450, 'Noite': 350 },
        km_incluso: 3,          // distância casa→escola já coberta pelo valor base
        valor_km_extra: 15,     // por km acima do incluso (por mês)
        desconto_irmao_pct: 10, // a partir do 2º filho do mesmo responsável
        proporcional_entrada: true,
        arredondar_para: 5,     // arredonda o valor sugerido para múltiplos de R$ 5
    },
    cobranca: {
        provedor: 'pix_manual',     // pix_manual | asaas
        pix_tipo: 'cpf', pix_chave: '', pix_nome: '', pix_cidade: 'BRASILIA',
        dia_vencimento_padrao: 10,
        multa_pct: 2, juros_mes_pct: 1,
        regua_ativa: true,
        regua_hora: 9,
        regua: [-3, 0, 1, 5, 10],   // dias em relação ao vencimento
        dias_alerta_inadimplencia: 10,
        asaas_ambiente: 'sandbox',
    },
    operacao: {
        alerta_docs_dias: 30,          // avisa quando faltar isso para vencer
        bloquear_docs_vencidos: false, // impede iniciar viagem com documento obrigatório vencido/faltando
        velocidade_max_kmh: 80,
        parada_min: 8,                 // van parada fora de ponto por mais que isso
        desvio_m: 700,                 // distância do trajeto previsto
        sem_sinal_min: 5,
        fim_atrasado_min: 30,          // rota não encerrada X min depois do fim previsto
        telefone_alertas: '',          // WhatsApp do dono/gestor para alertas críticos
    },
    // Asaas da empresa (vazio = empresa principal usa ASAAS_API_KEY / ASAAS_WEBHOOK_TOKEN do .env)
    asaas: { api_key: '', webhook_token: '' },
    // WhatsApp da empresa (vazio = empresa principal usa o .env; as demais ficam em modo teste)
    whatsapp: {
        provedor: '', zapi_instance_id: '', zapi_token: '', zapi_client_token: '', webhook_url: '', webhook_token: '',
    },
    contrato: {
        modelo: `CONTRATO DE PRESTAÇÃO DE SERVIÇO DE TRANSPORTE ESCOLAR

CONTRATADA: {{empresa_razao_social}}, CPF/CNPJ {{empresa_cnpj_cpf}}, {{empresa_endereco}}.
CONTRATANTE: {{responsavel_nome}}, CPF {{responsavel_cpf}}, telefone {{responsavel_telefone}}.
ALUNO(A): {{aluno_nome}}, estudante da escola {{escola_nome}}, turno {{turno}}.
ENDEREÇO DE EMBARQUE/DESEMBARQUE: {{aluno_endereco}}.

1. OBJETO. Transporte do(a) aluno(a) entre o endereço acima e a escola, nos dias letivos do calendário escolar, nos horários informados pela CONTRATADA.

2. VALOR E PAGAMENTO. Mensalidade de {{valor}} ({{valor_extenso}}), com vencimento todo dia {{dia_vencimento}}, por Pix ou outro meio oferecido pela CONTRATADA. Atraso acarreta multa de {{multa_pct}}% e juros de {{juros_mes_pct}}% ao mês.

3. VIGÊNCIA. De {{vigencia_inicio}} a {{vigencia_fim}}, podendo ser renovado.

4. FALTAS. Faltas do(a) aluno(a) não geram desconto. O CONTRATANTE deve avisar ausências pelo portal ou WhatsApp até o horário de saída da van.

5. SEGURANÇA. A CONTRATADA entregará o(a) aluno(a) somente ao CONTRATANTE ou a pessoas autorizadas por ele no portal.

6. RESCISÃO. Qualquer parte pode rescindir com aviso prévio de 30 dias.

7. DADOS PESSOAIS. Os dados do(a) aluno(a) e do CONTRATANTE são usados somente para a prestação deste serviço, conforme a Lei 13.709/2018 (LGPD).

{{cidade}}, {{data_hoje}}.`,
        vigencia_meses: 12,
    },
};

// Política de privacidade (LGPD): retenção e termo que os pais aceitam no portal
const LGPD = {
    retencao_meses_inativos: 24, // aluno inativo e sem pendências há mais que isso é anonimizado
    retencao_dias_gps: 180,      // posições de GPS das viagens
    retencao_dias_acessos: 730,  // registro de quem acessou dados
    termo_versao: 1,
    termo_texto: `TERMO DE PRIVACIDADE E CONSENTIMENTO (LGPD — Lei 13.709/2018)

{{empresa}} trata os dados do responsável e da criança apenas para prestar o serviço de transporte escolar:
• identificação, endereço e escola, para montar a rota e buscar/entregar a criança;
• dados de saúde informados (alergias, medicamentos, necessidades especiais) e contatos de emergência, usados somente para a segurança da criança durante o transporte;
• localização da van durante as viagens, para o acompanhamento em tempo real;
• dados de pagamento, para a cobrança das mensalidades.

Os dados são vistos apenas pela equipe da empresa e pelo motorista/monitor da rota, e não são vendidos nem compartilhados para outros fins. Cada acesso aos dados da criança fica registrado.

Você pode pedir a qualquer momento uma cópia dos seus dados, a correção ou a exclusão (depois do fim do contrato e das obrigações legais), falando com a empresa.

Dados de alunos que deixam o serviço são anonimizados após {{retencao_meses}} meses, e o histórico de GPS é apagado após {{retencao_gps}} dias.`,
};

function padroes(chave, empresa) {
    if (chave === 'empresa') {
        // empresa principal (1) mantém o nome do .env; as demais usam o nome do cadastro
        const nome = empresa?.id === 1 ? (process.env.EMPRESA_NOME || empresa?.nome || 'VanControl') : (empresa?.nome || 'Minha empresa');
        return { ...PADROES.empresa, razao_social: nome, nome_fantasia: nome };
    }
    if (chave === 'lgpd') return { ...LGPD };
    return PADROES[chave];
}

async function empresaDe(conn, id) {
    const [e] = await conn.query('SELECT id, nome FROM empresas WHERE id = ?', [id]);
    return e || { id, nome: null };
}

/** Lê uma configuração da empresa atual (ou da empresa informada). */
export async function lerConfig(conn, chave, emp = empresaId()) {
    if (!(chave in PADROES) && chave !== 'lgpd') throw new Error('Configuração desconhecida');
    const [r] = await conn.query('SELECT valor FROM configuracoes WHERE empresa_id = ? AND chave = ?', [emp, chave]);
    const salvo = r ? JSON.parse(r.valor) : {};
    const base = chave === 'empresa' ? padroes(chave, await empresaDe(conn, emp)) : padroes(chave);
    return { ...base, ...salvo };
}

export async function salvarConfig(conn, chave, valor, emp = empresaId()) {
    if (!(chave in PADROES) && chave !== 'lgpd') throw new Error('Configuração desconhecida');
    const atual = await lerConfig(conn, chave, emp);
    const novo = { ...atual, ...valor };
    await conn.query('INSERT INTO configuracoes (empresa_id, chave, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
        [emp, chave, JSON.stringify(novo)]);
    return novo;
}

// chaves editáveis em Financeiro → Configurações (WhatsApp e Asaas guardam senhas: telas próprias)
export const CHAVES_CONFIG = Object.keys(PADROES).filter(k => k !== 'whatsapp' && k !== 'asaas');
