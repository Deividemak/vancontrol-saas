// Servidor da API do VanControl. Cada módulo fica em server/routes/ e a regra de negócio em server/services/.
// Todas as consultas são filtradas pela empresa do usuário logado (multi-empresa).
import express from 'express';
import pool from './db.js';
import dotenv from 'dotenv';

dotenv.config();

const { requireAuth, restringirPapel } = await import('./middleware/auth.js');
const { default: authRouter } = await import('./routes/auth.js');
const { default: painelRouter } = await import('./routes/painel.js');
const { frotaRouter, manutencoesRouter, abastecimentosRouter, checklistsRouter } = await import('./routes/frota.js');
const { motoristasRouter, responsaveisRouter } = await import('./routes/cadastros.js');
const { default: equipeRouter } = await import('./routes/equipe.js');
const { default: lgpdRouter } = await import('./routes/lgpd.js');
const { iniciarRetencao } = await import('./services/lgpd.js');
const { default: escolaPortalRouter } = await import('./routes/escolaPortal.js');
const { default: rastreadorRouter } = await import('./routes/rastreador.js');
const { default: relatoriosRouter } = await import('./routes/relatorios.js');
const { rodarMigracoes } = await import('./migrations.js');
const { default: alunosRouter } = await import('./routes/alunos.js');
const { default: escolasRouter } = await import('./routes/escolas.js');
const { default: rotasRouter } = await import('./routes/rotas.js');
const { default: calendarioRouter } = await import('./routes/calendario.js');
const { default: geoRouter } = await import('./routes/geo.js');
const { pontosRouter, areasRouter } = await import('./routes/pontos.js');
const { default: motoristaAppRouter } = await import('./routes/motoristaApp.js');
const { default: operacaoRouter } = await import('./routes/operacao.js');
const { default: acessoMotoristaRouter } = await import('./routes/acessoMotorista.js');
const { default: portalRouter } = await import('./routes/portal.js');
const { default: webhookRouter } = await import('./routes/whatsappWebhook.js');
const { default: mensagensRouter } = await import('./routes/mensagens.js');
const { iniciarFila } = await import('./services/notificacoes.js');
const { default: financeiroRouter } = await import('./routes/financeiro.js');
const { default: contratosRouter } = await import('./routes/contratos.js');
const { default: asaasWebhookRouter } = await import('./routes/asaasWebhook.js');
const { iniciarRegua } = await import('./services/financeiro.js');
const { documentosRouter, monitoresRouter } = await import('./routes/documentos.js');
const { iniciarMonitor } = await import('./services/monitor.js');

const app = express();
const port = Number(process.env.API_PORT || 3002);

app.use(express.json({ limit: '2mb' })); // fotos de alunos chegam em base64

// CORS: em desenvolvimento o Vite faz proxy de /api (mesma origem), então não é necessário.
// Em produção, liste as origens permitidas em ALLOWED_ORIGINS (separadas por vírgula).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(o => o.trim()).filter(Boolean);

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// Todas as rotas /api exigem login, exceto as listadas em PUBLIC_ROUTES (middleware/auth.js)
app.use('/api', requireAuth);
app.use('/api', restringirPapel);

// Conta, painel e cadastros básicos
app.use('/api/auth', authRouter);
app.use('/api', painelRouter);                        // /dashboard, /notifications, /fleet/management, /students/by-school
app.use('/api/frota', frotaRouter);
app.use('/api/manutencoes', manutencoesRouter);
app.use('/api/abastecimentos', abastecimentosRouter);
app.use('/api/checklists', checklistsRouter);
app.use('/api/motoristas', motoristasRouter);
app.use('/api/responsaveis', responsaveisRouter);

// Fase 7: portal da escola (link mágico), rastreador veicular (segredo na URL) e relatórios
app.use('/api/escola-portal', escolaPortalRouter);
app.use('/api/publico', rastreadorRouter);
app.use('/api/relatorios', relatoriosRouter);

// Equipe (perfis de acesso) e LGPD — só o dono
app.use('/api/equipe', equipeRouter);
app.use('/api/lgpd', lgpdRouter);

// Módulos (Fase 1)
app.use('/api/alunos', alunosRouter);
app.use('/api/escolas', escolasRouter);
app.use('/api/rotas', rotasRouter);
app.use('/api/calendario', calendarioRouter);
app.use('/api/geo', geoRouter);
app.use('/api/pontos-encontro', pontosRouter);
app.use('/api/areas-restritas', areasRouter);

// Módulos (Fase 2)
app.use('/api/motorista', motoristaAppRouter);       // app do motorista
app.use('/api/operacao', operacaoRouter);             // painel: operação do dia
app.use('/api/motoristas-acesso', acessoMotoristaRouter);

// Módulos (Fase 3)
app.use('/api/portal', portalRouter);                 // portal dos pais (link mágico)
app.use('/api/publico', webhookRouter);               // webhook do WhatsApp (segredo na URL)
app.use('/api/mensagens', mensagensRouter);           // painel: conversas e avisos

// Módulos (Fase 4)
app.use('/api/financeiro', financeiroRouter);         // mensalidades, cobrança, inadimplência, lucro
app.use('/api/contratos', contratosRouter);           // contrato digital
app.use('/api/publico', asaasWebhookRouter);          // baixa automática do Asaas (token no cabeçalho)

// Módulos (Fase 5)
app.use('/api/documentos', documentosRouter);         // CRLV, vistoria, seguro, CNH, cursos...
app.use('/api/monitores', monitoresRouter);

try {
    await rodarMigracoes(pool);
} catch (err) {
    console.error('[migração] Falha ao atualizar o banco. Verifique a conexão com o MariaDB.', err.message);
    process.exit(1);
}

// Envio dos avisos de WhatsApp em segundo plano
iniciarFila();
// Régua de cobrança (uma vez por dia, na hora configurada no Financeiro)
if (process.env.REGUA_DESLIGADA !== '1') iniciarRegua();
// Alertas de anomalia (van parada, sem sinal, desvio, velocidade, rota não encerrada) — a cada minuto
if (process.env.MONITOR_DESLIGADO !== '1') iniciarMonitor();
// LGPD: anonimiza alunos inativos antigos e apaga GPS antigo (uma vez por dia, de madrugada)
if (process.env.RETENCAO_DESLIGADA !== '1') iniciarRetencao();

app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${port} (bind 0.0.0.0)`);
});
