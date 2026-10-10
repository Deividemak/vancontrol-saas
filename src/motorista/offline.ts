// Fila offline: toda ação do motorista entra aqui e é enviada assim que houver sinal.
// Cada item tem um id único; o servidor ignora reenvios (idempotente).
import { useEffect, useState } from 'react';
import { apiFetch } from '../services/api';

export interface ItemFila {
  id: string;
  url: string;
  body: unknown;
  criado: number;
  tentativas: number;
}
export type Resultado = { status: 'ok'; dados: any } | { status: 'erro'; mensagem: string; codigo: number; dados?: any } | { status: 'pendente' };

const CHAVE = 'vc_motorista_fila';
const MAX_ITENS = 2000;

export function novoId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch { /* contexto sem HTTPS */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ler(): ItemFila[] {
  try { return JSON.parse(localStorage.getItem(CHAVE) || '[]'); } catch { return []; }
}
function gravar(f: ItemFila[]) {
  try { localStorage.setItem(CHAVE, JSON.stringify(f.slice(-MAX_ITENS))); }
  catch {
    // armazenamento cheio (fotos): descarta posições antigas de GPS primeiro
    const enxuta = f.filter(i => !i.url.endsWith('/posicoes')).slice(-MAX_ITENS);
    try { localStorage.setItem(CHAVE, JSON.stringify(enxuta)); } catch { /* sem espaço */ }
  }
  avisar();
}

const ouvintes = new Set<() => void>();
const resultados = new Map<string, Resultado>();
function avisar() { ouvintes.forEach(f => f()); }

export function pendentes() { return ler().length; }

export function enfileirar(url: string, body: unknown): string {
  const id = novoId();
  const fila = ler();
  fila.push({ id, url, body, criado: Date.now(), tentativas: 0 });
  gravar(fila);
  void sincronizar();
  return id;
}

let rodando: Promise<void> | null = null;
let cancelarEnvio: (() => void) | null = null;

/** Sinal voltou (ou caiu): desiste de um envio possivelmente pendurado e recomeça. */
export function reiniciarEnvio() {
  cancelarEnvio?.();
  void (rodando || Promise.resolve()).then(() => sincronizar());
}

/** Envia a fila em ordem. Para no primeiro erro de rede (tenta de novo depois). */
export function sincronizar(): Promise<void> {
  if (rodando) return rodando;
  // o corpo roda numa microtarefa: assim "rodando" é atribuído ANTES de o finally limpá-lo
  // (com a fila vazia a função terminaria de forma síncrona e "rodando" ficaria preso)
  rodando = Promise.resolve().then(async () => {
    try {
      while (true) {
        const fila = ler();
        if (!fila.length) break;
        const item = fila[0];
        let res: Response;
        const corpo = JSON.stringify(item.body);
        // sinal fraco pode deixar a requisição pendurada: limite de tempo (maior para fotos)
        const ctrl = new AbortController();
        let limite: ReturnType<typeof setTimeout> | undefined;
        // não depende do navegador cancelar a requisição: a fila para de esperar sozinha
        // (o servidor ignora reenvios, então repetir é seguro)
        const desistir = new Promise<never>((_, rejeitar) => {
          limite = setTimeout(() => rejeitar(new Error('tempo esgotado')), corpo.length > 100_000 ? 60_000 : 15_000);
          cancelarEnvio = () => rejeitar(new Error('reiniciado'));
        });
        try {
          res = await Promise.race([
            apiFetch(item.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, signal: ctrl.signal }),
            desistir,
          ]);
        } catch {
          ctrl.abort();
          break; // sem rede, tempo esgotado ou reinício: tenta de novo depois
        } finally {
          clearTimeout(limite);
          cancelarEnvio = null;
        }
        if (res.status >= 500 || res.status === 401 || res.status === 408 || res.status === 429) {
          // servidor fora/sessão expirada: mantém na fila
          const f = ler();
          if (f[0]?.id === item.id) { f[0].tentativas++; gravar(f); }
          break;
        }
        let dados: any = null;
        try { dados = await res.json(); } catch { /* sem corpo */ }
        resultados.set(item.id, res.ok
          ? { status: 'ok', dados }
          : { status: 'erro', mensagem: dados?.error || `Erro ${res.status}`, codigo: res.status, dados });
        gravar(ler().filter(i => i.id !== item.id));
      }
    } finally {
      rodando = null;
      avisar();
    }
  });
  return rodando;
}

/** Enfileira e tenta enviar na hora. Diz se foi enviado, recusado ou ficou pendente (sem sinal). */
export async function enviarAgora(url: string, body: unknown): Promise<Resultado> {
  const id = enfileirar(url, body);
  await sincronizar();
  // pode ter caído numa sincronização que já estava rodando
  if (!resultados.has(id) && ler().some(i => i.id === id)) await sincronizar();
  return resultados.get(id) || { status: 'pendente' };
}

export function aoMudar(f: () => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/** Estado da conexão e da fila para a interface. */
export function useFila() {
  const [estado, setEstado] = useState({ online: typeof navigator === 'undefined' ? true : navigator.onLine, pendentes: pendentes() });
  useEffect(() => {
    const atualizar = () => setEstado({ online: navigator.onLine, pendentes: pendentes() });
    const on = () => { atualizar(); reiniciarEnvio(); };
    window.addEventListener('online', on);
    window.addEventListener('offline', atualizar);
    const sair = aoMudar(atualizar);
    const t = setInterval(() => { if (pendentes()) void sincronizar(); }, 15000);
    void sincronizar();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', atualizar); sair(); clearInterval(t); };
  }, []);
  return estado;
}

// Cache simples para abrir sem sinal
export function salvarCache<T>(chave: string, valor: T) {
  try { localStorage.setItem(`vc_motorista_${chave}`, JSON.stringify(valor)); } catch { /* cheio */ }
}
export function lerCache<T>(chave: string): T | null {
  try { const s = localStorage.getItem(`vc_motorista_${chave}`); return s ? JSON.parse(s) as T : null; } catch { return null; }
}
