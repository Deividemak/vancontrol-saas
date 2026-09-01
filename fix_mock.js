import pool from './server/db.js';

async function fixVehicle() {
    let conn;
    try {
        conn = await pool.getConnection();

        // Find the vehicle with placa ABC-1234
        const rows = await conn.query("SELECT id FROM frota WHERE placa='ABC-1234' LIMIT 1");
        
        if (rows && rows.length > 0) {
            const fiatId = rows[0].id;
            console.log('FIAT ID found: ' + fiatId);
            
            // Give all the mock abastecimentos to this FIAT id
            await conn.query("UPDATE abastecimentos SET veiculo_id = ?", [fiatId]);
            console.log('Fixed! All abastecimentos point to veiculo_id ' + fiatId);
        } else {
            console.log('Vehicle ABC-1234 not found!');
        }
    } catch (err) {
        console.error(err);
    } finally {
        if (conn) conn.release();
        process.exit();
    }
}

fixVehicle();
