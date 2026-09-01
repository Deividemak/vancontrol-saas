import pool from './server/db.js';

async function setupAbastecimentos() {
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(`
            CREATE TABLE IF NOT EXISTS abastecimentos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                veiculo_id INT,
                motorista_id INT,
                data_abastecimento DATE NOT NULL,
                tipo_combustivel VARCHAR(50),
                litros DECIMAL(10,2) NOT NULL,
                valor_unitario DECIMAL(10,2) NOT NULL,
                custo_total DECIMAL(10,2) NOT NULL,
                km_atual INT NOT NULL,
                posto VARCHAR(100),
                observacoes TEXT,
                FOREIGN KEY (veiculo_id) REFERENCES frota(id) ON DELETE CASCADE,
                FOREIGN KEY (motorista_id) REFERENCES motoristas(id) ON DELETE SET NULL
            )
        `);
        console.log('Tabela abastecimentos criada com sucesso.');

        // Mock data for vehicle ID 1 (Fiat Ducato / Sprinter etc) to test functionality
        await conn.query(`
            INSERT IGNORE INTO abastecimentos 
            (id, veiculo_id, motorista_id, data_abastecimento, tipo_combustivel, litros, valor_unitario, custo_total, km_atual, posto) 
            VALUES 
            (1, 1, 1, CURDATE() - INTERVAL 15 DAY, 'Diesel S10', 50, 5.80, 290.00, 84000, 'Posto Shell'),
            (2, 1, 1, CURDATE() - INTERVAL 5 DAY, 'Diesel S10', 45, 5.90, 265.50, 84350, 'Posto BR')
        `);
        console.log('Dados mockados inseridos.');
    } catch (err) {
        console.error('Erro:', err);
    } finally {
        if (conn) conn.release();
        process.exit();
    }
}

setupAbastecimentos();
