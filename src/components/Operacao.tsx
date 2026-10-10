// Painel: operação do dia — viagens ao vivo, presença, ocorrências, emergências e ausências.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../services/api';
import { Abas, Botao, Campo, Modal, Selo, CorSelo, inputCls, erroDaResposta } from './ui';
import { Mapa, MarcadorMapa } from './mapa/Mapa';
import { ViagemDetalhe, ROTULO_STATUS, TIPOS_OCORRENCIA, StatusPresenca } from '../motorista/tipos';
import { FrotaAoVivo } from './operacao/FrotaAoVivo';
import { Historico } from './operacao/Historico';
import { AlertasOperacao } from './operacao/AlertasOperacao';
import { SubstituirModal, ListaSubstituicoes, RotaParaTrocar } from './operacao/Substituicao';

interface LinhaDia {
  rota_id: number; rota_nome: string; tipo: 'ida' | 'volta'; periodo: string; hora_saida: string | null; hora_fim: string | null;
  placa: string | null; motorista_nome: string | null; motorista_telefone: string | null; total_alunos: number;
  monitor_nome?: string | null; substituicao?: { id: number; motorista: boolean; veiculo: boolean; monitor: boolean } | null;
  tem_aula: boolean; situacao: 'nao_iniciada' | 'em_andamento' | 'concluida'; atrasada: boolean;
  viagem_id: number | null; iniciada: string | null; concluida: string | null;
  resumo: Record<string, number> | null; ultima_posicao: { lat: number; lng: number; em: string } | null;
  ocorrencias_abertas: number; emergencias: number;
}
interface Dia { data: string; hoje: boolean; calendario: { sem_aula_todas: boolean; motivo: string | null }; viagens: LinhaDia[]; }
interface Ausencia { id: number; aluno_id: number; aluno_nome: string; escola_nome: string | null; sentido: string; motivo: string | null; origem: string; data_inicio: string; data_fim: string; }

const hojeLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const br = (d: string) => d.split('-').reverse().join('/');
const hhmm = (iso?: string | null) => (iso ? iso.slice(11, 16) : '');
const minutosDesde = (iso?: string | null) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : null);

const SITUACAO: Record<string, { label: string; cor: CorSelo }> = {
  nao_iniciada: { label: 'Não iniciada', cor: 'cinza' },
  em_andamento: { label: 'Em andamento', cor: 'azul' },
  concluida: { label: 'Concluída', cor: 'verde' },
};
const COR_PRESENCA: Record<StatusPresenca, CorSelo> = { previsto: 'cinza', ausente_avisado: 'amarelo', embarcou: 'azul', desembarcou: 'verde', nao_compareceu: 'vermelho' };
const ROTULO_EVENTO: Record<string, string> = {
  inicio: 'Viagem iniciada', chegada_parada: 'Chegou na parada', embarque: 'Embarcou', desembarque: 'Desembarcou',
  nao_compareceu: 'Não compareceu', desfazer: 'Correção (desfeito)', ocorrencia: 'Ocorrência', emergencia: 'EMERGÊNCIA',
  varredura: 'Varredura do veículo confirmada', fim: 'Viagem encerrada',
};

export const Operacao: React.FC = () => {
  const [aba, setAba] = useState<'aovivo' | 'mapa' | 'alertas' | 'historico' | 'substituicoes' | 'ausencias' | 'ocorrencias'>('aovivo');
  const [trocar, setTrocar] = useState<RotaParaTrocar | null>(null);
  const [aviso, setAviso] = useState('');
  const [replay, setReplay] = useState<{ viagem: number; data: string } | null>(null);
  const [nAlertas, setNAlertas] = useState(0);
  useEffect(() => {
    const ver = () => apiFetch('/api/operacao/alertas').then(r => r.ok && r.json()).then(j => j && setNAlertas(j.anomalias_abertas || 0)).catch(() => {});
    ver();
    const t = setInterval(ver, 20000);
    return () => clearInterval(t);
  }, []);
  const abrirRota = (rotaId: number) => { setAba('aovivo'); setData(hojeLocal()); setSel(rotaId); };
  const [data, setData] = useState(hojeLocal());
  const [dia, setDia] = useState<Dia | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [det, setDet] = useState<ViagemDetalhe | null>(null);

  const carregarDia = useCallback(async () => {
    const res = await apiFetch(`/api/operacao/dia?data=${data}`);
    if (res.ok) setDia(await res.json());
  }, [data]);

  const carregarDet = useCallback(async () => {
    const linha = dia?.viagens.find(v => v.rota_id === sel);
    if (!linha?.viagem_id) { setDet(null); return; }
    const res = await apiFetch(`/api/operacao/viagens/${linha.viagem_id}`);
    if (res.ok) setDet(await res.json());
  }, [dia, sel]);

  useEffect(() => { carregarDia(); }, [carregarDia]);
  useEffect(() => { carregarDet(); }, [sel, dia?.viagens.find(v => v.rota_id === sel)?.viagem_id]);
  // atualização automática no dia de hoje
  useEffect(() => {
    if (!dia?.hoje) return;
    const t = setInterval(() => { carregarDia(); }, 15000);
    return () => clearInterval(t);
  }, [dia?.hoje, carregarDia]);
  useEffect(() => {
    if (!dia?.hoje || !det || det.viagem.status !== 'em_andamento') return;
    const t = setInterval(carregarDet, 15000);
    return () => clearInterval(t);
  }, [dia?.hoje, det?.viagem.id, det?.viagem.status, carregarDet]);

  const linhas = dia?.viagens || [];
  const marcadoresFrota = useMemo<MarcadorMapa[]>(() => linhas.filter(l => l.situacao === 'em_andamento' && l.ultima_posicao).map(l => ({
    id: l.rota_id, lat: l.ultima_posicao!.lat, lng: l.ultima_posicao!.lng, tipo: 'partida' as const,
    titulo: `${l.rota_nome}\n${l.placa || ''} · ${l.motorista_nome || ''}\nAtualizado às ${hhmm(l.ultima_posicao!.em)}`,
    destaque: l.rota_id === sel,
  })), [linhas, sel]);

  const totais = linhas.reduce((t, l) => ({
    andamento: t.andamento + (l.situacao === 'em_andamento' ? 1 : 0),
    concluidas: t.concluidas + (l.situacao === 'concluida' ? 1 : 0),
    atrasadas: t.atrasadas + (l.atrasada ? 1 : 0),
    bordo: t.bordo + (l.resumo?.embarcou || 0),
  }), { andamento: 0, concluidas: 0, atrasadas: 0, bordo: 0 });

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight">Operação do dia</h2>
          <p className="text-slate-500 dark:text-slate-400">Acompanhe as vans ao vivo, quem embarcou e desceu, ocorrências e ausências avisadas.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={data} onChange={e => { setData(e.target.value); setSel(null); }} className={`${inputCls} !h-10 w-44`} />
          {data !== hojeLocal() && <Botao variante="secundario" onClick={() => setData(hojeLocal())}>Hoje</Botao>}
        </div>
      </div>

      <Abas ativa={aba} onTrocar={id => setAba(id as typeof aba)} abas={[
        { id: 'aovivo', label: 'Viagens', icone: 'radar' },
        { id: 'mapa', label: 'Mapa da frota', icone: 'map' },
        { id: 'alertas', label: `Alertas${nAlertas ? ` (${nAlertas})` : ''}`, icone: 'notification_important', alerta: nAlertas > 0 },
        { id: 'historico', label: 'Histórico', icone: 'history' },
        { id: 'substituicoes', label: 'Substituições', icone: 'sync_alt' },
        { id: 'ausencias', label: 'Ausências avisadas', icone: 'event_busy' },
        { id: 'ocorrencias', label: 'Ocorrências', icone: 'report' },
      ]} />
      {aviso && <p className="text-sm text-emerald-600 font-bold">{aviso}</p>}

      {aba === 'ausencias' && <Ausencias data={data} onMudou={carregarDia} />}
      {aba === 'ocorrencias' && <Ocorrencias />}
      {aba === 'mapa' && <FrotaAoVivo onAbrirRota={abrirRota} />}
      {aba === 'alertas' && <AlertasOperacao onAbrirRota={abrirRota} onReplay={(v, d) => { setReplay({ viagem: v, data: d }); setAba('historico'); }} />}
      {aba === 'historico' && <Historico key={replay ? `${replay.viagem}` : 'h'} dataInicial={replay?.data || data} viagemInicial={replay?.viagem ?? null} />}
      {aba === 'substituicoes' && <ListaSubstituicoes rotas={linhas} data={data} onMudou={carregarDia} />}
      <SubstituirModal rota={trocar} data={data} onFechar={() => setTrocar(null)} onFeito={m => { setTrocar(null); setAviso(m); carregarDia(); }} />

      {aba === 'aovivo' && (
        <>
          {dia?.calendario.sem_aula_todas && <p className="p-3 rounded-xl bg-blue-500/10 text-blue-800 dark:text-blue-200 text-sm font-bold">Sem aula neste dia ({dia.calendario.motivo}).</p>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[['Em andamento', totais.andamento, 'directions_bus'], ['Concluídas', totais.concluidas, 'task_alt'], ['Atrasadas', totais.atrasadas, 'schedule'], ['Alunos a bordo agora', totais.bordo, 'groups']].map(([l, v, i]) => (
              <div key={l as string} className={`rounded-xl p-4 border ${l === 'Atrasadas' && totais.atrasadas ? 'border-amber-300 bg-amber-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">{i}</span>{l}</p>
                <p className="text-2xl font-black">{v}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
            <aside className="space-y-2">
              {linhas.length === 0 && <p className="text-sm text-slate-400 p-6 text-center">Nenhuma rota ativa.</p>}
              {linhas.map(l => {
                const s = SITUACAO[l.situacao];
                const r = l.resumo;
                const pct = r && r.total ? Math.round(((r.desembarcou || 0) + (r.nao_compareceu || 0) + (r.ausente_avisado || 0)) / r.total * 100) : 0;
                const semSinal = l.situacao === 'em_andamento' && (minutosDesde(l.ultima_posicao?.em) ?? 99) > 5;
                return (
                  <button key={l.rota_id} onClick={() => setSel(l.rota_id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${sel === l.rota_id ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}
                      ${l.emergencias ? '!border-rose-500 !bg-rose-500/10' : ''} ${!l.tem_aula && l.situacao === 'nao_iniciada' ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-black text-sm">{l.rota_nome}</p>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {l.emergencias > 0 && <Selo cor="vermelho" icone="sos">Emergência</Selo>}
                        {l.atrasada && <Selo cor="amarelo" icone="schedule">Atrasada</Selo>}
                        {!l.tem_aula && <Selo>Sem aula</Selo>}
                        <Selo cor={s.cor}>{s.label}</Selo>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{l.hora_saida || '--:--'}{l.hora_fim ? `–${l.hora_fim}` : ''} · {l.placa || 'sem veículo'} · {l.motorista_nome || 'sem motorista'}{l.monitor_nome ? ` · ${l.monitor_nome}` : ''}</p>
                    {l.substituicao && <p className="text-[11px] font-bold text-indigo-600 mt-1 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">sync_alt</span>Substituição hoje{l.substituicao.motorista ? ' · motorista' : ''}{l.substituicao.veiculo ? ' · van' : ''}{l.substituicao.monitor ? ' · monitor' : ''}</p>}
                    {r && (
                      <>
                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mt-2 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {r.embarcou || 0} a bordo · {r.desembarcou || 0} entregues · {r.previsto || 0} aguardando · {(r.nao_compareceu || 0) + (r.ausente_avisado || 0)} faltas
                          {l.ocorrencias_abertas > l.emergencias ? ` · ${l.ocorrencias_abertas - l.emergencias} ocorrência(s)` : ''}
                        </p>
                      </>
                    )}
                    {semSinal && <p className="text-[11px] font-bold text-amber-600 mt-1">Sem posição há {minutosDesde(l.ultima_posicao?.em) ?? '?'} min</p>}
                  </button>
                );
              })}
            </aside>

            <section className="min-w-0 space-y-4">
              {!sel && (
                <Mapa className="h-[480px]" marcadores={marcadoresFrota} chaveEnquadramento={`frota-${marcadoresFrota.length}`} onClicarMarcador={id => setSel(Number(id))} />
              )}
              {sel && !det && (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-slate-400">
                  Esta rota ainda não foi iniciada neste dia.
                  <div className="mt-3 flex flex-wrap gap-2 justify-center">
                    {data >= hojeLocal() && <Botao icone="sync_alt" onClick={() => { const l = linhas.find(x => x.rota_id === sel); if (l) setTrocar(l); }}>Trocar motorista ou van</Botao>}
                    <Botao variante="secundario" onClick={() => setSel(null)}>Ver mapa da frota</Botao>
                  </div>
                </div>
              )}
              {sel && det && <DetalheViagem det={det} onFechar={() => setSel(null)} onMudou={() => { carregarDet(); carregarDia(); }} />}
            </section>
          </div>
        </>
      )}
    </div>
  );
};

const DetalheViagem: React.FC<{ det: ViagemDetalhe; onFechar: () => void; onMudou: () => void }> = ({ det, onFechar, onMudou }) => {
  const [foto, setFoto] = useState<string | null>(null);
  const v = det.viagem;
  const marcadores = useMemo<MarcadorMapa[]>(() => {
    const ms: MarcadorMapa[] = det.paradas.filter(p => p.lat !== null && p.tipo !== 'partida').map((p, i) => ({
      id: `p${p.seq}`, lat: p.lat!, lng: p.lng!, tipo: p.tipo === 'escola' ? 'escola' : 'embarque',
      rotulo: p.tipo === 'escola' ? undefined : String(i + 1), titulo: `${p.nome}\nPrevisto ${p.chegada || '--:--'}`,
      apagado: det.paradas_com_chegada.includes(p.seq),
    }));
    if (v.ultima_posicao) ms.push({ id: 'van', lat: v.ultima_posicao.lat, lng: v.ultima_posicao.lng, tipo: 'partida', destaque: true, titulo: `Van · ${hhmm(v.ultima_posicao.em)}` });
    for (const o of det.ocorrencias.filter(o => o.lat != null)) ms.push({ id: `o${o.id}`, lat: o.lat!, lng: o.lng!, tipo: 'pin', titulo: `${TIPOS_OCORRENCIA[o.tipo] || o.tipo}: ${o.descricao || ''}` });
    return ms;
  }, [det]);

  const verFoto = async (id: number) => {
    const res = await apiFetch(`/api/operacao/ocorrencias/${id}/foto`);
    if (res.ok) setFoto((await res.json()).foto);
  };
  const resolver = async (id: number) => {
    const resolucao = prompt('Como foi resolvido?');
    if (resolucao === null) return;
    await apiFetch(`/api/operacao/ocorrencias/${id}/resolver`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolucao }) });
    onMudou();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-black">{v.rota_nome}</h3>
          <p className="text-sm text-slate-500">
            {v.motorista_nome || 'sem motorista'}{v.motorista_telefone ? ` · ${v.motorista_telefone}` : ''} · {v.placa || 'sem veículo'} · iniciada {hhmm(v.iniciada_em)}{v.concluida_em ? ` · encerrada ${hhmm(v.concluida_em)}` : ''}
          </p>
        </div>
        <Botao variante="secundario" icone="map" onClick={onFechar}>Mapa da frota</Botao>
      </div>

      {det.ocorrencias.filter(o => o.status === 'aberta').map(o => (
        <div key={o.id} className={`flex flex-wrap items-center gap-3 p-3 rounded-xl ${o.tipo === 'emergencia' ? 'bg-rose-600 text-white' : 'bg-amber-500/10 text-amber-900 dark:text-amber-100'}`}>
          <span className="material-symbols-outlined">{o.tipo === 'emergencia' ? 'sos' : 'report'}</span>
          <p className="flex-1 text-sm"><b>{TIPOS_OCORRENCIA[o.tipo] || o.tipo}</b> às {hhmm(o.registrado_em)}{o.aluno_nome ? ` · ${o.aluno_nome}` : ''}{o.descricao ? ` — ${o.descricao}` : ''}</p>
          {o.tem_foto && <Botao variante="secundario" icone="image" onClick={() => verFoto(o.id)}>Foto</Botao>}
          <Botao variante="secundario" icone="check" onClick={() => resolver(o.id)}>Resolver</Botao>
        </div>
      ))}

      <Mapa className="h-[360px]" marcadores={marcadores} linha={det.trilha && det.trilha.length > 1 ? det.trilha : det.geometria}
        chaveEnquadramento={`v${v.id}`} />
      <p className="text-[11px] text-slate-400 -mt-2">
        {det.trilha && det.trilha.length > 1 ? 'Linha azul: caminho real percorrido (GPS do celular).' : 'Linha azul: trajeto planejado (ainda sem posições de GPS).'}
        {v.ultima_posicao && ` Última posição às ${hhmm(v.ultima_posicao.em)}.`}
      </p>

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <p className="px-4 py-3 font-black border-b border-slate-100 dark:border-slate-800">Presença</p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {det.presencas.map(p => (
                <tr key={p.aluno_id}>
                  <td className="px-4 py-2 font-medium">{p.nome}<span className="block text-[11px] text-slate-400">{p.escola_nome}</span></td>
                  <td className="px-2 py-2"><Selo cor={COR_PRESENCA[p.status]}>{ROTULO_STATUS[p.status]}</Selo></td>
                  <td className="px-4 py-2 text-right text-xs text-slate-500 whitespace-nowrap">{p.embarque_hora ? `▲ ${p.embarque_hora}` : ''} {p.desembarque_hora ? `▼ ${p.desembarque_hora}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <p className="px-4 py-3 font-black border-b border-slate-100 dark:border-slate-800">Linha do tempo (auditoria)</p>
          <ol className="p-4 space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar">
            {(det.eventos || []).map(e => {
              const atraso = Math.round((new Date(e.recebido_em).getTime() - new Date(e.registrado_em).getTime()) / 60000);
              return (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="font-mono text-xs text-slate-400 w-12 shrink-0 pt-0.5">{hhmm(e.registrado_em)}</span>
                  <span className={`flex-1 ${e.tipo === 'emergencia' ? 'text-rose-600 font-black' : ''}`}>
                    {ROTULO_EVENTO[e.tipo] || e.tipo}{e.aluno_nome ? `: ${e.aluno_nome}` : ''}
                    {e.lat !== null && <a className="ml-1 text-primary text-xs" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${e.lat},${e.lng}`}>local</a>}
                    {atraso > 2 && <span className="ml-1 text-[11px] text-amber-600">(enviado {atraso} min depois — sem sinal)</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {det.ocorrencias.some(o => o.status !== 'aberta') && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <p className="font-black">Ocorrências resolvidas</p>
          {det.ocorrencias.filter(o => o.status !== 'aberta').map(o => (
            <p key={o.id} className="text-sm text-slate-500">{hhmm(o.registrado_em)} · {TIPOS_OCORRENCIA[o.tipo] || o.tipo}{o.descricao ? ` — ${o.descricao}` : ''}{o.resolucao ? ` · Resolução: ${o.resolucao}` : ''}
              {o.tem_foto && <button className="ml-2 text-primary font-bold" onClick={() => verFoto(o.id)}>foto</button>}</p>
          ))}
        </div>
      )}

      <Modal aberto={!!foto} onFechar={() => setFoto(null)} titulo="Foto da ocorrência" tamanho="lg">
        {foto && <img src={foto} alt="Foto da ocorrência" className="w-full rounded-xl" />}
      </Modal>
    </div>
  );
};

const Ausencias: React.FC<{ data: string; onMudou: () => void }> = ({ data, onMudou }) => {
  const [lista, setLista] = useState<Ausencia[]>([]);
  const [alunos, setAlunos] = useState<{ id: number; nome: string; status: string }[]>([]);
  const [form, setForm] = useState({ aluno_id: '', data_inicio: data, data_fim: data, sentido: 'ambos', motivo: '' });
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const res = await apiFetch(`/api/operacao/ausencias?de=${data}`);
    if (res.ok) setLista(await res.json());
  }, [data]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { apiFetch('/api/alunos').then(r => r.json()).then(setAlunos); }, []);

  const salvar = async () => {
    setErro('');
    const res = await apiFetch('/api/operacao/ausencias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (!res.ok) { setErro(await erroDaResposta(res, 'Erro ao salvar')); return; }
    setAberto(false);
    carregar();
    onMudou();
  };
  const excluir = async (id: number) => {
    if (!confirm('Remover esta ausência?')) return;
    await apiFetch(`/api/operacao/ausencias/${id}`, { method: 'DELETE' });
    carregar();
    onMudou();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Alunos que não vão em {br(data)}. Eles saem automaticamente da lista do motorista.</p>
        <Botao icone="event_busy" onClick={() => { setForm({ aluno_id: '', data_inicio: data, data_fim: data, sentido: 'ambos', motivo: '' }); setErro(''); setAberto(true); }}>Registrar ausência</Botao>
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {lista.length === 0 && <p className="p-6 text-center text-sm text-slate-400">Nenhuma ausência avisada para este dia.</p>}
        {lista.map(a => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <p className="font-bold text-sm">{a.aluno_nome} <span className="text-slate-400 font-normal">· {a.escola_nome}</span></p>
              <p className="text-xs text-slate-500">
                {br(a.data_inicio)}{a.data_fim !== a.data_inicio ? ` a ${br(a.data_fim)}` : ''} · {a.sentido === 'ambos' ? 'ida e volta' : `só ${a.sentido}`}{a.motivo ? ` · ${a.motivo}` : ''} · via {a.origem}
              </p>
            </div>
            <button onClick={() => excluir(a.id)} className="text-slate-400 hover:text-rose-500" title="Remover"><span className="material-symbols-outlined text-[18px]">delete</span></button>
          </div>
        ))}
      </div>
      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo="Registrar ausência" tamanho="md"
        rodape={<>{erro && <p className="text-sm text-rose-500 font-bold mr-auto self-center">{erro}</p>}<Botao variante="secundario" onClick={() => setAberto(false)}>Cancelar</Botao><Botao onClick={salvar}>Salvar</Botao></>}>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Aluno" className="col-span-2">
            <select className={inputCls} value={form.aluno_id} onChange={e => setForm({ ...form, aluno_id: e.target.value })}>
              <option value="">Selecione</option>
              {alunos.filter(a => a.status === 'Ativo').map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </Campo>
          <Campo label="De"><input type="date" className={inputCls} value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value, data_fim: form.data_fim < e.target.value ? e.target.value : form.data_fim })} /></Campo>
          <Campo label="Até"><input type="date" className={inputCls} min={form.data_inicio} value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })} /></Campo>
          <Campo label="Sentido" className="col-span-2">
            <select className={inputCls} value={form.sentido} onChange={e => setForm({ ...form, sentido: e.target.value })}>
              <option value="ambos">Ida e volta</option><option value="ida">Só ida</option><option value="volta">Só volta</option>
            </select>
          </Campo>
          <Campo label="Motivo" className="col-span-2"><input className={inputCls} value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} placeholder="Ex.: consulta médica" /></Campo>
        </div>
      </Modal>
    </div>
  );
};

const Ocorrencias: React.FC = () => {
  const [todas, setTodas] = useState(false);
  const [lista, setLista] = useState<any[]>([]);
  const [foto, setFoto] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    const res = await apiFetch(`/api/operacao/ocorrencias${todas ? '?status=todas' : ''}`);
    if (res.ok) setLista(await res.json());
  }, [todas]);
  useEffect(() => { carregar(); }, [carregar]);
  const resolver = async (id: number) => {
    const resolucao = prompt('Como foi resolvido?');
    if (resolucao === null) return;
    await apiFetch(`/api/operacao/ocorrencias/${id}/resolver`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolucao }) });
    carregar();
  };
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium flex items-center gap-2"><input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} /> Mostrar resolvidas</label>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {lista.length === 0 && <p className="p-6 text-center text-sm text-slate-400">Nenhuma ocorrência {todas ? '' : 'em aberto'}.</p>}
        {lista.map(o => (
          <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Selo cor={o.tipo === 'emergencia' ? 'vermelho' : o.status === 'aberta' ? 'amarelo' : 'verde'}>{TIPOS_OCORRENCIA[o.tipo] || o.tipo}</Selo>
            <div className="flex-1 min-w-48">
              <p className="text-sm font-bold">{o.descricao || '(sem descrição)'}</p>
              <p className="text-xs text-slate-500">{o.registrado_em?.slice(0, 16).replace('T', ' ')} · {o.rota_nome || '—'} · {o.motorista_nome || '—'}{o.aluno_nome ? ` · ${o.aluno_nome}` : ''}{o.resolucao ? ` · Resolução: ${o.resolucao}` : ''}</p>
            </div>
            {o.tem_foto && <Botao variante="secundario" icone="image" onClick={async () => { const r = await apiFetch(`/api/operacao/ocorrencias/${o.id}/foto`); if (r.ok) setFoto((await r.json()).foto); }}>Foto</Botao>}
            {o.status === 'aberta' && <Botao variante="secundario" icone="check" onClick={() => resolver(o.id)}>Resolver</Botao>}
          </div>
        ))}
      </div>
      <Modal aberto={!!foto} onFechar={() => setFoto(null)} titulo="Foto da ocorrência" tamanho="lg">{foto && <img src={foto} alt="" className="w-full rounded-xl" />}</Modal>
    </div>
  );
};
