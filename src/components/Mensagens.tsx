// Painel: conversas com os responsáveis (WhatsApp + portal), avisos enviados e configuração do WhatsApp
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../services/api';
import { papelAtual } from '../permissoes';
import { Abas, Botao, Campo, Selo, CorSelo, inputCls, erroDaResposta } from './ui';
import { useCopiar } from '../utils/copiar';

interface Conversa { chave: string; responsavel_id: number | null; nome: string | null; alunos: string | null; telefone: string | null; nao_lidas: number; ultima: { texto: string; direcao: string; tipo: string; criado_em: string } | null; }
interface Msg { id: number; direcao: 'entrada' | 'saida'; canal: string; tipo: string; texto: string; criado_em: string; usuario_nome: string | null; envio_status: string | null; envio_erro: string | null; }

const quando = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  return d.toDateString() === hoje.toDateString() ? iso.slice(11, 16) : `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`;
};
const fone = (t?: string | null) => (t ? t.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : '');

export const Mensagens: React.FC = () => {
  const [aba, setAba] = useState<'conversas' | 'avisos' | 'config'>('conversas');
  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      <div className="space-y-1">
        <h2 className="text-3xl font-black tracking-tight">Mensagens</h2>
        <p className="text-slate-500 dark:text-slate-400">Conversas com os pais pelo WhatsApp e pelo portal, com tudo registrado.</p>
      </div>
      <Abas ativa={aba} onTrocar={id => setAba(id as typeof aba)} abas={[
        { id: 'conversas', label: 'Conversas', icone: 'forum' },
        { id: 'avisos', label: 'Avisos automáticos', icone: 'notifications_active' },
        { id: 'config', label: 'WhatsApp', icone: 'settings' },
      ]} />
      {aba === 'conversas' && <Conversas />}
      {aba === 'avisos' && <Avisos />}
      {aba === 'config' && <Config />}
    </div>
  );
};

const Conversas: React.FC = () => {
  const [lista, setLista] = useState<Conversa[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [thread, setThread] = useState<{ contato: any; mensagens: Msg[] } | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState('');
  const fim = useRef<HTMLDivElement>(null);

  const carregarLista = useCallback(async () => {
    const r = await apiFetch('/api/mensagens/conversas');
    if (r.ok) setLista(await r.json());
  }, []);
  const carregarThread = useCallback(async () => {
    if (!sel) return;
    const r = await apiFetch(`/api/mensagens/conversas/${sel}`);
    if (r.ok) setThread(await r.json());
  }, [sel]);

  useEffect(() => { carregarLista(); const t = setInterval(carregarLista, 15000); return () => clearInterval(t); }, [carregarLista]);
  useEffect(() => { setThread(null); carregarThread().then(carregarLista); const t = setInterval(carregarThread, 15000); return () => clearInterval(t); }, [sel]);
  useEffect(() => { fim.current?.scrollIntoView(); }, [thread?.mensagens.length]);

  const enviar = async () => {
    if (!sel || !texto.trim()) return;
    setEnviando(true);
    const r = await apiFetch(`/api/mensagens/conversas/${sel}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) });
    setEnviando(false);
    if (!r.ok) { alert(await erroDaResposta(r, 'Erro ao enviar')); return; }
    setTexto('');
    carregarThread();
    carregarLista();
  };

  const filtradas = lista.filter(c => !busca || `${c.nome || ''} ${c.alunos || ''} ${c.telefone || ''}`.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 h-[calc(100vh-260px)] min-h-[480px]">
      <aside className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800">
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar responsável ou aluno" className={`${inputCls} !h-10`} />
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800">
          {filtradas.length === 0 && <p className="p-6 text-center text-sm text-slate-400">Nenhuma conversa ainda.</p>}
          {filtradas.map(c => (
            <button key={c.chave} onClick={() => setSel(c.chave)} className={`w-full text-left px-4 py-3 ${sel === c.chave ? 'bg-primary/5' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm truncate ${c.nao_lidas ? 'font-black' : 'font-bold'}`}>{c.nome || fone(c.telefone) || 'Desconhecido'}</p>
                <span className="text-[11px] text-slate-400 shrink-0">{quando(c.ultima?.criado_em)}</span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">{c.alunos || (c.responsavel_id ? '' : 'Número não cadastrado')}</p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-500 truncate flex-1">{c.ultima?.direcao === 'saida' ? '↪ ' : ''}{c.ultima?.texto}</p>
                {c.nao_lidas > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-black flex items-center justify-center">{c.nao_lidas}</span>}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {!sel && <p className="m-auto text-slate-400">Escolha uma conversa.</p>}
        {sel && thread && (
          <>
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <p className="font-black">{thread.contato?.nome || fone(thread.contato?.telefone) || 'Contato'}</p>
              <p className="text-xs text-slate-500">
                {fone(thread.contato?.telefone)}{thread.contato?.alunos ? ` · ${thread.contato.alunos}` : ''}
                {thread.contato?.whatsapp_ativo === false && ' · avisos automáticos desligados'}
                {thread.contato?.portal_ultimo_acesso && ` · último acesso ao portal ${quando(thread.contato.portal_ultimo_acesso)}`}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2 bg-slate-50 dark:bg-slate-950/30">
              {thread.mensagens.map(m => {
                const sai = m.direcao === 'saida';
                const auto = m.tipo === 'notificacao' || m.tipo === 'resposta' || m.tipo === 'sistema';
                return (
                  <div key={m.id} className={`flex ${sai ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${sai ? (auto ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300' : 'bg-primary text-white') : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'}`}>
                      {m.texto}
                      <p className={`text-[10px] mt-1 ${sai && !auto ? 'text-white/70' : 'text-slate-400'}`}>
                        {quando(m.criado_em)} · {m.canal}{auto ? ' · automático' : ''}{m.usuario_nome ? ` · ${m.usuario_nome}` : ''}
                        {m.envio_status === 'erro' && <span className="text-rose-500 font-bold" title={m.envio_erro || ''}> · falhou</span>}
                        {m.envio_status === 'pendente' && ' · enviando...'}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={fim} />
            </div>
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
              <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                placeholder="Responder (vai pelo WhatsApp e aparece no portal)" className="flex-1 bg-slate-50 dark:bg-slate-800 border-none rounded-lg p-3 text-sm resize-none" />
              <Botao onClick={enviar} carregando={enviando} icone="send" className="self-end">Enviar</Botao>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

const COR_STATUS: Record<string, CorSelo> = { enviada: 'verde', pendente: 'azul', erro: 'vermelho', cancelada: 'cinza', enviando: 'azul' };
const ROTULO_TIPO: Record<string, string> = {
  a_caminho_busca: 'Van a caminho', chegada_busca: 'Van chegou', embarcou: 'Embarcou', nao_embarcou: 'Não embarcou', chegou_escola: 'Chegou na escola',
  embarcou_volta: 'Embarcou (volta)', nao_embarcou_volta: 'Não embarcou (volta)', a_caminho_casa: 'Chegando em casa', entregue_casa: 'Entregue em casa',
  ausencia_registrada: 'Falta registrada', resposta: 'Resposta', chat: 'Mensagem da empresa',
};

const Avisos: React.FC = () => {
  const [status, setStatus] = useState('');
  const [lista, setLista] = useState<any[]>([]);
  const carregar = useCallback(async () => {
    const r = await apiFetch(`/api/mensagens/notificacoes${status ? `?status=${status}` : ''}`);
    if (r.ok) setLista(await r.json());
  }, [status]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 10000); return () => clearInterval(t); }, [carregar]);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[['', 'Todos'], ['enviada', 'Enviados'], ['pendente', 'Na fila'], ['erro', 'Com erro']].map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k)} className={`h-9 px-4 rounded-lg text-sm font-bold ${status === k ? 'bg-primary text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500'}`}>{l}</button>
        ))}
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {lista.length === 0 && <p className="p-6 text-center text-sm text-slate-400">Nenhum aviso.</p>}
        {lista.map(n => (
          <div key={n.id} className="px-4 py-3 flex flex-wrap items-start gap-3">
            <Selo cor={COR_STATUS[n.status] || 'cinza'}>{n.status}</Selo>
            <div className="flex-1 min-w-60">
              <p className="text-sm font-bold">{ROTULO_TIPO[n.tipo] || n.tipo}{n.alunos.length ? ` · ${n.alunos.join(', ')}` : ''}</p>
              <p className="text-xs text-slate-500">{n.responsavel_nome || fone(n.telefone)} · criado {quando(n.criada_em)}{n.enviada_em ? ` · enviado ${quando(n.enviada_em)}` : ''}{n.tentativas ? ` · ${n.tentativas} tentativa(s)` : ''}</p>
              {n.erro && <p className="text-xs text-rose-500 mt-1">{n.erro}</p>}
              {n.mensagem && <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap line-clamp-2">{n.mensagem}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface ConfigWa {
  provedor: 'log' | 'zapi' | 'webhook'; origem: string; zapi_instance_id: string; webhook_url: string;
  zapi_token_configurado: boolean; zapi_client_token_configurado: boolean; webhook_token_configurado: boolean;
}

/** WhatsApp próprio da empresa (cada empresa usa o seu número). Só o dono altera. */
const ConfigWhatsapp: React.FC<{ onSalvo: () => void }> = ({ onSalvo }) => {
  const dono = papelAtual() === 'dono';
  const [c, setC] = useState<ConfigWa | null>(null);
  const [seg, setSeg] = useState({ zapi_token: '', zapi_client_token: '', webhook_token: '' });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const carregar = () => apiFetch('/api/mensagens/config').then(r => r.json()).then(setC).catch(() => {});
  useEffect(() => { carregar(); }, []);
  const salvar = async () => {
    setMsg(null);
    const r = await apiFetch('/api/mensagens/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provedor: c!.provedor, zapi_instance_id: c!.zapi_instance_id, webhook_url: c!.webhook_url, ...seg }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg({ ok: false, t: j.error || 'Erro ao salvar' });
    setMsg({ ok: true, t: 'Configuração salva.' });
    setSeg({ zapi_token: '', zapi_client_token: '', webhook_token: '' });
    carregar(); onSalvo();
  };
  if (!c) return null;
  const senha = (campo: keyof typeof seg, label: string, configurado: boolean) => (
    <Campo label={label} dica={configurado ? 'Já cadastrado. Deixe em branco para manter.' : undefined}>
      <input type="password" autoComplete="new-password" className={inputCls} disabled={!dono} value={seg[campo]} onChange={e => setSeg({ ...seg, [campo]: e.target.value })} placeholder={configurado ? '••••••••' : ''} aria-label={label} />
    </Campo>
  );
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 xl:col-span-2">
      <h3 className="font-black">WhatsApp da empresa</h3>
      <p className="text-sm text-slate-500">
        Cada empresa envia pelo próprio número.{c.origem === 'env' && ' Hoje está usando a configuração do arquivo .env do servidor; ao salvar aqui, passa a valer a do painel.'}
        {!dono && ' Só o dono pode alterar.'}
      </p>
      <div className="grid md:grid-cols-3 gap-3">
        <Campo label="Provedor">
          <select className={inputCls} disabled={!dono} value={c.provedor} onChange={e => setC({ ...c, provedor: e.target.value as ConfigWa['provedor'] })} aria-label="Provedor de WhatsApp">
            <option value="log">Modo teste (não envia)</option>
            <option value="zapi">Z-API</option>
            <option value="webhook">Webhook (n8n, Evolution API...)</option>
          </select>
        </Campo>
        {c.provedor === 'zapi' && <>
          <Campo label="ID da instância"><input className={inputCls} disabled={!dono} value={c.zapi_instance_id} onChange={e => setC({ ...c, zapi_instance_id: e.target.value })} aria-label="ID da instância" /></Campo>
          {senha('zapi_token', 'Token da instância', c.zapi_token_configurado)}
          {senha('zapi_client_token', 'Client-Token (segurança da conta)', c.zapi_client_token_configurado)}
        </>}
        {c.provedor === 'webhook' && <>
          <Campo label="URL que recebe as mensagens" className="md:col-span-2"><input className={inputCls} disabled={!dono} value={c.webhook_url} onChange={e => setC({ ...c, webhook_url: e.target.value })} placeholder="https://..." aria-label="URL do webhook" /></Campo>
          {senha('webhook_token', 'Token (opcional)', c.webhook_token_configurado)}
        </>}
      </div>
      {dono && <Botao onClick={salvar} icone="save">Salvar WhatsApp</Botao>}
      {msg && <p className={`text-sm font-bold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.t}</p>}
    </div>
  );
};

const Config: React.FC = () => {
  const [st, setSt] = useState<any>(null);
  const { copiado, copiar } = useCopiar();
  const [tel, setTel] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const carregarStatus = () => apiFetch('/api/mensagens/status').then(r => r.json()).then(setSt);
  useEffect(() => { carregarStatus(); }, []);
  const testar = async () => {
    setMsg(null);
    const r = await apiFetch('/api/mensagens/teste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telefone: tel }) });
    const j = await r.json();
    setMsg(r.ok ? { ok: true, t: `Mensagem enviada (${j.provedor}).` } : { ok: false, t: j.error });
  };
  if (!st) return <p className="text-slate-400">Carregando...</p>;
  const nomeProv: Record<string, string> = { zapi: 'Z-API', webhook: 'Webhook (n8n)', log: 'Modo teste (não envia)' };
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <ConfigWhatsapp onSalvo={carregarStatus} />
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <h3 className="font-black">Envio</h3>
        <p className="text-sm">Provedor: <b>{nomeProv[st.provedor] || st.provedor}</b> {st.configurado ? <Selo cor="verde">ok</Selo> : <Selo cor="vermelho">incompleto</Selo>}</p>
        {st.aviso && <p className="text-sm text-amber-700 bg-amber-500/10 rounded-lg p-3">{st.aviso}</p>}
        <p className="text-sm text-slate-500">Últimas 24 h: {st.enviadas_24h} enviados · {st.pendentes} na fila · {st.erros} com erro</p>
        <div className="flex gap-2 items-end">
          <Campo label="Enviar mensagem de teste para" className="flex-1"><input className={inputCls} value={tel} onChange={e => setTel(e.target.value)} placeholder="(61) 99999-0000" /></Campo>
          <Botao onClick={testar} icone="send">Testar</Botao>
        </div>
        {msg && <p className={`text-sm font-bold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.t}</p>}
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <h3 className="font-black">Receber mensagens dos pais</h3>
        {st.webhook_configurado ? (
          <>
            <p className="text-sm text-slate-500">Na Z-API, em <b>Webhooks → Ao receber</b>, cole este endereço (precisa ser HTTPS e acessível pela internet). Ele é exclusivo da sua empresa:</p>
            <div className="flex gap-2">
              <input readOnly className={`${inputCls} font-mono !text-xs`} value={st.webhook_url} onFocus={e => e.target.select()} />
              <Botao variante="secundario" icone={copiado ? 'check' : 'content_copy'} onClick={() => copiar(st.webhook_url)}>{copiado ? 'Copiado!' : 'Copiar'}</Botao>
            </div>
          </>
        ) : (
          <p className="text-sm text-amber-700 bg-amber-500/10 rounded-lg p-3">Defina <code>WHATSAPP_WEBHOOK_SEGREDO</code> no .env (um texto longo e aleatório) para receber mensagens.</p>
        )}
        <p className="text-sm text-slate-500">Com isso os pais podem responder no WhatsApp:</p>
        <ul className="text-sm text-slate-600 dark:text-slate-300 list-disc pl-5 space-y-1">
          <li>"<b>Ana não vai amanhã</b>", "<b>Beto falta hoje só na volta</b>", "não vão dia 15/10" → registra a falta e confirma</li>
          <li>"<b>DESFAZER</b>" → cancela o último aviso de falta</li>
          <li>"<b>cadê a van?</b>" → responde com a previsão de chegada e o link do portal</li>
          <li>Qualquer outra mensagem aparece em Conversas para a empresa responder</li>
        </ul>
      </div>
    </div>
  );
};
