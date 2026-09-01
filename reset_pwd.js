import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const m = await import('mariadb');
const mariadb = m.default || m;

async function resetPassword() {
    let conn;
    try {
        console.log('Connecting to database...');
        conn = await mariadb.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT || '3306'),
            database: process.env.DB_NAME || 'julio'
        });

        const newPassword = '123456';
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await conn.query(
            "UPDATE usuarios SET senha = ? WHERE email = ?",
            [hashedPassword, 'admin@equiprent.com']
        );

        console.log('Password reset successfully for admin@equiprent.com. New password: ' + newPassword);
    } catch (err) {
        console.error('Error resetting password:', err);
    } finally {
        if (conn) await conn.end();
        process.exit();
    }
}

resetPassword();
