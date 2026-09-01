import pool from './server/db.js';

async function setup() {
    try {
        // 1. Add columns to frota if they don't exist
        const addColumns = [
            "ALTER TABLE frota ADD COLUMN km_atual INT DEFAULT 0;",
            "ALTER TABLE frota ADD COLUMN km_ultima_revisao INT DEFAULT 0;",
            "ALTER TABLE frota ADD COLUMN km_proxima_revisao INT DEFAULT 10000;"
        ];

        for (const sql of addColumns) {
            try {
                await pool.query(sql);
                console.log("Added column successfully.");
            } catch (err) {
                if (err.code === 'ER_DUP_FIELDNAME') {
                    console.log("Column already exists, skipping...");
                } else {
                    console.error("Error adding column:", err.message);
                }
            }
        }

        // 2. Create manutencoes table
        const createTableSQL = `
      CREATE TABLE IF NOT EXISTS manutencoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        veiculo_id INT NOT NULL,
        servico VARCHAR(255) NOT NULL,
        tipo ENUM('Preventiva', 'Corretiva', 'Urgente') NOT NULL,
        data_agendada DATE NOT NULL,
        hora_agendada TIME,
        status ENUM('Pendente', 'Em Andamento', 'Concluída', 'Cancelada') DEFAULT 'Pendente',
        custo DECIMAL(10, 2) DEFAULT 0.00,
        FOREIGN KEY (veiculo_id) REFERENCES frota(id) ON DELETE CASCADE
      );
    `;
        await pool.query(createTableSQL);
        console.log("Table manutencoes created or already exists.");

        // 3. Seed some dummy data to match the UI state if needed
        // First, let's just make sure there are vehicles in frota
        const veiculos = await pool.query("SELECT * FROM frota");
        if (veiculos.length === 0) {
            await pool.query(`INSERT INTO frota (placa, modelo, ano, capacidade, km_atual, km_ultima_revisao, km_proxima_revisao, status) VALUES 
        ('ABC-1234', 'MERCEDES SPRINTER 2023', 2023, 16, 120500, 110500, 123000, 'Disponível'),
        ('DEF-5678', 'RENAULT MASTER 2022', 2022, 15, 85200, 75200, 86964, 'Manutenção'),
        ('GHI-9012', 'IVECO DAILY 2024', 2024, 20, 42000, 32000, 82000, 'Disponível'),
        ('JKL-3456', 'MERCEDES SPRINTER 2021', 2021, 16, 210000, 190000, 210000, 'Disponível')
      `);
            console.log("Seeded frota table with mock vehicles.");
        } else {
            // Just update existing ones to have some valid data for progress if they are all 0
            await pool.query(`UPDATE frota SET km_atual = 120500, km_ultima_revisao = 110500, km_proxima_revisao = 123000 WHERE id = ?`, [veiculos[0].id]);
            if (veiculos[1]) await pool.query(`UPDATE frota SET km_atual = 85200, km_ultima_revisao = 75200, km_proxima_revisao = 86964, status = 'Manutenção' WHERE id = ?`, [veiculos[1].id]);
            if (veiculos[2]) await pool.query(`UPDATE frota SET km_atual = 42000, km_ultima_revisao = 32000, km_proxima_revisao = 82000 WHERE id = ?`, [veiculos[2].id]);
            if (veiculos[3]) await pool.query(`UPDATE frota SET km_atual = 210000, km_ultima_revisao = 190000, km_proxima_revisao = 210000 WHERE id = ?`, [veiculos[3].id]);
            console.log("Updated existing frota rows with mock km values.");
        }

        // 4. Seed Manutencoes
        const manuts = await pool.query("SELECT * FROM manutencoes");
        if (manuts.length === 0) {
            // Get the first two vehicle IDs
            const frotaList = await pool.query("SELECT id FROM frota LIMIT 2");
            if (frotaList.length >= 2) {
                // We will use date of '2026-09-15' as per the UI
                await pool.query(`INSERT INTO manutencoes (veiculo_id, servico, tipo, data_agendada, hora_agendada, status, custo) VALUES
             (?, 'Troca de Óleo', 'Preventiva', '2026-09-15', '08:30:00', 'Pendente', 250.00),
             (?, 'Revisão de Freios', 'Urgente', '2026-09-16', '14:00:00', 'Pendente', 850.00)
           `, [frotaList[0].id, frotaList[1].id]);
                console.log("Seeded manutencoes table.");
            }
        }

    } catch (error) {
        console.error("Setup error:", error);
    } finally {
        process.exit(0);
    }
}

setup();
