// Agenda da frota: viagens encadeadas de cada veículo ao longo do dia
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Selo } from '../ui';

interface Viagem {
  id: number; nome: string; periodo: string; tipo: 'ida' | 'volta'; hora_saida: string | null; hora_fim: string | null;
  motorista_nome: string | null; total_alunos: number; conflito_com_proxima: boolean; intervalo_ate_proxima_min: number | null;
}
interface VeiculoAgenda { id: number; placa: string; modelo: string; lugares: number | null; status: string; viagens: Viagem[]; }

const INICIO = 5 * 60, FIM = 20 * 60; // 05:00 às 20:00
const min = (h: string | null) => { if (!h) return null; const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const pct = (m: number) => `${((Math.min(Math.max(m, INICIO), FIM) - INICIO) / (FIM - INICIO)) * 100}%`;

export const AgendaFrota: React.FC<{ onAbrirRota: (id: number) => void }> = ({ onAbrirRota }) => {
  const [dados, setDados] = useState<{ veiculos: VeiculoAgenda[]; sem_veiculo: Viagem[] } | null>(null);

  useEffect(() => { apiFetch('/api/rotas/agenda').then(r => r.json()).then(setDados); }, []);
  if (!dados) return <p className="p-8 text-center font-bold text-slate-400">Carregando agenda...</p>;

  const horas = Array.from({ length: (FIM - INICIO) / 60 + 1 }, (_, i) => INICIO / 60 + i);

  const Linha: React.FC<{ titulo: React.ReactNode; viagens: Viagem[] }> = ({ titulo, viagens }) => (
    <div className="grid grid-cols-[220px_1fr] gap-4 items-center py-3 border-b border-slate-100 dark:border-slate-800">
      <div className="min-w-0">{titulo}</div>
      <div className="space-y-2">
        <div className="relative h-9 rounded-lg bg-slate-50 dark:bg-slate-800/50">
          {horas.map(h => <div key={h} className="absolute top-0 bottom-0 border-l border-slate-200/70 dark:border-slate-700/50" style={{ left: pct(h * 60) }} />)}
          {viagens.map(v => {
            const ini = min(v.hora_saida), fim = min(v.hora_fim) ?? (ini !== null ? ini + 30 : null);
            if (ini === null || fim === null) return null;
            const conflito = v.conflito_com_proxima || viagens.some(o => o !== v && o.conflito_com_proxima && viagens[viagens.indexOf(o) + 1] === v);
            return (
              <button key={v.id} onClick={() => onAbrirRota(v.id)} title={`${v.nome}\n${v.hora_saida}–${v.hora_fim || '?'} · ${v.total_alunos} alunos`}
                className={`absolute top-1 bottom-1 rounded-md text-[10px] font-bold text-white px-1.5 truncate text-left hover:brightness-110
                  ${conflito ? 'bg-rose-500 ring-2 ring-rose-300' : v.tipo === 'ida' ? 'bg-emerald-600' : 'bg-indigo-600'}`}
                style={{ left: pct(ini), width: `calc(${pct(fim)} - ${pct(ini)})`, minWidth: 6 }}>
                {v.nome}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {viagens.length === 0 && <span className="text-xs text-slate-400">Nenhuma viagem</span>}
          {viagens.map(v => (
            <span key={v.id} className="text-xs text-slate-500 flex items-center gap-1">
              <button className="font-bold text-slate-700 dark:text-slate-200 hover:text-primary" onClick={() => onAbrirRota(v.id)}>{v.nome}</button>
              {v.hora_saida || 'sem horário'}{v.hora_fim ? `–${v.hora_fim}` : ''}
              {v.conflito_com_proxima && <Selo cor="vermelho" icone="error">sobrepõe a próxima</Selo>}
              {!v.conflito_com_proxima && v.intervalo_ate_proxima_min !== null && v.intervalo_ate_proxima_min < 10 &&
                <Selo cor="amarelo" icone="timer">{v.intervalo_ate_proxima_min} min até a próxima</Selo>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 overflow-x-auto">
      <div className="min-w-[900px]">
        <div className="grid grid-cols-[220px_1fr] gap-4 mb-1">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">Veículo</span>
          <div className="relative h-4">
            {horas.map(h => <span key={h} className="absolute -translate-x-1/2 text-[10px] text-slate-400 font-bold" style={{ left: pct(h * 60) }}>{h}h</span>)}
          </div>
        </div>
        {dados.veiculos.map(v => (
          <Linha key={v.id} viagens={v.viagens} titulo={<>
            <p className="text-sm font-black">{v.placa}</p>
            <p className="text-xs text-slate-500 truncate">{v.modelo}{v.lugares ? ` · ${v.lugares} lugares` : ''}</p>
          </>} />
        ))}
        {dados.sem_veiculo.length > 0 && (
          <Linha viagens={dados.sem_veiculo} titulo={<p className="text-sm font-black text-amber-600">Rotas sem veículo</p>} />
        )}
        <div className="flex gap-3 mt-4">
          <Selo cor="verde">Ida</Selo><Selo cor="roxo">Volta</Selo><Selo cor="vermelho">Conflito de horário</Selo>
        </div>
      </div>
    </div>
  );
};
