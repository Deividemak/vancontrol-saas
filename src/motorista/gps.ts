// GPS do celular durante a viagem + tela sempre acesa (navegadores param o GPS com a tela apagada)
import { useEffect, useRef, useState } from 'react';
import { enfileirar } from './offline';

export interface Posicao { lat: number; lng: number; precisao_m: number | null; velocidade_kmh: number | null; registrado_em: string; }
export type EstadoGps = 'aguardando' | 'ok' | 'negado' | 'indisponivel';

const INTERVALO_MIN_MS = 10000;   // no máximo 1 ponto a cada 10 s
const ENVIO_MS = 30000;           // envia em lote a cada 30 s

// última posição conhecida (usada para carimbar os eventos)
let ultima: Posicao | null = null;
export const ultimaPosicao = () => ultima;

export function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const s = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
}

export function useGps(viagemId: number | null) {
  const [estado, setEstado] = useState<EstadoGps>('aguardando');
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const buffer = useRef<Posicao[]>([]);

  useEffect(() => {
    if (!viagemId) return;
    if (!('geolocation' in navigator)) { setEstado('indisponivel'); return; }
    let ultimoPonto = 0;
    const aoReceber = (p: GeolocationPosition) => {
        setEstado('ok');
        const pos: Posicao = {
          lat: +p.coords.latitude.toFixed(7), lng: +p.coords.longitude.toFixed(7),
          precisao_m: p.coords.accuracy ? Math.round(p.coords.accuracy) : null,
          velocidade_kmh: p.coords.speed !== null && p.coords.speed !== undefined ? +(p.coords.speed * 3.6).toFixed(1) : null,
          registrado_em: new Date(p.timestamp || Date.now()).toISOString(),
        };
        ultima = pos;
        setPosicao(pos);
        if (Date.now() - ultimoPonto >= INTERVALO_MIN_MS) {
          ultimoPonto = Date.now();
          buffer.current.push(pos);
        }
    };
    const aoFalhar = (err: GeolocationPositionError) => setEstado(err.code === err.PERMISSION_DENIED ? 'negado' : 'indisponivel');
    const id = navigator.geolocation.watchPosition(aoReceber, aoFalhar, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    // van parada: o celular quase não manda posição; pede uma a cada ~45 s para a central saber que está tudo bem
    const pulso = setInterval(() => {
      if (Date.now() - ultimoPonto > 40000) navigator.geolocation.getCurrentPosition(aoReceber, () => {}, { enableHighAccuracy: true, maximumAge: 20000, timeout: 20000 });
    }, 45000);
    const envio = setInterval(() => {
      if (!buffer.current.length) return;
      const lote = buffer.current.splice(0);
      enfileirar(`/api/motorista/viagens/${viagemId}/posicoes`, { posicoes: lote });
    }, ENVIO_MS);

    // mantém a tela acesa durante a viagem
    let trava: { release: () => Promise<void> } | null = null;
    const pedirTrava = async () => {
      try { trava = await (navigator as any).wakeLock?.request('screen'); } catch { /* sem suporte */ }
    };
    void pedirTrava();
    const voltou = () => { if (document.visibilityState === 'visible') void pedirTrava(); };
    document.addEventListener('visibilitychange', voltou);

    return () => {
      navigator.geolocation.clearWatch(id);
      clearInterval(envio);
      clearInterval(pulso);
      if (buffer.current.length) enfileirar(`/api/motorista/viagens/${viagemId}/posicoes`, { posicoes: buffer.current.splice(0) });
      document.removeEventListener('visibilitychange', voltou);
      void trava?.release().catch(() => {});
    };
  }, [viagemId]);

  return { estado, posicao };
}
