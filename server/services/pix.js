// Pix "copia e cola" (BR Code estático, padrão EMV do Banco Central) para a chave Pix da empresa.
// Não passa por intermediário: o dinheiro cai direto na conta; a baixa é feita no painel.

function campo(id, valor) {
    const v = String(valor);
    return `${id}${String(v.length).padStart(2, '0')}${v}`;
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no campo 63. */
export function crc16(texto) {
    let crc = 0xffff;
    for (const byte of Buffer.from(texto, 'utf8')) {
        crc ^= byte << 8;
        for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Remove acentos e caracteres fora do padrão (nome e cidade aceitam só ASCII). */
function limpar(t, max) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .\-]/g, '').trim().toUpperCase().slice(0, max);
}

/** Formata a chave conforme o tipo escolhido na configuração (cpf, cnpj, email, telefone, aleatoria). */
export function normalizarChave(chave, tipo) {
    const c = String(chave || '').trim();
    if (!c) return null;
    const d = c.replace(/\D/g, '');
    switch (tipo) {
        case 'cpf': return d.length === 11 ? d : null;
        case 'cnpj': return d.length === 14 ? d : null;
        case 'email': return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c) ? c.toLowerCase() : null;
        case 'telefone': {
            const n = d.length === 10 || d.length === 11 ? `55${d}` : d;
            return n.length >= 12 && n.length <= 13 ? `+${n}` : null;
        }
        case 'aleatoria': return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c) ? c.toLowerCase() : null;
        default:
            if (c.includes('@')) return c.toLowerCase();
            if (/^[0-9a-f-]{36}$/i.test(c)) return c.toLowerCase();
            if (c.startsWith('+')) return `+${d}`;
            return d.length === 11 || d.length === 14 ? d : c;
    }
}

/**
 * Gera o "copia e cola".
 * txid: até 25 caracteres alfanuméricos (identifica o pagamento no extrato).
 */
export function gerarPixCopiaCola({ chave, tipo, nome, cidade, valor, txid = '***', descricao }) {
    const k = normalizarChave(chave, tipo);
    if (!k) throw new Error('Chave Pix não configurada ou inválida para o tipo escolhido.');
    const nomeOk = limpar(nome, 25) || 'RECEBEDOR';
    const cidadeOk = limpar(cidade, 15) || 'BRASIL';
    const tx = String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
    let conta = campo('00', 'br.gov.bcb.pix') + campo('01', k);
    // descrição só se couber no limite do campo 26 (99 caracteres)
    const desc = descricao ? limpar(descricao, 40) : '';
    if (desc && conta.length + desc.length + 4 <= 99) conta += campo('02', desc);
    const valorStr = valor !== undefined && valor !== null ? Number(valor).toFixed(2) : null;
    const corpo =
        campo('00', '01') +
        campo('26', conta) +
        campo('52', '0000') +
        campo('53', '986') +
        (valorStr && Number(valorStr) > 0 ? campo('54', valorStr) : '') +
        campo('58', 'BR') +
        campo('59', nomeOk) +
        campo('60', cidadeOk) +
        campo('62', campo('05', tx)) +
        '6304';
    return corpo + crc16(corpo);
}

/** Lê os campos de um BR Code (usado nos testes e para conferência). */
export function lerPix(codigo) {
    const out = {};
    let i = 0;
    while (i < codigo.length) {
        const id = codigo.slice(i, i + 2), n = Number(codigo.slice(i + 2, i + 4));
        out[id] = codigo.slice(i + 4, i + 4 + n);
        i += 4 + n;
    }
    return out;
}
