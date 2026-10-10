// IA no WhatsApp (Gemini): responde dúvidas comuns dos pais usando só os dados do sistema.
// Ligue com GEMINI_API_KEY no .env (chave grátis em https://aistudio.google.com). Sem chave, fica desligada.
const MODELO = () => process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const URL_BASE = () => (process.env.GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');

export const iaLigada = () => !!process.env.GEMINI_API_KEY;

/** Pergunta ao Gemini com o contexto do responsável. Devolve o texto ou null (erro/sem resposta). */
export async function responderComIA({ empresa, pergunta, contexto }) {
    if (!iaLigada()) return null;
    const instrucao = `Você é o atendente virtual da empresa de transporte escolar "${empresa}", respondendo pais no WhatsApp.
Responda em português do Brasil, curto (até 4 linhas), simpático e direto.
Use SOMENTE as informações do CONTEXTO abaixo. Se a resposta não estiver no contexto, diga que a equipe vai responder em breve.
Nunca invente horários, valores, nomes ou dados de pagamento. Não peça senhas nem dados de cartão.
Para avisar falta, oriente a escrever, por exemplo: "<nome> não vai amanhã".

CONTEXTO:
${contexto}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
        const r = await fetch(`${URL_BASE()}/models/${MODELO()}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: instrucao }] },
                contents: [{ role: 'user', parts: [{ text: pergunta.slice(0, 1000) }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
            }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const texto = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim();
        return texto ? texto.slice(0, 1500) : null;
    } catch (err) {
        console.warn('[ia] Gemini indisponível:', err.message);
        return null;
    } finally {
        clearTimeout(t);
    }
}
