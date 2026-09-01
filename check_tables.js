import pool from './server/db.js';
import fs from 'fs';

async function run() {
    const result = {};
    const tables = await pool.query("SHOW TABLES;");
    for (const t of tables) {
        const tableName = Object.values(t)[0];
        if (tableName === 'veiculos' || tableName === 'frota' || tableName === 'veiculo') {
            const columns = await pool.query(`DESCRIBE ${tableName};`);
            result[tableName] = columns;
        }
    }
    fs.writeFileSync('tables_schema.json', JSON.stringify(result, null, 2));
    process.exit(0);
}
run().catch(console.error);
