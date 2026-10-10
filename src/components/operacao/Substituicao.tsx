// Substituição rápida de motorista, van ou monitor (sem mexer na rota original)
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Campo, Modal, Selo, inputCls, erroDaResposta } from '../ui';

export interface RotaParaTrocar { rota_id: number; rota_nome: string; motorista_nome?: string | null; placa?: string | null; }
interface Opcao { id: number; nome?: string; placa?: string; modelo?: string; status?: string; }

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const br = (d: string) => d.split('-').reverse().join('/');

export const SubstituirModal: React.FC<{ rota: RotaParaTrocar | null; data?: string; onFechar: () => void; onFeito: (msg: string) => void }> = ({ rota, data, onFechar, onFeito }) => {
  const [mots, setMots] = useState<Opcao[]>([]);
  const [vans, setVans] = useState<Opcao[]>([]);
  const [mons, setMons] = useState<Opcao[]>([]);
  const [f, setF] = useState({ motorista_id: '', veiculo_id: '', monitor_id: '', data_inicio: '', data_fim: '', motivo: '', todas: '' as '' | 'motorista' | 'veiculo', avisar: true });
  const [erro, setErro] = useState('');
  const [conflitos, setConflitos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!rota) return;
    const d = data && data >= hoje() ? data : hoje();
    setF({ motorista_id: '', veiculo_id: '', monitor_id: '', data_inicio: d, data_fim: d, motivo: '', todas: '', avisar: true });
    setErro(''); setConflitos([]);
    Promise.all([apiFetch('/api/motoristas'), apiFetch('/api/frota'), apiFetch('/api/monitores')]).then(async ([a, b, c]) => {
      if (a.ok) setMots((await a.json()).filter((m: Opcao) => m.status !== 'Inativo'));
      if (b.ok) setVans(await b.json());
      if (c.ok) setMons((await c.json()).filter((m: Opcao) => m.status !== 'Inativo'));
    });
  }, [rota, data]);

  const salvar = async (forcar = false) => {
    setErro(''); setSalvando(true);
    const res = await apiFetch('/api/operacao/substituicoes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rota_id: rota!.rota_id, motorista_id: f.motorista_id || null, veiculo_id: f.veiculo_id || null, monitor_id: f.monitor_id || null,
        data_inicio: f.data_inicio, data_fim: f.data_fim, motivo: f.motivo, avisar_pais: f.avisar,
        todas_do_motorista: f.todas === 'motorista', todas_do_veiculo: f.todas === 'veiculo', forcar,
      }),
    });
    setSalvando(false);
    if (res.status === 409) { const j = await res.json(); setConflitos(j.conflitos || []); return; }
    if (!res.ok) { setErro(await erroDaResposta(res, 'Erro ao salvar')); return; }
    const j = await res.json();
    onFeito(`Substituição feita em ${j.rotas} rota(s)${j.avisados ? `; ${j.avisados} responsável(is) avisado(s) no WhatsApp` : ''}.${j.ja_iniciadas?.length ? ` Atenção: ${j.ja_iniciadas.join(', ')} já tinha começado e segue com quem saiu.` : ''}`);
  };

  return (
    <Modal titulo={`Trocar motorista ou van${rota ? ` · ${rota.rota_nome}` : ''}`} aberto={!!rota} onFechar={onFechar} tamanho="md"
      rodape={<>
        <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
        {conflitos.length > 0
          ? <Botao variante="perigo" onClick={() => salvar(true)} carregando={salvando}>Confirmar mesmo assim</Botao>
          : <Botao icone="sync_alt" onClick={() => salvar(false)} carregando={salvando} disabled={!f.motorista_id && !f.veiculo_id && !f.monitor_id}>Confirmar troca</Botao>}
      </>}>
      {rota && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Hoje: <b>{rota.motorista_nome || 'sem motorista'}</b> · <b>{rota.placa || 'sem van'}</b>. A rota original não muda; a troca vale só no período escolhido.</p>
          <Campo label="Novo motorista">
            <select className={inputCls} value={f.motorista_id} onChange={e => setF({ ...f, motorista_id: e.target.value })} aria-label="Novo motorista">
              <option value="">Manter o motorista</option>
              {mots.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Nova van">
            <select className={inputCls} value={f.veiculo_id} onChange={e => setF({ ...f, veiculo_id: e.target.value })} aria-label="Nova van">
              <option value="">Manter a van</option>
              {vans.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.modelo}</option>)}
            </select>
          </Campo>
          {mons.length > 0 && (
            <Campo label="Monitor(a)">
              <select className={inputCls} value={f.monitor_id} onChange={e => setF({ ...f, monitor_id: e.target.value })} aria-label="Novo monitor">
                <option value="">Manter</option>
                {mons.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </Campo>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Campo label="De"><input type="date" className={inputCls} min={hoje()} value={f.data_inicio} onChange={e => setF({ ...f, data_inicio: e.target.value, data_fim: e.target.value > f.data_fim ? e.target.value : f.data_fim })} /></Campo>
            <Campo label="Até"><input type="date" className={inputCls} min={f.data_inicio} value={f.data_fim} onChange={e => setF({ ...f, data_fim: e.target.value })} /></Campo>
          </div>
          <Campo label="Motivo (interno)"><input className={inputCls} value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} placeholder="Ex.: motorista doente, van na oficina" /></Campo>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="todas" checked={f.todas === ''} onChange={() => setF({ ...f, todas: '' })} /> Só esta rota</label>
            <label className="flex items-center gap-2"><input type="radio" name="todas" checked={f.todas === 'motorista'} onChange={() => setF({ ...f, todas: 'motorista' })} /> Todas as rotas deste motorista no período</label>
            <label className="flex items-center gap-2"><input type="radio" name="todas" checked={f.todas === 'veiculo'} onChange={() => setF({ ...f, todas: 'veiculo' })} /> Todas as rotas desta van no período</label>
            <label className="flex items-center gap-2 pt-1"><input type="checkbox" checked={f.avisar} onChange={e => setF({ ...f, avisar: e.target.checked })} /> Avisar os pais no WhatsApp (placa e motorista novos)</label>
          </div>
          {conflitos.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
              <p className="font-bold text-amber-800 dark:text-amber-200 mb-1">Conflito de horário:</p>
              <ul className="list-disc pl-5 text-amber-800 dark:text-amber-200">{conflitos.map(c => <li key={c}>{c}</li>)}</ul>
            </div>
          )}
          {erro && <p className="text-sm text-rose-600 font-bold">{erro}</p>}
        </div>
      )}
    </Modal>
  );
};

interface Sub { id: number; rota_id: number; rota_nome: string; data_inicio: string; data_fim: string; motivo: string | null; motorista_nome: string | null; placa: string | null; monitor_nome: string | null; avisado_em: string | null; }

export const ListaSubstituicoes: React.FC<{ rotas: RotaParaTrocar[]; data: string; onMudou: () => void }> = ({ rotas, data, onMudou }) => {
  const [lista, setLista] = useState<Sub[] | null>(null);
  const [trocar, setTrocar] = useState<RotaParaTrocar | null>(null);
  const [rotaSel, setRotaSel] = useState('');
  const [aviso, setAviso] = useState('');
  const carregar = () => apiFetch('/api/operacao/substituicoes').then(r => r.json()).then(setLista).catch(() => setLista([]));
  useEffect(() => { carregar(); }, []);
  const cancelar = async (id: number) => {
    if (!window.confirm('Cancelar esta substituição? A rota volta para o motorista/van de sempre.')) return;
    await apiFetch(`/api/operacao/substituicoes/${id}`, { method: 'DELETE' });
    carregar(); onMudou();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select className={`${inputCls} max-w-xs`} value={rotaSel} onChange={e => setRotaSel(e.target.value)} aria-label="Rota para trocar">
          <option value="">Escolha a rota...</option>
          {rotas.map(r => <option key={r.rota_id} value={r.rota_id}>{r.rota_nome}</option>)}
        </select>
        <Botao icone="sync_alt" disabled={!rotaSel} onClick={() => setTrocar(rotas.find(r => String(r.rota_id) === rotaSel) || null)}>Nova substituição</Botao>
      </div>
      {aviso && <p className="text-sm text-emerald-600 font-bold">{aviso}</p>}
      {lista?.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Nenhuma substituição programada.</p>}
      <div className="space-y-2">
        {lista?.map(s => (
          <div key={s.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px]">
              <p className="font-black text-sm">{s.rota_nome}</p>
              <p className="text-xs text-slate-500">{s.data_inicio === s.data_fim ? br(s.data_inicio) : `${br(s.data_inicio)} a ${br(s.data_fim)}`}{s.motivo ? ` · ${s.motivo}` : ''}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {s.motorista_nome && <Selo cor="azul" icone="person">{s.motorista_nome}</Selo>}
              {s.placa && <Selo cor="roxo" icone="airport_shuttle">{s.placa}</Selo>}
              {s.monitor_nome && <Selo icone="support_agent">{s.monitor_nome}</Selo>}
              {s.avisado_em && <Selo cor="verde" icone="done_all">Pais avisados</Selo>}
            </div>
            <Botao variante="perigo" className="h-8 text-xs" onClick={() => cancelar(s.id)}>Cancelar</Botao>
          </div>
        ))}
      </div>
      <SubstituirModal rota={trocar} data={data} onFechar={() => setTrocar(null)} onFeito={m => { setTrocar(null); setAviso(m); carregar(); onMudou(); }} />
    </div>
  );
};
