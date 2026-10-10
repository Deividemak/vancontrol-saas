# 🚐 VanControl — SaaS de gestão e roteirização de transporte escolar

Sistema para donos de van e empresas de transporte escolar (de 1 a 40 vans): rotas no mapa, app do motorista, acompanhamento pelos pais e pela escola, cobrança por Pix/WhatsApp e gestão da frota — com várias empresas no mesmo sistema.

**Stack:** React + TypeScript + Vite + Tailwind · Node.js/Express · MariaDB · Leaflet/OpenStreetMap · OSRM · WhatsApp (Z-API ou webhook/n8n) · Asaas (opcional) · Gemini (opcional)

## Como rodar

1. Copie `.env.example` para `.env` e preencha pelo menos `DB_*` e `JWT_SECRET` (mínimo 32 caracteres).
2. `npm install`
3. Em um terminal: `npm run server` (API na porta 3002 — atualiza o banco sozinho ao iniciar).
4. Em outro: `npm run dev` (painel em http://localhost:3000).

Outros comandos: `npm run migrate` (só atualizar o banco) · `npm run plano -- <empresa_id> <gratis|essencial|profissional|frota|completo>` (mudar o plano de uma empresa).

## O que o sistema faz

| Área | Recursos |
|---|---|
| **Rotas** | Endereços com CEP e ajuste no mapa · ida/volta por turno, várias viagens por van · ordem por arrastar e soltar · otimização (respeita entrada da escola, tempo máximo na van e lotação) · trânsito no horário de pico · pontos de encontro e áreas restritas · simulação "e se" de aluno novo com preço sugerido · agenda da frota e conflitos |
| **App do motorista (celular)** | Rotas do dia, checklist de saída, embarque/desembarque com um toque, funciona sem sinal, GPS, "cheguei no ponto", varredura obrigatória ("nenhuma criança na van"), ocorrências com foto, botão de emergência · **monitor** usa o mesmo app |
| **Pais** | Portal por link (sem senha): van ao vivo e previsão de chegada, faltas, quem pode buscar, Pix/recibos, contrato, conversa · avisos automáticos no WhatsApp (embarcou, chegou, van a 5 min...) · faltas e "cadê a van?" pelo WhatsApp · IA (Gemini) para dúvidas |
| **Escola** | Portal por link: quais alunos estão chegando, em qual van e quando |
| **Operação** | Operação do dia, mapa ao vivo da frota, replay do trajeto, alertas (parada, desvio, velocidade, sem sinal, atraso previsto, rota não encerrada), substituição de motorista/van, documentos com vencimento (CRLV, vistoria, seguro, CNH, cursos), rastreador veicular (GPS/OBD) |
| **Financeiro** | Mensalidades automáticas, Pix copia e cola (ou Asaas), régua de cobrança no WhatsApp, inadimplência e suspensão, recibos, contrato digital com aceite, preço por distância/irmãos/proporcional, custos e lucro por rota |
| **Gestão** | Relatórios (pontualidade, ocupação, km, custo por aluno, CSV) · equipe com perfis (dono, gestor, financeiro, motorista, monitor) · planos por número de vans |
| **LGPD** | Termo aceito pelos pais no portal · registro de quem acessa dados das crianças · exportação e anonimização a pedido · retenção automática (alunos inativos e GPS antigo) |

## Estrutura

```
server/
  index.js          monta as rotas da API e inicia as tarefas automáticas
  migrations.js     atualizações do banco (rodam sozinhas, nunca apagam dados)
  middleware/       login, perfis e permissões
  lib/              utilidades (http, multi-empresa, geometria)
  routes/           endpoints por módulo (alunos, rotas, motorista, portal, financeiro...)
  services/         regras de negócio (cálculo de rota, cobrança, WhatsApp, LGPD...)
src/
  components/       telas do painel
  motorista/        app do motorista/monitor (PWA)
  portal/           portal dos pais
  escola/           portal da escola
```

## Integrações (todas opcionais)

- **WhatsApp:** cada empresa configura em Mensagens → WhatsApp (Z-API ou webhook, ex.: n8n/Evolution API). Sem configuração, fica em modo teste (só mostra no console). Para receber mensagens dos pais é preciso o sistema estar publicado com HTTPS.
- **Asaas:** Financeiro → Configurações (boleto/cartão/Pix com baixa automática).
- **Gemini:** `GEMINI_API_KEY` no `.env`.
- **Rastreador:** Frota → Rastreador mostra o endereço para o rastreador (ou Traccar) enviar as posições.
