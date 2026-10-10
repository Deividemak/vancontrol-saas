// Copiar para a área de transferência e ajustar links gerados pelo servidor.
// navigator.clipboard só existe em contexto seguro (https ou localhost); aberto por http com IP
// (ex.: http://192.168.0.139:3000) ele não existe, então cai no método antigo com execCommand.
import { useCallback, useEffect, useRef, useState } from 'react';

/** Copia o texto. Retorna true se conseguiu. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // sem permissão: tenta o método antigo
  }
  try {
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.setAttribute('readonly', '');
    campo.style.position = 'fixed';
    campo.style.top = '0';
    campo.style.left = '0';
    campo.style.opacity = '0';
    document.body.appendChild(campo);
    campo.focus();
    campo.select();
    campo.setSelectionRange(0, texto.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(campo);
    return ok;
  } catch {
    return false;
  }
}

/** Para botões "Copiar": copiado fica true por 2 segundos depois de copiar. */
export function useCopiar(ms = 2000) {
  const [copiado, setCopiado] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copiar = useCallback(async (texto: string) => {
    const ok = await copiarTexto(texto);
    if (ok) {
      setCopiado(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopiado(false), ms);
    }
    return ok;
  }, [ms]);
  return { copiado, copiar };
}

/**
 * Troca a origem do link (que vem do APP_URL do servidor, ex.: http://localhost:3000)
 * pelo endereço atual do navegador, mantendo o caminho, a busca e o que vem depois do #.
 */
export function linkNesteEndereco(link: string): string {
  try {
    const u = new URL(link);
    return `${window.location.origin}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return link;
  }
}
