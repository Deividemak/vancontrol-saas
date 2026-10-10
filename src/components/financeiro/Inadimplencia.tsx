// Aba Inadimplência: quem está devendo, cobrar agora, suspender/reativar transporte
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Modal, Campo, Selo, inputCls, erroDaResposta } from '../ui';
import { BRL, dataBR, competencia, buscarJson, ErroCarga } from './util';

interface Grupo {
  chave: string; responsavel_id: number | null; aluno_id: number | null; nome: string; telefone: string | null;
  dias_atraso: number; total: number; total_atualizado: number; critico: boolean;
  mensalidades: { id: number; aluno_nome: string; vencimento: string; valor: number; valor_atualizado: number; dias_atraso: number }[];
  alunos: { id: number; nome: string; suspenso: boolean; motivo: string | null }[];
}
interface Painel {
  resumo: { pagadores: number; total: number; criticos: number; suspensos: number };
  grupos: Grupo[];
  suspensos_quitados: { id: number; nome: string; suspensao_motivo: string | null; suspenso_em: string }[];
  dias_alerta: number;
}

export const Inadimplencia: React.FC = () => {
  const [p, setP] = useState<Painel | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [suspender, setSuspender] = useState<{ id: number; nome: string } | null>(null);
  const [motivo, setMotivo] = useState('Mensalidade em atraso');
  const [avisar, setAvisar] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = () => buscarJson<Painel>(apiFetch, '/api/financeiro/inadimplencia').then(setP).catch(e => setErro(e.message));
  useEffect(() => { carregar(); }, []);

  const cobrar = async (g: Grupo) => {
    setMsg(m => ({ ...m, [g.chave]: 'Enviando...' }));
    const r = await apiFetch('/api/financeiro/cobrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responsavel_id: g.responsavel_id, aluno_id: g.aluno_id }) });
    setMsg(m => ({ ...m, [g.chave]: r.ok ? 'Cobrança enviada no WhatsApp' : '' }));
    if (!r.ok) alert(await erroDaResposta(r, 'Erro ao enviar'));
  };
  const reativar = async (id: number) => {
    const r = await apiFetch(`/api/financeiro/alunos/${id}/reativar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!r.ok) alert(await erroDaResposta(r, 'Erro')); else carregar();
  };
  const confirmarSuspensao = async () => {
    const r = await apiFetch(`/api/financeiro/alunos/${suspender!.id}/suspender`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo, avisar }) });
    if (!r.ok) return alert(await erroDaResposta(r, 'Erro'));
    setSuspender(null); carregar();
  };

  if (erro) return <ErroCarga msg={erro} />;
  if (!p) return <p className="text-center text-slate-500 animate-pulse py-8">Carregando...</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[['Responsáveis devendo', String(p.resumo.pagadores)], ['Total em atraso', BRL(p.resumo.total)], [`Mais de ${p.dias_alerta} dias`, String(p.resumo.criticos)], ['Transportes suspensos', String(p.resumo.suspensos)]].map(([t, v]) => (
          <div key={t} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">{t}</p><p className="text-2xl font-black mt-1">{v}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">A régua de cobrança avisa automaticamente no WhatsApp. Suspender o transporte é sempre uma decisão sua: o aluno sai da lista do motorista até ser reativado (o motorista não vê o motivo).</p>

      {p.grupos.length === 0 && <p className="text-center text-emerald-600 font-bold py-10">Nenhuma mensalidade em atraso. 🎉</p>}
      <div className="space-y-3">
        {p.grupos.map(g => (
          <div key={g.chave} className={`rounded-xl border bg-white dark:bg-slate-900 p-4 ${g.critico ? 'border-rose-300 dark:border-rose-900' : 'border-slate-200 dark:border-slate-800'}`}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[220px]">
                <p className="font-black">{g.nome} {g.critico && <Selo cor="vermelho" icone="priority_high">{g.dias_atraso} dias</Selo>}{!g.critico && <Selo cor="amarelo">{g.dias_atraso} dia{g.dias_atraso > 1 ? 's' : ''}</Selo>}</p>
                <p className="text-xs text-slate-500">{g.telefone || 'Sem telefone'}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-black text-rose-600">{BRL(g.total_atualizado)}</p>
                <p className="text-[11px] text-slate-500">{BRL(g.total)} + multa e juros</p>
              </div>
            </div>
            <ul className="mt-3 text-sm space-y-1">
              {g.mensalidades.map(m => <li key={m.id} className="flex justify-between"><span>{m.aluno_nome} · {competencia(m.vencimento)} · venceu {dataBR(m.vencimento)}</span><b>{BRL(m.valor_atualizado)}</b></li>)}
            </ul>
            <div className="flex flex-wrap gap-2 mt-3 items-center">
              <Botao className="h-9 text-xs bg-green-600 shadow-none" icone="send" onClick={() => cobrar(g)}>Cobrar agora</Botao>
              {g.alunos.map(a => a.suspenso
                ? <Botao key={a.id} variante="secundario" className="h-9 text-xs" icone="play_circle" onClick={() => reativar(a.id)}>Reativar {a.nome.split(' ')[0]}</Botao>
                : <Botao key={a.id} variante="perigo" className="h-9 text-xs" icone="block" onClick={() => { setSuspender(a); setMotivo('Mensalidade em atraso'); setAvisar(true); }}>Suspender {a.nome.split(' ')[0]}</Botao>)}
              {msg[g.chave] && <span className="text-xs font-bold text-emerald-600">{msg[g.chave]}</span>}
            </div>
          </div>
        ))}
      </div>

      {p.suspensos_quitados.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 p-4">
          <p className="font-black text-sm mb-2">Suspensos sem pendências (já podem voltar)</p>
          {p.suspensos_quitados.map(s => (
            <div key={s.id} className="flex items-center justify-between py-1">
              <span className="text-sm">{s.nome} · suspenso em {dataBR(s.suspenso_em)}</span>
              <Botao className="h-8 text-xs" icone="play_circle" onClick={() => reativar(s.id)}>Reativar</Botao>
            </div>
          ))}
        </div>
      )}

      <Modal titulo={`Suspender transporte${suspender ? ` · ${suspender.nome}` : ''}`} aberto={!!suspender} onFechar={() => setSuspender(null)} tamanho="md"
        rodape={<><Botao variante="secundario" onClick={() => setSuspender(null)}>Cancelar</Botao><Botao variante="perigo" icone="block" onClick={confirmarSuspensao}>Suspender</Botao></>}>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">O aluno deixa de aparecer nas viagens do motorista a partir da próxima viagem. As mensalidades continuam sendo geradas.</p>
        <Campo label="Motivo (vai na mensagem ao responsável)"><input className={inputCls} value={motivo} onChange={e => setMotivo(e.target.value)} /></Campo>
        <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={avisar} onChange={e => setAvisar(e.target.checked)} /> Avisar o responsável no WhatsApp</label>
      </Modal>
    </div>
  );
};
