// Documentos da frota, dos motoristas e dos monitores, com alertas de vencimento
import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../services/api';
import { Abas, Botao, Campo, Modal, Selo, CorSelo, inputCls, erroDaResposta } from './ui';

type Entidade = 'veiculo' | 'motorista' | 'monitor';
interface TipoDoc { id: string; nome: string; obrigatorio: boolean; meses: number; }
interface Doc {
  id?: number | null; tipo: string; nome: string; obrigatorio: boolean; situacao: 'ok' | 'vencendo' | 'vencido' | 'faltando' | 'sem_validade';
  dias: number | null; numero?: string | null; emissao?: string | null; validade?: string | null; tem_arquivo?: boolean; arquivo_nome?: string | null;
  observacao?: string | null; do_cadastro?: boolean;
}
interface Item { entidade: Entidade; entidade_id: number; nome: string; detalhe: string | null; documentos: Doc[]; pendencias: { tipo: string; nome: string; situacao: string; dias: number | null }[]; }
interface Painel { alerta_dias: number; resumo: { vencidos: number; vencendo: number; faltando: number; irregulares: number }; itens: Item[]; }
interface Monitor { id: number; nome: string; telefone: string | null; cpf: string | null; status: string; observacoes: string | null; rotas_nomes: string | null; app_email?: string | null; }

const br = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const COR: Record<Doc['situacao'], CorSelo> = { ok: 'verde', vencendo: 'amarelo', vencido: 'vermelho', faltando: 'vermelho', sem_validade: 'cinza' };
const textoSituacao = (d: Doc) =>
  d.situacao === 'faltando' ? (d.obrigatorio ? 'Faltando' : 'Não lançado')
    : d.situacao === 'vencido' ? `Vencido há ${-d.dias!} dia${d.dias === -1 ? '' : 's'}`
      : d.situacao === 'vencendo' ? (d.dias === 0 ? 'Vence hoje' : `Vence em ${d.dias} dia${d.dias === 1 ? '' : 's'}`)
        : d.situacao === 'ok' ? `Até ${br(d.validade)}` : 'Sem validade';

const somarMeses = (iso: string, m: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export const Documentos: React.FC = () => {
  const [aba, setAba] = useState<Entidade>('veiculo');
  const [p, setP] = useState<Painel | null>(null);
  const [tipos, setTipos] = useState<Record<Entidade, TipoDoc[]> | null>(null);
  const [soPend, setSoPend] = useState(false);
  const [editar, setEditar] = useState<{ item: Item; doc: Doc } | null>(null);
  const [config, setConfig] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = () => apiFetch('/api/documentos/painel').then(async r => (r.ok ? setP(await r.json()) : setErro(await erroDaResposta(r, 'Erro ao carregar')))).catch(() => setErro('Sem conexão com o servidor.'));
  useEffect(() => {
    carregar();
    apiFetch('/api/documentos/tipos').then(r => r.json()).then(setTipos).catch(() => {});
  }, []);

  const itens = useMemo(() => (p?.itens || []).filter(i => i.entidade === aba && (!soPend || i.pendencias.length)), [p, aba, soPend]);
  const pendAba = (e: Entidade) => (p?.itens || []).filter(i => i.entidade === e && i.pendencias.length).length;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight">Documentos</h2>
          <p className="text-slate-500 dark:text-slate-400">CRLV, vistoria escolar, seguro APP, CNH, curso de transporte escolar, antecedentes e alertas de vencimento.</p>
        </div>
        <Botao variante="secundario" icone="tune" onClick={() => setConfig(true)}>Configurar</Botao>
      </div>
      {erro && <p className="text-rose-600 font-bold">{erro}</p>}
      {p && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Vencidos', p.resumo.vencidos, 'text-rose-600'], [`Vencem em até ${p.alerta_dias} dias`, p.resumo.vencendo, 'text-amber-600'], ['Obrigatórios faltando', p.resumo.faltando, 'text-rose-600'], ['CNH fora da categoria', p.resumo.irregulares, 'text-rose-600']].map(([l, v, c]) => (
            <div key={l as string} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{l}</p>
              <p className={`text-2xl font-black ${Number(v) ? c : ''}`}>{v}</p>
            </div>
          ))}
        </div>
      )}
      <Abas ativa={aba} onTrocar={id => setAba(id as Entidade)} abas={[
        { id: 'veiculo', label: 'Vans', icone: 'airport_shuttle', alerta: pendAba('veiculo') > 0 },
        { id: 'motorista', label: 'Motoristas', icone: 'badge', alerta: pendAba('motorista') > 0 },
        { id: 'monitor', label: 'Monitores', icone: 'support_agent', alerta: pendAba('monitor') > 0 },
      ]} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soPend} onChange={e => setSoPend(e.target.checked)} /> Só com pendência</label>
        {aba === 'motorista' && <p className="text-xs text-slate-500">Motoristas de van escolar precisam de CNH D (ou E), curso de transporte escolar, certidão de antecedentes e exame toxicológico em dia.</p>}
      </div>
      {aba === 'monitor' && <Monitores onMudou={carregar} />}
      {!p && !erro && <p className="text-center text-slate-400 animate-pulse py-8">Carregando...</p>}
      {p && itens.length === 0 && <p className="text-center text-slate-400 py-8">{soPend ? 'Nenhuma pendência. 🎉' : aba === 'monitor' ? 'Cadastre os monitores acima.' : 'Nenhum cadastro.'}</p>}
      <div className="space-y-3">
        {itens.map(i => (
          <div key={`${i.entidade}${i.entidade_id}`} className={`rounded-xl border bg-white dark:bg-slate-900 p-4 ${i.pendencias.some(x => x.situacao !== 'vencendo') ? 'border-rose-200 dark:border-rose-900' : i.pendencias.length ? 'border-amber-200' : 'border-slate-200 dark:border-slate-800'}`}>
            <div className="flex flex-wrap items-baseline gap-2 mb-3">
              <p className="font-black">{i.nome}</p>
              <p className="text-xs text-slate-500">{i.detalhe || ''}</p>
              {i.pendencias.filter(x => x.situacao === 'irregular').map(x => <Selo key={x.tipo} cor="vermelho" icone="error">{x.nome}</Selo>)}
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2">
              {i.documentos.map(d => (
                <button key={d.tipo} onClick={() => setEditar({ item: i, doc: d })} title="Lançar ou renovar"
                  className="text-left rounded-lg border border-slate-200 dark:border-slate-700 p-3 hover:border-primary transition-colors">
                  <p className="text-xs font-bold leading-tight">{d.nome}{!d.obrigatorio && <span className="text-slate-400 font-medium"> (opcional)</span>}</p>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    <Selo cor={d.situacao === 'faltando' && !d.obrigatorio ? 'cinza' : COR[d.situacao]}>{textoSituacao(d)}</Selo>
                    {d.tem_arquivo && <span className="material-symbols-outlined text-[16px] text-slate-400" title="Tem arquivo">attach_file</span>}
                    {d.do_cadastro && <span className="text-[10px] text-slate-400">do cadastro</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <DocModal alvo={editar} tipos={tipos} onFechar={() => setEditar(null)} onSalvo={() => { setEditar(null); carregar(); }} />
      <ConfigDocs aberto={config} onFechar={() => { setConfig(false); carregar(); }} />
    </div>
  );
};

const DocModal: React.FC<{ alvo: { item: Item; doc: Doc } | null; tipos: Record<Entidade, TipoDoc[]> | null; onFechar: () => void; onSalvo: () => void }> = ({ alvo, tipos, onFechar, onSalvo }) => {
  const [f, setF] = useState({ numero: '', emissao: '', validade: '', observacao: '' });
  const [arquivo, setArquivo] = useState<{ dado: string | null; nome: string } | undefined>(undefined);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!alvo) return;
    const d = alvo.doc;
    setF({ numero: d.numero || '', emissao: d.emissao || '', validade: d.validade || '', observacao: d.observacao || '' });
    setArquivo(undefined); setErro('');
  }, [alvo]);
  if (!alvo) return null;
  const meses = tipos?.[alvo.item.entidade]?.find(t => t.id === alvo.doc.tipo)?.meses;

  const escolher = (fl: File | undefined) => {
    if (!fl) return;
    if (fl.size > 2 * 1024 * 1024) { setErro('Arquivo maior que 2 MB.'); return; }
    const r = new FileReader();
    r.onload = () => setArquivo({ dado: String(r.result), nome: fl.name });
    r.readAsDataURL(fl);
  };
  const verArquivo = async () => {
    const r = await apiFetch(`/api/documentos/${alvo.doc.id}/arquivo`);
    if (!r.ok) return;
    const j = await r.json();
    const w = window.open('', '_blank');
    if (w) w.document.write(j.arquivo.startsWith('data:application/pdf') ? `<iframe src="${j.arquivo}" style="border:0;width:100%;height:100vh"></iframe>` : `<img src="${j.arquivo}" style="max-width:100%">`);
  };
  const salvar = async () => {
    setSalvando(true); setErro('');
    const res = await apiFetch('/api/documentos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entidade: alvo.item.entidade, entidade_id: alvo.item.entidade_id, tipo: alvo.doc.tipo, ...f,
        ...(arquivo !== undefined ? { arquivo: arquivo.dado, arquivo_nome: arquivo.nome } : {}) }),
    });
    setSalvando(false);
    if (res.ok) onSalvo(); else setErro(await erroDaResposta(res, 'Erro ao salvar'));
  };
  const excluir = async () => {
    if (!alvo.doc.id || !window.confirm('Excluir este documento?')) return;
    await apiFetch(`/api/documentos/${alvo.doc.id}`, { method: 'DELETE' });
    onSalvo();
  };

  return (
    <Modal titulo={`${alvo.doc.nome} · ${alvo.item.nome}`} aberto onFechar={onFechar} tamanho="md"
      rodape={<>
        {alvo.doc.id && <Botao variante="perigo" onClick={excluir}>Excluir</Botao>}
        <div className="flex-1" />
        <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao onClick={salvar} carregando={salvando}>Salvar</Botao>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Número" className="col-span-2"><input className={inputCls} value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} aria-label="Número do documento" /></Campo>
          <Campo label="Emissão"><input type="date" className={inputCls} value={f.emissao} onChange={e => setF({ ...f, emissao: e.target.value })} aria-label="Emissão" /></Campo>
          <Campo label="Validade" dica={meses ? `Costuma valer ${meses >= 12 ? `${meses / 12} ano${meses > 12 ? 's' : ''}` : `${meses} meses`}` : undefined}>
            <input type="date" className={inputCls} value={f.validade} onChange={e => setF({ ...f, validade: e.target.value })} aria-label="Validade" />
          </Campo>
        </div>
        {meses && <button type="button" className="text-xs font-bold text-primary" onClick={() => setF({ ...f, validade: somarMeses(f.emissao || hojeISO(), meses) })}>Calcular validade a partir da emissão (+{meses} meses)</button>}
        <Campo label="Arquivo (foto ou PDF, até 2 MB)">
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => escolher(e.target.files?.[0])} className="text-sm" aria-label="Arquivo do documento" />
            {alvo.doc.tem_arquivo && arquivo === undefined && <Botao variante="secundario" className="h-8 text-xs" icone="visibility" onClick={verArquivo}>Ver atual</Botao>}
            {alvo.doc.tem_arquivo && arquivo === undefined && <Botao variante="fantasma" className="h-8 text-xs" onClick={() => setArquivo({ dado: null, nome: '' })}>Remover</Botao>}
            {arquivo?.dado && <span className="text-xs text-emerald-600 font-bold">{arquivo.nome}</span>}
          </div>
        </Campo>
        <Campo label="Observação"><input className={inputCls} value={f.observacao} onChange={e => setF({ ...f, observacao: e.target.value })} /></Campo>
        {alvo.doc.do_cadastro && <p className="text-xs text-slate-500">A validade veio do cadastro do motorista. Ao salvar, os dois ficam iguais.</p>}
        {erro && <p className="text-sm text-rose-600 font-bold">{erro}</p>}
      </div>
    </Modal>
  );
};

const Monitores: React.FC<{ onMudou: () => void }> = ({ onMudou }) => {
  const [lista, setLista] = useState<Monitor[]>([]);
  const [edit, setEdit] = useState<Partial<Monitor> | null>(null);
  const [acesso, setAcesso] = useState<{ m: Monitor; email: string; senha: string } | null>(null);
  const [erro, setErro] = useState('');
  const salvarAcesso = async () => {
    const res = await apiFetch(`/api/equipe/monitor/${acesso!.m.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: acesso!.email, senha: acesso!.senha }) });
    if (!res.ok) return setErro(await erroDaResposta(res, 'Erro ao salvar acesso'));
    setAcesso(null); carregar();
  };
  const removerAcesso = async () => {
    await apiFetch(`/api/equipe/monitor/${acesso!.m.id}`, { method: 'DELETE' });
    setAcesso(null); carregar();
  };
  const carregar = () => apiFetch('/api/monitores').then(r => r.json()).then(setLista).catch(() => {});
  useEffect(() => { carregar(); }, []);
  const salvar = async () => {
    const res = await apiFetch(edit!.id ? `/api/monitores/${edit!.id}` : '/api/monitores', { method: edit!.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit) });
    if (!res.ok) return setErro(await erroDaResposta(res, 'Erro ao salvar'));
    setEdit(null); carregar(); onMudou();
  };
  const excluir = async (m: Monitor) => {
    if (!window.confirm(`Excluir ${m.nome}? Sai das rotas e os documentos são apagados.`)) return;
    await apiFetch(`/api/monitores/${m.id}`, { method: 'DELETE' });
    carregar(); onMudou();
  };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-black text-sm">Cadastro de monitores</p>
        <Botao className="h-9" icone="person_add" onClick={() => { setErro(''); setEdit({ nome: '', telefone: '', cpf: '', status: 'Ativo' }); }}>Novo monitor</Botao>
      </div>
      {lista.length === 0 && <p className="text-sm text-slate-400">Nenhum monitor cadastrado. Depois de cadastrar, escolha o monitor na tela de Rotas.</p>}
      {lista.map(m => (
        <div key={m.id} className="flex flex-wrap items-center gap-2 py-2 border-t border-slate-100 dark:border-slate-800">
          <p className="font-bold text-sm flex-1">{m.nome} <span className="text-xs text-slate-500 font-medium">{m.telefone || ''}{m.rotas_nomes ? ` · ${m.rotas_nomes}` : ''}</span></p>
          {m.status !== 'Ativo' && <Selo>Inativo</Selo>}
          {m.app_email && <Selo cor="verde" icone="smartphone">App: {m.app_email}</Selo>}
          <button className="h-8 px-2 rounded-lg text-xs font-bold text-primary hover:bg-primary/10" title="Acesso ao app do monitor"
            onClick={() => { setErro(''); setAcesso({ m, email: m.app_email || '', senha: '' }); }}>App</button>
          <button className="size-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Editar" onClick={() => { setErro(''); setEdit(m); }}><span className="material-symbols-outlined text-[18px]">edit</span></button>
          <button className="size-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Excluir" onClick={() => excluir(m)}><span className="material-symbols-outlined text-[18px]">delete</span></button>
        </div>
      ))}
      <Modal titulo={`Acesso ao app · ${acesso?.m.nome || ''}`} aberto={!!acesso} onFechar={() => setAcesso(null)} tamanho="md"
        rodape={<>{acesso?.m.app_email && <Botao variante="perigo" onClick={removerAcesso}>Remover acesso</Botao>}<Botao variante="secundario" onClick={() => setAcesso(null)}>Cancelar</Botao><Botao onClick={salvarAcesso}>Salvar</Botao></>}>
        {acesso && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">O monitor entra no mesmo app do motorista (pelo celular) e marca embarque/desembarque, ocorrências e emergência nas rotas em que acompanha. Iniciar e encerrar a viagem continuam com o motorista.</p>
            <Campo label="E-mail de acesso"><input type="email" className={inputCls} value={acesso.email} onChange={e => setAcesso({ ...acesso, email: e.target.value })} aria-label="E-mail do monitor" /></Campo>
            <Campo label={acesso.m.app_email ? 'Nova senha (deixe em branco para manter)' : 'Senha (mínimo 8 caracteres)'}>
              <input type="text" className={inputCls} value={acesso.senha} onChange={e => setAcesso({ ...acesso, senha: e.target.value })} aria-label="Senha do monitor" />
            </Campo>
            {erro && <p className="text-sm text-rose-600 font-bold">{erro}</p>}
          </div>
        )}
      </Modal>
      <Modal titulo={edit?.id ? 'Editar monitor' : 'Novo monitor'} aberto={!!edit} onFechar={() => setEdit(null)} tamanho="md"
        rodape={<><Botao variante="secundario" onClick={() => setEdit(null)}>Cancelar</Botao><Botao onClick={salvar}>Salvar</Botao></>}>
        {edit && (
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nome" className="col-span-2"><input className={inputCls} value={edit.nome || ''} onChange={e => setEdit({ ...edit, nome: e.target.value })} aria-label="Nome do monitor" /></Campo>
            <Campo label="Telefone"><input className={inputCls} value={edit.telefone || ''} onChange={e => setEdit({ ...edit, telefone: e.target.value })} /></Campo>
            <Campo label="CPF"><input className={inputCls} value={edit.cpf || ''} onChange={e => setEdit({ ...edit, cpf: e.target.value })} /></Campo>
            <Campo label="Status">
              <select className={inputCls} value={edit.status || 'Ativo'} onChange={e => setEdit({ ...edit, status: e.target.value })}><option>Ativo</option><option>Inativo</option></select>
            </Campo>
            {erro && <p className="col-span-2 text-sm text-rose-600 font-bold">{erro}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
};

const ConfigDocs: React.FC<{ aberto: boolean; onFechar: () => void }> = ({ aberto, onFechar }) => {
  const [c, setC] = useState<Record<string, any> | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => { if (aberto) apiFetch('/api/operacao/config').then(r => r.json()).then(j => setC(j)).catch(() => setErro('Erro ao carregar')); }, [aberto]);
  const salvar = async () => {
    const r = await apiFetch('/api/operacao/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alerta_docs_dias: c!.alerta_docs_dias, bloquear_docs_vencidos: c!.bloquear_docs_vencidos, telefone_alertas: c!.telefone_alertas }) });
    if (r.ok) onFechar(); else setErro(await erroDaResposta(r, 'Erro ao salvar'));
  };
  return (
    <Modal titulo="Configurar documentos" aberto={aberto} onFechar={onFechar} tamanho="md"
      rodape={<><Botao variante="secundario" onClick={onFechar}>Cancelar</Botao><Botao onClick={salvar}>Salvar</Botao></>}>
      {c && (
        <div className="space-y-4">
          <Campo label="Avisar com quantos dias de antecedência">
            <input type="number" min={1} max={120} className={inputCls} value={c.alerta_docs_dias} onChange={e => setC({ ...c, alerta_docs_dias: Number(e.target.value) })} aria-label="Dias de antecedência" />
          </Campo>
          <Campo label="WhatsApp do gestor" dica="Recebe um resumo quando algo chega a 30, 15, 7, 3, 1 ou 0 dias do vencimento (e no dia seguinte ao vencimento).">
            <input className={inputCls} value={c.telefone_alertas || ''} onChange={e => setC({ ...c, telefone_alertas: e.target.value })} placeholder="(61) 99999-9999" />
          </Campo>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={!!c.bloquear_docs_vencidos} onChange={e => setC({ ...c, bloquear_docs_vencidos: e.target.checked })} />
            <span><b>Bloquear a saída</b> quando a van ou o motorista tiver documento obrigatório vencido ou faltando (o app do motorista mostra o motivo).</span>
          </label>
          {erro && <p className="text-sm text-rose-600 font-bold">{erro}</p>}
        </div>
      )}
    </Modal>
  );
};
