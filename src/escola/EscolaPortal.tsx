// Portal da escola (link mágico): quais alunos da escola estão chegando e em qual van.
import React, { useCallback, useEffect, useState } from 'react';

interface Aluno { nome: string; turno: string; status: string; rotulo: string; }
interface Van {
  rota_nome: string; tipo: 'ida' | 'volta'; hora_saida: string | null; previsto_escola: string | null; placa: string | null; modelo: string | null;
  motorista: string | null; motorista_telefone: string | null; situacao: 'nao_iniciada' | 'em_andamento' | 'concluida'; eta_min: number | null; alunos: Aluno[];
}
interface Dados { escola: string; empresa: string; data: string; agora: string; vans: Van[]; }

const CHAVE = 'vancontrol_escola_token';
function tokenDaUrl(): string | null {
  const h = window.location.hash.replace(/^#/, '');
  if (h) {
    try { localStorage.setItem(CHAVE, h); } catch { /* sem armazenamento */ }
    window.history.replaceState(null, '', window.location.pathname);
    return h;
  }
  try { return localStorage.getItem(CHAVE); } catch { return null; }
}

const COR: Record<string, string> = {
  previsto: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', ausente_avisado: 'bg-amber-100 text-amber-700',
  embarcou: 'bg-blue-100 text-blue-700', desembarcou: 'bg-emerald-100 text-emerald-700', nao_compareceu: 'bg-rose-100 text-rose-700',
};
const SITUACAO = { nao_iniciada: 'Ainda não saiu', em_andamento: 'A caminho', concluida: 'Concluída' };

export const EscolaPortal: React.FC = () => {
  const [token] = useState(tokenDaUrl);
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const carregar = useCallback(async () => {
    if (!token) { setErro('Abra o link enviado pela empresa de transporte.'); return; }
    try {
      const r = await fetch('/api/escola-portal/hoje', { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (!r.ok) { setErro(j.error || 'Erro'); return; }
      setD(j); setErro('');
    } catch { setErro('Sem conexão. Tentando de novo...'); }
  }, [token]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 30000); return () => clearInterval(t); }, [carregar]);

  if (erro && !d) return <div className="min-h-screen flex items-center justify-center p-6 text-center font-bold text-slate-500">{erro}</div>;
  if (!d) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-400">Carregando...</div>;
  const total = d.vans.reduce((s, v) => s + v.alunos.length, 0);
  const chegaram = d.vans.filter(v => v.tipo === 'ida').reduce((s, v) => s + v.alunos.filter(a => a.status === 'desembarcou').length, 0);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-background-dark pb-10">
      <header className="bg-primary text-white px-4 pt-5 pb-5">
        <p className="text-xs font-black uppercase tracking-widest opacity-80">{d.empresa} · transporte escolar</p>
        <h1 className="text-2xl font-black">{d.escola}</h1>
        <p className="text-sm opacity-90">Hoje, {d.data.split('-').reverse().join('/')} · atualizado às {d.agora} · {chegaram} de {total} aluno(s) da ida já chegaram</p>
      </header>
      <main className="p-3 max-w-3xl mx-auto space-y-3">
        {erro && <p className="text-sm font-bold text-amber-700">{erro}</p>}
        {d.vans.length === 0 && <p className="rounded-2xl bg-white dark:bg-slate-900 p-6 text-center text-slate-500">Nenhum aluno desta escola nas rotas de hoje.</p>}
        {d.vans.map(v => (
          <section key={`${v.rota_nome}-${v.tipo}`} className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-black text-lg leading-tight">{v.tipo === 'ida' ? 'Chegada' : 'Saída'} · {v.rota_nome}</p>
                <p className="text-sm text-slate-500">
                  Van {v.placa || '—'}{v.modelo ? ` (${v.modelo})` : ''} · {v.motorista || 'motorista a definir'}{v.motorista_telefone ? ` · ${v.motorista_telefone}` : ''}
                </p>
              </div>
              <span className={`text-xs font-black px-2 py-1 rounded-lg ${v.situacao === 'em_andamento' ? 'bg-blue-600 text-white' : v.situacao === 'concluida' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {SITUACAO[v.situacao]}{v.eta_min !== null ? ` · chega em ~${v.eta_min} min` : v.previsto_escola && v.situacao === 'nao_iniciada' ? ` · previsto ${v.previsto_escola}` : ''}
              </span>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {v.alunos.map(a => (
                <li key={a.nome} className="py-1.5 flex items-center gap-2 text-sm">
                  <span className="flex-1 font-medium">{a.nome}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${COR[a.status] || COR.previsto}`}>{a.rotulo}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-center text-xs text-slate-400">Esta página atualiza sozinha a cada 30 segundos.</p>
      </main>
    </div>
  );
};
