// Planos do VanControl (assinatura de cada empresa). Limites por quantidade de vans.
// Mudar o plano de uma empresa: npm run plano -- <empresa_id> <plano>
export const PLANOS = {
    gratis: { nome: 'Grátis', vans: 1, preco: 0 },
    essencial: { nome: 'Essencial', vans: 5, preco: 99 },
    profissional: { nome: 'Profissional', vans: 15, preco: 249 },
    frota: { nome: 'Frota', vans: 40, preco: 499 },
    completo: { nome: 'Completo (sem limite)', vans: null, preco: null },
};

export async function planoDaEmpresa(conn, empresaId) {
    const [e] = await conn.query('SELECT plano FROM empresas WHERE id = ?', [empresaId]);
    const id = PLANOS[e?.plano] ? e.plano : 'gratis';
    const [{ n }] = await conn.query('SELECT COUNT(*) n FROM frota WHERE empresa_id = ?', [empresaId]);
    const [{ a }] = await conn.query(`SELECT COUNT(*) a FROM alunos WHERE empresa_id = ? AND status = 'Ativo' AND anonimizado_em IS NULL`, [empresaId]);
    return { id, ...PLANOS[id], vans_em_uso: Number(n), alunos_ativos: Number(a) };
}

/** Erro amigável quando a empresa chega no limite de vans do plano. */
export async function conferirLimiteVans(conn, empresaId) {
    const p = await planoDaEmpresa(conn, empresaId);
    if (p.vans !== null && p.vans_em_uso >= p.vans) {
        return `Seu plano ${p.nome} permite até ${p.vans} van${p.vans > 1 ? 's' : ''}. Veja os planos em Meu plano.`;
    }
    return null;
}

// Execução direta: node server/services/planos.js <empresa_id> <plano>
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('services/planos.js')) {
    const [id, plano] = process.argv.slice(2);
    if (!id || !PLANOS[plano]) {
        console.log(`Uso: npm run plano -- <empresa_id> <${Object.keys(PLANOS).join('|')}>`);
        process.exit(1);
    }
    const dotenv = await import('dotenv'); dotenv.config();
    const { default: pool } = await import('../db.js');
    const r = await pool.query('UPDATE empresas SET plano = ? WHERE id = ?', [plano, Number(id)]);
    console.log(r.affectedRows ? `Empresa ${id} agora no plano ${PLANOS[plano].nome}.` : 'Empresa não encontrada.');
    await pool.end();
}
