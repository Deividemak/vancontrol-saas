import pool from './server/db.js';
import fs from 'fs';

async function dumpSchema() {
    let conn;
    try {
        conn = await pool.getConnection();
        const r = await conn.query('DESCRIBE responsaveis');
        const a = await conn.query('DESCRIBE alunos');
        fs.writeFileSync('./tmp_schema.json', JSON.stringify({ responsaveis: r, alunos: a }, null, 2));
        console.log('Schema dumped to ./tmp_schema.json');
    } catch (err) {
        console.error(err);
    } finally {
        if (conn) conn.release();
        process.exit();
    }
}

dumpSchema();
