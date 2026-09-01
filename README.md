# 🚐 Vancontrol — Plataforma SaaS de Gestão para Transporte Escolar

[![React](https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/Licen%C3%A7a-MIT-green?style=for-the-badge)](LICENSE)

> Plataforma completa e moderna desenvolvida para motoristas e empresas de transporte escolar gerenciarem rotas de alunos, fluxo financeiro, contratos e manutenções de veículos em um único lugar.

---

## 📌 Visão Geral do Projeto

O **Vancontrol** resolve a dor de dezenas de motoristas que ainda utilizam pranchetas e planilhas manuais para gerenciar trajetos diários e cobranças de mensalidades. 

A plataforma digitaliza todo o ciclo operacional: do cadastro e alocação de pontos de embarque/desembarque de alunos, até o controle automático de inadimplência, abastecimentos e revisões de veículos.

---

## ✨ Principais Funcionalidades

### 🗺️ Roteirização e Gestão de Alunos
- **Cadastro Completo de Alunos e Responsáveis:** Contatos de emergência, escolas, turnos e endereços residenciais.
- **Planejamento de Trajetos Inteligentes:** Organização sequencial dos pontos de parada por proximidade geográfica e horários escolares.
- **Controle de Presença Diário:** Check-in rápido de embarque e desembarque para acompanhamento em tempo real.

### 💰 Gestão Financeira Completa
- **Controle de Mensalidades:** Acompanhamento visual de status (Pago, Pendente, Atrasado).
- **Relatórios de Faturamento:** Gráficos interativos com projeção de receita mensal e fluxo de caixa.
- **Gestão de Custos Operacionais:** Registro categorizado de despesas com combustível, pedágios, pneus e manutenções mecânicas.

### 🚐 Gestão de Frotas e Veículos
- **Controle de Manutenção Preventiva:** Alertas para troca de óleo, vistorias obrigatórias e renovação de documentação (IPVA, licenciamento, alvará).
- **Consumo e Abastecimento:** Cálculo de média de consumo (km/L) e custo médio por quilômetro rodado.

---

## 🏗️ Arquitetura e Tecnologias

A aplicação foi construída com arquitetura desacoplada e código fortemente tipado:

```
vancontrol-saas/
├── src/                    # Frontend React + TypeScript
│   ├── components/         # Componentes modulares e reutilizáveis (UI)
│   ├── pages/              # Telas da aplicação (Dashboard, Alunos, Rotas, Financeiro)
│   ├── hooks/              # Custom Hooks para gerenciamento de estado
│   ├── types/              # Interfaces e tipos globais TypeScript
│   └── services/           # Camada de comunicação com a API REST
├── server/                 # Backend Node.js / Express
│   ├── routes/             # Definição de rotas RESTful
│   ├── controllers/        # Lógica de controle e regras de negócio
│   └── database/           # Conexão e esquemas de dados relacionais
└── public/                 # Assets estáticos e ícones
```

### Stack Técnica Detalhada:
- **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide React, Vite.
- **Backend:** Node.js, Express, RESTful APIs, JWT para autenticação segura.
- **Banco de Dados:** Banco relacional estruturado com rotinas de consulta otimizadas.
- **DevOps & Ferramentas:** Git, GitHub, ESLint, Prettier, Postman.

---

## 🚀 Como Executar o Projeto Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 18 ou superior)
- [Git](https://git-scm.com/)

### Passo a Passo:

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/Deividemak/vancontrol-saas.git
   cd vancontrol-saas
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as Variáveis de Ambiente:**
   Copie o arquivo `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```

4. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```

5. **Acesse no navegador:**
   Abra [http://localhost:5173](http://localhost:5173) para visualizar a aplicação.

---

## 👨‍💻 Autor

**Deivide Ferreira de Souza**  
*Desenvolvedor Full Stack*

- 🌐 LinkedIn: [linkedin.com/in/deividmak](https://linkedin.com/in/deividmak)
- 🐙 GitHub: [@Deividemak](https://github.com/Deividemak)
- ✉️ Email: [deividmak@gmail.com](mailto:deividmak@gmail.com)

---

## 📄 Licença

Este projeto está sob a licença [MIT](LICENSE).
