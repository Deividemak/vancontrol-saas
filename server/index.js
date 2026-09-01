import express from 'express';
import pool from './db.js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const port = 3002;

app.use(express.json());

app.use(express.json());

// Enable basic CORS for debugging
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const JWT_SECRET = process.env.JWT_SECRET || 'vancontrol_secret_key_123';

// --- Autenticação ---

// Registro de Usuário
app.post('/api/auth/register', async (req, res) => {
    const { nome, email, senha } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();

        // Verificar se usuário já existe
        const existing = await conn.query("SELECT id FROM usuarios WHERE email = ?", [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
        }

        const hashedSenha = await bcrypt.hash(senha, 10);
        const result = await conn.query(
            "INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)",
            [nome, email, hashedSenha]
        );

        const userId = Number(result.insertId);
        const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            token,
            user: { id: userId, nome, email }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao registrar usuário' });
    } finally {
        if (conn) conn.release();
    }
});

// Login de Usuário
app.post('/api/auth/login', async (req, res) => {
    const { email, senha } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT * FROM usuarios WHERE email = ?", [email]);

        if (rows.length === 0) {
            return res.status(400).json({ error: 'E-mail ou senha incorretos.' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(senha, user.senha);

        if (!isMatch) {
            return res.status(400).json({ error: 'E-mail ou senha incorretos.' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            token,
            user: { id: user.id, nome: user.nome, email: user.email }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao fazer login' });
    } finally {
        if (conn) conn.release();
    }
});

// Atualizar Perfil de Usuário
app.put('/api/auth/profile', async (req, res) => {
    const { userId, nome, email } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();

        const existing = await conn.query("SELECT id FROM usuarios WHERE email = ? AND id != ?", [email, userId]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Este e-mail já está em uso por outra conta.' });
        }

        await conn.query("UPDATE usuarios SET nome = ?, email = ? WHERE id = ?", [nome, email, userId]);
        
        res.json({ message: 'Perfil atualizado com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar perfil' });
    } finally {
        if (conn) conn.release();
    }
});

// Alterar Senha
app.put('/api/auth/password', async (req, res) => {
    const { userId, senhaAtual, novaSenha } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT senha FROM usuarios WHERE id = ?", [userId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        const isMatch = await bcrypt.compare(senhaAtual, rows[0].senha);
        if (!isMatch) {
            return res.status(400).json({ error: 'Senha atual incorreta.' });
        }

        const hashedSenha = await bcrypt.hash(novaSenha, 10);
        await conn.query("UPDATE usuarios SET senha = ? WHERE id = ?", [hashedSenha, userId]);
        
        res.json({ message: 'Senha atualizada com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao alterar senha' });
    } finally {
        if (conn) conn.release();
    }
});

// 1. Gestão da Frota (Consulta solicitada pelo usuário)
app.get('/api/fleet/management', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT 
                f.id AS veiculo_id,
                f.placa,
                f.modelo,
                f.ano,
                f.capacidade,
                f.status AS veiculo_status,
                f.motorista_id AS motorista_fixo_id,
                COALESCE(m_fixo.nome, m_rota.nome) AS motorista_nome,
                COALESCE(m_fixo.telefone, m_rota.telefone) AS motorista_telefone,
                r.id AS rota_id,
                r.nome AS rota_nome,
                r.periodo AS rota_periodo,
                esc.id AS escola_id,
                esc.nome AS escola_nome
            FROM frota f
            LEFT JOIN motoristas m_fixo ON f.motorista_id = m_fixo.id
            LEFT JOIN rotas r ON f.id = r.veiculo_id
            LEFT JOIN motoristas m_rota ON r.motorista_id = m_rota.id
            LEFT JOIN escolas esc ON f.escola_id = esc.id
            ORDER BY f.modelo ASC;
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar gestão da frota' });
    } finally {
        if (conn) conn.release();
    }
});

// Listar rotas para seleção
app.get('/api/rotas', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT id, nome, periodo FROM rotas ORDER BY nome ASC");
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar rotas' });
    } finally {
        if (conn) conn.release();
    }
});

// 2. Alunos por Escola (Consulta solicitada pelo usuário)
app.get('/api/students/by-school', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT a.nome, e.nome AS escola, a.responsavel_telefone, a.valor_mensalidade 
            FROM alunos a 
            JOIN escolas e ON a.escola_id = e.id;
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar alunos por escola' });
    } finally {
        if (conn) conn.release();
    }
});

// --- MÓDULO DASHBOARD CENTRAL ---
app.get('/api/dashboard', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();

        // 1. KPIs
        const totalAlunos = await conn.query("SELECT COUNT(*) as total FROM alunos WHERE status = 'Ativo'");
        const vansAtivas = await conn.query("SELECT COUNT(*) as total FROM frota WHERE status IN ('Disponível', 'Em Rota')");
        
        // Receita Mensal (Pagas no mês corrente)
        const receitaMensal = await conn.query(`
            SELECT SUM(valor) as total 
            FROM mensalidades 
            WHERE status = 'Pago' 
            AND DATE_FORMAT(data_pagamento, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        `);

        // Atrasos (Soma total atrasado)
        const atrasos = await conn.query("SELECT SUM(valor) as total FROM mensalidades WHERE status = 'Atrasado'");

        // 2. Gráfico (Últimos 6 meses)
        const mesesGraph = await conn.query(`
            SELECT DATE_FORMAT(data_pagamento, '%Y-%m') as mes, SUM(valor) as total 
            FROM mensalidades 
            WHERE status = 'Pago' AND data_pagamento >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY mes ORDER BY mes ASC
        `);

        // 3. Alertas Críticos
        // Manutenções (Tabela 'manutencoes' foi criada em setup_manutencao_db.js)
        const manutencoes = await conn.query(`
            SELECT f.placa, m.servico, m.data_agendada
            FROM manutencoes m 
            JOIN frota f ON m.veiculo_id = f.id 
            WHERE m.status = 'Pendente' 
            AND m.data_agendada IS NOT NULL 
            AND m.data_agendada > '2000-01-01'
            AND m.data_agendada <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
        `);

        const cnhVencendo = await conn.query(`
            SELECT nome, vencimento_cnh 
            FROM motoristas 
            WHERE status = 'Ativo' 
            AND vencimento_cnh IS NOT NULL 
            AND vencimento_cnh > '2000-01-01'
            AND vencimento_cnh <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
        `);

        const inadimplentesCount = await conn.query("SELECT COUNT(*) as total FROM mensalidades WHERE status = 'Atrasado'");

        res.json({
            kpis: {
                totalAlunos: Number(totalAlunos[0].total || 0),
                vansAtivas: Number(vansAtivas[0].total || 0),
                receitaMensal: Number(receitaMensal[0].total || 0),
                atrasos: Number(atrasos[0].total || 0)
            },
            grafico: mesesGraph.map(g => ({ mes: g.mes, total: Number(g.total || 0) })),
            alertas: {
                manutencoes,
                cnhVencendo,
                inadimplentesCount: Number(inadimplentesCount[0].total || 0)
            }
        });
    } catch (err) {
        console.error('Erro no dashboard:', err);
        res.status(500).json({ error: 'Erro ao buscar dados do dashboard' });
    } finally {
        if (conn) conn.release();
    }
});

// --- NOTIFICAÇÕES GLOBAIS ---
app.get('/api/notifications', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();

        const manutencoes = await conn.query(`
            SELECT f.placa, m.servico, m.data_agendada
            FROM manutencoes m 
            JOIN frota f ON m.veiculo_id = f.id 
            WHERE m.status = 'Pendente' 
            AND m.data_agendada IS NOT NULL 
            AND m.data_agendada > '2000-01-01'
            AND m.data_agendada <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
        `);

        const cnhVencendo = await conn.query(`
            SELECT nome, vencimento_cnh 
            FROM motoristas 
            WHERE status = 'Ativo' 
            AND vencimento_cnh IS NOT NULL 
            AND vencimento_cnh > '2000-01-01'
            AND vencimento_cnh <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
        `);

        const inadimplentesCount = await conn.query("SELECT COUNT(*) as total FROM mensalidades WHERE status = 'Atrasado'");

        res.json({
            manutencoes,
            cnhVencendo,
            inadimplentesCount: Number(inadimplentesCount[0].total || 0)
        });
    } catch (err) {
        console.error('Erro nas notificações:', err);
        res.status(500).json({ error: 'Erro ao buscar notificações' });
    } finally {
        if (conn) conn.release();
    }
});

// --- MÓDULO FINANCEIRO ---

// 1. Financeiro - Dashboard (Todas as mensalidades do mês/histórico e KPIs + Auto-Gerador)
app.get('/api/financeiro/dashboard', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // --- INÍCIO DA GERAÇÃO AUTOMÁTICA ---
        // Pega todos os alunos ativos
        const alunosAtivos = await conn.query("SELECT id, valor_mensalidade, dia_vencimento FROM alunos WHERE status = 'Ativo'");
        const currentYearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const curYear = currentYearMonth.split('-')[0];
        const curMonth = currentYearMonth.split('-')[1];

        if (alunosAtivos.length > 0) {
            await conn.beginTransaction();
            for (const aluno of alunosAtivos) {
                // Verifica se já tem mensalidade neste mês
                const check = await conn.query(
                    "SELECT id FROM mensalidades WHERE aluno_id = ? AND DATE_FORMAT(data_vencimento, '%Y-%m') = ?",
                    [aluno.id, currentYearMonth]
                );

                if (check.length === 0) {
                    // Dia de vencimento vindo do cadastro (padrão = 10 se não existir)
                    let dueDay = aluno.dia_vencimento || 10; 
                    const strDay = dueDay.toString().padStart(2, '0');
                    const dataVenc = `${currentYearMonth}-${strDay}`;
                    
                    await conn.query(
                        "INSERT INTO mensalidades (aluno_id, valor, data_vencimento, status) VALUES (?, ?, ?, 'Pendente')",
                        [aluno.id, aluno.valor_mensalidade, dataVenc]
                    );
                }
            }
            await conn.commit();
        }
        // --- FIM DA GERAÇÃO AUTOMÁTICA ---

        // --- ATUALIZAÇÃO AUTOMÁTICA DE STATUS ---
        await conn.query(`
            UPDATE mensalidades 
            SET status = 'Atrasado' 
            WHERE status = 'Pendente' AND data_vencimento < CURDATE()
        `);

        // Caso a data de vencimento tenha sido postergada (na edição do aluno)
        await conn.query(`
            UPDATE mensalidades 
            SET status = 'Pendente' 
            WHERE status = 'Atrasado' AND data_vencimento >= CURDATE()
        `);

        // Retorna todos os dados para o dashboard
        const rows = await conn.query(`
            SELECT m.*, a.nome AS aluno, 
                   COALESCE(a.responsavel_telefone, r.telefone) AS responsavel_telefone
            FROM mensalidades m 
            JOIN alunos a ON m.aluno_id = a.id 
            LEFT JOIN responsaveis r ON a.responsavel_id = r.id
            ORDER BY m.status DESC, m.data_vencimento DESC;
        `);
        // Status order: 'Pendente', 'Pago', 'Atrasado', 'Cancelado'
        res.json(rows);
    } catch (err) {
        if (conn) await conn.rollback();
        console.error('Erro ao buscar dashboard financeiro:', err);
        res.status(500).json({ error: 'Erro ao buscar dados financeiros' });
    } finally {
        if (conn) conn.release();
    }
});

// 2. Financeiro - Dar Baixa (Registrar Pagamento)
app.put('/api/financeiro/pagar/:id', async (req, res) => {
    let conn;
    try {
        const { id } = req.params;
        conn = await pool.getConnection();
        const result = await conn.query(
            "UPDATE mensalidades SET status = 'Pago', data_pagamento = CURDATE() WHERE id = ?",
            [id]
        );
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Pagamento registrado com sucesso' });
        } else {
            res.status(404).json({ error: 'Mensalidade não encontrada' });
        }
    } catch (err) {
        console.error('Erro ao registrar pagamento:', err);
        res.status(500).json({ error: 'Erro ao registrar pagamento' });
    } finally {
        if (conn) conn.release();
    }
});

// 3. Financeiro - Gerar Cobranças do Mês
app.post('/api/financeiro/gerar', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // Pega todos os alunos ativos
        const alunos = await conn.query("SELECT id, valor_mensalidade FROM alunos WHERE status = 'Ativo'");
        let variados = 0;
        let pularam = 0;

        const currentYearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const diaPadrao = '10'; // Vencimento padrão todo dia 10

        for (const aluno of alunos) {
            // Verifica se já existe mensalidade para este aluno neste mês
            const check = await conn.query(
                "SELECT id FROM mensalidades WHERE aluno_id = ? AND DATE_FORMAT(data_vencimento, '%Y-%m') = ?",
                [aluno.id, currentYearMonth]
            );

            if (check.length === 0) {
                // Não existe, então insere
                const dataVenc = `${currentYearMonth}-${diaPadrao}`;
                await conn.query(
                    "INSERT INTO mensalidades (aluno_id, valor, data_vencimento, status) VALUES (?, ?, ?, 'Pendente')",
                    [aluno.id, aluno.valor_mensalidade, dataVenc]
                );
                variados++;
            } else {
                pularam++;
            }
        }

        await conn.commit();
        res.json({ success: true, geradas: variados, ignoradas: pularam });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error('Erro ao gerar cobranças:', err);
        res.status(500).json({ error: 'Erro ao gerar cobranças em lote' });
    } finally {
        if (conn) conn.release();
    }
});

// Criar veículo
app.post('/api/frota', async (req, res) => {
    const { placa, modelo, ano, capacidade, status, motorista_id, rota_id, escola_id } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        const result = await conn.query(
            "INSERT INTO frota (placa, modelo, ano, capacidade, status, motorista_id, escola_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [placa, modelo, ano, capacidade, status || 'Disponível', motorista_id || null, escola_id || null]
        );
        const veiculo_id = Number(result.insertId);

        if (rota_id) {
            // Desvincular veículo de qualquer outra rota e vincular à nova
            await conn.query("UPDATE rotas SET veiculo_id = NULL WHERE veiculo_id = ?", [veiculo_id]);
            await conn.query("UPDATE rotas SET veiculo_id = ? WHERE id = ?", [veiculo_id, rota_id]);
        }

        await conn.commit();
        res.status(201).json({ id: veiculo_id });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Esta placa já está cadastrada em outro veículo.' });
        }
        res.status(500).json({ error: 'Erro ao criar veículo' });
    } finally {
        if (conn) conn.release();
    }
});

// Atualizar veículo
app.put('/api/frota/:id', async (req, res) => {
    const { id } = req.params;
    const { placa, modelo, ano, capacidade, status, motorista_id, rota_id, escola_id } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        await conn.query(
            "UPDATE frota SET placa=?, modelo=?, ano=?, capacidade=?, status=?, motorista_id=?, escola_id=? WHERE id=?",
            [placa, modelo, ano, capacidade, status, motorista_id || null, escola_id || null, id]
        );

        // Atualizar vínculo de rota
        await conn.query("UPDATE rotas SET veiculo_id = NULL WHERE veiculo_id = ?", [id]);
        if (rota_id) {
            await conn.query("UPDATE rotas SET veiculo_id = ? WHERE id = ?", [id, rota_id]);
        }

        await conn.commit();
        res.json({ message: 'Veículo atualizado com sucesso' });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar veículo' });
    } finally {
        if (conn) conn.release();
    }
});

// --- Gestão de Motoristas ---

// Listar todos os motoristas
app.get('/api/motoristas', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT * FROM motoristas ORDER BY nome ASC");
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar motoristas' });
    } finally {
        if (conn) conn.release();
    }
});

// Criar novo motorista
app.post('/api/motoristas', async (req, res) => {
    const { nome, telefone, cnh, vencimento_cnh, categoria, status } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            "INSERT INTO motoristas (nome, telefone, cnh, vencimento_cnh, categoria, status) VALUES (?, ?, ?, ?, ?, ?)",
            [nome, telefone, cnh, vencimento_cnh, categoria, status || 'Ativo']
        );
        res.status(201).json({ id: Number(result.insertId), nome, telefone, cnh, vencimento_cnh, categoria, status });
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
            return res.status(400).json({ error: 'Esta CNH já está cadastrada para outro motorista.' });
        }
        res.status(500).json({ error: 'Erro ao criar motorista' });
    } finally {
        if (conn) conn.release();
    }
});

// Atualizar motorista
app.put('/api/motoristas/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, telefone, cnh, vencimento_cnh, categoria, status } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(
            "UPDATE motoristas SET nome=?, telefone=?, cnh=?, vencimento_cnh=?, categoria=?, status=? WHERE id=?",
            [nome, telefone, cnh, vencimento_cnh, categoria, status, id]
        );
        res.json({ message: 'Motorista atualizado com sucesso' });
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
            return res.status(400).json({ error: 'Esta CNH já está cadastrada para outro motorista.' });
        }
        res.status(500).json({ error: 'Erro ao atualizar motorista' });
    } finally {
        if (conn) conn.release();
    }
});

// Excluir motorista
app.delete('/api/motoristas/:id', async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await pool.getConnection();
        // Verificar se há rotas vinculadas antes de excluir (opcional, mas boa prática)
        const rotas = await conn.query("SELECT id FROM rotas WHERE motorista_id = ?", [id]);
        if (rotas.length > 0) {
            return res.status(400).json({ error: 'Não é possível excluir um motorista vinculado a uma rota.' });
        }
        await conn.query("DELETE FROM motoristas WHERE id = ?", [id]);
        res.json({ message: 'Motorista excluído com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao excluir motorista' });
    } finally {
        if (conn) conn.release();
    }
});

// Excluir veículo
app.delete('/api/frota/:id', async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("DELETE FROM frota WHERE id = ?", [id]);
        res.json({ message: 'Veículo excluído com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao excluir veículo' });
    } finally {
        if (conn) conn.release();
    }
});

// --- Gestão de Responsáveis ---

// Listar responsáveis com contagem de alunos (Query do Usuário Adaptada)
app.get('/api/responsaveis', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT 
                r.id,
                r.nome,
                r.cpf,
                r.telefone,
                r.email,
                r.endereco_residencial,
                r.status,
                COUNT(a.id) as total_alunos,
                GROUP_CONCAT(a.nome SEPARATOR ', ') as alunos_nomes
            FROM responsaveis r
            LEFT JOIN alunos a ON r.id = a.responsavel_id
            GROUP BY r.id
            ORDER BY r.nome ASC
        `);
        // Converter BigInt para Number
        const data = rows.map(row => ({
            ...row,
            total_alunos: Number(row.total_alunos)
        }));
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar responsáveis' });
    } finally {
        if (conn) conn.release();
    }
});

// Criar responsável
app.post('/api/responsaveis', async (req, res) => {
    const { nome, cpf, email, telefone, endereco_residencial } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            "INSERT INTO responsaveis (nome, cpf, email, telefone, endereco_residencial, status) VALUES (?, ?, ?, ?, ?, ?)",
            [nome, cpf || null, email || null, telefone, endereco_residencial || null, 'Ativo']
        );
        res.status(201).json({ id: Number(result.insertId), nome, cpf, email, telefone, endereco_residencial, status: 'Ativo' });
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Este CPF já está cadastrado.' });
        }
        res.status(500).json({ error: 'Erro ao criar responsável' });
    } finally {
        if (conn) conn.release();
    }
});

// Atualizar responsável
app.put('/api/responsaveis/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, cpf, email, telefone, endereco_residencial, status } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(
            "UPDATE responsaveis SET nome=?, cpf=?, email=?, telefone=?, endereco_residencial=?, status=? WHERE id=?",
            [nome, cpf || null, email || null, telefone, endereco_residencial || null, status || 'Ativo', id]
        );
        res.json({ message: 'Responsável atualizado com sucesso' });
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Este CPF já está cadastrado em outro responsável.' });
        }
        res.status(500).json({ error: 'Erro ao atualizar responsável' });
    } finally {
        if (conn) conn.release();
    }
});

// Excluir responsável
app.delete('/api/responsaveis/:id', async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await pool.getConnection();
        // Verificar se há alunos vinculados
        const check = await conn.query("SELECT id FROM alunos WHERE responsavel_id = ?", [id]);
        if (check.length > 0) {
            return res.status(400).json({ error: 'Não é possível excluir um responsável que possui alunos vinculados.' });
        }
        await conn.query("DELETE FROM responsaveis WHERE id = ?", [id]);
        res.json({ message: 'Responsável excluído com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao excluir responsável' });
    } finally {
        if (conn) conn.release();
    }
});

// --- Gestão de Escolas ---

// Listar escolas com contagem de alunos e vans
app.get('/api/escolas', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT 
                e.*,
                (SELECT COUNT(*) FROM alunos WHERE escola_id = e.id) as studentsCount,
                (SELECT COUNT(*) FROM frota WHERE escola_id = e.id) as activeVans,
                (SELECT GROUP_CONCAT(placa SEPARATOR ', ') FROM frota WHERE escola_id = e.id) as activeVansDetails
            FROM escolas e
            ORDER BY e.nome ASC
        `);
        // Converter BigInt para Number
        const data = rows.map(row => ({
            ...row,
            studentsCount: Number(row.studentsCount),
            activeVans: Number(row.activeVans)
        }));
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar escolas' });
    } finally {
        if (conn) conn.release();
    }
});

// Criar escola
app.post('/api/escolas', async (req, res) => {
    const { nome, endereco, telefone, responsavel_contato, tipo } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            "INSERT INTO escolas (nome, endereco, telefone, responsavel_contato, tipo) VALUES (?, ?, ?, ?, ?)",
            [nome, endereco || null, telefone || null, responsavel_contato || null, tipo || 'Particular']
        );
        res.status(201).json({ id: Number(result.insertId), nome, endereco, telefone, responsavel_contato, tipo });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar escola' });
    } finally {
        if (conn) conn.release();
    }
});

// Atualizar escola
app.put('/api/escolas/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, endereco, telefone, responsavel_contato, tipo } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(
            "UPDATE escolas SET nome=?, endereco=?, telefone=?, responsavel_contato=?, tipo=? WHERE id=?",
            [nome, endereco || null, telefone || null, responsavel_contato || null, tipo || 'Particular', id]
        );
        res.json({ message: 'Escola atualizada com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar escola' });
    } finally {
        if (conn) conn.release();
    }
});

// Excluir escola
app.delete('/api/escolas/:id', async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await pool.getConnection();
        const check = await conn.query("SELECT id FROM alunos WHERE escola_id = ?", [id]);
        if (check.length > 0) {
            return res.status(400).json({ error: 'Não é possível excluir escola com alunos vinculados.' });
        }
        await conn.query("DELETE FROM escolas WHERE id = ?", [id]);
        res.json({ message: 'Escola excluída com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao excluir escola' });
    } finally {
        if (conn) conn.release();
    }
});

// Listar todos os alunos
app.get('/api/alunos', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT 
                a.id, a.nome, a.responsavel_telefone, a.valor_mensalidade, a.dia_vencimento,
                a.escola_id, a.responsavel_id, a.turno, a.status,
                e.nome AS escola_nome, 
                r.nome AS responsavel_nome
            FROM alunos a 
            LEFT JOIN escolas e ON a.escola_id = e.id 
            LEFT JOIN responsaveis r ON a.responsavel_id = r.id
            ORDER BY a.nome ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error('ERRO EM GET /API/ALUNOS:', err);
        res.status(500).json({ error: 'Erro ao buscar alunos' });
    } finally {
        if (conn) conn.release();
    }
});

// Criar aluno
app.post('/api/alunos', async (req, res) => {
    const { nome, responsavel_telefone, valor_mensalidade, dia_vencimento, escola_id, responsavel_id, turno, status } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            "INSERT INTO alunos (nome, responsavel_telefone, valor_mensalidade, dia_vencimento, escola_id, responsavel_id, turno, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [nome, responsavel_telefone || null, Number(valor_mensalidade), Number(dia_vencimento) || 10, escola_id || null, responsavel_id || null, turno || 'Manhã', status || 'Ativo']
        );
        res.status(201).json({ id: Number(result.insertId), nome, responsavel_telefone, valor_mensalidade, dia_vencimento, escola_id, responsavel_id, turno, status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar aluno' });
    } finally {
        if (conn) conn.release();
    }
});

// Atualizar aluno
app.put('/api/alunos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, responsavel_telefone, valor_mensalidade, dia_vencimento, escola_id, responsavel_id, turno, status } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(
            "UPDATE alunos SET nome=?, responsavel_telefone=?, valor_mensalidade=?, dia_vencimento=?, escola_id=?, responsavel_id=?, turno=?, status=? WHERE id=?",
            [nome, responsavel_telefone || null, Number(valor_mensalidade), Number(dia_vencimento) || 10, escola_id || null, responsavel_id || null, turno || 'Manhã', status || 'Ativo', id]
        );
        
        // Se mudou o dia_vencimento, atualiza também a data_vencimento da mensalidade PENDENTE do mês atual
        if (dia_vencimento) {
            const currentYearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
            const strDay = Number(dia_vencimento).toString().padStart(2, '0');
            const novaDataVenc = `${currentYearMonth}-${strDay}`;
            await conn.query(`
                UPDATE mensalidades 
                SET data_vencimento = ? 
                WHERE aluno_id = ? AND status IN ('Pendente', 'Atrasado') AND DATE_FORMAT(data_vencimento, '%Y-%m') = ?
            `, [novaDataVenc, id, currentYearMonth]);
        }
        
        res.json({ message: 'Aluno atualizado com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar aluno' });
    } finally {
        if (conn) conn.release();
    }
});

// Excluir aluno
app.delete('/api/alunos/:id', async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await pool.getConnection();
        // Verificar se há vínculos antes de excluir
        const check = await conn.query("SELECT id FROM mensalidades WHERE aluno_id = ?", [id]);
        if (check.length > 0) {
            return res.status(400).json({ error: 'Não é possível excluir aluno com mensalidades registradas.' });
        }
        await conn.query("DELETE FROM alunos WHERE id = ?", [id]);
        res.json({ message: 'Aluno excluído com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao excluir aluno' });
    } finally {
        if (conn) conn.release();
    }
});

// Busca frota simples (legado mantido e adaptado)
app.get('/api/frota', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query('SELECT * FROM frota');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar frota' });
    } finally {
        if (conn) conn.release();
    }
});

// --- Checklist Diário ---

// Listar checklists (com join para placa e motorista)
app.get('/api/checklists', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT 
                c.id, c.veiculo_id, c.motorista_id, c.data_registro, c.resolvido,
                c.freios, c.pneus, c.oleo, c.luzes, c.limpeza, c.cintos, c.observacoes,
                f.placa as veiculo_placa,
                m.nome as motorista_nome
            FROM checklist_diario c
            JOIN frota f ON c.veiculo_id = f.id
            JOIN motoristas m ON c.motorista_id = m.id
            ORDER BY c.data_registro DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar checklists' });
    } finally {
        if (conn) conn.release();
    }
});

// Criar novo checklist
app.post('/api/checklists', async (req, res) => {
    const { veiculo_id, motorista_id, freios, pneus, oleo, luzes, limpeza, cintos, observacoes } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            "INSERT INTO checklist_diario (veiculo_id, motorista_id, freios, pneus, oleo, luzes, limpeza, cintos, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [veiculo_id, motorista_id, freios || 'ok', pneus || 'ok', oleo || 'ok', luzes || 'ok', limpeza || 'ok', cintos || 'ok', observacoes]
        );
        res.status(201).json({ id: Number(result.insertId) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar checklist' });
    } finally {
        if (conn) conn.release();
    }
});

// Resolver alerta de checklist
app.put('/api/checklists/:id/resolve', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query("UPDATE checklist_diario SET resolvido = true WHERE id = ?", [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Checklist não encontrado' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao resolver alerta' });
    } finally {
        if (conn) conn.release();
    }
});
// --- Manutenção ---

// Dashboard Data
app.get('/api/manutencoes/dashboard', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();

        // 1. Stats
        const [totalFrota] = await conn.query("SELECT COUNT(*) as total FROM frota");
        const [emManutencao] = await conn.query("SELECT COUNT(*) as total FROM frota WHERE status = 'Manutenção'");

        // Custo total acumulado de manutenções ativas (pendentes ou andamento)
        const [custoRows] = await conn.query(`
            SELECT COALESCE(SUM(custo), 0) as total 
            FROM manutencoes 
            WHERE status IN ('Pendente', 'Em Andamento')
        `);

        // 2. Veículos com Progresso
        const veiculos = await conn.query(`
            SELECT id, placa, modelo, km_atual, km_ultima_revisao, km_proxima_revisao, status 
            FROM frota
        `);

        res.json({
            stats: {
                total_veiculos: Number(totalFrota?.total || 0),
                em_manutencao: Number(emManutencao?.total || 0),
                custo_mensal: parseFloat(custoRows[0]?.total || 0)
            },
            veiculos
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar dashboard de manutenção' });
    } finally {
        if (conn) conn.release();
    }
});

// Registrar Nova Manutenção
app.post('/api/manutencoes', async (req, res) => {
    const { veiculo_id, tipo, servico, custo, status, data_agendada, hora_agendada } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            "INSERT INTO manutencoes (veiculo_id, tipo, servico, custo, status, data_agendada, hora_agendada) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [veiculo_id, tipo, servico, custo || 0, status || 'Pendente', data_agendada, hora_agendada]
        );
        res.status(201).json({ id: Number(result.insertId) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao registrar manutenção' });
    } finally {
        if (conn) conn.release();
    }
});

// TEST DEBUG ROTA
app.get('/api/testdebug', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT * FROM manutencoes");
        res.json(rows);
    } catch (err) {
        res.status(500).send(err.message);
    } finally {
        if (conn) conn.release();
    }
});

// Atualizar KM Atual do Veículo
app.put('/api/frota/:id/km', async (req, res) => {
    const { id } = req.params;
    const { km_atual } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("UPDATE frota SET km_atual = ? WHERE id = ?", [km_atual, id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar KM' });
    } finally {
        if (conn) conn.release();
    }
});

// Próxima Manutenção por Veículo
app.get('/api/frota/:id/next-maintenance', async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await pool.getConnection();
        
        // 1. Obter KM do veículo
        const [veiculo] = await conn.query("SELECT km_atual, km_proxima_revisao, status FROM frota WHERE id = ?", [id]);
        
        if (!veiculo) {
            return res.status(404).json({ error: 'Veículo não encontrado' });
        }

        // 2. Obter próxima manutenção agendada
        const [manutencao] = await conn.query(`
            SELECT servico, data_agendada, tipo 
            FROM manutencoes 
            WHERE veiculo_id = ? AND status IN ('Pendente', 'Em Andamento') 
            ORDER BY data_agendada ASC 
            LIMIT 1
        `, [id]);

        const km_restantes = veiculo.km_proxima_revisao ? (veiculo.km_proxima_revisao - (veiculo.km_atual || 0)) : null;

        res.json({
            veiculo: {
                km_atual: veiculo.km_atual,
                km_proxima_revisao: veiculo.km_proxima_revisao,
                km_restantes: km_restantes > 0 ? km_restantes : 0,
                status: veiculo.status
            },
            next_maintenance: manutencao || null
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar próxima manutenção do veículo' });
    } finally {
        if (conn) conn.release();
    }
});

// Agenda de Serviços
app.get('/api/manutencoes/agenda', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const agenda = await conn.query(`
            SELECT m.*, f.placa, f.modelo 
            FROM manutencoes m 
            JOIN frota f ON m.veiculo_id = f.id 
            WHERE m.status IN ('Pendente', 'Em Andamento') 
            ORDER BY m.data_agendada ASC, m.hora_agendada ASC 
            LIMIT 10
        `);
        res.json(agenda);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar agenda' });
    } finally {
        if (conn) conn.release();
    }
});

// Consumo e Performance do Veículo
app.get('/api/frota/:id/performance', async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await pool.getConnection();

        // Calcular gastos no mês atual
        const [rows] = await conn.query(`
            SELECT 
                SUM(litros) as total_litros,
                SUM(custo_total) as gasto_total,
                (MAX(km_atual) - MIN(km_atual)) as km_rodados
            FROM abastecimentos
            WHERE veiculo_id = ? AND MONTH(data_abastecimento) = MONTH(CURRENT_DATE()) AND YEAR(data_abastecimento) = YEAR(CURRENT_DATE())
        `, [id]);

        const metrics = rows || { total_litros: 0, gasto_total: 0, km_rodados: 0 };
        
        const total_litros = Number(metrics.total_litros || 0);
        const km_rodados = Number(metrics.km_rodados || 0);
        const gasto_total = Number(metrics.gasto_total || 0);

        let consumo_medio = 0;
        let custo_km = 0;

        if (total_litros > 0 && km_rodados > 0) {
            consumo_medio = km_rodados / total_litros;
        }
        
        if (gasto_total > 0 && km_rodados > 0) {
            custo_km = gasto_total / km_rodados;
        }

        // Mock percentual de variação em relação ao mês anterior (apenas visualização)
        const variacao_consumo = '+2%';
        const variacao_custo = '-1%';
        const gasto_mes_anterior = gasto_total ? (gasto_total * 0.9).toFixed(2) : 0;

        res.json({
            consumo_medio: consumo_medio.toFixed(1),
            custo_km: custo_km.toFixed(2),
            gasto_total: gasto_total ? Number(gasto_total).toFixed(2) : '0.00',
            variacao_consumo,
            variacao_custo,
            gasto_mes_anterior: Number(gasto_mes_anterior).toFixed(2)
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar dados de performance' });
    } finally {
        if (conn) conn.release();
    }
});

// Listagem de Abastecimentos com relação Frota
app.get('/api/abastecimentos', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT a.*, f.placa, m.nome as motorista_nome 
            FROM abastecimentos a
            LEFT JOIN frota f ON a.veiculo_id = f.id
            LEFT JOIN motoristas m ON a.motorista_id = m.id
            ORDER BY a.data_abastecimento DESC, a.id DESC
            LIMIT 50
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar abastecimentos' });
    } finally {
        if (conn) conn.release();
    }
});

// Registrar Novo Abastecimento
app.post('/api/abastecimentos', async (req, res) => {
    const { veiculo_id, motorista_id, litros, valor_unitario, custo_total, km_atual, tipo_combustivel, data_abastecimento } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        const query = `
            INSERT INTO abastecimentos 
            (veiculo_id, motorista_id, litros, valor_unitario, custo_total, km_atual, tipo_combustivel, data_abastecimento) 
            VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()))
        `;
        
        const result = await conn.query(query, [
            veiculo_id, 
            motorista_id || null, 
            litros, 
            valor_unitario, 
            custo_total, 
            km_atual, 
            tipo_combustivel || 'Não Especificado',
            data_abastecimento || null
        ]);

        res.status(201).json({ success: true, id: Number(result.insertId) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao registrar abastecimento' });
    } finally {
        if (conn) conn.release();
    }
});

// Deletar Abastecimento
app.delete('/api/abastecimentos/:id', async (req, res) => {
    let conn;
    try {
        const { id } = req.params;
        conn = await pool.getConnection();
        const result = await conn.query('DELETE FROM abastecimentos WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Registro não encontrado' });
        }
    } catch (err) {
        console.error('Erro ao deletar abastecimento:', err);
        res.status(500).json({ error: 'Erro interno ao deletar' });
    } finally {
        if (conn) conn.release();
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${port} (bind 0.0.0.0)`);
});
