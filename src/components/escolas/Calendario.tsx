// Calendário escolar: feriados, recessos e dias sem aula (geral ou por escola).
import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Campo, Modal, Selo, inputCls, erroDaResposta, CorSelo } from '../ui';

interface Evento {
  id: number;
  escola_id: number | null;
  escola_nome: string | null;
  tipo: 'feriado' | 'recesso' | 'sem_aula' | 'evento';
  descricao: string;
  data_inicio: string;
  data_fim: string;
}

const TIPOS: Record<Evento['tipo'], { label: string; cor: CorSelo; fundo: string }> = {
  feriado: { label: 'Feriado', cor: 'vermelho', fundo: 'bg-rose-500' },
  recesso: { label: 'Recesso / férias', cor: 'amarelo', fundo: 'bg-amber-500' },
  sem_aula: { label: 'Sem aula', cor: 'roxo', fundo: 'bg-indigo-500' },
  evento: { label: 'Evento (tem aula)', cor: 'azul', fundo: 'bg-blue-500' },
};
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const iso = (a: number, m: number, d: number) => `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const br = (s: string) => s.split('-').reverse().join('/');

const vazio = { escola_id: '', tipo: 'feriado' as Evento['tipo'], descricao: '', data_inicio: '', data_fim: '' };

export const Calendario: React.FC<{ escolas: { id: number; nome: string }[] }> = ({ escolas }) => {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [filtroEscola, setFiltroEscola] = useState('');
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState('');
  const [importando, setImportando] = useState(false);

  const carregar = async () => {
    const res = await apiFetch(`/api/calendario?ano=${ano}`);
    if (res.ok) setEventos(await res.json());
  };
  useEffect(() => { carregar(); }, [ano]);

  const visiveis = useMemo(
    () => eventos.filter(e => !filtroEscola || !e.escola_id || String(e.escola_id) === filtroEscola),
    [eventos, filtroEscola]
  );

  const doDia = (d: string) => visiveis.filter(e => e.data_inicio <= d && e.data_fim >= d);
  const doMes = visiveis.filter(e => e.data_inicio <= iso(ano, mes, 31) && e.data_fim >= iso(ano, mes, 1));

  const abrir = (ev?: Evento, data?: string) => {
    setErro('');
    setEditando(ev || null);
    setForm(ev
      ? { escola_id: ev.escola_id ? String(ev.escola_id) : '', tipo: ev.tipo, descricao: ev.descricao, data_inicio: ev.data_inicio, data_fim: ev.data_fim }
      : { ...vazio, escola_id: filtroEscola, data_inicio: data || '', data_fim: data || '' });
    setAberto(true);
  };

  const salvar = async () => {
    setErro('');
    const res = await apiFetch(editando ? `/api/calendario/${editando.id}` : '/api/calendario', {
      method: editando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, data_fim: form.data_fim || form.data_inicio }),
    });
    if (!res.ok) { setErro(await erroDaResposta(res, 'Erro ao salvar')); return; }
    setAberto(false);
    carregar();
  };

  const excluir = async (ev: Evento) => {
    if (!confirm(`Excluir "${ev.descricao}"?`)) return;
    await apiFetch(`/api/calendario/${ev.id}`, { method: 'DELETE' });
    carregar();
  };

  const importar = async () => {
    setImportando(true);
    try {
      const res = await apiFetch('/api/calendario/importar-feriados', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ano }),
      });
      const j = await res.json();
      alert(res.ok ? (j.criados ? `${j.criados} feriados nacionais de ${ano} adicionados.` : `Os feriados de ${ano} já estavam cadastrados.`) : j.error);
      carregar();
    } finally {
      setImportando(false);
    }
  };

  const navegar = (delta: number) => {
    let m = mes + delta, a = ano;
    if (m < 0) { m = 11; a--; }
    if (m > 11) { m = 0; a++; }
    setMes(m);
    setAno(a);
  };

  const primeiroDia = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const celulas = [...Array(primeiroDia).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)];
  const hojeIso = iso(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight">Calendário Escolar</h2>
          <p className="text-slate-500 dark:text-slate-400">Feriados, recessos e dias sem aula. A operação diária usa este calendário para saber quais rotas rodam.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className={`${inputCls} !h-10 w-56`} value={filtroEscola} onChange={e => setFiltroEscola(e.target.value)}>
            <option value="">Todas as escolas</option>
            {escolas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <Botao variante="secundario" icone="download" carregando={importando} onClick={importar}>Feriados nacionais {ano}</Botao>
          <Botao icone="add" onClick={() => abrir()}>Novo evento</Botao>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => navegar(-1)} aria-label="Mês anterior">
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <h3 className="text-lg font-black">{MESES[mes]} {ano}</h3>
            <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => navegar(1)} aria-label="Próximo mês">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {SEMANA.map(s => <div key={s} className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-1">{s}</div>)}
            {celulas.map((d, i) => {
              if (d === null) return <div key={`v${i}`} />;
              const data = iso(ano, mes, d);
              const evs = doDia(data);
              const fds = i % 7 === 0 || i % 7 === 6;
              return (
                <button key={data} onClick={() => (evs.length ? abrir(evs[0]) : abrir(undefined, data))}
                  title={evs.map(e => `${e.descricao}${e.escola_nome ? ` (${e.escola_nome})` : ''}`).join('\n')}
                  className={`min-h-16 rounded-lg p-1.5 text-left flex flex-col gap-1 border transition-colors hover:border-primary
                    ${data === hojeIso ? 'border-primary' : 'border-transparent'} ${fds ? 'bg-slate-50 dark:bg-slate-800/40' : 'bg-white dark:bg-slate-900'}`}>
                  <span className={`text-xs font-bold ${fds ? 'text-slate-400' : ''}`}>{d}</span>
                  {evs.slice(0, 2).map(e => (
                    <span key={e.id} className={`${TIPOS[e.tipo].fundo} text-white text-[9px] font-bold rounded px-1 truncate`}>
                      {e.escola_id ? '• ' : ''}{e.descricao}
                    </span>
                  ))}
                  {evs.length > 2 && <span className="text-[9px] text-slate-400">+{evs.length - 2}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {Object.entries(TIPOS).map(([k, t]) => <Selo key={k} cor={t.cor}>{t.label}</Selo>)}
            <span className="text-[11px] text-slate-400">• = só de uma escola</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h3 className="font-black">Eventos de {MESES[mes]}</h3>
          {doMes.length === 0 && <p className="text-sm text-slate-400">Nenhum evento neste mês.</p>}
          {doMes.map(e => (
            <div key={e.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{e.descricao}</p>
                <p className="text-xs text-slate-500">
                  {br(e.data_inicio)}{e.data_fim !== e.data_inicio && ` a ${br(e.data_fim)}`} · {e.escola_nome || 'Todas as escolas'}
                </p>
                <div className="mt-1"><Selo cor={TIPOS[e.tipo].cor}>{TIPOS[e.tipo].label}</Selo></div>
              </div>
              <button onClick={() => abrir(e)} className="text-slate-400 hover:text-primary" title="Editar"><span className="material-symbols-outlined text-[18px]">edit</span></button>
              <button onClick={() => excluir(e)} className="text-slate-400 hover:text-rose-500" title="Excluir"><span className="material-symbols-outlined text-[18px]">delete</span></button>
            </div>
          ))}
        </div>
      </div>

      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo={editando ? 'Editar evento' : 'Novo evento'} tamanho="md"
        rodape={<>
          {erro && <p className="text-sm text-rose-500 font-bold mr-auto self-center">{erro}</p>}
          {editando && <Botao variante="perigo" icone="delete" onClick={() => { setAberto(false); excluir(editando); }}>Excluir</Botao>}
          <Botao variante="secundario" onClick={() => setAberto(false)}>Cancelar</Botao>
          <Botao onClick={salvar}>Salvar</Botao>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Descrição" className="col-span-2">
            <input className={inputCls} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: Recesso de julho" />
          </Campo>
          <Campo label="Tipo" className="col-span-2">
            <select className={inputCls} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as Evento['tipo'] })}>
              {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </Campo>
          <Campo label="De">
            <input type="date" className={inputCls} value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value, data_fim: form.data_fim && form.data_fim >= e.target.value ? form.data_fim : e.target.value })} />
          </Campo>
          <Campo label="Até">
            <input type="date" className={inputCls} value={form.data_fim} min={form.data_inicio} onChange={e => setForm({ ...form, data_fim: e.target.value })} />
          </Campo>
          <Campo label="Vale para" className="col-span-2">
            <select className={inputCls} value={form.escola_id} onChange={e => setForm({ ...form, escola_id: e.target.value })}>
              <option value="">Todas as escolas</option>
              {escolas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </Campo>
        </div>
      </Modal>
    </div>
  );
};
