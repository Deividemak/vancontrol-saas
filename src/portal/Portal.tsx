// Portal do responsável: acesso por link mágico (sem senha), pensado para celular.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mapa, MarcadorMapa } from '../components/mapa/Mapa';
import { BlocoPix, Cobranca } from '../components/financeiro/Modais';
import { BRL, imprimirRecibo, imprimirContrato, Recibo, Contrato } from '../components/financeiro/util';

const CHAVE = 'vc_portal_token';

function tokenDaUrl(): string | null {
  // link: /acompanhar#<token>  (aceita também o formato antigo /acompanhar/<token>)
  const doHash = window.location.hash.replace(/^#/, '');
  const doCaminho = window.location.pathname.match(/^\/acompanhar\/([^/?#]+)/)?.[1];
  const novo = doHash || doCaminho;
  if (novo) {
    try { localStorage.setItem(CHAVE, novo); } catch { /* sem armazenamento */ }
    // tira o token da barra de endereço (evita vazar em print/compartilhamento)
    window.history.replaceState(null, '', '/acompanhar');
    return novo;
  }
  try { return localStorage.getItem(CHAVE); } catch { return null; }
}

async function chamar<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/portal${url}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error || 'Erro'), { status: res.status });
  return j as T;
}

interface Aluno { id: number; nome: string; turno: string; foto_thumb: string | null; escola_nome: string | null; }
interface Item {
  aluno_id: number; aluno_nome: string; rota_nome: string; tipo: 'ida' | 'volta'; periodo: string; hora_saida: string | null; hora_prevista: string | null;
  placa: string | null; modelo: string | null; motorista_nome: string | null; escola_nome: string | null; escola: { lat: number; lng: number } | null;
  parada: { lat: number; lng: number; nome: string } | null; ausente: boolean;
  viagem_status: 'nao_iniciada' | 'em_andamento' | 'concluida';
  presenca: { status: string; embarque: string | null; desembarque: string | null } | null;
  van: { lat: number; lng: number; em: string } | null; eta_min: number | null;
}

const inp = 'w-full h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border-none px-4 font-medium';
const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const br = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '');
const primeiro = (n: string) => n.split(' ')[0];

export const Portal: React.FC = () => {
  const [token] = useState(tokenDaUrl);
  const [me, setMe] = useState<{ responsavel: { nome: string }; empresa: string; alunos: Aluno[]; pendencias?: { contratos: number; atrasadas: number }; consentimento_pendente?: boolean } | null>(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<'hoje' | 'faltas' | 'autorizados' | 'pagamentos' | 'conversa'>('hoje');

  const carregarMe = useCallback(() => {
    if (!token) { setErro('Abra o link enviado pela empresa no WhatsApp.'); return; }
    chamar<typeof me>(token, '/me').then(setMe).catch(e => setErro(e.message));
  }, [token]);
  useEffect(() => { carregarMe(); }, [carregarMe]);

  if (erro) return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center bg-slate-100 dark:bg-background-dark">
      <div className="space-y-3 max-w-sm">
        <span className="material-symbols-outlined text-5xl text-slate-400">link_off</span>
        <p className="font-bold">{erro}</p>
      </div>
    </div>
  );
  if (!me || !token) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-400">Carregando...</div>;
  // LGPD: primeiro o responsável lê e aceita o termo de privacidade
  if (me.consentimento_pendente) return <Termo token={token} empresa={me.empresa} nome={me.responsavel.nome} onAceito={carregarMe} />;

  const abas = [
    { id: 'hoje', label: 'Hoje', icone: 'directions_bus' },
    { id: 'faltas', label: 'Faltas', icone: 'event_busy' },
    { id: 'autorizados', label: 'Quem busca', icone: 'how_to_reg' },
    { id: 'pagamentos', label: 'Pagamentos', icone: 'payments' },
    { id: 'conversa', label: 'Conversa', icone: 'chat' },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-background-dark pb-24">
      <header className="bg-primary text-white px-4 pt-5 pb-5">
        <p className="text-xs font-black uppercase tracking-widest opacity-80">{me.empresa}</p>
        <h1 className="text-2xl font-black">Olá, {primeiro(me.responsavel.nome)}</h1>
        <p className="text-sm opacity-90">{me.alunos.map(a => primeiro(a.nome)).join(' e ') || 'Nenhum aluno ativo'}</p>
      </header>
      <main className="p-3 max-w-xl mx-auto">
        {aba === 'hoje' && <Hoje token={token} />}
        {aba === 'faltas' && <Faltas token={token} alunos={me.alunos} />}
        {aba === 'autorizados' && <Autorizados token={token} alunos={me.alunos} />}
        {aba === 'pagamentos' && <Pagamentos token={token} onMudou={carregarMe} />}
        {aba === 'conversa' && <Conversa token={token} empresa={me.empresa} />}
      </main>
      <nav className="fixed bottom-0 inset-x-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 z-[1100]">
        {abas.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)} className={`h-16 flex flex-col items-center justify-center text-[11px] font-bold ${aba === a.id ? 'text-primary' : 'text-slate-500'}`}>
            <span className="material-symbols-outlined relative">{a.icone}
              {a.id === 'pagamentos' && !!(me.pendencias?.contratos || me.pendencias?.atrasadas) && <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-rose-500" />}
            </span>{a.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

// ---------------- Termo de privacidade (LGPD) ----------------
const Termo: React.FC<{ token: string; empresa: string; nome: string; onAceito: () => void }> = ({ token, empresa, nome, onAceito }) => {
  const [t, setT] = useState<{ versao: number; texto: string } | null>(null);
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { chamar<{ versao: number; texto: string }>(token, '/termo').then(setT).catch(e => setErro(e.message)); }, [token]);
  const aceitar = async () => {
    setEnviando(true); setErro('');
    try {
      await chamar(token, '/consentimento', { method: 'POST', body: JSON.stringify({ aceite: true }) });
      onAceito();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-background-dark">
      <header className="bg-primary text-white px-4 pt-5 pb-5">
        <p className="text-xs font-black uppercase tracking-widest opacity-80">{empresa}</p>
        <h1 className="text-2xl font-black">Olá, {primeiro(nome)}</h1>
        <p className="text-sm opacity-90">Antes de começar, leia como cuidamos dos seus dados e dos dados da criança.</p>
      </header>
      <main className="p-3 max-w-xl mx-auto space-y-3">
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm">
          {t ? <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{t.texto}</pre> : <p className="text-slate-400">Carregando...</p>}
        </div>
        <label className="flex items-start gap-3 rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm text-sm font-medium">
          <input type="checkbox" className="mt-1 size-5" checked={aceite} onChange={e => setAceite(e.target.checked)} />
          <span>Li e concordo com o termo de privacidade e autorizo o uso dos dados para o transporte escolar.</span>
        </label>
        {erro && <p className="text-sm font-bold text-rose-600">{erro}</p>}
        <button disabled={!aceite || !t || enviando} onClick={aceitar} className="w-full h-14 rounded-2xl bg-primary text-white text-lg font-black disabled:opacity-40">
          {enviando ? 'Enviando...' : 'Aceitar e continuar'}
        </button>
        {t && <p className="text-center text-xs text-slate-400">Versão {t.versao} do termo</p>}
      </main>
    </div>
  );
};

// ---------------- Hoje ----------------
const ROTULO: Record<string, string> = { previsto: 'Aguardando a van', ausente_avisado: 'Falta avisada', embarcou: 'Na van', desembarcou: 'Entregue', nao_compareceu: 'Não embarcou' };

const Hoje: React.FC<{ token: string }> = ({ token }) => {
  const [d, setD] = useState<{ data: string; calendario: { sem_aula_todas: boolean; motivo: string | null }; itens: Item[] } | null>(null);
  const [erro, setErro] = useState('');
  const carregar = useCallback(() => chamar<any>(token, '/hoje').then(x => { setD(x); setErro(''); }).catch(e => setErro(e.message)), [token]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 20000); return () => clearInterval(t); }, [carregar]);
  if (erro) return <p className="p-4 text-rose-600 font-bold">{erro}</p>;
  if (!d) return <p className="p-8 text-center text-slate-400 font-bold">Carregando...</p>;
  return (
    <div className="space-y-3">
      {d.calendario.sem_aula_todas && <p className="rounded-2xl bg-blue-500/10 text-blue-800 dark:text-blue-200 p-4 font-bold">Hoje não tem aula ({d.calendario.motivo}).</p>}
      {d.itens.length === 0 && <p className="rounded-2xl bg-white dark:bg-slate-900 p-6 text-center text-slate-500">Nenhuma rota cadastrada para seus filhos.</p>}
      {d.itens.map(it => <CartaoViagem key={`${it.aluno_id}-${it.rota_nome}`} it={it} />)}
      <p className="text-center text-[11px] text-slate-400">Atualiza sozinho a cada 20 segundos.</p>
    </div>
  );
};

const CartaoViagem: React.FC<{ it: Item }> = ({ it }) => {
  const st = it.presenca?.status;
  const aoVivo = it.viagem_status === 'em_andamento' && !!it.van;
  const marcadores = useMemo<MarcadorMapa[]>(() => {
    const m: MarcadorMapa[] = [];
    if (it.parada) m.push({ id: 'casa', lat: it.parada.lat, lng: it.parada.lng, tipo: 'pin', titulo: it.parada.nome });
    if (it.escola) m.push({ id: 'escola', lat: it.escola.lat, lng: it.escola.lng, tipo: 'escola', titulo: it.escola_nome || 'Escola' });
    if (it.van) m.push({ id: 'van', lat: it.van.lat, lng: it.van.lng, tipo: 'partida', destaque: true, titulo: 'Van' });
    return m;
  }, [it]);
  const chave = useRef(Date.now());
  let destaque = '';
  if (it.ausente) destaque = 'Falta avisada para hoje';
  else if (it.viagem_status === 'nao_iniciada') destaque = it.hora_prevista ? `Previsão no ponto: ${it.hora_prevista}` : `Saída da van: ${it.hora_saida || '--:--'}`;
  else if (it.eta_min !== null && (st === 'previsto' || st === 'embarcou')) destaque = it.tipo === 'ida' && st === 'previsto' ? `A van chega em ~${it.eta_min} min` : `Chega em casa em ~${it.eta_min} min`;
  else if (st) destaque = ROTULO[st] || st;

  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="p-4 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-black">{primeiro(it.aluno_nome)} · {it.tipo === 'ida' ? 'Ida para a escola' : 'Volta para casa'}</p>
          <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${it.viagem_status === 'em_andamento' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-slate-500/10 text-slate-500'}`}>
            {it.viagem_status === 'em_andamento' ? 'Ao vivo' : it.viagem_status === 'concluida' ? 'Concluída' : 'Não iniciada'}
          </span>
        </div>
        <p className={`text-2xl font-black ${it.ausente ? 'text-amber-600' : 'text-primary'}`}>{destaque}</p>
        <p className="text-sm text-slate-500">{it.escola_nome} · {it.placa || 'van'}{it.motorista_nome ? ` · ${it.motorista_nome}` : ''}</p>
        {it.presenca && (it.presenca.embarque || it.presenca.desembarque) && (
          <p className="text-sm font-medium">
            {it.presenca.embarque && <>Embarcou às <b>{it.presenca.embarque}</b></>}
            {it.presenca.desembarque && <> · {it.tipo === 'ida' ? 'chegou na escola' : 'entregue'} às <b>{it.presenca.desembarque}</b></>}
          </p>
        )}
      </div>
      {aoVivo && <Mapa className="h-56 !rounded-none !border-0" marcadores={marcadores} chaveEnquadramento={chave.current} />}
    </section>
  );
};

// ---------------- Faltas ----------------
const Faltas: React.FC<{ token: string; alunos: Aluno[] }> = ({ token, alunos }) => {
  const [lista, setLista] = useState<any[]>([]);
  const [sel, setSel] = useState<number[]>(alunos.length === 1 ? [alunos[0].id] : []);
  const [de, setDe] = useState(hojeISO());
  const [ate, setAte] = useState(hojeISO());
  const [sentido, setSentido] = useState('ambos');
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const carregar = useCallback(() => chamar<any[]>(token, '/ausencias').then(setLista), [token]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvar = async () => {
    setMsg(null);
    if (!sel.length) { setMsg({ ok: false, t: 'Escolha quem vai faltar.' }); return; }
    try {
      await chamar(token, '/ausencias', { method: 'POST', body: JSON.stringify({ aluno_ids: sel, data_inicio: de, data_fim: ate, sentido, motivo }) });
      setMsg({ ok: true, t: 'Falta avisada. O motorista já fica sabendo.' });
      setMotivo('');
      carregar();
    } catch (e) { setMsg({ ok: false, t: (e as Error).message }); }
  };
  const cancelar = async (id: number) => { if (!confirm('Cancelar este aviso de falta?')) return; await chamar(token, `/ausencias/${id}`, { method: 'DELETE' }); carregar(); };
  return (
    <div className="space-y-3">
      <section className="rounded-3xl bg-white dark:bg-slate-900 p-4 space-y-3">
        <h2 className="text-lg font-black">Avisar falta</h2>
        <div className="flex flex-wrap gap-2">
          {alunos.map(a => (
            <button key={a.id} onClick={() => setSel(s => s.includes(a.id) ? s.filter(x => x !== a.id) : [...s, a.id])}
              className={`h-11 px-4 rounded-xl font-bold ${sel.includes(a.id) ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{primeiro(a.nome)}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-slate-500">De<input type="date" min={hojeISO()} className={inp} value={de} onChange={e => { setDe(e.target.value); if (ate < e.target.value) setAte(e.target.value); }} /></label>
          <label className="text-xs font-bold text-slate-500">Até<input type="date" min={de} className={inp} value={ate} onChange={e => setAte(e.target.value)} /></label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[['ambos', 'Ida e volta'], ['ida', 'Só ida'], ['volta', 'Só volta']].map(([k, l]) => (
            <button key={k} onClick={() => setSentido(k)} className={`h-11 rounded-xl text-sm font-bold ${sentido === k ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{l}</button>
          ))}
        </div>
        <input className={inp} placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
        {msg && <p className={`text-sm font-bold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.t}</p>}
        <button onClick={salvar} className="w-full h-14 rounded-2xl bg-primary text-white text-lg font-black">Avisar</button>
        <p className="text-[11px] text-slate-500">Dica: você também pode avisar pelo WhatsApp, escrevendo por exemplo "{alunos[0] ? primeiro(alunos[0].nome) : 'Ana'} não vai amanhã".</p>
      </section>
      <section className="rounded-3xl bg-white dark:bg-slate-900 p-4 space-y-2">
        <h2 className="font-black">Faltas avisadas</h2>
        {lista.length === 0 && <p className="text-sm text-slate-500">Nenhuma falta futura.</p>}
        {lista.map(a => (
          <div key={a.id} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
            <div className="flex-1">
              <p className="font-bold">{primeiro(a.aluno_nome)} · {br(a.data_inicio)}{a.data_fim !== a.data_inicio ? ` a ${br(a.data_fim)}` : ''}</p>
              <p className="text-xs text-slate-500">{a.sentido === 'ambos' ? 'Ida e volta' : `Só ${a.sentido}`}{a.motivo && !a.motivo.startsWith('WhatsApp') ? ` · ${a.motivo}` : ''} · via {a.origem}</p>
            </div>
            <button onClick={() => cancelar(a.id)} className="h-10 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancelar</button>
          </div>
        ))}
      </section>
    </div>
  );
};

// ---------------- Autorizados ----------------
const Autorizados: React.FC<{ token: string; alunos: Aluno[] }> = ({ token, alunos }) => {
  const [lista, setLista] = useState<any[]>([]);
  const vazio = { aluno_ids: alunos.map(a => a.id), nome: '', parentesco: '', telefone: '', documento: '', valido_ate: '' };
  const [f, setF] = useState(vazio);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');
  const carregar = useCallback(() => chamar<any[]>(token, '/autorizados').then(setLista), [token]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvar = async () => {
    setErro('');
    try { await chamar(token, '/autorizados', { method: 'POST', body: JSON.stringify(f) }); setAberto(false); setF(vazio); carregar(); }
    catch (e) { setErro((e as Error).message); }
  };
  const remover = async (id: number) => { if (!confirm('Remover esta autorização?')) return; await chamar(token, `/autorizados/${id}`, { method: 'DELETE' }); carregar(); };
  return (
    <div className="space-y-3">
      <section className="rounded-3xl bg-white dark:bg-slate-900 p-4 space-y-2">
        <h2 className="text-lg font-black">Quem pode buscar e receber</h2>
        <p className="text-sm text-slate-500">O motorista vê esta lista na hora de entregar a criança.</p>
        {lista.length === 0 && <p className="text-sm text-slate-500 py-2">Nenhuma pessoa cadastrada além de você.</p>}
        {lista.map(a => (
          <div key={a.id} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
            <div className="flex-1">
              <p className="font-bold">{a.nome}{a.parentesco ? ` (${a.parentesco})` : ''}</p>
              <p className="text-xs text-slate-500">{primeiro(a.aluno_nome)}{a.telefone ? ` · ${a.telefone}` : ''}{a.valido_ate ? ` · até ${br(a.valido_ate)}` : ''}</p>
            </div>
            <button onClick={() => remover(a.id)} className="h-10 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Remover</button>
          </div>
        ))}
        {!aberto && <button onClick={() => setAberto(true)} className="w-full h-12 rounded-2xl bg-primary text-white font-black">Adicionar pessoa</button>}
      </section>
      {aberto && (
        <section className="rounded-3xl bg-white dark:bg-slate-900 p-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            {alunos.map(a => (
              <button key={a.id} onClick={() => setF(x => ({ ...x, aluno_ids: x.aluno_ids.includes(a.id) ? x.aluno_ids.filter(i => i !== a.id) : [...x.aluno_ids, a.id] }))}
                className={`h-10 px-4 rounded-xl text-sm font-bold ${f.aluno_ids.includes(a.id) ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{primeiro(a.nome)}</button>
            ))}
          </div>
          <input className={inp} placeholder="Nome completo" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inp} placeholder="Parentesco" value={f.parentesco} onChange={e => setF({ ...f, parentesco: e.target.value })} />
            <input className={inp} placeholder="Telefone" value={f.telefone} onChange={e => setF({ ...f, telefone: e.target.value })} />
          </div>
          <input className={inp} placeholder="Documento (RG/CPF) — opcional" value={f.documento} onChange={e => setF({ ...f, documento: e.target.value })} />
          <label className="text-xs font-bold text-slate-500 block">Válido até (vazio = sem prazo)<input type="date" className={inp} value={f.valido_ate} onChange={e => setF({ ...f, valido_ate: e.target.value })} /></label>
          {erro && <p className="text-sm font-bold text-rose-600">{erro}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setAberto(false)} className="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 font-bold">Cancelar</button>
            <button onClick={salvar} className="h-12 rounded-2xl bg-primary text-white font-black">Salvar</button>
          </div>
        </section>
      )}
    </div>
  );
};

// ---------------- Pagamentos ----------------
interface MensPortal { id: number; aluno_nome: string; valor: number; valor_atualizado: number; dias_atraso: number; status: string; vencimento: string; pagamento: string | null; recibo_numero: number | null; descricao: string | null }
const Pagamentos: React.FC<{ token: string; onMudou: () => void }> = ({ token, onMudou }) => {
  const [lista, setLista] = useState<MensPortal[] | null>(null);
  const [contratos, setContratos] = useState<any[]>([]);
  const [aberta, setAberta] = useState<number | null>(null);
  const [cob, setCob] = useState<Cobranca | null>(null);
  const [erroPix, setErroPix] = useState('');
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const carregar = useCallback(() => {
    chamar<MensPortal[]>(token, '/mensalidades').then(setLista);
    chamar<any[]>(token, '/contratos').then(setContratos).catch(() => setContratos([]));
  }, [token]);
  useEffect(() => { carregar(); }, [carregar]);

  const pagar = async (id: number) => {
    if (aberta === id) { setAberta(null); return; }
    setAberta(id); setCob(null); setErroPix('');
    try { setCob(await chamar<Cobranca>(token, `/mensalidades/${id}/pagar`)); } catch (e) { setErroPix((e as Error).message); }
  };
  const recibo = async (id: number) => {
    try { imprimirRecibo(await chamar<Recibo>(token, `/mensalidades/${id}/recibo`)); } catch (e) { alert((e as Error).message); }
  };
  const abrirContrato = async (id: number) => setContrato(await chamar<Contrato>(token, `/contratos/${id}`));

  if (!lista) return <p className="p-8 text-center text-slate-400 font-bold">Carregando...</p>;
  if (contrato) return <AssinarContrato token={token} c={contrato} onVoltar={() => { setContrato(null); carregar(); onMudou(); }} />;
  const cor: Record<string, string> = { Pago: 'bg-emerald-500/15 text-emerald-700', Pendente: 'bg-blue-500/15 text-blue-700', Atrasado: 'bg-rose-500/15 text-rose-700' };
  const pendentes = contratos.filter(c => c.status === 'pendente');
  return (
    <div className="space-y-3">
      {pendentes.map(c => (
        <button key={c.id} onClick={() => abrirContrato(c.id)} className="w-full text-left rounded-3xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 p-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-amber-600 text-3xl">history_edu</span>
          <span className="flex-1"><b className="block">Contrato para assinar</b><span className="text-sm text-slate-600 dark:text-slate-300">Transporte de {primeiro(c.aluno_nome)} · toque para ler e assinar</span></span>
          <span className="material-symbols-outlined text-slate-400">chevron_right</span>
        </button>
      ))}
      <section className="rounded-3xl bg-white dark:bg-slate-900 p-4 space-y-2">
        <h2 className="text-lg font-black">Mensalidades</h2>
        {lista.length === 0 && <p className="text-sm text-slate-500">Nenhuma mensalidade registrada.</p>}
        {lista.map(m => {
          const emAberto = m.status === 'Pendente' || m.status === 'Atrasado';
          return (
            <div key={m.id} className="py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-bold">{primeiro(m.aluno_nome)} · {m.vencimento.slice(5, 7)}/{m.vencimento.slice(0, 4)}</p>
                  <p className="text-xs text-slate-500">
                    {BRL(emAberto ? m.valor_atualizado : m.valor)} · vence {br(m.vencimento)}{m.pagamento ? ` · pago em ${br(m.pagamento)}` : ''}
                    {m.dias_atraso > 0 && emAberto ? ' · com multa e juros' : ''}{m.descricao ? ` · ${m.descricao}` : ''}
                  </p>
                </div>
                <span className={`text-[11px] font-black uppercase px-2 py-1 rounded ${cor[m.status] || 'bg-slate-500/10 text-slate-500'}`}>{m.status}</span>
              </div>
              {emAberto && <button onClick={() => pagar(m.id)} className="mt-2 w-full h-11 rounded-xl bg-primary text-white font-bold flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">qr_code_2</span>{aberta === m.id ? 'Fechar' : 'Pagar com Pix'}</button>}
              {m.status === 'Pago' && m.recibo_numero && <button onClick={() => recibo(m.id)} className="mt-2 text-sm font-bold text-primary flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px]">receipt_long</span>Recibo nº {m.recibo_numero}</button>}
              {aberta === m.id && (
                <div className="mt-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-3">
                  {erroPix && <p className="text-sm text-rose-600 font-bold">{erroPix}</p>}
                  {!cob && !erroPix && <p className="text-center text-slate-400 animate-pulse">Gerando Pix...</p>}
                  {cob && <BlocoPix c={cob} />}
                  {cob && <p className="text-[11px] text-slate-500 mt-3 text-center">{cob.provedor === 'asaas' ? 'A confirmação é automática e o recibo aparece aqui.' : 'Depois de pagar, a empresa confirma o recebimento e o recibo aparece aqui. Se quiser, mande o comprovante na Conversa.'}</p>}
                </div>
              )}
            </div>
          );
        })}
      </section>
      {contratos.filter(c => c.status === 'assinado').map(c => (
        <button key={c.id} onClick={() => abrirContrato(c.id)} className="w-full text-left rounded-3xl bg-white dark:bg-slate-900 p-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-emerald-600">verified</span>
          <span className="flex-1 text-sm"><b>Contrato de {primeiro(c.aluno_nome)}</b> · assinado em {new Date(c.assinado_em).toLocaleDateString('pt-BR')}</span>
          <span className="material-symbols-outlined text-slate-400">chevron_right</span>
        </button>
      ))}
    </div>
  );
};

const AssinarContrato: React.FC<{ token: string; c: Contrato; onVoltar: () => void }> = ({ token, c, onVoltar }) => {
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);
  const assinar = async () => {
    setErro('');
    try {
      await chamar(token, `/contratos/${c.id}/assinar`, { method: 'POST', body: JSON.stringify({ nome, cpf, aceite }) });
      setOk(true);
    } catch (e) { setErro((e as Error).message); }
  };
  const fmtCpf = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 p-4 space-y-3">
      <button onClick={onVoltar} className="text-sm font-bold text-primary flex items-center gap-1"><span className="material-symbols-outlined text-[18px]">arrow_back</span>Voltar</button>
      <h2 className="text-lg font-black">Contrato · {primeiro(c.aluno_nome)}</h2>
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed max-h-[55vh] overflow-y-auto rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-3">{c.conteudo}</pre>
      {c.status === 'assinado' || ok ? (
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm">
          <b>Contrato assinado{ok ? '!' : ''}</b>{!ok && <> por {c.assinatura_nome} em {new Date(c.assinado_em!).toLocaleString('pt-BR')}</>}
          <button onClick={() => imprimirContrato(ok ? { ...c, status: 'assinado', assinatura_nome: nome, assinatura_cpf: fmtCpf(cpf), assinado_em: new Date().toISOString() } : c)} className="block mt-2 font-bold text-primary">Imprimir / salvar PDF</button>
        </div>
      ) : (
        <div className="space-y-3">
          <input className={inp} placeholder="Seu nome completo" value={nome} onChange={e => setNome(e.target.value)} aria-label="Nome completo" />
          <input className={inp} placeholder="Seu CPF" inputMode="numeric" value={cpf} onChange={e => setCpf(fmtCpf(e.target.value))} aria-label="CPF" />
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={aceite} onChange={e => setAceite(e.target.checked)} />
            <span>Li e concordo com este contrato. Entendo que esta confirmação vale como assinatura eletrônica.</span></label>
          {erro && <p className="text-sm text-rose-600 font-bold">{erro}</p>}
          <button onClick={assinar} disabled={!nome || !cpf || !aceite} className="w-full h-12 rounded-xl bg-primary text-white font-bold disabled:opacity-40">Assinar contrato</button>
          <p className="text-[11px] text-slate-500">Registramos data, hora, IP e aparelho junto com um código que garante que o texto não foi alterado.</p>
        </div>
      )}
    </section>
  );
};

// ---------------- Conversa ----------------
const Conversa: React.FC<{ token: string; empresa: string }> = ({ token, empresa }) => {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [texto, setTexto] = useState('');
  const fim = useRef<HTMLDivElement>(null);
  const carregar = useCallback(() => chamar<any[]>(token, '/mensagens').then(setMsgs), [token]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 15000); return () => clearInterval(t); }, [carregar]);
  useEffect(() => { fim.current?.scrollIntoView(); }, [msgs.length]);
  const enviar = async () => {
    if (!texto.trim()) return;
    await chamar(token, '/mensagens', { method: 'POST', body: JSON.stringify({ texto }) });
    setTexto('');
    carregar();
  };
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500 px-1">Conversa com {empresa}. Tudo fica registrado, inclusive o que você manda pelo WhatsApp.</p>
      <div className="space-y-2 pb-20">
        {msgs.map(m => {
          const meu = m.direcao === 'entrada';
          return (
            <div key={m.id} className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 whitespace-pre-wrap text-sm ${meu ? 'bg-primary text-white' : m.tipo === 'notificacao' ? 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300' : 'bg-white dark:bg-slate-900'}`}>
                {m.texto}
                <p className={`text-[10px] mt-1 ${meu ? 'text-white/70' : 'text-slate-400'}`}>{m.criado_em.slice(8, 10)}/{m.criado_em.slice(5, 7)} {m.criado_em.slice(11, 16)} · {m.canal}</p>
              </div>
            </div>
          );
        })}
        <div ref={fim} />
      </div>
      <div className="fixed bottom-16 inset-x-0 bg-slate-100 dark:bg-background-dark p-2 flex gap-2 max-w-xl mx-auto z-[1050]">
        <input className={`${inp} flex-1 bg-white dark:bg-slate-900`} placeholder="Escreva para a empresa" value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} />
        <button onClick={enviar} className="h-12 w-12 rounded-xl bg-primary text-white flex items-center justify-center" aria-label="Enviar"><span className="material-symbols-outlined">send</span></button>
      </div>
    </div>
  );
};
