// Aba Mensalidades: lista, indicadores, cobrança com Pix, baixa com recibo
import React, { useEffect, useMemo, useState } from 'react';
import { StatCard } from '../StatCard';
import { apiFetch } from '../../services/api';
import { Botao, Modal, Campo, Selo, inputCls, erroDaResposta } from '../ui';
import { CobrancaModal, PagamentoModal } from './Modais';
import { BRL, dataBR, competencia, mesAtual, imprimirRecibo, statusMensalidade } from './util';

export interface Mensalidade {
  id: number; aluno_id: number; aluno: string; responsavel_nome: string | null; responsavel_telefone: string | null;
  valor: number; valor_pago: number | null; data_vencimento: string; data_pagamento: string | null;
  status: 'Pendente' | 'Pago' | 'Atrasado' | 'Cancelado'; descricao: string | null; recibo_numero: number | null;
  forma_pagamento: string | null; gateway: string | null; suspenso: boolean;
}

export const Mensalidades: React.FC = () => {
  const [lista, setLista] = useState<Mensalidade[] | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [mes, setMes] = useState('');
  const [cobrar, setCobrar] = useState<number | null>(null);
  const [pagar, setPagar] = useState<Mensalidade | null>(null);
  const [editar, setEditar] = useState<Mensalidade | null>(null);
  const [aviso, setAviso] = useState('');

  const carregar = () =>
    apiFetch('/api/financeiro/dashboard')
      .then(async r => (r.ok ? setLista(await r.json()) : setErro(await erroDaResposta(r, 'Erro ao carregar'))))
      .catch(() => setErro('Erro de comunicação com o servidor.'));
  useEffect(() => { carregar(); }, []);

  const mesHoje = mesAtual();
  const meses = useMemo(() => [...new Set((lista || []).map(m => m.data_vencimento.slice(0, 7)))].sort().reverse(), [lista]);
  const filtradas = useMemo(() => (lista || []).filter(m =>
    (!filtro || (filtro === 'Aberto' ? m.status === 'Pendente' || m.status === 'Atrasado' : m.status === filtro)) &&
    (!mes || m.data_vencimento.startsWith(mes)) &&
    (!busca || `${m.aluno} ${m.responsavel_nome || ''}`.toLowerCase().includes(busca.toLowerCase()))), [lista, filtro, mes, busca]);

  if (erro) return <p className="p-8 text-center text-rose-600 font-bold">{erro}</p>;
  if (!lista) return <p className="p-8 text-center font-bold text-slate-500 animate-pulse">Carregando mensalidades...</p>;

  const pagasMes = lista.filter(m => m.status === 'Pago' && (m.data_pagamento || '').startsWith(mesHoje));
  const recebidoMes = pagasMes.reduce((s, m) => s + Number(m.valor_pago ?? m.valor), 0);
  const abertas = lista.filter(m => m.status === 'Pendente' || m.status === 'Atrasado');
  const atrasadas = lista.filter(m => m.status === 'Atrasado');
  const ativas = lista.filter(m => m.status !== 'Cancelado');
  const pctInad = ativas.length ? (atrasadas.length / ativas.length) * 100 : 0;

  const verRecibo = async (m: Mensalidade) => {
    const r = await apiFetch(`/api/financeiro/mensalidades/${m.id}/recibo`);
    if (r.ok) imprimirRecibo(await r.json());
    else alert(await erroDaResposta(r, 'Erro ao gerar recibo'));
  };
  const acao = async (m: Mensalidade, caminho: string, pergunta: string, corpo?: object) => {
    if (!window.confirm(pergunta)) return;
    const r = await apiFetch(`/api/financeiro/mensalidades/${m.id}/${caminho}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });
    if (!r.ok) return alert(await erroDaResposta(r, 'Erro'));
    const j = await r.json();
    if (j.aviso) alert(j.aviso);
    carregar();
  };
  const gerarProximo = async () => {
    const d = new Date(`${mesHoje}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1);
    const prox = d.toISOString().slice(0, 7);
    const r = await apiFetch('/api/financeiro/gerar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mes: prox }) });
    const j = await r.json();
    setAviso(`${j.geradas} mensalidade(s) gerada(s) para ${competencia(prox + '-01')}.`);
    carregar();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Recebido no mês" value={BRL(recebidoMes)} change={`${pagasMes.length} pagamentos`} isPositive icon="payments"
          iconColor="text-emerald-500" bgColor="bg-emerald-500/10" onClick={() => setFiltro(filtro === 'Pago' ? null : 'Pago')} isActive={filtro === 'Pago'} />
        <StatCard title="Em aberto" value={BRL(abertas.reduce((s, m) => s + Number(m.valor), 0))} change={`${abertas.length} mensalidades`} isPositive={false}
          icon="pending_actions" iconColor="text-amber-500" bgColor="bg-amber-500/10" onClick={() => setFiltro(filtro === 'Aberto' ? null : 'Aberto')} isActive={filtro === 'Aberto'} />
        <StatCard title="Inadimplência" value={`${pctInad.toFixed(1)}%`} change={`${atrasadas.length} atrasadas`} isPositive={pctInad < 15} icon="warning"
          iconColor={pctInad < 15 ? 'text-emerald-500' : 'text-rose-500'} bgColor={pctInad < 15 ? 'bg-emerald-500/10' : 'bg-rose-500/10'}
          onClick={() => setFiltro(filtro === 'Atrasado' ? null : 'Atrasado')} isActive={filtro === 'Atrasado'} />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input className={`${inputCls} max-w-xs`} placeholder="Buscar aluno ou responsável" value={busca} onChange={e => setBusca(e.target.value)} />
        <select className={`${inputCls} max-w-[180px]`} value={mes} onChange={e => setMes(e.target.value)} aria-label="Mês">
          <option value="">Todos os meses</option>
          {meses.map(m => <option key={m} value={m}>{competencia(m + '-01')}</option>)}
        </select>
        <div className="flex-1" />
        <Botao variante="secundario" icone="print" onClick={() => imprimirLista(filtradas, { recebidoMes, aberto: abertas.reduce((s, m) => s + Number(m.valor), 0), pctInad, filtro: [filtro, mes && competencia(mes + '-01'), busca].filter(Boolean).join(' · ') })}>Relatório</Botao>
        <Botao variante="secundario" icone="add_card" onClick={gerarProximo}>Gerar próximo mês</Botao>
      </div>
      {aviso && <p className="text-sm text-emerald-600 font-bold">{aviso}</p>}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
            <tr className="text-slate-600 dark:text-slate-400 font-black text-[10px] uppercase tracking-widest">
              <th className="px-5 py-3">Aluno</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Vencimento</th>
              <th className="px-5 py-3">Pagamento</th><th className="px-5 py-3 text-center">Status</th><th className="px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtradas.length === 0 && <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-bold">Nenhuma mensalidade encontrada.</td></tr>}
            {filtradas.map(m => {
              const st = statusMensalidade[m.status] || statusMensalidade.Cancelado;
              const aberta = m.status === 'Pendente' || m.status === 'Atrasado';
              return (
                <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-3">
                    <div className="font-black text-sm">{m.aluno} {m.suspenso && <Selo cor="vermelho" icone="block">Suspenso</Selo>}</div>
                    <div className="text-xs text-slate-500">{m.responsavel_nome || m.responsavel_telefone || 'Sem responsável'}{m.descricao ? ` · ${m.descricao}` : ''}</div>
                  </td>
                  <td className="px-5 py-3 text-sm font-black whitespace-nowrap">{BRL(m.valor)}
                    {m.valor_pago !== null && Number(m.valor_pago) !== Number(m.valor) && <div className="text-[11px] text-slate-500 font-medium">pago {BRL(m.valor_pago)}</div>}
                  </td>
                  <td className="px-5 py-3 text-sm font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">{dataBR(m.data_vencimento)}</td>
                  <td className="px-5 py-3 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {m.data_pagamento ? dataBR(m.data_pagamento) : '—'}
                    {m.recibo_numero && <div className="text-[11px]">Recibo nº {m.recibo_numero}{m.gateway === 'asaas' ? ' · Asaas' : ''}</div>}
                  </td>
                  <td className="px-5 py-3 text-center"><Selo cor={st.cor} icone={st.icone}>{m.status}</Selo></td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1.5">
                      {aberta && <>
                        <Botao className="h-8 px-3 text-xs bg-green-600 shadow-none" icone="qr_code_2" onClick={() => setCobrar(m.id)}>Cobrar</Botao>
                        <Botao className="h-8 px-3 text-xs" variante="secundario" icone="price_check" onClick={() => setPagar(m)}>Dar baixa</Botao>
                        <button title="Editar valor/vencimento" className="size-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setEditar(m)}>
                          <span className="material-symbols-outlined text-[18px]">edit</span></button>
                        <button title="Cancelar mensalidade" className="size-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => acao(m, 'cancelar', `Cancelar a mensalidade de ${m.aluno} (${competencia(m.data_vencimento)})?`)}>
                          <span className="material-symbols-outlined text-[18px]">block</span></button>
                      </>}
                      {m.status === 'Pago' && <>
                        <Botao className="h-8 px-3 text-xs" variante="secundario" icone="receipt_long" onClick={() => verRecibo(m)}>Recibo</Botao>
                        <button title="Desfazer baixa" className="size-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => acao(m, 'estornar', 'Desfazer a baixa deste pagamento?')}>
                          <span className="material-symbols-outlined text-[18px]">undo</span></button>
                      </>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CobrancaModal mensalidadeId={cobrar} onFechar={() => setCobrar(null)} />
      <PagamentoModal m={pagar} onFechar={() => setPagar(null)} onSalvo={n => { setPagar(null); setAviso(`Pagamento registrado. Recibo nº ${n}.`); carregar(); }} />
      <EditarModal m={editar} onFechar={() => setEditar(null)} onSalvo={() => { setEditar(null); carregar(); }} />
    </div>
  );
};

function imprimirLista(lista: Mensalidade[], k: { recebidoMes: number; aberto: number; pctInad: number; filtro: string }) {
  const w = window.open('', '_blank');
  if (!w) return alert('Permita pop-ups para gerar o relatório.');
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório financeiro</title><style>
    body{font-family:Segoe UI,Arial,sans-serif;padding:32px;color:#222} h1{font-size:20px;margin:0} .k{display:flex;gap:16px;margin:20px 0}
    .k div{flex:1;border:1px solid #ddd;border-radius:8px;padding:12px} table{width:100%;border-collapse:collapse;font-size:13px}
    th,td{border-bottom:1px solid #e5e5e5;padding:8px;text-align:left} th{background:#f6f6f6;font-size:11px;text-transform:uppercase}
  </style></head><body><h1>Relatório financeiro</h1><p>Gerado em ${new Date().toLocaleString('pt-BR')}${k.filtro ? ` · Filtro: ${esc(k.filtro)}` : ''}</p>
  <div class="k"><div>Recebido no mês<br><b>${BRL(k.recebidoMes)}</b></div><div>Em aberto<br><b>${BRL(k.aberto)}</b></div><div>Inadimplência<br><b>${k.pctInad.toFixed(1)}%</b></div></div>
  <table><thead><tr><th>Aluno</th><th>Responsável</th><th>Valor</th><th>Vencimento</th><th>Pagamento</th><th>Status</th></tr></thead><tbody>
  ${lista.map(m => `<tr><td>${esc(m.aluno)}</td><td>${esc(m.responsavel_nome || '')}</td><td>${BRL(m.valor)}</td><td>${dataBR(m.data_vencimento)}</td><td>${m.data_pagamento ? dataBR(m.data_pagamento) : '-'}</td><td>${m.status}</td></tr>`).join('')}
  </tbody></table><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
  w.document.close();
}

const EditarModal: React.FC<{ m: Mensalidade | null; onFechar: () => void; onSalvo: () => void }> = ({ m, onFechar, onSalvo }) => {
  const [valor, setValor] = useState('');
  const [venc, setVenc] = useState('');
  const [desc, setDesc] = useState('');
  const [erro, setErro] = useState('');
  useEffect(() => { if (m) { setValor(String(m.valor)); setVenc(m.data_vencimento); setDesc(m.descricao || ''); setErro(''); } }, [m]);
  const salvar = async () => {
    const r = await apiFetch(`/api/financeiro/mensalidades/${m!.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor: Number(valor.replace(',', '.')), vencimento: venc, descricao: desc }) });
    if (r.ok) onSalvo(); else setErro(await erroDaResposta(r, 'Erro ao salvar'));
  };
  return (
    <Modal titulo={`Editar mensalidade${m ? ` · ${m.aluno}` : ''}`} aberto={!!m} onFechar={onFechar} tamanho="md"
      rodape={<><Botao variante="secundario" onClick={onFechar}>Cancelar</Botao><Botao onClick={salvar}>Salvar</Botao></>}>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Valor (R$)"><input className={inputCls} value={valor} onChange={e => setValor(e.target.value)} /></Campo>
        <Campo label="Vencimento"><input type="date" className={inputCls} value={venc} onChange={e => setVenc(e.target.value)} /></Campo>
        <Campo label="Descrição" className="col-span-2" dica="Ex.: desconto combinado, valor proporcional"><input className={inputCls} value={desc} onChange={e => setDesc(e.target.value)} /></Campo>
      </div>
      {erro && <p className="text-sm text-rose-600 font-bold mt-3">{erro}</p>}
    </Modal>
  );
};
