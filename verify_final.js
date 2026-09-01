import pool from './server/db.js';

async function verify() {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query('SELECT email FROM usuarios WHERE email = ?', ['admin@equiprent.com']);
        if (rows.length > 0) {
            console.log('USUARIO_OK');
        } else {
            console.log('USUARIO_AUSENTE');
        }
    } catch (err) {
        console.error(err);
    } finally {
        if (conn) conn.release();
        process.exit();
    }
}

verify();
