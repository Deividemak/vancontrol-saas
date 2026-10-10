// Aba Lucro por rota: receita x custos (veículo e motorista) rateados, com editor de custos fixos
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Modal, inputCls, Selo } from '../ui';
import { BRL, mesAtual, competencia, buscarJson, ErroCarga } from './util';

interface Linha {
  rota_id: number; nome: string; tipo: string; placa: string | null; motorista_nome: string | null; alunos: number; lugares: number | null;
  receita: number; recebido: number; custo_veiculo: number; custo_motorista: number; custo_total: number; lucro: number;
  margem_pct: number | null; custo_por_aluno: number | null; ocupacao_pct: number | null;
}
interface Resultado {
  mes: string; rotas: Linha[]; totais: { receita: number; recebido: number; custo_total: number; lucro: number; margem_pct: number | null };
  custos_sem_rota: { tipo: string; nome: string; valor: number }[]; receita_sem_rota: number;
}
interface Custos { veiculos: { id: number; placa: string; modelo: string; custo_fixo_mensal: number | string | null }[]; motoristas: { id: number; nome: string; custo_mensal: number | string | null }[] }

export const LucroRotas: React.FC = () => {
  const [mes, setMes] = useState(mesAtual());
  const [r, setR] = useState<Resultado | null>(null);
  const [custos, setCustos] = useState<Custos | null>(null);
  const [erro, setErro] = useState('');

  const carregar = () => buscarJson<Resultado>(apiFetch, `/api/financeiro/lucro?mes=${mes}`).then(x => { setErro(''); setR(x); }).catch(e => setErro(e.message));
  useEffect(() => { setR(null); carregar(); }, [mes]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirCustos = () => buscarJson<Custos>(apiFetch, '/api/financeiro/custos').then(setCustos).catch(e => alert(e.message));
  const salvarCustos = async () => {
    await apiFetch('/api/financeiro/custos', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      motoristas: custos!.motoristas.map(m => ({ id: m.id, custo_mensal: m.custo_mensal === null || m.custo_mensal === '' ? null : Number(String(m.custo_mensal).replace(',', '.')) })),
      veiculos: custos!.veiculos.map(v => ({ id: v.id, custo_fixo_mensal: v.custo_fixo_mensal === null || v.custo_fixo_mensal === '' ? null : Number(String(v.custo_fixo_mensal).replace(',', '.')) })),
    }) });
    setCustos(null); carregar();
  };
  const semCustos = r && r.rotas.length > 0 && r.rotas.every(l => l.custo_total === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <input type="month" className={`${inputCls} max-w-[200px]`} value={mes} onChange={e => e.target.value && setMes(e.target.value)} aria-label="Mês" />
        <div className="flex-1" />
        <Botao variante="secundario" icone="tune" onClick={abrirCustos}>Custos fixos</Botao>
      </div>
      {erro && <ErroCarga msg={erro} />}
      {!r && !erro && <p className="text-center text-slate-500 animate-pulse py-8">Calculando...</p>}
      {r && (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[['Receita (mensalidades)', BRL(r.totais.receita), ''], ['Recebido', BRL(r.totais.recebido), ''], ['Custos', BRL(r.totais.custo_total), ''],
            ['Lucro', BRL(r.totais.lucro), r.totais.margem_pct === null ? '' : `${r.totais.margem_pct}% de margem`]].map(([t, v, s]) => (
            <div key={t} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">{t}</p><p className="text-2xl font-black mt-1">{v}</p>{s && <p className="text-xs text-slate-500">{s}</p>}
            </div>
          ))}
        </div>
        {semCustos && <p className="text-sm text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">Nenhum custo em {competencia(mes + '-01')}. Cadastre o custo mensal dos motoristas e o custo fixo dos veículos em <b>Custos fixos</b> (combustível e manutenção entram automaticamente da Frota).</p>}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] uppercase tracking-widest text-slate-500 font-black">
              <tr><th className="px-4 py-3">Rota</th><th className="px-4 py-3 text-right">Alunos</th><th className="px-4 py-3 text-right">Receita</th><th className="px-4 py-3 text-right">Veículo</th>
                <th className="px-4 py-3 text-right">Motorista</th><th className="px-4 py-3 text-right">Lucro</th><th className="px-4 py-3 text-right">Margem</th><th className="px-4 py-3 text-right">Custo/aluno</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {r.rotas.map(l => (
                <tr key={l.rota_id}>
                  <td className="px-4 py-3"><p className="font-black">{l.nome}</p><p className="text-xs text-slate-500">{[l.placa, l.motorista_nome].filter(Boolean).join(' · ') || 'Sem veículo/motorista'}</p></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{l.alunos}{l.lugares ? `/${l.lugares}` : ''}{l.ocupacao_pct !== null && <div className="text-[11px] text-slate-500">{l.ocupacao_pct}% ocupada</div>}</td>
                  <td className="px-4 py-3 text-right font-bold whitespace-nowrap">{BRL(l.receita)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{BRL(l.custo_veiculo)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{BRL(l.custo_motorista)}</td>
                  <td className={`px-4 py-3 text-right font-black whitespace-nowrap ${l.lucro < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{BRL(l.lucro)}</td>
                  <td className="px-4 py-3 text-right">{l.margem_pct === null ? '—' : <Selo cor={l.margem_pct < 0 ? 'vermelho' : l.margem_pct < 20 ? 'amarelo' : 'verde'}>{l.margem_pct}%</Selo>}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{l.custo_por_aluno === null ? '—' : BRL(l.custo_por_aluno)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Como é calculado: a mensalidade de cada aluno é dividida entre as rotas dele (ida e volta = metade cada). Combustível, manutenção e custo fixo do veículo
          são divididos entre as rotas do veículo pela distância; o custo do motorista, pela duração das rotas.
          {r.custos_sem_rota.length > 0 && <> Custos sem rota no mês: {r.custos_sem_rota.map(c => `${c.nome} (${BRL(c.valor)})`).join(', ')} — entram no total.</>}
          {r.receita_sem_rota > 0 && <> Receita de alunos fora de rotas: {BRL(r.receita_sem_rota)}.</>}
        </p>
      </>)}

      <Modal titulo="Custos fixos mensais" aberto={!!custos} onFechar={() => setCustos(null)} tamanho="lg"
        rodape={<><Botao variante="secundario" onClick={() => setCustos(null)}>Cancelar</Botao><Botao onClick={salvarCustos}>Salvar</Botao></>}>
        {custos && (
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Motoristas (salário + encargos)</p>
              {custos.motoristas.map((m, i) => (
                <label key={m.id} className="flex items-center gap-2 mb-2 text-sm"><span className="flex-1">{m.nome}</span>
                  <input className={`${inputCls} max-w-[130px]`} inputMode="decimal" placeholder="R$ / mês" aria-label={`Custo ${m.nome}`} value={m.custo_mensal ?? ''}
                    onChange={e => setCustos(c => c && { ...c, motoristas: c.motoristas.map((x, j) => (j === i ? { ...x, custo_mensal: e.target.value } : x)) })} /></label>
              ))}
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Veículos (parcela, seguro, IPVA, rateados por mês)</p>
              {custos.veiculos.map((v, i) => (
                <label key={v.id} className="flex items-center gap-2 mb-2 text-sm"><span className="flex-1">{v.placa} <span className="text-slate-400">{v.modelo}</span></span>
                  <input className={`${inputCls} max-w-[130px]`} inputMode="decimal" placeholder="R$ / mês" aria-label={`Custo ${v.placa}`} value={v.custo_fixo_mensal ?? ''}
                    onChange={e => setCustos(c => c && { ...c, veiculos: c.veiculos.map((x, j) => (j === i ? { ...x, custo_fixo_mensal: e.target.value } : x)) })} /></label>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
