// Faixa vermelha em todas as telas do painel quando há emergência aberta
import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../services/api';

interface Emergencia { id: number; rota_nome: string | null; motorista_nome: string | null; motorista_telefone: string | null; registrado_em: string; lat: number | null; lng: number | null; }

function bipe() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch { /* navegador bloqueou som */ }
}

export const AlertaEmergencia: React.FC<{ onVer: () => void }> = ({ onVer }) => {
  const [lista, setLista] = useState<Emergencia[]>([]);
  const [criticos, setCriticos] = useState(0);
  const vistas = useRef<Set<number>>(new Set());
  useEffect(() => {
    let ativo = true;
    const buscar = async () => {
      try {
        const res = await apiFetch('/api/operacao/alertas');
        if (!res.ok || !ativo) return;
        const j = await res.json();
        const novas = (j.emergencias as Emergencia[]).filter(e => !vistas.current.has(e.id));
        if (novas.length) { novas.forEach(e => vistas.current.add(e.id)); bipe(); }
        setLista(j.emergencias);
        setCriticos(j.anomalias_criticas || 0);
      } catch { /* sem conexão */ }
    };
    buscar();
    const t = setInterval(buscar, 15000);
    return () => { ativo = false; clearInterval(t); };
  }, []);
  if (!lista.length) {
    if (!criticos) return null;
    return (
      <div className="bg-amber-500 text-white px-6 py-2 flex flex-wrap items-center gap-3 print:hidden" role="status">
        <span className="material-symbols-outlined">notification_important</span>
        <p className="flex-1 font-bold text-sm">{criticos} alerta{criticos > 1 ? 's' : ''} crítico{criticos > 1 ? 's' : ''} na operação (van parada, fora do trajeto, velocidade ou rota não encerrada)</p>
        <button onClick={onVer} className="h-8 px-3 rounded-lg bg-white/20 font-black text-sm">Ver alertas</button>
      </div>
    );
  }
  const e = lista[0];
  return (
    <div className="bg-rose-600 text-white px-6 py-3 flex flex-wrap items-center gap-3 animate-pulse print:hidden" role="alert">
      <span className="material-symbols-outlined text-3xl">sos</span>
      <p className="flex-1 font-bold">
        EMERGÊNCIA{lista.length > 1 ? ` (${lista.length})` : ''}: {e.rota_nome || 'rota'} · {e.motorista_nome || 'motorista'} às {e.registrado_em.slice(11, 16)}
      </p>
      {e.motorista_telefone && <a href={`tel:${e.motorista_telefone}`} className="h-10 px-4 rounded-lg bg-white text-rose-600 font-black flex items-center gap-1"><span className="material-symbols-outlined">call</span>Ligar</a>}
      {e.lat !== null && <a href={`https://www.google.com/maps?q=${e.lat},${e.lng}`} target="_blank" rel="noreferrer" className="h-10 px-4 rounded-lg bg-white/20 font-black flex items-center">Local</a>}
      <button onClick={onVer} className="h-10 px-4 rounded-lg bg-white/20 font-black">Ver operação</button>
    </div>
  );
};
