// Migrações do banco: rodam automaticamente ao iniciar o servidor (ou com `npm run migrate`).
// Cada migração roda uma única vez e fica registrada na tabela schema_migrations.
// São aditivas: só criam tabelas/colunas novas, nunca apagam dados.

async function colunaExiste(conn, tabela, coluna) {
    const r = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tabela, coluna]
    );
    return r.length > 0;
}

async function tabelaExiste(conn, tabela) {
    const r = await conn.query(
        `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [tabela]);
    return r.length > 0;
}

// Tabelas com dados de cada empresa (as tabelas "filhas" — horários da escola, alunos da rota,
// presenças, posições... — pertencem à empresa do registro pai)
const TABELAS_EMPRESA = [
    'usuarios', 'alunos', 'escolas', 'frota', 'motoristas', 'monitores', 'responsaveis', 'rotas', 'mensalidades',
    'manutencoes', 'abastecimentos', 'checklist_diario', 'viagens', 'calendario_eventos', 'pontos_encontro',
    'areas_restritas', 'ausencias', 'contratos', 'documentos', 'mensagens', 'notificacoes', 'ocorrencias',
    'substituicoes', 'alertas_operacao',
];

async function addColunas(conn, tabela, colunas) {
    for (const [nome, def] of colunas) {
        if (!(await colunaExiste(conn, tabela, nome))) {
            await conn.query(`ALTER TABLE \`${tabela}\` ADD COLUMN \`${nome}\` ${def}`);
        }
    }
}

const ENDERECO = [
    ['cep', 'VARCHAR(9) NULL'],
    ['logradouro', 'VARCHAR(255) NULL'],
    ['numero', 'VARCHAR(20) NULL'],
    ['complemento', 'VARCHAR(100) NULL'],
    ['bairro', 'VARCHAR(100) NULL'],
    ['cidade', 'VARCHAR(100) NULL'],
    ['uf', 'CHAR(2) NULL'],
    ['lat', 'DECIMAL(10,7) NULL'],
    ['lng', 'DECIMAL(10,7) NULL'],
    // pendente | automatico | manual | falhou
    ['geo_status', "VARCHAR(20) NOT NULL DEFAULT 'pendente'"],
    ['geo_precisao', 'VARCHAR(20) NULL'],
];

const MIGRACOES = [
    {
        id: '2026-10-08-fase1-alunos',
        async up(conn) {
            await addColunas(conn, 'alunos', [
                ['data_nascimento', 'DATE NULL'],
                ...ENDERECO,
                ['alergias', 'TEXT NULL'],
                ['condicoes_medicas', 'TEXT NULL'],
                ['medicamentos', 'TEXT NULL'],
                ['necessidades_especiais', 'TEXT NULL'],
                ['tipo_sanguineo', 'VARCHAR(5) NULL'],
                ['observacoes', 'TEXT NULL'],
                ['foto', 'MEDIUMTEXT NULL'],
                ['foto_thumb', 'TEXT NULL'],
            ]);
            await conn.query(`
                CREATE TABLE IF NOT EXISTS aluno_contatos_emergencia (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    aluno_id INT NOT NULL,
                    nome VARCHAR(150) NOT NULL,
                    parentesco VARCHAR(60) NULL,
                    telefone VARCHAR(20) NOT NULL,
                    ordem INT NOT NULL DEFAULT 0,
                    FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
        },
    },
    {
        id: '2026-10-08-fase1-escolas',
        async up(conn) {
            await addColunas(conn, 'escolas', ENDERECO);
            await conn.query(`
                CREATE TABLE IF NOT EXISTS escola_horarios (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    escola_id INT NOT NULL,
                    turno VARCHAR(20) NOT NULL,
                    entrada TIME NULL,
                    saida TIME NULL,
                    UNIQUE KEY uq_escola_turno (escola_id, turno),
                    FOREIGN KEY (escola_id) REFERENCES escolas(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            await conn.query(`
                CREATE TABLE IF NOT EXISTS calendario_eventos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    escola_id INT NULL,
                    data_inicio DATE NOT NULL,
                    data_fim DATE NOT NULL,
                    tipo VARCHAR(20) NOT NULL DEFAULT 'feriado',
                    descricao VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_periodo (data_inicio, data_fim),
                    FOREIGN KEY (escola_id) REFERENCES escolas(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
        },
    },
    {
        id: '2026-10-08-fase1-rotas',
        async up(conn) {
            await conn.query(`
                CREATE TABLE IF NOT EXISTS pontos_encontro (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    nome VARCHAR(150) NOT NULL,
                    referencia VARCHAR(255) NULL,
                    lat DECIMAL(10,7) NOT NULL,
                    lng DECIMAL(10,7) NOT NULL,
                    ativo BOOLEAN NOT NULL DEFAULT true
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            await conn.query(`
                CREATE TABLE IF NOT EXISTS areas_restritas (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    nome VARCHAR(150) NOT NULL,
                    descricao VARCHAR(255) NULL,
                    lat DECIMAL(10,7) NOT NULL,
                    lng DECIMAL(10,7) NOT NULL,
                    raio_m INT NOT NULL DEFAULT 100,
                    ativo BOOLEAN NOT NULL DEFAULT true
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            await addColunas(conn, 'rotas', [
                // ida = casa -> escola | volta = escola -> casa
                ['tipo', "VARCHAR(10) NOT NULL DEFAULT 'ida'"],
                ['hora_saida', 'TIME NULL'],
                ['partida_descricao', 'VARCHAR(255) NULL'],
                ['partida_lat', 'DECIMAL(10,7) NULL'],
                ['partida_lng', 'DECIMAL(10,7) NULL'],
                ['tempo_parada_seg', 'INT NOT NULL DEFAULT 60'],
                ['velocidade_media_kmh', 'INT NOT NULL DEFAULT 25'],
                ['folga_escola_min', 'INT NOT NULL DEFAULT 10'],
                ['tempo_max_bordo_min', 'INT NOT NULL DEFAULT 60'],
                ['status', "VARCHAR(20) NOT NULL DEFAULT 'Ativa'"],
                ['observacoes', 'TEXT NULL'],
                ['hora_fim', 'TIME NULL'],
                ['duracao_seg', 'INT NULL'],
                ['distancia_m', 'INT NULL'],
                ['calculado_em', 'DATETIME NULL'],
            ]);
            await addColunas(conn, 'rota_alunos', [
                ['ordem', 'INT NOT NULL DEFAULT 0'],
                ['ponto_encontro_id', 'INT NULL'],
                ['hora_prevista', 'TIME NULL'],
            ]);
            await conn.query(`
                CREATE TABLE IF NOT EXISTS rota_escolas (
                    rota_id INT NOT NULL,
                    escola_id INT NOT NULL,
                    ordem INT NOT NULL DEFAULT 0,
                    hora_prevista TIME NULL,
                    PRIMARY KEY (rota_id, escola_id),
                    FOREIGN KEY (rota_id) REFERENCES rotas(id) ON DELETE CASCADE,
                    FOREIGN KEY (escola_id) REFERENCES escolas(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            // Ordem inicial para alunos que já estavam em rotas
            await conn.query(`UPDATE rota_alunos SET ordem = aluno_id WHERE ordem = 0`);
        },
    },
    {
        id: '2026-10-09-fase2-operacao',
        async up(conn) {
            // Acesso do motorista ao app
            await addColunas(conn, 'usuarios', [['motorista_id', 'INT NULL']]);
            const idx = await conn.query(`SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND INDEX_NAME = 'uq_usuario_motorista'`);
            if (!idx.length) await conn.query('ALTER TABLE usuarios ADD UNIQUE KEY uq_usuario_motorista (motorista_id)');

            // Checklist diário (a tabela já existe em instalações antigas; garante em instalações novas)
            await conn.query(`
                CREATE TABLE IF NOT EXISTS checklist_diario (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    veiculo_id INT, motorista_id INT,
                    freios VARCHAR(20), pneus VARCHAR(20), oleo VARCHAR(20), luzes VARCHAR(20), limpeza VARCHAR(20), cintos VARCHAR(20),
                    observacoes TEXT, resolvido BOOLEAN DEFAULT false,
                    data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await addColunas(conn, 'checklist_diario', [['extintor', 'VARCHAR(20) NULL']]);

            // Ausências avisadas (pelo painel agora; pelos pais/WhatsApp na Fase 3)
            await conn.query(`
                CREATE TABLE IF NOT EXISTS ausencias (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    aluno_id INT NOT NULL,
                    data_inicio DATE NOT NULL,
                    data_fim DATE NOT NULL,
                    sentido VARCHAR(10) NOT NULL DEFAULT 'ambos',
                    motivo VARCHAR(255) NULL,
                    origem VARCHAR(20) NOT NULL DEFAULT 'painel',
                    criado_por INT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_aus_periodo (data_inicio, data_fim),
                    FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            // Execução de uma rota num dia
            await conn.query(`
                CREATE TABLE IF NOT EXISTS viagens (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    rota_id INT NOT NULL,
                    data DATE NOT NULL,
                    motorista_id INT NULL,
                    veiculo_id INT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'em_andamento',
                    checklist_id INT NULL,
                    iniciada_em DATETIME NULL,
                    concluida_em DATETIME NULL,
                    varredura_em DATETIME NULL,
                    ultima_lat DECIMAL(10,7) NULL,
                    ultima_lng DECIMAL(10,7) NULL,
                    ultima_velocidade DECIMAL(6,2) NULL,
                    ultima_posicao_em DATETIME NULL,
                    UNIQUE KEY uq_viagem_rota_dia (rota_id, data),
                    KEY idx_viagem_data (data),
                    FOREIGN KEY (rota_id) REFERENCES rotas(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            // Situação de cada aluno na viagem
            await conn.query(`
                CREATE TABLE IF NOT EXISTS presencas (
                    viagem_id INT NOT NULL,
                    aluno_id INT NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'previsto',
                    embarque_em DATETIME NULL,
                    desembarque_em DATETIME NULL,
                    embarque_lat DECIMAL(10,7) NULL, embarque_lng DECIMAL(10,7) NULL,
                    desembarque_lat DECIMAL(10,7) NULL, desembarque_lng DECIMAL(10,7) NULL,
                    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (viagem_id, aluno_id),
                    FOREIGN KEY (viagem_id) REFERENCES viagens(id) ON DELETE CASCADE,
                    FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            // Trilha de auditoria: tudo que aconteceu, na ordem, com local e horário do aparelho
            await conn.query(`
                CREATE TABLE IF NOT EXISTS viagem_eventos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    viagem_id INT NOT NULL,
                    uuid VARCHAR(64) NULL,
                    tipo VARCHAR(30) NOT NULL,
                    aluno_id INT NULL,
                    parada_seq INT NULL,
                    lat DECIMAL(10,7) NULL,
                    lng DECIMAL(10,7) NULL,
                    dados TEXT NULL,
                    usuario_id INT NULL,
                    registrado_em DATETIME NOT NULL,
                    recebido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_evento_uuid (uuid),
                    KEY idx_evento_viagem (viagem_id, registrado_em),
                    FOREIGN KEY (viagem_id) REFERENCES viagens(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            await conn.query(`
                CREATE TABLE IF NOT EXISTS viagem_posicoes (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    viagem_id INT NOT NULL,
                    lat DECIMAL(10,7) NOT NULL,
                    lng DECIMAL(10,7) NOT NULL,
                    precisao_m INT NULL,
                    velocidade_kmh DECIMAL(6,2) NULL,
                    registrado_em DATETIME NOT NULL,
                    KEY idx_pos_viagem (viagem_id, registrado_em),
                    FOREIGN KEY (viagem_id) REFERENCES viagens(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            await conn.query(`
                CREATE TABLE IF NOT EXISTS ocorrencias (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    viagem_id INT NULL,
                    uuid VARCHAR(64) NULL,
                    tipo VARCHAR(30) NOT NULL,
                    gravidade VARCHAR(10) NOT NULL DEFAULT 'normal',
                    descricao TEXT NULL,
                    aluno_id INT NULL,
                    foto MEDIUMTEXT NULL,
                    lat DECIMAL(10,7) NULL,
                    lng DECIMAL(10,7) NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'aberta',
                    resolucao TEXT NULL,
                    resolvida_em DATETIME NULL,
                    usuario_id INT NULL,
                    registrado_em DATETIME NOT NULL,
                    recebido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_ocorrencia_uuid (uuid),
                    KEY idx_ocorrencia_status (status, gravidade),
                    FOREIGN KEY (viagem_id) REFERENCES viagens(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
        },
    },
    {
        id: '2026-10-09-fase3-pais',
        async up(conn) {
            await addColunas(conn, 'responsaveis', [
                ['whatsapp_ativo', 'BOOLEAN NOT NULL DEFAULT true'],
                ['portal_versao', 'INT NOT NULL DEFAULT 1'],      // incrementar invalida links antigos
                ['portal_ultimo_acesso', 'DATETIME NULL'],
            ]);
            // Pessoas autorizadas a receber/buscar o aluno
            await conn.query(`
                CREATE TABLE IF NOT EXISTS autorizados_retirada (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    aluno_id INT NOT NULL,
                    nome VARCHAR(150) NOT NULL,
                    parentesco VARCHAR(60) NULL,
                    telefone VARCHAR(20) NULL,
                    documento VARCHAR(30) NULL,
                    valido_ate DATE NULL,
                    observacao VARCHAR(255) NULL,
                    origem VARCHAR(20) NOT NULL DEFAULT 'painel',
                    ativo BOOLEAN NOT NULL DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            // Fila de envio (WhatsApp)
            await conn.query(`
                CREATE TABLE IF NOT EXISTS notificacoes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    viagem_id INT NULL,
                    responsavel_id INT NULL,
                    telefone VARCHAR(20) NOT NULL,
                    tipo VARCHAR(30) NOT NULL,
                    alunos TEXT NULL,
                    dados TEXT NULL,
                    mensagem TEXT NULL,
                    status VARCHAR(15) NOT NULL DEFAULT 'pendente',
                    tentativas INT NOT NULL DEFAULT 0,
                    erro VARCHAR(500) NULL,
                    enviar_apos DATETIME NOT NULL,
                    enviada_em DATETIME NULL,
                    provedor_id VARCHAR(100) NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_notif_fila (status, enviar_apos),
                    KEY idx_notif_viagem (viagem_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            // Evita avisar duas vezes o mesmo fato (ex.: "embarcou" de novo depois de desfazer)
            await conn.query(`
                CREATE TABLE IF NOT EXISTS notificacoes_registro (
                    chave VARCHAR(120) PRIMARY KEY,
                    notificacao_id INT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            // Conversas com os responsáveis (WhatsApp + portal + painel), com registro
            await conn.query(`
                CREATE TABLE IF NOT EXISTS mensagens (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    responsavel_id INT NULL,
                    telefone VARCHAR(20) NULL,
                    direcao VARCHAR(10) NOT NULL,
                    canal VARCHAR(15) NOT NULL,
                    tipo VARCHAR(15) NOT NULL DEFAULT 'mensagem',
                    texto TEXT NOT NULL,
                    usuario_id INT NULL,
                    notificacao_id INT NULL,
                    externo_id VARCHAR(100) NULL,
                    lida BOOLEAN NOT NULL DEFAULT false,
                    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_msg_externo (externo_id),
                    KEY idx_msg_resp (responsavel_id, criado_em),
                    KEY idx_msg_tel (telefone, criado_em)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
        },
    },
    {
        id: '2026-10-09-fase4-financeiro',
        async up(conn) {
            // Configurações da empresa (preços, cobrança, contrato) em chave/valor JSON
            await conn.query(`
                CREATE TABLE IF NOT EXISTS configuracoes (
                    chave VARCHAR(60) PRIMARY KEY,
                    valor MEDIUMTEXT NOT NULL,
                    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            await addColunas(conn, 'mensalidades', [
                ['descricao', 'VARCHAR(255) NULL'],
                ['valor_pago', 'DECIMAL(10,2) NULL'],
                ['forma_pagamento', 'VARCHAR(20) NULL'],
                ['pago_em', 'DATETIME NULL'],
                ['recibo_numero', 'INT NULL'],
                ['observacao', 'VARCHAR(255) NULL'],
                ['gateway', 'VARCHAR(20) NULL'],
                ['gateway_id', 'VARCHAR(60) NULL'],
                ['gateway_url', 'VARCHAR(255) NULL'],
                ['boleto_url', 'VARCHAR(255) NULL'],
                ['pix_copia_cola', 'TEXT NULL'],
                ['pix_qr', 'MEDIUMTEXT NULL'],
                ['registrado_por', 'INT NULL'],
            ]);
            await addColunas(conn, 'alunos', [
                ['inicio_contrato', 'DATE NULL'],
                ['suspenso', 'BOOLEAN NOT NULL DEFAULT false'],
                ['suspensao_motivo', 'VARCHAR(255) NULL'],
                ['suspenso_em', 'DATETIME NULL'],
            ]);
            await addColunas(conn, 'responsaveis', [['cpf_assinatura', 'VARCHAR(14) NULL']]);
            await addColunas(conn, 'motoristas', [['custo_mensal', 'DECIMAL(10,2) NULL']]);
            await addColunas(conn, 'frota', [['custo_fixo_mensal', 'DECIMAL(10,2) NULL']]);
            await conn.query(`
                CREATE TABLE IF NOT EXISTS contratos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    aluno_id INT NOT NULL,
                    responsavel_id INT NULL,
                    status VARCHAR(15) NOT NULL DEFAULT 'pendente',
                    conteudo MEDIUMTEXT NOT NULL,
                    hash_sha256 CHAR(64) NOT NULL,
                    valor DECIMAL(10,2) NULL,
                    vigencia_inicio DATE NULL,
                    vigencia_fim DATE NULL,
                    criado_por INT NULL,
                    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    enviado_em DATETIME NULL,
                    assinado_em DATETIME NULL,
                    assinatura_nome VARCHAR(150) NULL,
                    assinatura_cpf VARCHAR(14) NULL,
                    assinatura_ip VARCHAR(60) NULL,
                    assinatura_user_agent VARCHAR(255) NULL,
                    cancelado_em DATETIME NULL,
                    KEY idx_contrato_aluno (aluno_id),
                    FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            // Eventos de gateways de pagamento (idempotência e auditoria)
            await conn.query(`
                CREATE TABLE IF NOT EXISTS pagamentos_eventos (
                    id VARCHAR(80) PRIMARY KEY,
                    gateway VARCHAR(20) NOT NULL,
                    evento VARCHAR(40) NOT NULL,
                    mensalidade_id INT NULL,
                    corpo MEDIUMTEXT NULL,
                    recebido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
        },
    },
    {
        // Bancos criados por versões antigas podem não ter colunas que o sistema usa. Só acrescenta o que faltar.
        id: '2026-10-09-fase4b-colunas-base',
        async up(conn) {
            const existe = async (t) => (await conn.query(
                'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [t])).length > 0;
            if (!(await existe('abastecimentos'))) {
                await conn.query(`
                    CREATE TABLE abastecimentos (
                        id INT AUTO_INCREMENT PRIMARY KEY, veiculo_id INT NULL, motorista_id INT NULL, data_abastecimento DATE NOT NULL,
                        tipo_combustivel VARCHAR(50) NULL, litros DECIMAL(10,2) NOT NULL DEFAULT 0, valor_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
                        custo_total DECIMAL(10,2) NOT NULL DEFAULT 0, km_atual INT NOT NULL DEFAULT 0, posto VARCHAR(100) NULL, observacoes TEXT NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
            }
            if (!(await existe('manutencoes'))) {
                await conn.query(`
                    CREATE TABLE manutencoes (
                        id INT AUTO_INCREMENT PRIMARY KEY, veiculo_id INT NOT NULL, servico VARCHAR(255) NOT NULL,
                        tipo ENUM('Preventiva','Corretiva','Urgente') NOT NULL DEFAULT 'Preventiva', data_agendada DATE NOT NULL, hora_agendada TIME NULL,
                        status ENUM('Pendente','Em Andamento','Concluída','Cancelada') DEFAULT 'Pendente', custo DECIMAL(10,2) DEFAULT 0.00
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
            }
            const colunas = {
                alunos: [['responsavel_telefone', 'VARCHAR(20) NULL'], ['responsavel_id', 'INT NULL'], ['avatar_url', 'TEXT NULL'], ['dia_vencimento', 'INT NULL DEFAULT 10']],
                mensalidades: [['data_pagamento', 'DATE NULL']],
                responsaveis: [['cpf', 'VARCHAR(20) NULL'], ['email', 'VARCHAR(255) NULL'], ['endereco_residencial', 'TEXT NULL'], ['status', "VARCHAR(20) NULL DEFAULT 'Ativo'"]],
                motoristas: [['telefone', 'VARCHAR(20) NULL'], ['categoria', 'VARCHAR(10) NULL'], ['status', "VARCHAR(20) NULL DEFAULT 'Ativo'"]],
                frota: [['km_atual', 'INT NULL DEFAULT 0'], ['km_ultima_revisao', 'INT NULL DEFAULT 0'], ['km_proxima_revisao', 'INT NULL DEFAULT 10000'],
                        ['motorista_id', 'INT NULL'], ['escola_id', 'INT NULL']],
                escolas: [['endereco', 'TEXT NULL'], ['telefone', 'VARCHAR(20) NULL'], ['responsavel_contato', 'VARCHAR(100) NULL']],
                abastecimentos: [['motorista_id', 'INT NULL'], ['tipo_combustivel', 'VARCHAR(50) NULL'], ['posto', 'VARCHAR(100) NULL'], ['observacoes', 'TEXT NULL']],
                manutencoes: [['hora_agendada', 'TIME NULL'], ['custo', 'DECIMAL(10,2) NULL DEFAULT 0.00']],
                checklist_diario: [['observacoes', 'TEXT NULL'], ['resolvido', 'BOOLEAN NULL DEFAULT false']],
                usuarios: [['role', "VARCHAR(20) NULL DEFAULT 'admin'"]],
            };
            for (const [tabela, cols] of Object.entries(colunas)) {
                if (await existe(tabela)) await addColunas(conn, tabela, cols);
            }
            await conn.query('UPDATE alunos SET dia_vencimento = 10 WHERE dia_vencimento IS NULL');
        },
    },
    {
        id: '2026-10-09-fase5-operacional',
        async up(conn) {
            // Monitores (acompanham as crianças na van)
            await conn.query(`
                CREATE TABLE IF NOT EXISTS monitores (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    nome VARCHAR(150) NOT NULL,
                    telefone VARCHAR(20) NULL,
                    cpf VARCHAR(14) NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'Ativo',
                    observacoes VARCHAR(255) NULL,
                    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            await addColunas(conn, 'rotas', [['monitor_id', 'INT NULL']]);
            await addColunas(conn, 'viagens', [['monitor_id', 'INT NULL'], ['substituicao_id', 'INT NULL']]);
            await addColunas(conn, 'motoristas', [['cpf', 'VARCHAR(14) NULL']]);
            // Documentos com validade (veículo, motorista, monitor); um registro atual por tipo
            await conn.query(`
                CREATE TABLE IF NOT EXISTS documentos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    entidade VARCHAR(15) NOT NULL,
                    entidade_id INT NOT NULL,
                    tipo VARCHAR(30) NOT NULL,
                    numero VARCHAR(60) NULL,
                    emissao DATE NULL,
                    validade DATE NULL,
                    arquivo MEDIUMTEXT NULL,
                    arquivo_nome VARCHAR(150) NULL,
                    observacao VARCHAR(255) NULL,
                    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_documento (entidade, entidade_id, tipo),
                    KEY idx_doc_validade (validade)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            // Troca de motorista/veículo/monitor por um período (a rota original não muda)
            await conn.query(`
                CREATE TABLE IF NOT EXISTS substituicoes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    rota_id INT NOT NULL,
                    data_inicio DATE NOT NULL,
                    data_fim DATE NOT NULL,
                    motorista_id INT NULL,
                    veiculo_id INT NULL,
                    monitor_id INT NULL,
                    motivo VARCHAR(255) NULL,
                    avisado_em DATETIME NULL,
                    criado_por INT NULL,
                    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    cancelada_em DATETIME NULL,
                    KEY idx_sub_periodo (data_inicio, data_fim),
                    FOREIGN KEY (rota_id) REFERENCES rotas(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            // Alertas de anomalia da operação (van parada, desvio, velocidade, sem sinal, rota não encerrada)
            await conn.query(`
                CREATE TABLE IF NOT EXISTS alertas_operacao (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    chave VARCHAR(120) NOT NULL,
                    viagem_id INT NULL,
                    rota_id INT NULL,
                    tipo VARCHAR(30) NOT NULL,
                    nivel VARCHAR(10) NOT NULL DEFAULT 'aviso',
                    mensagem VARCHAR(255) NOT NULL,
                    lat DECIMAL(10,7) NULL,
                    lng DECIMAL(10,7) NULL,
                    criado_em DATETIME NOT NULL,
                    atualizado_em DATETIME NOT NULL,
                    resolvido_em DATETIME NULL,
                    resolvido_por VARCHAR(60) NULL,
                    UNIQUE KEY uq_alerta_chave (chave),
                    KEY idx_alerta_aberto (resolvido_em)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
        },
    },
    {
        // Fase 0: várias empresas no mesmo sistema (multi-empresa), perfis de acesso e LGPD.
        // Tudo o que já existe fica com a empresa 1.
        id: '2026-10-10-fase0-empresas',
        async up(conn) {
            await conn.query(`
                CREATE TABLE IF NOT EXISTS empresas (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    nome VARCHAR(150) NOT NULL,
                    ativo TINYINT(1) NOT NULL DEFAULT 1,
                    plano VARCHAR(20) NOT NULL DEFAULT 'completo',
                    whatsapp_segredo VARCHAR(64) NULL,
                    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_empresa_segredo (whatsapp_segredo)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            const [e1] = await conn.query('SELECT id FROM empresas WHERE id = 1');
            if (!e1) {
                let nome = process.env.EMPRESA_NOME || 'Minha empresa';
                try {
                    const [c] = await conn.query("SELECT valor FROM configuracoes WHERE chave = 'empresa'");
                    const v = c ? JSON.parse(c.valor) : {};
                    nome = v.nome_fantasia || v.razao_social || nome;
                } catch { /* sem configurações ainda */ }
                await conn.query('INSERT INTO empresas (id, nome) VALUES (1, ?)', [nome]);
            }

            for (const t of TABELAS_EMPRESA) {
                if (!(await tabelaExiste(conn, t))) continue;
                if (!(await colunaExiste(conn, t, 'empresa_id'))) {
                    await conn.query(`ALTER TABLE \`${t}\` ADD COLUMN empresa_id INT NOT NULL DEFAULT 1`);
                    await conn.query(`ALTER TABLE \`${t}\` ADD INDEX idx_${t}_empresa (empresa_id)`);
                }
                // sem valor padrão daqui em diante: todo cadastro novo precisa dizer a empresa
                await conn.query(`ALTER TABLE \`${t}\` ALTER COLUMN empresa_id DROP DEFAULT`);
            }

            // configurações passam a ser por empresa
            if (!(await colunaExiste(conn, 'configuracoes', 'empresa_id'))) {
                await conn.query('ALTER TABLE configuracoes ADD COLUMN empresa_id INT NOT NULL DEFAULT 1');
                await conn.query('ALTER TABLE configuracoes DROP PRIMARY KEY, ADD PRIMARY KEY (empresa_id, chave)');
            }
            await conn.query('ALTER TABLE configuracoes ALTER COLUMN empresa_id DROP DEFAULT');

            // placa, CNH e CPF passam a ser únicos dentro de cada empresa (não no sistema todo)
            for (const [t, col] of [['frota', 'placa'], ['motoristas', 'cnh'], ['responsaveis', 'cpf']]) {
                if (!(await tabelaExiste(conn, t))) continue;
                const idx = await conn.query(`
                    SELECT INDEX_NAME, COUNT(*) n, MAX(COLUMN_NAME) col FROM information_schema.STATISTICS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
                    GROUP BY INDEX_NAME`, [t]);
                for (const i of idx) {
                    if (Number(i.n) === 1 && i.col === col) await conn.query(`ALTER TABLE \`${t}\` DROP INDEX \`${i.INDEX_NAME}\``);
                }
                const ja = idx.some(i => i.INDEX_NAME === `uq_${t}_empresa_${col}`);
                if (!ja) await conn.query(`ALTER TABLE \`${t}\` ADD UNIQUE KEY uq_${t}_empresa_${col} (empresa_id, ${col})`);
            }

            if (await tabelaExiste(conn, 'pagamentos_eventos')) await addColunas(conn, 'pagamentos_eventos', [['empresa_id', 'INT NULL']]);

            // perfis: dono, gestor, financeiro, motorista, monitor
            await addColunas(conn, 'usuarios', [
                ['ativo', 'TINYINT(1) NOT NULL DEFAULT 1'],
                ['monitor_id', 'INT NULL'],
                ['ultimo_login', 'DATETIME NULL'],
            ]);
            await conn.query("UPDATE usuarios SET role = 'dono' WHERE role IS NULL OR role IN ('admin', '')");

            // LGPD
            await addColunas(conn, 'alunos', [['inativado_em', 'DATETIME NULL'], ['anonimizado_em', 'DATETIME NULL']]);
            await conn.query("UPDATE alunos SET inativado_em = NOW() WHERE status <> 'Ativo' AND inativado_em IS NULL");
            await addColunas(conn, 'responsaveis', [
                ['anonimizado_em', 'DATETIME NULL'],
                ['consentimento_versao', 'INT NULL'],
                ['consentimento_em', 'DATETIME NULL'],
            ]);
            await conn.query(`
                CREATE TABLE IF NOT EXISTS lgpd_acessos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    empresa_id INT NOT NULL,
                    usuario_id INT NULL,
                    usuario_nome VARCHAR(150) NULL,
                    papel VARCHAR(20) NULL,
                    acao VARCHAR(40) NOT NULL,
                    aluno_id INT NULL,
                    responsavel_id INT NULL,
                    detalhe VARCHAR(255) NULL,
                    ip VARCHAR(60) NULL,
                    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_lgpd_empresa (empresa_id, criado_em),
                    KEY idx_lgpd_aluno (aluno_id),
                    KEY idx_lgpd_resp (responsavel_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            await conn.query(`
                CREATE TABLE IF NOT EXISTS lgpd_consentimentos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    empresa_id INT NOT NULL,
                    responsavel_id INT NOT NULL,
                    versao INT NOT NULL,
                    texto_sha256 CHAR(64) NOT NULL,
                    ip VARCHAR(60) NULL,
                    user_agent VARCHAR(255) NULL,
                    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_consent_resp (responsavel_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
        },
    },
    {
        // Fase 7: portal da escola, rastreador veicular e planos
        id: '2026-10-10-fase7-extras',
        async up(conn) {
            await addColunas(conn, 'escolas', [['portal_versao', 'INT NOT NULL DEFAULT 1']]);
            await addColunas(conn, 'frota', [['rastreador_id', 'VARCHAR(40) NULL']]);
            await addColunas(conn, 'empresas', [['rastreador_segredo', 'VARCHAR(64) NULL']]);
            await addColunas(conn, 'viagem_posicoes', [['fonte', "VARCHAR(12) NOT NULL DEFAULT 'celular'"]]);
        },
    },
    {
        // Frota completa: cadastro detalhado, planos de manutenção preventiva e origem das manutenções
        id: '2026-10-10-frota-excelencia',
        async up(conn) {
            await addColunas(conn, 'frota', [
                ['lugares', 'INT NULL'], ['acessivel', 'TINYINT(1) NOT NULL DEFAULT 0'], ['renavam', 'VARCHAR(20) NULL'],
                ['chassi', 'VARCHAR(30) NULL'], ['cor', 'VARCHAR(30) NULL'], ['foto', 'MEDIUMTEXT NULL'],
            ]);
            // lugares a partir do texto antigo ("20 Lugares")
            const vans = await conn.query('SELECT id, capacidade FROM frota WHERE lugares IS NULL');
            for (const v of vans) {
                const m = String(v.capacidade || '').match(/\d+/);
                if (m) await conn.query('UPDATE frota SET lugares = ? WHERE id = ?', [Number(m[0]), v.id]);
            }
            await addColunas(conn, 'manutencoes', [
                ['km_execucao', 'INT NULL'], ['data_conclusao', 'DATE NULL'], ['plano_id', 'INT NULL'],
                ['origem', "VARCHAR(20) NOT NULL DEFAULT 'manual'"], ['checklist_id', 'INT NULL'], ['observacao', 'TEXT NULL'],
            ]);
            await conn.query(`
                CREATE TABLE IF NOT EXISTS manutencao_planos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    empresa_id INT NOT NULL,
                    veiculo_id INT NOT NULL,
                    nome VARCHAR(120) NOT NULL,
                    intervalo_km INT NULL,
                    intervalo_meses INT NULL,
                    ultimo_km INT NULL,
                    ultima_data DATE NULL,
                    ativo TINYINT(1) NOT NULL DEFAULT 1,
                    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_plano_empresa (empresa_id, veiculo_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
        },
    },
    {
        // Central de checklists: quando e como o problema foi resolvido
        id: '2026-10-10-checklist-central',
        async up(conn) {
            await addColunas(conn, 'checklist_diario', [['resolvido_em', 'DATETIME NULL'], ['resolucao_obs', 'TEXT NULL']]);
        },
    },
];

export async function rodarMigracoes(pool) {
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id VARCHAR(100) PRIMARY KEY,
                aplicada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        const feitas = new Set((await conn.query('SELECT id FROM schema_migrations')).map(r => r.id));
        for (const m of MIGRACOES) {
            if (feitas.has(m.id)) continue;
            console.log(`[migração] aplicando ${m.id}...`);
            await m.up(conn);
            await conn.query('INSERT INTO schema_migrations (id) VALUES (?)', [m.id]);
        }
    } finally {
        if (conn) conn.release();
    }
}

// Execução direta: node server/migrations.js
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('server/migrations.js')) {
    const dotenv = await import('dotenv');
    dotenv.config();
    const { default: pool } = await import('./db.js');
    try {
        await rodarMigracoes(pool);
        console.log('[migração] banco atualizado.');
    } catch (err) {
        console.error('[migração] falhou:', err);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}
