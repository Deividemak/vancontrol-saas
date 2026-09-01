import dotenv from 'dotenv';
dotenv.config();

const m = await import('mariadb');
const mariadb = m.default || m;

async function setup() {
    let conn;
    try {
        // Conexão inicial para criar o banco de dados se não existir
        conn = await mariadb.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT || '3306')
        });

        console.log('Conectado ao MariaDB para configuração...');

        // Criar banco de dados
        const dbName = process.env.DB_NAME || 'vancontrol';
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await conn.query(`USE \`${dbName}\``);
        console.log(`Banco de dados "${dbName}" verificado/criado.`);

        // Criar tabelas
        await conn.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                senha VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('Tabela "usuarios" verificada/criada.');

        await conn.query(`
            CREATE TABLE IF NOT EXISTS motoristas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                telefone VARCHAR(20),
                cnh VARCHAR(20) NOT NULL UNIQUE,
                vencimento_cnh DATE NOT NULL,
                categoria VARCHAR(10),
                status VARCHAR(20) DEFAULT 'Ativo'
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS frota (
                id INT AUTO_INCREMENT PRIMARY KEY,
                placa VARCHAR(20) NOT NULL UNIQUE,
                modelo VARCHAR(100) NOT NULL,
                ano INT NOT NULL,
                capacidade VARCHAR(50) NOT NULL,
                status VARCHAR(50) DEFAULT 'Disponível'
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS rotas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                periodo VARCHAR(20),
                veiculo_id INT,
                motorista_id INT,
                FOREIGN KEY (veiculo_id) REFERENCES frota(id),
                FOREIGN KEY (motorista_id) REFERENCES motoristas(id)
            )
        `);

        await conn.query(`
        CREATE TABLE IF NOT EXISTS escolas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(255) NOT NULL,
            endereco TEXT,
            telefone VARCHAR(20),
            responsavel_contato VARCHAR(100),
            tipo ENUM('Pública', 'Particular') DEFAULT 'Particular'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

        // Tabela de Responsáveis (Novo módulo)
        await conn.query(`
        CREATE TABLE IF NOT EXISTS responsaveis (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(255) NOT NULL,
            cpf VARCHAR(20) UNIQUE,
            email VARCHAR(255),
            telefone VARCHAR(20) NOT NULL,
            endereco_residencial TEXT,
            status VARCHAR(20) DEFAULT 'Ativo'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

        // Tabela de Alunos
        await conn.query(`
        CREATE TABLE IF NOT EXISTS alunos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(150) NOT NULL,
            responsavel_telefone VARCHAR(20),
            valor_mensalidade DECIMAL(10,2) NOT NULL,
            escola_id INT,
            responsavel_id INT,
            turno ENUM('Manhã', 'Tarde', 'Integral', 'Noite') DEFAULT 'Manhã',
            status ENUM('Ativo', 'Inativo') DEFAULT 'Ativo',
            avatar_url TEXT,
            FOREIGN KEY (escola_id) REFERENCES escolas(id),
            FOREIGN KEY (responsavel_id) REFERENCES responsaveis(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS mensalidades (
                id INT AUTO_INCREMENT PRIMARY KEY,
                aluno_id INT,
                valor DECIMAL(10,2),
                data_vencimento DATE,
                status VARCHAR(20) DEFAULT 'Pendente',
                FOREIGN KEY (aluno_id) REFERENCES alunos(id)
            )
        `);
        console.log('Tabela "mensalidades" verificada/criada.');

        // Criar tabela rota_alunos (Relacionamento N:N)
        await conn.query(`
            CREATE TABLE IF NOT EXISTS rota_alunos (
                rota_id INT,
                aluno_id INT,
                PRIMARY KEY (rota_id, aluno_id),
                FOREIGN KEY (rota_id) REFERENCES rotas(id),
                FOREIGN KEY (aluno_id) REFERENCES alunos(id)
            )
        `);
        console.log('Tabela "rota_alunos" verificada/criada.');

        console.log('Estrutura de tabelas criada com sucesso.');

        // Seeds
        console.log('Inserindo dados iniciais...');
        await conn.query("INSERT IGNORE INTO motoristas (id, nome, telefone) VALUES (1, 'João Silva', '11999999999'), (2, 'Ana Oliveira', '11888888888')");
        await conn.query("INSERT IGNORE INTO frota (id, placa, modelo, ano, capacidade, status) VALUES (1, 'ABC-1234', 'Mercedes Sprinter', 2023, '20 Lugares', 'Disponível'), (2, 'DEF-5678', 'Renault Master', 2022, '16 Lugares', 'Em Rota')");
        await conn.query("INSERT IGNORE INTO rotas (id, nome, periodo, veiculo_id, motorista_id) VALUES (1, 'Rota Norte', 'Manhã', 1, 1), (2, 'Rota Sul', 'Tarde', 2, 2)");
        await conn.query("INSERT IGNORE INTO escolas (id, nome) VALUES (1, 'Escola Estadual Central'), (2, 'Colégio Objetivo')");
        await conn.query("INSERT IGNORE INTO alunos (id, nome, responsavel_telefone, valor_mensalidade, escola_id) VALUES (1, 'Pedro Santos', '11777777777', 450.00, 1), (2, 'Maria Lima', '11666666666', 500.00, 2)");
        await conn.query("INSERT IGNORE INTO mensalidades (id, aluno_id, valor, data_vencimento, status) VALUES (1, 1, 450.00, '2024-02-10', 'Atrasado'), (2, 2, 500.00, '2024-03-10', 'Pendente')");

        // Seed rota_alunos
        await conn.query("INSERT IGNORE INTO rota_alunos (rota_id, aluno_id) VALUES (1, 1), (2, 2)");

        console.log('Configuração concluída!');

    } catch (err) {
        console.error('Erro no setup:', err);
    } finally {
        if (conn) await conn.end();
        process.exit();
    }
}

setup();
