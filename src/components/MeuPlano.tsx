// Meu plano: quantas vans o plano permite e quanto já está em uso
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import { Selo } from './ui';

interface Plano { id: string; nome: string; vans: number | null; preco: number | null; }
interface Dados { atual: Plano & { vans_em_uso: number; alunos_ativos: number }; planos: Plano[]; }

export const MeuPlano: React.FC = () => {
  const [d, setD] = useState<Dados | null>(null);
  useEffect(() => { apiFetch('/api/plano').then(r => r.json()).then(setD).catch(() => {}); }, []);
  if (!d) return <p className="p-8 text-slate-400">Carregando...</p>;
  const pct = d.atual.vans ? Math.min(100, Math.round((d.atual.vans_em_uso / d.atual.vans) * 100)) : 0;
  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      <div className="space-y-1">
        <h2 className="text-3xl font-black tracking-tight">Meu plano</h2>
        <p className="text-slate-500 dark:text-slate-400">O VanControl cresce com a sua frota: de 1 até 40 vans.</p>
      </div>
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2 max-w-xl">
        <p className="text-sm text-slate-500">Plano atual</p>
        <p className="text-2xl font-black">{d.atual.nome}</p>
        <p className="text-sm">{d.atual.vans_em_uso} van(s) em uso{d.atual.vans ? ` de ${d.atual.vans}` : ' · sem limite'} · {d.atual.alunos_ativos} aluno(s) ativo(s)</p>
        {d.atual.vans && <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-2 rounded-full ${pct >= 100 ? 'bg-rose-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} /></div>}
      </section>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {d.planos.map(p => (
          <div key={p.id} className={`rounded-xl border p-4 space-y-1 ${p.id === d.atual.id ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
            <div className="flex items-center gap-2"><p className="font-black flex-1">{p.nome}</p>{p.id === d.atual.id && <Selo cor="azul">Atual</Selo>}</div>
            <p className="text-2xl font-black">{p.preco ? `R$ ${p.preco}` : 'Grátis'}<span className="text-sm text-slate-400 font-bold">{p.preco ? '/mês' : ''}</span></p>
            <p className="text-sm text-slate-500">Até {p.vans} van{p.vans === 1 ? '' : 's'} · todos os recursos</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-500">Para mudar de plano, fale com o suporte do VanControl.</p>
    </div>
  );
};
