import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const m = await import('mariadb');
const mariadb = m.default || m;

async function getUsers() {
    let conn;
    try {
        conn = await mariadb.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT || '3306'),
            database: process.env.DB_NAME || 'julio'
        });

        const users = await conn.query('SELECT email, senha, role FROM usuarios');
        fs.writeFileSync('output.json', JSON.stringify(users, null, 2));
    } catch (err) {
        console.error('Error fetching users:', err);
    } finally {
        if (conn) await conn.end();
        process.exit();
    }
}

getUsers();
