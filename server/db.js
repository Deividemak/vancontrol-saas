import dotenv from 'dotenv';
dotenv.config();

const m = await import('mariadb');
const mariadb = m.default || m;

const pool = mariadb.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vancontrol',
    port: parseInt(process.env.DB_PORT || '3306'),
    connectionLimit: 10
});

export default pool;
