// Central de checklists do gestor: situação de hoje, problemas abertos, histórico e registro manual
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import { Modal, Abas, Botao, Campo, Selo, inputCls, textareaCls, erroDaResposta, type CorSelo } from './ui';

const ITENS = [
  { campo: 'pneus', label: 'Pneus', descricao: 'Calibrados e sem danos', icone: 'tire_repair' },
  { campo: 'freios', label: 'Freios', descricao: 'Freando bem', icone: 'do_not_step' },
  { campo: 'cintos', label: 'Cintos', descricao: 'Todos funcionando', icone: 'airline_seat_recline_normal' },
  { campo: 'extintor', label: 'Extintor/kit', descricao: 'Extintor e primeiros socorros', icone: 'fire_extinguisher' },
  { campo: 'luzes', label: 'Luzes', descricao: 'Faróis, setas e luz de freio', icone: 'emoji_objects' },
  { campo: 'oleo', label: 'Óleo/água', descricao: 'Níveis de óleo e água', icone: 'oil_barrel' },
  { campo: 'limpeza', label: 'Limpeza/portas', descricao: 'Limpo e portas travando', icone: 'cleaning_services' },
] as const;
const nomeItem = (c: string) => ITENS.find(i => i.campo === c)?.label || c;

interface VanHoje {
  veiculo_id: number; placa: string; modelo: string; motorista_nome: string | null;
  situacao: 'feito_ok' | 'feito_problema' | 'pendente'; checklist_id: number | null; hora: string | null;
  problemas: string[]; observacoes: string | null; resolvido: boolean; saiu_hoje: boolean;
}
interface Hoje { data: string; contadores: { total: number; feitos: number; pendentes: number; com_problema: number }; vans: VanHoje[] }
interface Registro {
  id: number; veiculo_id: number; placa: string | null; modelo: string | null; motorista_nome: string | null; data: string;
  observacoes: string | null; problemas: string[]; resolvido: boolean; resolvido_em: string | null; resolucao_obs: string | null;
  manutencao: { id: number; status: string } | null;
}
interface Pagina { total: number; pagina: number; por_pagina: number; itens: Registro[] }
type Opcao = { id: number; placa?: string; modelo?: string; nome?: string };

const SITUACAO: Record<VanHoje['situacao'], { label: string; cor: CorSelo; icone: string }> = {
  pendente: { label: 'Pendente', cor: 'amarelo', icone: 'schedule' },
  feito_problema: { label: 'Problema', cor: 'vermelho', icone: 'error' },
  feito_ok: { label: 'Tudo OK', cor: 'verde', icone: 'check_circle' },
};
const COR_MANUTENCAO: Record<string, CorSelo> = { Pendente: 'amarelo', 'Em Andamento': 'azul', 'Concluída': 'verde', Cancelada: 'cinza' };
const dataHoraBR = (d?: string | null) => (d ? `${d.slice(0, 10).split('-').reverse().join('/')}${d.length > 10 ? ` ${d.slice(11, 16)}` : ''}` : '—');
const hojeISO = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - 3 * 3600000 - n * 86400000).toISOString().slice(0, 10);

const Erro: React.FC<{ msg: string | null }> = ({ msg }) =>
  msg ? <p role="alert" className="text-sm font-bold text-rose-600 bg-rose-500/10 rounded-lg px-3 py-2">{msg}</p> : null;
const Vazio: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-sm text-slate-400 py-6 text-center">{children}</p>;
const cartao = 'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm';

async function lerJson<T>(url: string): Promise<{ dados?: T; erro?: string }> {
  const r = await apiFetch(url).catch(() => null);
  if (!r) return { erro: 'Sem conexão com o servidor.' };
  if (!r.ok) return { erro: await erroDaResposta(r, 'Não foi possível carregar.') };
  return { dados: await r.json() };
}

const Contador: React.FC<{ label: string; valor: number | string; icone: string; cor: string }> = ({ label, valor, icone, cor }) => (
  <div className={`${cartao} p-5 flex items-center gap-4`}>
    <span className={`material-symbols-outlined text-3xl rounded-xl p-2 ${cor}`}>{icone}</span>
    <div><p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">{label}</p><p className="text-2xl font-black">{valor}</p></div>
  </div>
);

const SelosProblemas: React.FC<{ problemas: string[] }> = ({ problemas }) => (
  <div className="flex flex-wrap gap-1">{problemas.map(p => <Selo key={p} cor="vermelho">{nomeItem(p)}</Selo>)}</div>
);

// ---------- Aba Hoje ----------
const AbaHoje: React.FC<{ hoje: Hoje | null }> = ({ hoje }) => {
  if (!hoje) return <Vazio>Carregando…</Vazio>;
  if (!hoje.vans.length) return <Vazio>Nenhuma van com rota ativa ou viagem hoje.</Vazio>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {hoje.vans.map(v => {
        const s = SITUACAO[v.situacao];
        return (
          <div key={v.veiculo_id} className={`${cartao} p-5 space-y-3`}>
            <div className="flex justify-between items-start gap-2">
              <div><p className="text-lg font-black">{v.placa}</p><p className="text-sm text-slate-500">{v.modelo}</p></div>
              <Selo cor={s.cor} icone={s.icone}>{s.label}</Selo>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div><p className="text-[10px] uppercase font-black text-slate-400">Motorista</p><p className="text-xs font-bold truncate">{v.motorista_nome || '—'}</p></div>
              <div><p className="text-[10px] uppercase font-black text-slate-400">Checklist</p><p className="text-xs font-bold">{v.hora || 'Ainda não fez'}</p></div>
            </div>
            {v.situacao === 'feito_problema' && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
                <SelosProblemas problemas={v.problemas} />
                {v.observacoes && <p className="text-xs text-slate-500">{v.observacoes}</p>}
                {v.resolvido && <Selo cor="verde" icone="done_all">Resolvido</Selo>}
              </div>
            )}
            {v.saiu_hoje && v.situacao === 'pendente' && <p className="text-xs font-bold text-amber-600">Já saiu em viagem hoje sem checklist.</p>}
            {v.saiu_hoje && v.situacao !== 'pendente' && <p className="text-xs text-slate-400">Já saiu em viagem hoje.</p>}
          </div>
        );
      })}
    </div>
  );
};

// ---------- Aba Problemas abertos ----------
const LinhaProblema: React.FC<{ r: Registro; onResolvido: () => void }> = ({ r, onResolvido }) => {
  const [aberto, setAberto] = useState(false);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const resolver = async () => {
    setSalvando(true); setErro(null);
    const res = await apiFetch(`/api/checklists/${r.id}/resolve`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ observacao: obs }) }).catch(() => null);
    setSalvando(false);
    if (!res) return setErro('Sem conexão com o servidor.');
    if (!res.ok) return setErro(await erroDaResposta(res, 'Não foi possível resolver.'));
    onResolvido();
  };

  return (
    <div className={`${cartao} p-5 space-y-3`}>
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div className="space-y-1">
          <p className="font-black">{r.placa || 'Van removida'} <span className="text-sm font-medium text-slate-500">· {r.motorista_nome || '—'} · {dataHoraBR(r.data)}</span></p>
          <SelosProblemas problemas={r.problemas} />
        </div>
        <div className="flex items-center gap-2">
          {r.manutencao
            ? <Selo cor={COR_MANUTENCAO[r.manutencao.status] || 'cinza'} icone="build">Manutenção: {r.manutencao.status}</Selo>
            : <Selo icone="build">Sem manutenção ligada</Selo>}
          {!aberto && <Botao variante="secundario" icone="task_alt" onClick={() => setAberto(true)}>Resolver</Botao>}
        </div>
      </div>
      {r.observacoes && <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">{r.observacoes}</p>}
      {aberto && (
        <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Campo label="O que foi feito?" dica={r.manutencao && r.manutencao.status !== 'Concluída' && r.manutencao.status !== 'Cancelada' ? 'A manutenção ligada também será marcada como concluída.' : undefined}>
            <textarea className={textareaCls} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex: pneu trocado na borracharia" aria-label="Observação da resolução" />
          </Campo>
          <Erro msg={erro} />
          <div className="flex gap-2 justify-end">
            <Botao variante="fantasma" onClick={() => { setAberto(false); setErro(null); }}>Cancelar</Botao>
            <Botao icone="check" carregando={salvando} onClick={resolver}>Confirmar resolução</Botao>
          </div>
        </div>
      )}
    </div>
  );
};

const AbaProblemas: React.FC<{ versao: number; onMudou: () => void }> = ({ versao, onMudou }) => {
  const [dados, setDados] = useState<Pagina | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

  const carregar = useCallback(async () => {
    const r = await lerJson<Pagina>(`/api/checklists?so_abertos=1&pagina=${pagina}`);
    setErro(r.erro || null);
    if (r.dados) setDados(r.dados);
  }, [pagina]);
  useEffect(() => { carregar(); }, [carregar, versao]);

  if (erro) return <Erro msg={erro} />;
  if (!dados) return <Vazio>Carregando…</Vazio>;
  if (!dados.itens.length) return <Vazio>Nenhum problema aberto. Tudo em dia!</Vazio>;
  return (
    <div className="space-y-3">
      {dados.itens.map(r => <LinhaProblema key={r.id} r={r} onResolvido={onMudou} />)}
      <Paginacao dados={dados} onPagina={setPagina} />
    </div>
  );
};

// ---------- Aba Histórico ----------
const Paginacao: React.FC<{ dados: Pagina; onPagina: (p: number) => void }> = ({ dados, onPagina }) => {
  const paginas = Math.max(1, Math.ceil(dados.total / dados.por_pagina));
  if (paginas <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <Botao variante="secundario" icone="chevron_left" disabled={dados.pagina <= 1} onClick={() => onPagina(dados.pagina - 1)}>Anterior</Botao>
      <span className="text-sm font-bold text-slate-500">Página {dados.pagina} de {paginas}</span>
      <Botao variante="secundario" disabled={dados.pagina >= paginas} onClick={() => onPagina(dados.pagina + 1)}>Próxima<span className="material-symbols-outlined text-[18px]">chevron_right</span></Botao>
    </div>
  );
};

const AbaHistorico: React.FC<{ versao: number; vans: Opcao[] }> = ({ versao, vans }) => {
  const [filtro, setFiltro] = useState({ de: diasAtras(30), ate: hojeISO(), veiculo_id: '', so_problemas: false });
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Pagina | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const p = new URLSearchParams({ pagina: String(pagina) });
    if (filtro.de) p.set('de', filtro.de);
    if (filtro.ate) p.set('ate', filtro.ate);
    if (filtro.veiculo_id) p.set('veiculo_id', filtro.veiculo_id);
    if (filtro.so_problemas) p.set('so_problemas', '1');
    const r = await lerJson<Pagina>(`/api/checklists?${p}`);
    setErro(r.erro || null);
    if (r.dados) setDados(r.dados);
  }, [filtro, pagina]);
  useEffect(() => { carregar(); }, [carregar, versao]);

  const mudar = (k: keyof typeof filtro, v: string | boolean) => { setFiltro(f => ({ ...f, [k]: v })); setPagina(1); };

  return (
    <div className="space-y-4">
      <div className={`${cartao} p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end`}>
        <Campo label="De"><input type="date" className={inputCls} value={filtro.de} onChange={e => mudar('de', e.target.value)} aria-label="Data inicial" /></Campo>
        <Campo label="Até"><input type="date" className={inputCls} value={filtro.ate} onChange={e => mudar('ate', e.target.value)} aria-label="Data final" /></Campo>
        <Campo label="Van">
          <select className={inputCls} value={filtro.veiculo_id} onChange={e => mudar('veiculo_id', e.target.value)} aria-label="Filtrar por van">
            <option value="">Todas</option>{vans.map(v => <option key={v.id} value={v.id}>{v.placa}</option>)}
          </select>
        </Campo>
        <label className="flex items-center gap-2 h-11 text-sm font-bold">
          <input type="checkbox" checked={filtro.so_problemas} onChange={e => mudar('so_problemas', e.target.checked)} />Só com problema
        </label>
      </div>
      <Erro msg={erro} />
      {!dados ? <Vazio>Carregando…</Vazio> : !dados.itens.length ? <Vazio>Nenhum checklist nesse período.</Vazio> : (
        <>
          <p className="text-xs text-slate-400">{dados.total} checklist(s) encontrado(s)</p>
          <div className={`${cartao} divide-y divide-slate-100 dark:divide-slate-800`}>
            {dados.itens.map(r => (
              <div key={r.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <p className="font-bold">{r.placa || 'Van removida'} <span className="text-sm font-medium text-slate-500">· {r.motorista_nome || '—'} · {dataHoraBR(r.data)}</span></p>
                  {r.problemas.length > 0 && <SelosProblemas problemas={r.problemas} />}
                  {r.observacoes && <p className="text-xs text-slate-500">{r.observacoes}</p>}
                  {r.resolvido && r.resolucao_obs && <p className="text-xs text-emerald-600">Resolvido: {r.resolucao_obs}</p>}
                </div>
                {!r.problemas.length ? <Selo cor="verde" icone="check_circle">Tudo OK</Selo>
                  : r.resolvido ? <Selo cor="verde" icone="done_all">Resolvido {r.resolvido_em ? dataHoraBR(r.resolvido_em).slice(0, 5) : ''}</Selo>
                    : <Selo cor="vermelho" icone="error">Aberto</Selo>}
              </div>
            ))}
          </div>
          <Paginacao dados={dados} onPagina={setPagina} />
        </>
      )}
    </div>
  );
};

// ---------- Registro manual ----------
const RegistroManual: React.FC<{ aberto: boolean; onFechar: () => void; onSalvo: () => void; vans: Opcao[]; motoristas: Opcao[] }> = ({ aberto, onFechar, onSalvo, vans, motoristas }) => {
  const [veiculo, setVeiculo] = useState('');
  const [motorista, setMotorista] = useState('');
  const [valores, setValores] = useState<Record<string, 'ok' | 'error'>>({});
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setVeiculo(''); setMotorista(''); setObs(''); setErro(null);
    setValores(Object.fromEntries(ITENS.map(i => [i.campo, 'ok'])));
  }, [aberto]);

  const problemas = ITENS.filter(i => valores[i.campo] === 'error');

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!veiculo || !motorista) return setErro('Escolha a van e o motorista.');
    if (problemas.length && !obs.trim()) return setErro('Descreva o problema encontrado.');
    setSalvando(true); setErro(null);
    const res = await apiFetch('/api/checklists', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ veiculo_id: Number(veiculo), motorista_id: Number(motorista), ...valores, observacoes: obs }),
    }).catch(() => null);
    setSalvando(false);
    if (!res) return setErro('Sem conexão com o servidor.');
    if (!res.ok) return setErro(await erroDaResposta(res, 'Não foi possível registrar.'));
    onSalvo(); onFechar();
  };

  return (
    <Modal titulo="Registrar checklist manualmente" aberto={aberto} onFechar={onFechar}
      rodape={<><Botao variante="secundario" type="button" onClick={onFechar}>Cancelar</Botao><Botao type="submit" form="form-checklist" carregando={salvando}>Registrar</Botao></>}>
      <form id="form-checklist" onSubmit={salvar} className="space-y-4">
        <p className="text-sm text-slate-500">Use quando o motorista não tem celular. O checklist fica registrado como feito hoje.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Van">
            <select required className={inputCls} value={veiculo} onChange={e => setVeiculo(e.target.value)} aria-label="Van">
              <option value="">Escolha…</option>{vans.map(v => <option key={v.id} value={v.id}>{v.placa} · {v.modelo}</option>)}
            </select>
          </Campo>
          <Campo label="Motorista">
            <select required className={inputCls} value={motorista} onChange={e => setMotorista(e.target.value)} aria-label="Motorista">
              <option value="">Escolha…</option>{motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </Campo>
        </div>
        <div className="space-y-2">
          {ITENS.map(i => (
            <div key={i.campo} className="flex items-center gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
              <span className="material-symbols-outlined text-slate-400">{i.icone}</span>
              <div className="flex-1 min-w-0"><p className="text-sm font-bold">{i.label}</p><p className="text-xs text-slate-500">{i.descricao}</p></div>
              <div className="flex gap-1" role="group" aria-label={i.label}>
                <button type="button" onClick={() => setValores(v => ({ ...v, [i.campo]: 'ok' }))}
                  className={`h-9 px-3 rounded-lg text-xs font-black ${valores[i.campo] === 'ok' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500'}`}>OK</button>
                <button type="button" onClick={() => setValores(v => ({ ...v, [i.campo]: 'error' }))}
                  className={`h-9 px-3 rounded-lg text-xs font-black ${valores[i.campo] === 'error' ? 'bg-rose-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500'}`}>Problema</button>
              </div>
            </div>
          ))}
        </div>
        <Campo label={problemas.length ? 'Descreva o problema (obrigatório)' : 'Observação (opcional)'}
          dica={problemas.length ? 'O problema vira uma manutenção pendente na ficha da van.' : undefined}>
          <textarea className={textareaCls} required={problemas.length > 0} value={obs} onChange={e => setObs(e.target.value)} aria-label="Observação"
            placeholder={problemas.length ? `O que há de errado em: ${problemas.map(p => p.label).join(', ')}?` : ''} />
        </Campo>
        <Erro msg={erro} />
      </form>
    </Modal>
  );
};

// ---------- Tela ----------
export const ChecklistEficiencia: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const [aba, setAba] = useState('hoje');
  const [hoje, setHoje] = useState<Hoje | null>(null);
  const [abertos, setAbertos] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [vans, setVans] = useState<Opcao[]>([]);
  const [motoristas, setMotoristas] = useState<Opcao[]>([]);
  const [manual, setManual] = useState(false);
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    const [h, p] = await Promise.all([lerJson<Hoje>('/api/checklists/hoje'), lerJson<Pagina>('/api/checklists?so_abertos=1')]);
    setErro(h.erro || p.erro || null);
    if (h.dados) setHoje(h.dados);
    if (p.dados) setAbertos(p.dados.total);
  }, []);
  useEffect(() => { carregar(); }, [carregar, versao]);

  useEffect(() => {
    lerJson<Opcao[]>('/api/frota').then(r => r.dados && setVans(r.dados));
    lerJson<Opcao[]>('/api/motoristas').then(r => r.dados && setMotoristas(r.dados));
  }, []);

  const mudou = () => setVersao(v => v + 1);
  const c = hoje?.contadores;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-3xl font-black tracking-tight">Checklists</h2>
          <p className="text-slate-500">Conferência das vans antes de sair: quem já fez, o que deu problema e o que falta resolver.</p>
        </div>
        <div className="flex gap-2">
          {onNavigate && <Botao variante="fantasma" icone="airport_shuttle" onClick={() => onNavigate('frota')}>Ver frota</Botao>}
          <Botao variante="secundario" icone="edit_note" onClick={() => setManual(true)}>Registrar manualmente</Botao>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Contador label="Feitos hoje" valor={c ? `${c.feitos}/${c.total}` : '—'} icone="task_alt" cor="bg-emerald-500/10 text-emerald-600" />
        <Contador label="Pendentes" valor={c?.pendentes ?? '—'} icone="schedule" cor="bg-amber-500/10 text-amber-600" />
        <Contador label="Com problema hoje" valor={c?.com_problema ?? '—'} icone="error" cor="bg-rose-500/10 text-rose-600" />
      </div>

      <Erro msg={erro} />

      <Abas ativa={aba} onTrocar={setAba} abas={[
        { id: 'hoje', label: 'Hoje', icone: 'today', alerta: !!c?.pendentes },
        { id: 'problemas', label: `Problemas abertos${abertos ? ` (${abertos})` : ''}`, icone: 'report', alerta: !!abertos },
        { id: 'historico', label: 'Histórico', icone: 'history' },
      ]} />

      {aba === 'hoje' && <AbaHoje hoje={hoje} />}
      {aba === 'problemas' && <AbaProblemas versao={versao} onMudou={mudou} />}
      {aba === 'historico' && <AbaHistorico versao={versao} vans={vans} />}

      <RegistroManual aberto={manual} onFechar={() => setManual(false)} onSalvo={mudou} vans={vans} motoristas={motoristas} />
    </div>
  );
};
