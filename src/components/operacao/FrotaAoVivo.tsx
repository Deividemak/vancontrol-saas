// Mapa ao vivo de toda a frota (atualiza sozinho)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Selo, CorSelo } from '../ui';
import { Mapa, MarcadorMapa } from '../mapa/Mapa';

interface Van {
  viagem_id: number; rota_id: number; rota_nome: string; tipo: string; placa: string | null; modelo: string | null;
  motorista_nome: string | null; motorista_telefone: string | null; monitor_nome: string | null;
  posicao: { lat: number; lng: number } | null; velocidade: number | null; minutos_desde_posicao: number | null;
  a_bordo: number; aguardando: number; estado: 'movendo' | 'parada' | 'sem_sinal' | 'alerta' | 'emergencia';
  alertas: { tipo: string; nivel: string; mensagem: string }[]; atrasada_dia: boolean;
}

export const ESTADOS: Record<Van['estado'], { label: string; cor: string; selo: CorSelo }> = {
  movendo: { label: 'Em movimento', cor: '#059669', selo: 'verde' },
  parada: { label: 'Parada', cor: '#2563eb', selo: 'azul' },
  sem_sinal: { label: 'Sem sinal', cor: '#64748b', selo: 'cinza' },
  alerta: { label: 'Com alerta', cor: '#d97706', selo: 'amarelo' },
  emergencia: { label: 'Emergência', cor: '#e11d48', selo: 'vermelho' },
};

export const FrotaAoVivo: React.FC<{ onAbrirRota: (rotaId: number) => void }> = ({ onAbrirRota }) => {
  const [vans, setVans] = useState<Van[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [atualizado, setAtualizado] = useState('');

  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch('/api/operacao/frota-ao-vivo');
      if (r.ok) { setVans(await r.json()); setAtualizado(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })); }
    } catch { /* sem conexão: tenta de novo */ }
  }, []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 10000);
    return () => clearInterval(t);
  }, [carregar]);

  const marcadores = useMemo<MarcadorMapa[]>(() => (vans || []).filter(v => v.posicao).map(v => ({
    id: v.viagem_id, lat: v.posicao!.lat, lng: v.posicao!.lng, tipo: 'van', cor: ESTADOS[v.estado].cor, destaque: v.viagem_id === sel,
    titulo: `${v.rota_nome}\n${v.placa || ''} · ${v.motorista_nome || ''}\n${v.a_bordo} a bordo · ${ESTADOS[v.estado].label}${v.velocidade != null ? ` · ${Math.round(v.velocidade)} km/h` : ''}`,
  })), [vans, sel]);
  const enquadrar = useMemo(() => (vans || []).map(v => v.viagem_id).join(','), [vans]);

  if (!vans) return <p className="text-center text-slate-400 py-10 animate-pulse">Carregando a frota...</p>;
  const cont = (e: Van['estado']) => vans.filter(v => v.estado === e).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(Object.keys(ESTADOS) as Van['estado'][]).map(e => (
          <span key={e} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold">
            <span className="size-2.5 rounded-full" style={{ background: ESTADOS[e].cor }} />{ESTADOS[e].label} ({cont(e)})
          </span>
        ))}
        <span className="ml-auto text-slate-400">Atualiza a cada 10 s · {atualizado}</span>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        <Mapa className="h-[560px]" marcadores={marcadores} chaveEnquadramento={enquadrar} onClicarMarcador={id => setSel(Number(id))} />
        <aside className="space-y-2 max-h-[560px] overflow-y-auto">
          {vans.length === 0 && <p className="text-sm text-slate-400 text-center p-8">Nenhuma van em viagem agora.</p>}
          {vans.map(v => (
            <div key={v.viagem_id} onClick={() => setSel(v.viagem_id)}
              className={`p-3 rounded-xl border cursor-pointer ${sel === v.viagem_id ? 'border-primary ring-1 ring-primary' : 'border-slate-200 dark:border-slate-800'} bg-white dark:bg-slate-900`}>
              <div className="flex items-start gap-2">
                <span className="size-3 rounded-full mt-1 shrink-0" style={{ background: ESTADOS[v.estado].cor }} />
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm truncate">{v.rota_nome}</p>
                  <p className="text-xs text-slate-500">{v.placa || 'sem van'} · {v.motorista_nome || 'sem motorista'}{v.monitor_nome ? ` · ${v.monitor_nome}` : ''}</p>
                  <p className="text-xs text-slate-500">{v.a_bordo} a bordo · {v.aguardando} aguardando{v.velocidade != null ? ` · ${Math.round(v.velocidade)} km/h` : ''}
                    {v.minutos_desde_posicao != null ? ` · posição há ${v.minutos_desde_posicao} min` : ' · sem posição'}</p>
                  {v.alertas.map((a, i) => <p key={i} className={`text-[11px] font-bold mt-1 ${a.nivel === 'critico' ? 'text-rose-600' : 'text-amber-600'}`}>⚠ {a.mensagem}</p>)}
                </div>
                <Selo cor={ESTADOS[v.estado].selo}>{ESTADOS[v.estado].label}</Selo>
              </div>
              <div className="flex gap-3 mt-2 text-xs font-bold">
                <button className="text-primary" onClick={e => { e.stopPropagation(); onAbrirRota(v.rota_id); }}>Ver viagem</button>
                {v.motorista_telefone && <a className="text-primary" href={`tel:${v.motorista_telefone}`} onClick={e => e.stopPropagation()}>Ligar</a>}
                {v.posicao && <a className="text-primary" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${v.posicao.lat},${v.posicao.lng}`} onClick={e => e.stopPropagation()}>Abrir no Maps</a>}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
};
