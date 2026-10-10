// Relatórios: pontualidade, ocupação por veículo, km rodado e custo por aluno (com exportação CSV)
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import { Botao, Campo, inputCls, erroDaResposta } from './ui';

interface Rel {
  de: string; ate: string;
  totais: { viagens: number; concluidas: number; km: number; pct_saida: number | null; pct_presenca: number | null };
  pontualidade: { rota_nome: string; viagens: number; pct_saida: number | null; pct_fim: number | null; pct_presenca: number | null; km: number }[];
  veiculos: { placa: string; modelo: string; lugares: number | null; alunos_maior_rota: number; ocupacao_pct: number | null; viagens: number; media_a_bordo: number | null; ocupacao_real_pct: number | null; km: number }[];
  custos: null | { combustivel: number; manutencao: number; fixos_veiculos: number; motoristas: number; total: number; alunos_ativos: number; meses: number; por_aluno_mes: number | null; por_km: number | null; recebido: number };
}
const BRL = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const P = (v: number | null) => (v === null ? '—' : `${v}%`);
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

function baixarCsv(nome: string, linhas: (string | number | null)[][]) {
  const csv = linhas.map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nome; a.click(); URL.revokeObjectURL(a.href);
}

const Cartao: React.FC<{ titulo: string; valor: string; dica?: string }> = ({ titulo, valor, dica }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{titulo}</p>
    <p className="text-2xl font-black">{valor}</p>
    {dica && <p className="text-xs text-slate-500">{dica}</p>}
  </div>
);

export const Relatorios: React.FC = () => {
  const [de, setDe] = useState(`${hoje().slice(0, 7)}-01`);
  const [ate, setAte] = useState(hoje());
  const [r, setR] = useState<Rel | null>(null);
  const [erro, setErro] = useState('');
  const carregar = () => {
    setErro('');
    apiFetch(`/api/relatorios?de=${de}&ate=${ate}`).then(async x => (x.ok ? setR(await x.json()) : setErro(await erroDaResposta(x, 'Erro ao gerar')))).catch(() => setErro('Sem conexão com o servidor.'));
  };
  useEffect(() => { carregar(); }, []);

  const exportar = () => {
    if (!r) return;
    baixarCsv(`relatorio-${r.de}-a-${r.ate}.csv`, [
      ['Pontualidade por rota'], ['Rota', 'Viagens', 'Saída no horário', 'Fim no horário', 'Presença', 'Km'],
      ...r.pontualidade.map(p => [p.rota_nome, p.viagens, P(p.pct_saida), P(p.pct_fim), P(p.pct_presenca), p.km]),
      [], ['Veículos'], ['Placa', 'Modelo', 'Lugares', 'Alunos (maior rota)', 'Ocupação', 'Viagens', 'Média a bordo', 'Km'],
      ...r.veiculos.map(v => [v.placa, v.modelo, v.lugares, v.alunos_maior_rota, P(v.ocupacao_pct), v.viagens, v.media_a_bordo, v.km]),
      ...(r.custos ? [[], ['Custos'], ['Combustível', r.custos.combustivel], ['Manutenção', r.custos.manutencao], ['Fixos dos veículos', r.custos.fixos_veiculos],
        ['Motoristas', r.custos.motoristas], ['Total', r.custos.total], ['Custo por aluno/mês', r.custos.por_aluno_mes], ['Custo por km', r.custos.por_km], ['Recebido', r.custos.recebido]] : []),
    ]);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight">Relatórios</h2>
          <p className="text-slate-500 dark:text-slate-400">Pontualidade, ocupação das vans, quilometragem e custo por aluno no período.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Campo label="De"><input type="date" className={inputCls} value={de} onChange={e => setDe(e.target.value)} aria-label="De" /></Campo>
          <Campo label="Até"><input type="date" className={inputCls} value={ate} onChange={e => setAte(e.target.value)} aria-label="Até" /></Campo>
          <Botao onClick={carregar} icone="refresh">Gerar</Botao>
          <Botao variante="secundario" icone="download" onClick={exportar} disabled={!r}>Exportar CSV</Botao>
        </div>
      </div>
      {erro && <p className="text-rose-600 font-bold">{erro}</p>}
      {r && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Cartao titulo="Viagens" valor={String(r.totais.viagens)} dica={`${r.totais.concluidas} concluídas`} />
            <Cartao titulo="Saídas no horário" valor={P(r.totais.pct_saida)} dica="até 5 min de tolerância" />
            <Cartao titulo="Presença" valor={P(r.totais.pct_presenca)} dica="embarcaram / esperados" />
            <Cartao titulo="Km rodados" valor={r.totais.km.toLocaleString('pt-BR')} dica="GPS ou distância da rota" />
          </div>
          {r.custos && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Cartao titulo="Custo por aluno/mês" valor={BRL(r.custos.por_aluno_mes)} dica={`${r.custos.alunos_ativos} alunos ativos`} />
              <Cartao titulo="Custo por km" valor={BRL(r.custos.por_km)} />
              <Cartao titulo="Custos no período" valor={BRL(r.custos.total)} dica={`combustível ${BRL(r.custos.combustivel)} · manutenção ${BRL(r.custos.manutencao)}`} />
              <Cartao titulo="Recebido no período" valor={BRL(r.custos.recebido)} />
            </div>
          )}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <p className="px-4 py-3 font-black text-sm">Pontualidade por rota</p>
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-widest text-slate-400"><tr>{['Rota', 'Viagens', 'Saída no horário', 'Fim no horário', 'Presença', 'Km'].map(h => <th key={h} className="text-left px-4 py-2">{h}</th>)}</tr></thead>
              <tbody>
                {r.pontualidade.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-center text-slate-400">Nenhuma viagem no período.</td></tr>}
                {r.pontualidade.map(p => (
                  <tr key={p.rota_nome} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 font-bold">{p.rota_nome}</td><td className="px-4 py-2">{p.viagens}</td><td className="px-4 py-2">{P(p.pct_saida)}</td>
                    <td className="px-4 py-2">{P(p.pct_fim)}</td><td className="px-4 py-2">{P(p.pct_presenca)}</td><td className="px-4 py-2">{p.km.toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <p className="px-4 py-3 font-black text-sm">Ocupação e quilometragem por veículo</p>
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-widest text-slate-400"><tr>{['Veículo', 'Lugares', 'Alunos (maior rota)', 'Ocupação', 'Viagens', 'Média a bordo', 'Km'].map(h => <th key={h} className="text-left px-4 py-2">{h}</th>)}</tr></thead>
              <tbody>
                {r.veiculos.map(v => (
                  <tr key={v.placa} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2"><b>{v.placa}</b> <span className="text-slate-500">{v.modelo}</span></td><td className="px-4 py-2">{v.lugares ?? '—'}</td>
                    <td className="px-4 py-2">{v.alunos_maior_rota}</td>
                    <td className="px-4 py-2"><span className={v.ocupacao_pct !== null && v.ocupacao_pct > 100 ? 'text-rose-600 font-bold' : ''}>{P(v.ocupacao_pct)}</span></td>
                    <td className="px-4 py-2">{v.viagens}</td><td className="px-4 py-2">{v.media_a_bordo ?? '—'}</td><td className="px-4 py-2">{v.km.toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
};
