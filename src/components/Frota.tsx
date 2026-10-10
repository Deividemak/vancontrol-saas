// Frota: lista com situação real e alertas, cadastro completo, ficha da van e manutenção preventiva
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../services/api';
import { Modal, Abas, Botao, Campo, Selo, inputCls, textareaCls, erroDaResposta, type CorSelo } from './ui';

type Alerta = { nome: string; situacao: string; dias?: number | null; faltam_km?: number | null; faltam_dias?: number | null };
interface Van {
  id: number; placa: string; modelo: string; ano: number; cor?: string | null; lugares?: number | null; capacidade?: string;
  acessivel: boolean; status: string; km_atual?: number | null; renavam?: string | null; chassi?: string | null;
  motorista_id?: number | null; escola_id?: number | null; rastreador_id?: string | null; custo_fixo_mensal?: number | null; tem_foto: boolean;
  motorista_nome?: string | null; escola_nome?: string | null;
  situacao: string; motivo: string; rotas: { id: number; nome: string; saida: string; alunos: number; motorista_nome?: string }[];
  lotacao: { alunos: number; lugares: number; pct: number } | null;
  alertas: { documentos: Alerta[]; manutencao: Alerta[]; pendentes: number };
}
interface Plano { id: number; nome: string; intervalo_km?: number | null; intervalo_meses?: number | null; ultimo_km?: number | null; ultima_data?: string | null; proximo_km?: number | null; faltam_km?: number | null; proxima_data?: string | null; faltam_dias?: number | null; situacao: string }
interface Consumo { litros: number; gasto: number; km: number; km_por_litro: number | null; custo_km: number | null }
interface Ficha {
  veiculo: Van; documentos: any[]; planos: Plano[];
  manutencoes: { id: number; tipo: string; servico: string; status: string; custo: number; origem?: string; km_execucao?: number | null; data_agendada?: string | null; data_conclusao?: string | null; observacao?: string | null }[];
  abastecimentos: { id: number; litros: number; custo_total: number; valor_unitario: number; km_atual: number; tipo_combustivel: string; data: string }[];
  desempenho: { atual: Consumo; anterior: Consumo; variacao_consumo_pct: number | null; variacao_custo_km_pct: number | null };
  custos_mes: { combustivel: number; manutencao: number; fixo: number; total: number };
  viagens: { id: number; data: string; status: string; rota_nome: string; motorista_nome?: string; inicio?: string; fim?: string }[];
  checklists: { id: number; data: string; resolvido: boolean; observacoes?: string; motorista_nome?: string; problemas: string[] }[];
}

const SITUACOES: Record<string, { label: string; cor: CorSelo; icone: string }> = {
  em_viagem: { label: 'Em viagem', cor: 'azul', icone: 'route' },
  disponivel: { label: 'Disponível', cor: 'verde', icone: 'check_circle' },
  manutencao: { label: 'Manutenção', cor: 'amarelo', icone: 'build' },
  bloqueada: { label: 'Bloqueada', cor: 'vermelho', icone: 'block' },
  sem_motorista: { label: 'Sem motorista', cor: 'roxo', icone: 'person_off' },
  inativa: { label: 'Inativa', cor: 'cinza', icone: 'pause_circle' },
};
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const num = (v?: number | null) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR'));
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const totalAlertas = (v: Van) => v.alertas.documentos.length + v.alertas.manutencao.length + v.alertas.pendentes;

async function enviar(url: string, method: string, body?: any): Promise<string | null> {
  const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return res.ok ? null : erroDaResposta(res, 'Não foi possível salvar.');
}

/** Reduz a foto para no máximo 800px (JPEG) antes de enviar. */
function lerFoto(arquivo: File): Promise<string> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => {
      const esc = Math.min(1, 800 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', 0.8));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => falha(new Error('Imagem inválida'));
    img.src = URL.createObjectURL(arquivo);
  });
}

const Erro: React.FC<{ msg: string | null }> = ({ msg }) =>
  msg ? <p role="alert" className="text-sm font-bold text-rose-600 bg-rose-500/10 rounded-lg px-3 py-2">{msg}</p> : null;

const Vazio: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-sm text-slate-400 py-6 text-center">{children}</p>;

// ---------- Formulário da van ----------
const VAZIO = { placa: '', modelo: '', ano: String(new Date().getFullYear()), lugares: '', cor: '', acessivel: false, renavam: '', chassi: '', status: 'Disponível', motorista_id: '', escola_id: '', rota_id: '', rastreador_id: '', custo_fixo_mensal: '' };

const FormVan: React.FC<{ van: Van | null; aberto: boolean; onFechar: () => void; onSalvo: () => void }> = ({ van, aberto, onFechar, onSalvo }) => {
  const [f, setF] = useState<any>(VAZIO);
  const [foto, setFoto] = useState<string | null>(null);
  const [removerFoto, setRemoverFoto] = useState(false);
  const [listas, setListas] = useState<{ motoristas: any[]; escolas: any[]; rotas: any[] }>({ motoristas: [], escolas: [], rotas: [] });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErro(null); setFoto(null); setRemoverFoto(false);
    setF(van ? {
      placa: van.placa, modelo: van.modelo, ano: String(van.ano || ''), lugares: van.lugares ? String(van.lugares) : '', cor: van.cor || '', acessivel: van.acessivel,
      renavam: van.renavam || '', chassi: van.chassi || '', status: van.status === 'Em Rota' || !van.status ? 'Disponível' : van.status,
      motorista_id: van.motorista_id ? String(van.motorista_id) : '', escola_id: van.escola_id ? String(van.escola_id) : '', rota_id: '',
      rastreador_id: van.rastreador_id || '', custo_fixo_mensal: van.custo_fixo_mensal ? String(van.custo_fixo_mensal) : '',
    } : VAZIO);
    Promise.all(['/api/motoristas', '/api/escolas', '/api/rotas'].map(u => apiFetch(u).then(r => (r.ok ? r.json() : [])).catch(() => [])))
      .then(([motoristas, escolas, rotas]) => setListas({ motoristas, escolas, rotas }));
  }, [aberto, van]);

  const campo = (k: string) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }) });

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true); setErro(null);
    const msg = await enviar(van ? `/api/frota/${van.id}` : '/api/frota', van ? 'PUT' : 'POST', {
      ...f, custo_fixo_mensal: Number(f.custo_fixo_mensal) || 0, foto: foto || undefined, remover_foto: removerFoto || undefined,
    });
    setSalvando(false);
    if (msg) return setErro(msg);
    onSalvo(); onFechar();
  };

  return (
    <Modal titulo={van ? `Editar van ${van.placa}` : 'Nova van'} aberto={aberto} onFechar={onFechar}
      rodape={<><Botao variante="secundario" type="button" onClick={onFechar}>Cancelar</Botao><Botao type="submit" form="form-van" carregando={salvando}>Salvar</Botao></>}>
      <form id="form-van" onSubmit={salvar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2"><Erro msg={erro} /></div>
        <Campo label="Placa" dica="ABC-1234 ou ABC1D23"><input required className={inputCls} {...campo('placa')} placeholder="ABC1D23" aria-label="Placa" /></Campo>
        <Campo label="Modelo"><input required className={inputCls} {...campo('modelo')} placeholder="Ex: Mercedes Sprinter" aria-label="Modelo" /></Campo>
        <Campo label="Ano"><input type="number" className={inputCls} {...campo('ano')} aria-label="Ano" /></Campo>
        <Campo label="Lugares (alunos)"><input type="number" min={1} className={inputCls} {...campo('lugares')} placeholder="Ex: 20" aria-label="Lugares" /></Campo>
        <Campo label="Cor"><input className={inputCls} {...campo('cor')} placeholder="Ex: Branca" aria-label="Cor" /></Campo>
        <Campo label="Situação">
          <select className={inputCls} {...campo('status')} aria-label="Situação">
            <option value="Disponível">Em uso</option><option value="Manutenção">Na oficina</option><option value="Inativa">Inativa (fora de uso)</option>
          </select>
        </Campo>
        <Campo label="RENAVAM" dica="11 números (opcional)"><input inputMode="numeric" className={inputCls} {...campo('renavam')} aria-label="RENAVAM" /></Campo>
        <Campo label="Chassi" dica="17 caracteres (opcional)"><input className={inputCls} {...campo('chassi')} aria-label="Chassi" /></Campo>
        <Campo label="Motorista responsável">
          <select className={inputCls} {...campo('motorista_id')} aria-label="Motorista"><option value="">Nenhum fixo</option>{listas.motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>
        </Campo>
        <Campo label="Escola atendida">
          <select className={inputCls} {...campo('escola_id')} aria-label="Escola"><option value="">—</option>{listas.escolas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
        </Campo>
        <Campo label="Vincular a uma rota">
          <select className={inputCls} {...campo('rota_id')} aria-label="Rota"><option value="">Manter as rotas atuais</option>{listas.rotas.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}</select>
        </Campo>
        <Campo label="Custo fixo por mês (R$)" dica="Seguro, IPVA, parcela… dividido por mês"><input type="number" min={0} step="0.01" className={inputCls} {...campo('custo_fixo_mensal')} aria-label="Custo fixo" /></Campo>
        <Campo label="Rastreador (IMEI / ID)" dica="Só se a van tiver rastreador GPS/OBD"><input className={inputCls} {...campo('rastreador_id')} aria-label="ID do rastreador" /></Campo>
        <Campo label="Foto da van">
          <input type="file" accept="image/*" className="text-sm" aria-label="Foto"
            onChange={async e => { const a = e.target.files?.[0]; if (a) { try { setFoto(await lerFoto(a)); setRemoverFoto(false); } catch { setErro('Não consegui ler essa imagem.'); } } }} />
          {foto && <img src={foto} alt="Prévia" className="mt-2 h-20 rounded-lg object-cover" />}
          {van?.tem_foto && !foto && (
            <label className="flex items-center gap-2 text-xs mt-2"><input type="checkbox" checked={removerFoto} onChange={e => setRemoverFoto(e.target.checked)} />Remover a foto atual</label>
          )}
        </Campo>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={f.acessivel} onChange={e => setF({ ...f, acessivel: e.target.checked })} />
          <span className="material-symbols-outlined text-[18px]">accessible</span>Van acessível (cadeirante / necessidades especiais)
        </label>
      </form>
    </Modal>
  );
};

// ---------- Ficha da van ----------
const ABAS = [
  { id: 'resumo', label: 'Resumo', icone: 'dashboard' },
  { id: 'manutencao', label: 'Manutenção', icone: 'build' },
  { id: 'abastecimentos', label: 'Abastecimentos', icone: 'local_gas_station' },
  { id: 'documentos', label: 'Documentos', icone: 'description' },
  { id: 'custos', label: 'Custos', icone: 'payments' },
  { id: 'viagens', label: 'Viagens', icone: 'history' },
  { id: 'checklists', label: 'Checklists', icone: 'fact_check' },
];
const corPlano: Record<string, CorSelo> = { vencido: 'vermelho', proximo: 'amarelo', ok: 'verde', sem_registro: 'cinza' };
const nomePlano: Record<string, string> = { vencido: 'Vencida', proximo: 'Em breve', ok: 'Em dia', sem_registro: 'Sem registro' };

const Indicador: React.FC<{ label: string; valor: React.ReactNode; dica?: React.ReactNode }> = ({ label, valor, dica }) => (
  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    <p className="text-xl font-black mt-1">{valor}</p>
    {dica && <p className="text-xs text-slate-500 mt-0.5">{dica}</p>}
  </div>
);

const Variacao: React.FC<{ pct: number | null; melhorSeSobe: boolean }> = ({ pct, melhorSeSobe }) => {
  if (pct === null) return <>sem mês anterior para comparar</>;
  const bom = melhorSeSobe ? pct >= 0 : pct <= 0;
  return <span className={bom ? 'text-emerald-600' : 'text-rose-600'}>{pct > 0 ? '+' : ''}{pct}% vs mês anterior</span>;
};

const FichaVan: React.FC<{ id: number | null; versao: number; onFechar: () => void; onEditar: (v: Van) => void; onMudou: () => void }> = ({ id, versao, onFechar, onEditar, onMudou }) => {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [aba, setAba] = useState('resumo');
  const [foto, setFoto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<any>(null); // formulário aberto dentro da aba
  const [confirmar, setConfirmar] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    const r = await apiFetch(`/api/frota/${id}/ficha`);
    if (r.ok) setFicha(await r.json()); else setErro(await erroDaResposta(r, 'Não foi possível abrir a ficha.'));
  }, [id]);

  useEffect(() => {
    setFicha(null); setFoto(null); setErro(null); setForm(null); setConfirmar(false); setAba('resumo');
    if (!id) return;
    carregar();
    apiFetch(`/api/frota/${id}/foto`).then(r => (r.ok ? r.json() : null)).then(j => setFoto(j?.foto || null)).catch(() => {});
  }, [id, carregar]);
  useEffect(() => {
    if (!id || !versao) return;
    carregar();
    apiFetch(`/api/frota/${id}/foto`).then(r => (r.ok ? r.json() : null)).then(j => setFoto(j?.foto || null)).catch(() => {});
  }, [versao]); // eslint-disable-line react-hooks/exhaustive-deps

  const acao = async (url: string, method: string, body?: any) => {
    setErro(null);
    const msg = await enviar(url, method, body);
    if (msg) { setErro(msg); return false; }
    setForm(null); await carregar(); onMudou();
    return true;
  };
  const excluir = async () => { if (await acao(`/api/frota/${id}`, 'DELETE')) onFechar(); else setConfirmar(false); };

  const v = ficha?.veiculo;
  const s = v ? SITUACOES[v.situacao] || SITUACOES.disponivel : null;
  const input = (k: string, props: any = {}) => <input className={inputCls} value={form?.[k] ?? ''} onChange={e => setForm({ ...form, [k]: e.target.value })} {...props} />;

  return (
    <Modal titulo={v ? `${v.placa} · ${v.modelo}` : 'Ficha da van'} aberto={!!id} onFechar={onFechar} tamanho="2xl"
      rodape={v && (
        confirmar
          ? <><span className="text-sm font-bold mr-auto self-center">Excluir esta van de vez?</span><Botao variante="secundario" onClick={() => setConfirmar(false)}>Não</Botao><Botao variante="perigo" icone="delete" onClick={excluir}>Sim, excluir</Botao></>
          : <><Botao variante="perigo" icone="delete" className="mr-auto" onClick={() => setConfirmar(true)}>Excluir</Botao><Botao variante="secundario" icone="edit" onClick={() => onEditar(v)}>Editar dados</Botao></>
      )}>
      {!ficha ? (erro ? <Erro msg={erro} /> : <Vazio>Carregando…</Vazio>) : (
        <div className="space-y-4">
          <Abas abas={ABAS.map(a => ({ ...a, alerta: (a.id === 'manutencao' && (v!.alertas.manutencao.length > 0 || v!.alertas.pendentes > 0)) || (a.id === 'documentos' && v!.alertas.documentos.length > 0) }))}
            ativa={aba} onTrocar={a => { setAba(a); setForm(null); setErro(null); }} />
          <Erro msg={erro} />

          {aba === 'resumo' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-3">
                {foto ? <img src={foto} alt={`Foto da van ${v!.placa}`} className="w-full h-44 object-cover rounded-xl" />
                  : <div className="w-full h-44 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><span className="material-symbols-outlined text-6xl text-slate-300">airport_shuttle</span></div>}
                <div className="flex flex-wrap gap-2"><Selo cor={s!.cor} icone={s!.icone}>{s!.label}</Selo>{v!.acessivel && <Selo cor="azul" icone="accessible">Acessível</Selo>}</div>
                <p className="text-sm text-slate-500">{v!.motivo}</p>
                <dl className="text-sm grid grid-cols-2 gap-y-1">
                  <dt className="text-slate-400">Ano</dt><dd className="font-bold">{v!.ano}</dd>
                  <dt className="text-slate-400">Cor</dt><dd className="font-bold">{v!.cor || '—'}</dd>
                  <dt className="text-slate-400">RENAVAM</dt><dd className="font-bold">{v!.renavam || '—'}</dd>
                  <dt className="text-slate-400">Chassi</dt><dd className="font-bold break-all">{v!.chassi || '—'}</dd>
                  <dt className="text-slate-400">Motorista</dt><dd className="font-bold">{v!.motorista_nome || '—'}</dd>
                  <dt className="text-slate-400">Escola</dt><dd className="font-bold">{v!.escola_nome || '—'}</dd>
                </dl>
              </div>
              <div className="lg:col-span-2 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Indicador label="Km atual" valor={num(v!.km_atual)} dica="atualiza com os abastecimentos" />
                  <Indicador label="Lotação" valor={v!.lotacao ? `${v!.lotacao.alunos}/${v!.lotacao.lugares}` : '—'} dica={v!.lotacao ? `${v!.lotacao.pct}% na maior rota` : 'informe os lugares'} />
                  <Indicador label="Consumo" valor={ficha.desempenho.atual.km_por_litro ? `${ficha.desempenho.atual.km_por_litro} km/l` : '—'} dica={<Variacao pct={ficha.desempenho.variacao_consumo_pct} melhorSeSobe />} />
                  <Indicador label="Custo no mês" valor={brl(ficha.custos_mes.total)} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Rotas desta van</p>
                  {v!.rotas.length ? v!.rotas.map(r => (
                    <div key={r.id} className="flex justify-between text-sm py-1.5 border-b border-slate-100 dark:border-slate-800">
                      <span className="font-bold">{r.saida} · {r.nome}</span><span className="text-slate-500">{r.alunos} aluno(s){r.motorista_nome ? ` · ${r.motorista_nome}` : ''}</span>
                    </div>
                  )) : <p className="text-sm text-slate-400">Nenhuma rota ativa.</p>}
                </div>
                {totalAlertas(v!) > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Atenção</p>
                    {v!.alertas.documentos.map(d => <p key={d.nome} className="text-sm"><Selo cor={d.situacao === 'vencendo' ? 'amarelo' : 'vermelho'}>{d.situacao}</Selo> {d.nome}</p>)}
                    {v!.alertas.manutencao.map(m => <p key={m.nome} className="text-sm"><Selo cor={corPlano[m.situacao]}>{nomePlano[m.situacao]}</Selo> {m.nome}</p>)}
                    {v!.alertas.pendentes > 0 && <p className="text-sm"><Selo cor="amarelo">Pendente</Selo> {v!.alertas.pendentes} manutenção(ões) para fazer</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {aba === 'manutencao' && (
            <div className="space-y-6">
              <section>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h4 className="font-black flex-1">Manutenção preventiva</h4>
                  <Botao variante="secundario" icone="auto_awesome" onClick={() => acao('/api/frota/planos/padrao', 'POST', { veiculo_id: v!.id })}>Usar planos sugeridos</Botao>
                  <Botao variante="secundario" icone="add" onClick={() => setForm({ tipo: 'plano', nome: '', intervalo_km: '', intervalo_meses: '', ultimo_km: v!.km_atual ?? '', ultima_data: hoje() })}>Novo plano</Botao>
                </div>
                {form?.tipo === 'plano' && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl mb-3">
                    <Campo label="Serviço" className="col-span-2">{input('nome', { placeholder: 'Ex: Troca de óleo', 'aria-label': 'Serviço do plano' })}</Campo>
                    <Campo label="A cada km">{input('intervalo_km', { type: 'number' })}</Campo>
                    <Campo label="A cada meses">{input('intervalo_meses', { type: 'number' })}</Campo>
                    <Campo label="Feito por último (km)">{input('ultimo_km', { type: 'number' })}</Campo>
                    <Campo label="Feito por último (data)">{input('ultima_data', { type: 'date' })}</Campo>
                    <div className="flex gap-2 col-span-2 sm:col-span-4 justify-end">
                      <Botao variante="secundario" onClick={() => setForm(null)}>Cancelar</Botao>
                      <Botao onClick={() => form.id ? acao(`/api/frota/planos/${form.id}`, 'PUT', form) : acao('/api/frota/planos', 'POST', { ...form, veiculo_id: v!.id })}>Salvar plano</Botao>
                    </div>
                  </div>
                )}
                {ficha.planos.length ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ficha.planos.map(p => (
                      <div key={p.id} className="py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Selo cor={corPlano[p.situacao]}>{nomePlano[p.situacao]}</Selo>
                          <span className="font-bold flex-1">{p.nome}</span>
                          <span className="text-xs text-slate-500">
                            {[p.intervalo_km && `a cada ${num(p.intervalo_km)} km`, p.intervalo_meses && `${p.intervalo_meses} meses`].filter(Boolean).join(' ou ')}
                            {p.proximo_km ? ` · próxima aos ${num(p.proximo_km)} km` : ''}{p.proxima_data ? ` · até ${dataBR(p.proxima_data)}` : ''}
                          </span>
                          <Botao variante="fantasma" icone="task_alt" onClick={() => setForm({ tipo: 'feito', id: p.id, nome: p.nome, km: v!.km_atual ?? '', data: hoje(), custo: '' })}>Feito</Botao>
                          <Botao variante="fantasma" icone="edit" aria-label="Editar plano" onClick={() => setForm({ tipo: 'plano', ...p, intervalo_km: p.intervalo_km ?? '', intervalo_meses: p.intervalo_meses ?? '', ultimo_km: p.ultimo_km ?? '', ultima_data: p.ultima_data ?? '' })} />
                          <Botao variante="fantasma" icone="delete" aria-label="Remover plano" onClick={() => acao(`/api/frota/planos/${p.id}`, 'DELETE')} />
                        </div>
                        {form?.tipo === 'feito' && form.id === p.id && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl mt-2">
                            <Campo label="Km no serviço">{input('km', { type: 'number' })}</Campo>
                            <Campo label="Data">{input('data', { type: 'date' })}</Campo>
                            <Campo label="Custo (R$)">{input('custo', { type: 'number', step: '0.01' })}</Campo>
                            <div className="flex gap-2 justify-end"><Botao variante="secundario" onClick={() => setForm(null)}>Cancelar</Botao><Botao onClick={() => acao(`/api/frota/planos/${p.id}/feito`, 'POST', form)}>Registrar</Botao></div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <Vazio>Nenhum plano ainda. Clique em “Usar planos sugeridos” para começar com óleo, pneus, freios, revisão e vistoria.</Vazio>}
              </section>

              <section>
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="font-black flex-1">Serviços e consertos</h4>
                  <Botao variante="secundario" icone="add" onClick={() => setForm({ tipo: 'manut', servico: '', tipoM: 'Corretiva', custo: '', data_agendada: hoje() })}>Agendar serviço</Botao>
                </div>
                {form?.tipo === 'manut' && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl mb-3">
                    <Campo label="Serviço" className="col-span-2">{input('servico', { placeholder: 'Ex: Trocar lâmpada do farol', 'aria-label': 'Serviço' })}</Campo>
                    <Campo label="Tipo"><select className={inputCls} value={form.tipoM} onChange={e => setForm({ ...form, tipoM: e.target.value })}><option>Corretiva</option><option>Preventiva</option></select></Campo>
                    <Campo label="Data">{input('data_agendada', { type: 'date' })}</Campo>
                    <Campo label="Custo previsto">{input('custo', { type: 'number', step: '0.01' })}</Campo>
                    <div className="flex gap-2 col-span-2 sm:col-span-5 justify-end">
                      <Botao variante="secundario" onClick={() => setForm(null)}>Cancelar</Botao>
                      <Botao onClick={() => acao('/api/manutencoes', 'POST', { veiculo_id: v!.id, servico: form.servico, tipo: form.tipoM, custo: form.custo, data_agendada: form.data_agendada })}>Salvar</Botao>
                    </div>
                  </div>
                )}
                {ficha.manutencoes.length ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ficha.manutencoes.map(m => (
                      <div key={m.id} className="py-2.5">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Selo cor={m.status === 'Concluída' ? 'verde' : m.status === 'Cancelada' ? 'cinza' : m.status === 'Em Andamento' ? 'azul' : 'amarelo'}>{m.status}</Selo>
                          <span className="font-bold flex-1">{m.servico}{m.origem === 'checklist' && <span className="text-xs text-slate-400 font-normal"> (do checklist)</span>}</span>
                          <span className="text-slate-500">{dataBR(m.data_conclusao || m.data_agendada)} · {brl(m.custo)}{m.km_execucao ? ` · ${num(m.km_execucao)} km` : ''}</span>
                          {(m.status === 'Pendente' || m.status === 'Em Andamento') && <>
                            {m.status === 'Pendente' && <Botao variante="fantasma" icone="garage" onClick={() => acao(`/api/manutencoes/${m.id}/status`, 'PUT', { status: 'Em Andamento' })}>Na oficina</Botao>}
                            <Botao variante="fantasma" icone="task_alt" onClick={() => setForm({ tipo: 'concluir', id: m.id, custo: m.custo || '', km: v!.km_atual ?? '', data: hoje() })}>Concluir</Botao>
                            <Botao variante="fantasma" icone="close" aria-label="Cancelar serviço" onClick={() => acao(`/api/manutencoes/${m.id}/status`, 'PUT', { status: 'Cancelada' })} />
                          </>}
                        </div>
                        {m.observacao && <p className="text-xs text-slate-500 mt-1">{m.observacao}</p>}
                        {form?.tipo === 'concluir' && form.id === m.id && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl mt-2">
                            <Campo label="Custo final (R$)">{input('custo', { type: 'number', step: '0.01' })}</Campo>
                            <Campo label="Km">{input('km', { type: 'number' })}</Campo>
                            <Campo label="Data">{input('data', { type: 'date' })}</Campo>
                            <div className="flex gap-2 justify-end"><Botao variante="secundario" onClick={() => setForm(null)}>Voltar</Botao><Botao onClick={() => acao(`/api/manutencoes/${m.id}/status`, 'PUT', { status: 'Concluída', custo: form.custo, km: form.km, data: form.data })}>Concluir</Botao></div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <Vazio>Nenhum serviço registrado.</Vazio>}
              </section>
            </div>
          )}

          {aba === 'abastecimentos' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Indicador label="Consumo no mês" valor={ficha.desempenho.atual.km_por_litro ? `${ficha.desempenho.atual.km_por_litro} km/l` : '—'} dica={<Variacao pct={ficha.desempenho.variacao_consumo_pct} melhorSeSobe />} />
                <Indicador label="Custo por km" valor={ficha.desempenho.atual.custo_km ? brl(ficha.desempenho.atual.custo_km) : '—'} dica={<Variacao pct={ficha.desempenho.variacao_custo_km_pct} melhorSeSobe={false} />} />
                <Indicador label="Gasto no mês" valor={brl(ficha.desempenho.atual.gasto)} dica={`${num(ficha.desempenho.atual.litros)} litros`} />
                <Indicador label="Km rodados" valor={num(ficha.desempenho.atual.km)} dica="entre abastecimentos do mês" />
              </div>
              <div className="flex justify-end"><Botao variante="secundario" icone="add" onClick={() => setForm({ tipo: 'abast', litros: '', custo_total: '', km_atual: '', data_abastecimento: hoje(), tipo_combustivel: 'Diesel' })}>Registrar abastecimento</Botao></div>
              {form?.tipo === 'abast' && (
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
                  <Campo label="Data">{input('data_abastecimento', { type: 'date' })}</Campo>
                  <Campo label="Litros">{input('litros', { type: 'number', step: '0.01', 'aria-label': 'Litros' })}</Campo>
                  <Campo label="Valor total (R$)">{input('custo_total', { type: 'number', step: '0.01', 'aria-label': 'Valor total' })}</Campo>
                  <Campo label="Km no painel">{input('km_atual', { type: 'number', 'aria-label': 'Km no painel' })}</Campo>
                  <Campo label="Combustível"><select className={inputCls} value={form.tipo_combustivel} onChange={e => setForm({ ...form, tipo_combustivel: e.target.value })}><option>Diesel</option><option>Diesel S10</option><option>Gasolina</option><option>Etanol</option><option>GNV</option></select></Campo>
                  <div className="flex gap-2 justify-end">
                    <Botao variante="secundario" onClick={() => setForm(null)}>Cancelar</Botao>
                    <Botao onClick={() => {
                      const l = Number(form.litros), t = Number(form.custo_total);
                      if (!(l > 0) || !(t > 0) || !(Number(form.km_atual) > 0)) return setErro('Preencha litros, valor e km.');
                      acao('/api/abastecimentos', 'POST', { veiculo_id: v!.id, litros: l, custo_total: t, valor_unitario: Math.round((t / l) * 1000) / 1000, km_atual: Number(form.km_atual), tipo_combustivel: form.tipo_combustivel, data_abastecimento: form.data_abastecimento });
                    }}>Salvar</Botao>
                  </div>
                </div>
              )}
              {ficha.abastecimentos.length ? (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[10px] uppercase tracking-widest text-slate-400"><th className="py-2">Data</th><th>Litros</th><th>R$/l</th><th>Total</th><th>Km</th><th /></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ficha.abastecimentos.map(a => (
                      <tr key={a.id}><td className="py-2">{dataBR(a.data)}</td><td>{num(a.litros)}</td><td>{a.valor_unitario ? a.valor_unitario.toFixed(2) : '—'}</td><td>{brl(a.custo_total)}</td><td>{num(a.km_atual)}</td>
                        <td className="text-right"><Botao variante="fantasma" icone="delete" aria-label="Excluir abastecimento" onClick={() => acao(`/api/abastecimentos/${a.id}`, 'DELETE')} /></td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <Vazio>Nenhum abastecimento. Registre com o km do painel para calcular o consumo.</Vazio>}
            </div>
          )}

          {aba === 'documentos' && (
            ficha.documentos.length ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {ficha.documentos.map((d: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 py-2.5 text-sm">
                    <Selo cor={d.situacao === 'ok' ? 'verde' : d.situacao === 'vencendo' || d.situacao === 'sem_validade' ? 'amarelo' : d.situacao === 'opcional' ? 'cinza' : 'vermelho'}>{d.situacao}</Selo>
                    <span className="font-bold flex-1">{d.nome}{d.obrigatorio ? '' : <span className="text-xs text-slate-400 font-normal"> (opcional)</span>}</span>
                    <span className="text-slate-500">{d.validade ? `vale até ${dataBR(d.validade)}` : 'sem validade cadastrada'}</span>
                  </div>
                ))}
                <p className="text-xs text-slate-400 pt-3">Para enviar ou atualizar um documento, use a tela Documentos.</p>
              </div>
            ) : <Vazio>Nenhum tipo de documento de veículo configurado. Configure na tela Documentos.</Vazio>
          )}

          {aba === 'custos' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Indicador label="Combustível" valor={brl(ficha.custos_mes.combustivel)} />
                <Indicador label="Manutenção" valor={brl(ficha.custos_mes.manutencao)} />
                <Indicador label="Custo fixo" valor={brl(ficha.custos_mes.fixo)} dica="seguro, IPVA, parcela" />
                <Indicador label="Total no mês" valor={brl(ficha.custos_mes.total)} />
              </div>
              {v!.lotacao && v!.lotacao.alunos > 0 && <p className="text-sm text-slate-500">Custo por aluno nesta van no mês: <b>{brl(ficha.custos_mes.total / v!.lotacao.alunos)}</b> (considerando a maior rota).</p>}
            </div>
          )}

          {aba === 'viagens' && (
            ficha.viagens.length ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {ficha.viagens.map(x => (
                  <div key={x.id} className="flex flex-wrap gap-2 py-2.5 text-sm">
                    <span className="font-bold w-24">{dataBR(x.data)}</span><span className="flex-1">{x.rota_nome}{x.motorista_nome ? ` · ${x.motorista_nome}` : ''}</span>
                    <span className="text-slate-500">{x.inicio || '—'} → {x.fim || '—'}</span>
                    <Selo cor={x.status === 'concluida' ? 'verde' : x.status === 'em_andamento' ? 'azul' : 'cinza'}>{x.status.replace('_', ' ')}</Selo>
                  </div>
                ))}
                <p className="text-xs text-slate-400 pt-3">O trajeto completo (replay) fica na tela Viagens.</p>
              </div>
            ) : <Vazio>Nenhuma viagem feita com esta van.</Vazio>
          )}

          {aba === 'checklists' && (
            ficha.checklists.length ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {ficha.checklists.map(c => (
                  <div key={c.id} className="py-2.5 text-sm">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="font-bold w-36">{dataBR(c.data)} {c.data.slice(11, 16)}</span><span className="flex-1">{c.motorista_nome || '—'}</span>
                      {c.problemas.length ? <Selo cor={c.resolvido ? 'verde' : 'vermelho'}>{c.resolvido ? 'Resolvido' : `Problema: ${c.problemas.join(', ')}`}</Selo> : <Selo cor="verde">Tudo ok</Selo>}
                    </div>
                    {c.observacoes && <p className="text-xs text-slate-500 mt-1">{c.observacoes}</p>}
                  </div>
                ))}
                <p className="text-xs text-slate-400 pt-3">Problema marcado no checklist vira automaticamente um serviço pendente na aba Manutenção.</p>
              </div>
            ) : <Vazio>Nenhum checklist feito ainda.</Vazio>
          )}
        </div>
      )}
    </Modal>
  );
};

// ---------- Tela ----------
export const Frota: React.FC = () => {
  const [vans, setVans] = useState<Van[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [soAlertas, setSoAlertas] = useState(false);
  const [form, setForm] = useState<{ aberto: boolean; van: Van | null }>({ aberto: false, van: null });
  const [fichaId, setFichaId] = useState<number | null>(null);
  const [rastreador, setRastreador] = useState<{ url: string } | null>(null);
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    const r = await apiFetch('/api/frota/painel').catch(() => null);
    if (r?.ok) { setVans(await r.json()); setErro(null); } else setErro(r ? await erroDaResposta(r, 'Erro ao carregar a frota.') : 'Sem conexão com o servidor.');
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const verRastreador = () => apiFetch('/api/frota/rastreador').then(r => r.json()).then(setRastreador).catch(() => {});

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    vans.forEach(v => { c[v.situacao] = (c[v.situacao] || 0) + 1; });
    return c;
  }, [vans]);

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return vans.filter(v =>
      (filtro === 'todas' || v.situacao === filtro) &&
      (!soAlertas || totalAlertas(v) > 0) &&
      (!b || [v.placa, v.modelo, v.motorista_nome, v.escola_nome, ...v.rotas.map(r => r.nome)].some(x => x?.toLowerCase().includes(b))));
  }, [vans, busca, filtro, soAlertas]);

  const comAlerta = vans.filter(v => totalAlertas(v) > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-3xl font-black tracking-tight">Gestão de Frota</h2>
          <p className="text-slate-500">Situação de cada van, manutenção, consumo e custos.</p>
        </div>
        <div className="flex gap-2">
          <Botao variante="secundario" icone="satellite_alt" onClick={verRastreador}>Rastreador</Botao>
          <Botao icone="add" onClick={() => setForm({ aberto: true, van: null })}>Nova van</Botao>
        </div>
      </div>

      {rastreador && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 text-sm">
          <div className="flex items-center"><p className="font-black flex-1">Rastreador veicular (GPS/OBD)</p><button onClick={() => setRastreador(null)} className="text-slate-400" aria-label="Fechar rastreador"><span className="material-symbols-outlined">close</span></button></div>
          <p className="text-slate-500">Se a van tiver rastreador, cadastre o IMEI/ID dele no veículo e configure o rastreador (ou a plataforma dele, como o Traccar) para enviar as posições para o endereço abaixo. As posições entram no mapa ao vivo e no replay junto com o celular do motorista.</p>
          <div className="flex gap-2">
            <input readOnly className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-lg h-10 px-3 font-mono text-xs" value={rastreador.url} onFocus={e => e.target.select()} aria-label="Endereço do rastreador" />
            <Botao variante="secundario" onClick={() => navigator.clipboard?.writeText(rastreador.url)}>Copiar</Botao>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
          <input className={`${inputCls} pl-10`} placeholder="Buscar placa, modelo, motorista, rota…" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar van" />
        </div>
        <button onClick={() => setSoAlertas(!soAlertas)} className={`h-11 px-4 rounded-lg text-sm font-bold flex items-center gap-1 ${soAlertas ? 'bg-amber-500 text-white' : 'bg-amber-500/10 text-amber-600'}`}>
          <span className="material-symbols-outlined text-[18px]">warning</span>Com alertas ({comAlerta})
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {[['todas', `Todas (${vans.length})`], ...Object.entries(SITUACOES).filter(([k]) => contagem[k]).map(([k, s]) => [k, `${s.label} (${contagem[k]})`])].map(([k, label]) => (
          <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${filtro === k ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{label}</button>
        ))}
      </div>

      <Erro msg={erro} />
      {carregando ? <Vazio>Carregando…</Vazio> : !vans.length ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center space-y-3">
          <span className="material-symbols-outlined text-5xl text-slate-300">airport_shuttle</span>
          <p className="font-bold">Nenhuma van cadastrada</p>
          <Botao icone="add" onClick={() => setForm({ aberto: true, van: null })}>Cadastrar a primeira van</Botao>
        </div>
      ) : !lista.length ? <Vazio>Nenhuma van encontrada com esses filtros.</Vazio> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {lista.map(v => {
            const s = SITUACOES[v.situacao] || SITUACOES.disponivel;
            const n = totalAlertas(v);
            return (
              <button key={v.id} onClick={() => setFichaId(v.id)} className="text-left bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all" aria-label={`Abrir ficha da van ${v.placa}`}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-lg font-black">{v.placa}</p>
                    <p className="text-sm text-slate-500">{v.modelo} · {v.ano}{v.cor ? ` · ${v.cor}` : ''}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Selo cor={s.cor} icone={s.icone}>{s.label}</Selo>
                    {v.acessivel && <Selo cor="azul" icone="accessible">Acessível</Selo>}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2 truncate" title={v.motivo}>{v.motivo}</p>
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div><p className="text-[10px] uppercase font-black text-slate-400">Motorista</p><p className="text-xs font-bold truncate">{v.motorista_nome || '—'}</p></div>
                  <div><p className="text-[10px] uppercase font-black text-slate-400">Lotação</p><p className={`text-xs font-bold ${v.lotacao && v.lotacao.pct > 100 ? 'text-rose-600' : ''}`}>{v.lotacao ? `${v.lotacao.alunos}/${v.lotacao.lugares}` : '—'}</p></div>
                  <div><p className="text-[10px] uppercase font-black text-slate-400">Km</p><p className="text-xs font-bold">{num(v.km_atual)}</p></div>
                </div>
                {n > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1">
                    {v.alertas.documentos.length > 0 && <Selo cor="vermelho" icone="description">{v.alertas.documentos.length} documento(s)</Selo>}
                    {v.alertas.manutencao.some(m => m.situacao === 'vencido') ? <Selo cor="vermelho" icone="build">Manutenção vencida</Selo>
                      : v.alertas.manutencao.length > 0 && <Selo cor="amarelo" icone="build">Manutenção em breve</Selo>}
                    {v.alertas.pendentes > 0 && <Selo cor="amarelo" icone="pending_actions">{v.alertas.pendentes} serviço(s) pendente(s)</Selo>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <FichaVan id={fichaId} versao={versao} onFechar={() => setFichaId(null)} onEditar={van => setForm({ aberto: true, van })} onMudou={carregar} />
      <FormVan van={form.van} aberto={form.aberto} onFechar={() => setForm({ aberto: false, van: null })} onSalvo={() => { carregar(); setVersao(x => x + 1); }} />
    </div>
  );
};
