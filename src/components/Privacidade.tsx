// Privacidade (LGPD): termo que os pais aceitam, retenção dos dados, registro de acessos e pedidos dos titulares
import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../services/api';
import { Abas, Botao, Campo, Modal, Selo, inputCls, textareaCls, erroDaResposta } from './ui';

interface Config {
  retencao_meses_inativos: number; retencao_dias_gps: number; retencao_dias_acessos: number;
  termo_versao: number; termo_texto: string; termo_previa: string; responsaveis_total: number; responsaveis_aceitaram: number;
}
interface Acesso {
  id: number; usuario_nome: string | null; papel: string | null; acao: string; aluno_id: number | null; aluno_nome: string | null;
  responsavel_id: number | null; responsavel_nome: string | null; detalhe: string | null; ip: string | null; criado_em: string;
}
interface Pessoa { id: number; nome: string; }

const ACOES: Record<string, string> = {
  login: 'Entrou no sistema', viu_ficha: 'Abriu a ficha do aluno', app_lista_viagem: 'Lista da viagem no app (com dados de saúde)',
  exportou_dados: 'Exportou dados do responsável', anonimizou_aluno: 'Anonimizou aluno', anonimizou_responsavel: 'Anonimizou responsável',
};
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

export const Privacidade: React.FC = () => {
  const [aba, setAba] = useState<'politica' | 'acessos' | 'titulares'>('politica');
  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      <div className="space-y-1">
        <h2 className="text-3xl font-black tracking-tight">Privacidade (LGPD)</h2>
        <p className="text-slate-500 dark:text-slate-400">Dados de crianças pedem cuidado redobrado: consentimento dos pais, registro de quem acessa, prazo para guardar e atendimento aos pedidos dos responsáveis.</p>
      </div>
      <Abas ativa={aba} onTrocar={v => setAba(v as typeof aba)} abas={[
        { id: 'politica', label: 'Termo e retenção', icone: 'policy' },
        { id: 'acessos', label: 'Registro de acessos', icone: 'manage_search' },
        { id: 'titulares', label: 'Pedidos dos responsáveis', icone: 'person_search' },
      ]} />
      {aba === 'politica' && <Politica />}
      {aba === 'acessos' && <Acessos />}
      {aba === 'titulares' && <Titulares />}
    </div>
  );
};

const Politica: React.FC = () => {
  const [c, setC] = useState<Config | null>(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [resultado, setResultado] = useState<string>('');
  const [termoAberto, setTermoAberto] = useState(false);
  const carregar = () => apiFetch('/api/lgpd/config').then(async r => (r.ok ? setC(await r.json()) : setErro(await erroDaResposta(r, 'Erro ao carregar')))).catch(() => setErro('Sem conexão com o servidor.'));
  useEffect(() => { carregar(); }, []);

  const salvar = async (corpo: Record<string, unknown>, msg: string) => {
    setErro(''); setOk('');
    const r = await apiFetch('/api/lgpd/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    if (!r.ok) return setErro(await erroDaResposta(r, 'Erro ao salvar'));
    setOk(msg); carregar();
  };
  const novaVersao = () => {
    if (!window.confirm('Publicar uma nova versão do termo? Todos os responsáveis vão precisar aceitar de novo ao abrir o portal.')) return;
    salvar({ nova_versao_termo: true }, 'Nova versão publicada.');
  };
  const aplicar = async () => {
    if (!window.confirm('Aplicar a retenção agora? Alunos inativos além do prazo (e sem mensalidade em aberto) serão anonimizados e o GPS antigo apagado. Não dá para desfazer.')) return;
    const r = await apiFetch('/api/lgpd/retencao/executar', { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErro(j.error || 'Erro ao aplicar');
    setResultado(`${j.alunos} aluno(s) e ${j.responsaveis} responsável(is) anonimizados · ${j.posicoes} posição(ões) de GPS apagadas · ${j.acessos} registro(s) de acesso antigos removidos.`);
  };
  if (!c) return erro ? <p className="text-rose-600 font-bold">{erro}</p> : <p className="text-slate-400">Carregando...</p>;
  const pct = c.responsaveis_total ? Math.round((c.responsaveis_aceitaram / c.responsaveis_total) * 100) : 0;
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-black">Termo de privacidade dos pais</p>
            <p className="text-sm text-slate-500">Aparece no portal antes de tudo. O aceite fica guardado (data, IP e versão).</p>
          </div>
          <Selo cor="azul">Versão {c.termo_versao}</Selo>
        </div>
        <div>
          <p className="text-3xl font-black">{c.responsaveis_aceitaram}<span className="text-base text-slate-400 font-bold"> de {c.responsaveis_total} responsáveis</span></p>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 mt-2"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
          <p className="text-xs text-slate-500 mt-1">aceitaram a versão atual. Quem ainda não aceitou vê o termo na próxima vez que abrir o portal.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" icone="edit_note" onClick={() => setTermoAberto(true)}>Ver / editar o texto</Botao>
          <Botao variante="secundario" icone="published_with_changes" onClick={novaVersao}>Publicar nova versão</Botao>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div>
          <p className="font-black">Por quanto tempo guardar</p>
          <p className="text-sm text-slate-500">Roda sozinho todo dia de madrugada. Mensalidades e contratos assinados ficam guardados (obrigação legal), sem os dados da criança.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Campo label="Aluno inativo (meses)" dica="Depois disso é anonimizado.">
            <input type="number" min={6} max={120} className={inputCls} value={c.retencao_meses_inativos} onChange={e => setC({ ...c, retencao_meses_inativos: Number(e.target.value) })} aria-label="Meses de retenção" />
          </Campo>
          <Campo label="GPS das viagens (dias)">
            <input type="number" min={30} max={1825} className={inputCls} value={c.retencao_dias_gps} onChange={e => setC({ ...c, retencao_dias_gps: Number(e.target.value) })} aria-label="Dias de GPS" />
          </Campo>
          <Campo label="Registro de acessos (dias)">
            <input type="number" min={180} max={3650} className={inputCls} value={c.retencao_dias_acessos} onChange={e => setC({ ...c, retencao_dias_acessos: Number(e.target.value) })} aria-label="Dias do registro de acessos" />
          </Campo>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao onClick={() => salvar({ retencao_meses_inativos: c.retencao_meses_inativos, retencao_dias_gps: c.retencao_dias_gps, retencao_dias_acessos: c.retencao_dias_acessos }, 'Prazos salvos.')}>Salvar prazos</Botao>
          <Botao variante="secundario" icone="cleaning_services" onClick={aplicar}>Aplicar agora</Botao>
        </div>
        {resultado && <p className="text-sm font-bold text-emerald-600">{resultado}</p>}
      </section>
      {(erro || ok) && <p className={`lg:col-span-2 font-bold ${erro ? 'text-rose-600' : 'text-emerald-600'}`}>{erro || ok}</p>}

      <TermoModal aberto={termoAberto} onFechar={() => setTermoAberto(false)} c={c} onSalvo={() => { setTermoAberto(false); carregar(); }} />
    </div>
  );
};

const TermoModal: React.FC<{ aberto: boolean; onFechar: () => void; c: Config; onSalvo: () => void }> = ({ aberto, onFechar, c, onSalvo }) => {
  const [texto, setTexto] = useState(c.termo_texto);
  const [novaVersao, setNovaVersao] = useState(true);
  const [erro, setErro] = useState('');
  useEffect(() => { if (aberto) { setTexto(c.termo_texto); setErro(''); setNovaVersao(true); } }, [aberto, c.termo_texto]);
  const salvar = async () => {
    const r = await apiFetch('/api/lgpd/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ termo_texto: texto, nova_versao_termo: novaVersao }) });
    if (!r.ok) return setErro(await erroDaResposta(r, 'Erro ao salvar'));
    onSalvo();
  };
  return (
    <Modal titulo="Termo de privacidade" aberto={aberto} onFechar={onFechar} tamanho="xl"
      rodape={<><Botao variante="secundario" onClick={onFechar}>Fechar</Botao><Botao onClick={salvar}>Salvar texto</Botao></>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Use {'{{empresa}}'}, {'{{retencao_meses}}'} e {'{{retencao_gps}}'} para preencher com os dados da empresa e os prazos.</p>
        <textarea className={`${textareaCls} min-h-[320px] font-mono text-xs`} value={texto} onChange={e => setTexto(e.target.value)} aria-label="Texto do termo" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={novaVersao} onChange={e => setNovaVersao(e.target.checked)} />Publicar como nova versão (os pais aceitam de novo)</label>
        <details className="text-sm"><summary className="cursor-pointer font-bold">Como os pais veem hoje</summary><pre className="whitespace-pre-wrap text-xs mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">{c.termo_previa}</pre></details>
        {erro && <p className="text-sm text-rose-600 font-bold">{erro}</p>}
      </div>
    </Modal>
  );
};

const Acessos: React.FC = () => {
  const [lista, setLista] = useState<Acesso[]>([]);
  const [acao, setAcao] = useState('');
  const [erro, setErro] = useState('');
  useEffect(() => {
    apiFetch(`/api/lgpd/acessos${acao ? `?acao=${acao}` : ''}`).then(async r => (r.ok ? setLista(await r.json()) : setErro(await erroDaResposta(r, 'Erro ao carregar')))).catch(() => setErro('Sem conexão com o servidor.'));
  }, [acao]);
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <p className="font-black text-sm flex-1">Quem acessou dados pessoais (últimos 300 registros)</p>
        <select className={`${inputCls} h-9 py-1 w-auto`} value={acao} onChange={e => setAcao(e.target.value)} aria-label="Filtrar ação">
          <option value="">Todas as ações</option>
          {Object.entries(ACOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {erro && <p className="px-4 py-3 text-rose-600 font-bold">{erro}</p>}
      {lista.length === 0 && !erro && <p className="px-4 py-6 text-center text-slate-400">Nenhum registro.</p>}
      {lista.map(a => (
        <div key={a.id} className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-sm flex flex-wrap gap-x-3">
          <span className="text-slate-400 w-32 shrink-0">{quando(a.criado_em)}</span>
          <span className="font-bold">{a.usuario_nome || '—'}</span>
          <span className="text-slate-500">{ACOES[a.acao] || a.acao}</span>
          {(a.aluno_nome || a.responsavel_nome || a.detalhe) && <span className="text-slate-700 dark:text-slate-300">· {a.aluno_nome || a.responsavel_nome || a.detalhe}</span>}
          {a.ip && <span className="text-xs text-slate-400 ml-auto">IP {a.ip}</span>}
        </div>
      ))}
    </section>
  );
};

const Titulares: React.FC = () => {
  const [resps, setResps] = useState<Pessoa[]>([]);
  const [alunos, setAlunos] = useState<Pessoa[]>([]);
  const [resp, setResp] = useState('');
  const [aluno, setAluno] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const carregar = () => {
    apiFetch('/api/responsaveis').then(r => r.json()).then(setResps).catch(() => {});
    apiFetch('/api/alunos').then(r => r.json()).then(setAlunos).catch(() => {});
  };
  useEffect(() => { carregar(); }, []);
  const nomeResp = useMemo(() => resps.find(r => String(r.id) === resp)?.nome || '', [resps, resp]);

  const exportar = async () => {
    setMsg(null);
    const r = await apiFetch(`/api/lgpd/responsaveis/${resp}/exportar`);
    if (!r.ok) return setMsg({ ok: false, t: await erroDaResposta(r, 'Erro ao exportar') });
    const blob = new Blob([JSON.stringify(await r.json(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dados-${nomeResp.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg({ ok: true, t: 'Arquivo gerado. Envie ao responsável por um canal seguro.' });
  };
  const anonimizar = async (tipo: 'responsaveis' | 'alunos', id: string, nome: string) => {
    if (!window.confirm(`Anonimizar ${nome}? Nome, endereço, telefone, dados de saúde e conversas são apagados para sempre. Não dá para desfazer.`)) return;
    setMsg(null);
    const r = await apiFetch(`/api/lgpd/${tipo}/${id}/anonimizar`, { method: 'POST' });
    if (!r.ok) return setMsg({ ok: false, t: await erroDaResposta(r, 'Erro ao anonimizar') });
    setMsg({ ok: true, t: `${nome} anonimizado.` });
    setResp(''); setAluno(''); carregar();
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <p className="font-black">Responsável pediu os dados ou a exclusão</p>
        <p className="text-sm text-slate-500">Exportar gera um arquivo com tudo o que a empresa guarda (cadastro, filhos, saúde, contatos, mensalidades, contratos, faltas, conversas e aceites). Anonimizar exige que não haja mensalidade em aberto e também anonimiza os filhos.</p>
        <Campo label="Responsável">
          <select className={inputCls} value={resp} onChange={e => setResp(e.target.value)} aria-label="Responsável">
            <option value="">Escolha...</option>
            {resps.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </Campo>
        <div className="flex flex-wrap gap-2">
          <Botao icone="download" disabled={!resp} onClick={exportar}>Exportar dados</Botao>
          <Botao variante="perigo" icone="person_off" disabled={!resp} onClick={() => anonimizar('responsaveis', resp, nomeResp)}>Anonimizar</Botao>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <p className="font-black">Aluno que saiu do serviço</p>
        <p className="text-sm text-slate-500">Para antecipar a anonimização de um aluno (normalmente é automática depois do prazo de retenção).</p>
        <Campo label="Aluno">
          <select className={inputCls} value={aluno} onChange={e => setAluno(e.target.value)} aria-label="Aluno">
            <option value="">Escolha...</option>
            {alunos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </Campo>
        <Botao variante="perigo" icone="person_off" disabled={!aluno} onClick={() => anonimizar('alunos', aluno, alunos.find(a => String(a.id) === aluno)?.nome || '')}>Anonimizar aluno</Botao>
      </section>
      {msg && <p className={`lg:col-span-2 font-bold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.t}</p>}
    </div>
  );
};
