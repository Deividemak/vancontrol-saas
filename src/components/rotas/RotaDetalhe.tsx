// Painel de uma rota: paradas (arrastar e soltar), mapa, horários, alertas e sugestões.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Selo, erroDaResposta, formatarDistancia, formatarDuracao } from '../ui';
import { Mapa, MarcadorMapa } from '../mapa/Mapa';
import { AreaRestrita, Parada, PontoEncontro, RotaDetalhe as Detalhe, Sugestao } from './tipos';

interface Props {
  detalhe: Detalhe;
  pontos: PontoEncontro[];
  areas: AreaRestrita[];
  onAtualizar: (d: Detalhe) => void;
  onEditar: () => void;
  onCriarVolta: () => void;
  onExcluir: () => void;
  onAdicionarAlunos: () => void;
  onAbrirRota: (id: number) => void;
}

/** Lista reordenável por arrastar e soltar (HTML5) com setas para teclado/celular. */
function useArrastar<T>(itens: T[], onSoltar: (nova: T[]) => void) {
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const mover = (de: number, para: number) => {
    if (de === para || para < 0 || para >= itens.length) return;
    const nova = [...itens];
    const [x] = nova.splice(de, 1);
    nova.splice(para, 0, x);
    onSoltar(nova);
  };
  const props = (i: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setArrastando(i); e.dataTransfer.effectAllowed = 'move'; },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (sobre !== i) setSobre(i); },
    onDragLeave: () => setSobre(s => (s === i ? null : s)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (arrastando !== null) mover(arrastando, i); setArrastando(null); setSobre(null); },
    onDragEnd: () => { setArrastando(null); setSobre(null); },
  });
  return { props, mover, arrastando, sobre };
}

const Stat: React.FC<{ label: string; valor: string; icone: string; alerta?: boolean }> = ({ label, valor, icone, alerta }) => (
  <div className={`rounded-xl p-3 border ${alerta ? 'border-rose-300 bg-rose-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
      <span className="material-symbols-outlined text-[14px]">{icone}</span>{label}
    </p>
    <p className={`text-lg font-black tracking-tight ${alerta ? 'text-rose-600' : ''}`}>{valor}</p>
  </div>
);

export const RotaDetalhe: React.FC<Props> = ({ detalhe, pontos, areas, onAtualizar, onEditar, onCriarVolta, onExcluir, onAdicionarAlunos, onAbrirRota }) => {
  const { rota, resumo, paradas } = detalhe;
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [sugestao, setSugestao] = useState<Sugestao | null>(null);
  const [destaque, setDestaque] = useState<number | null>(null);
  const refsParadas = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => { setSugestao(null); setErro(''); }, [rota.id]);

  const paradasAluno = paradas.filter(p => p.tipo === 'embarque' || p.tipo === 'desembarque');
  const paradasEscola = paradas.filter(p => p.tipo === 'escola');
  const partida = paradas.find(p => p.tipo === 'partida');

  const chamar = async (url: string, init: RequestInit, padrao: string) => {
    setOcupado(true);
    setErro('');
    try {
      const res = await apiFetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      if (!res.ok) throw new Error(await erroDaResposta(res, padrao));
      const j = await res.json();
      return j;
    } catch (e) {
      setErro((e as Error).message);
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const salvarOrdem = async (alunosStops: Parada[], escolas: Parada[]) => {
    const alunos = [...alunosStops.flatMap(p => p.alunos.map(a => a.aluno_id)), ...detalhe.sem_localizacao.map(a => a.aluno_id)];
    const d = await chamar(`/api/rotas/${rota.id}/ordem`, { method: 'PUT', body: JSON.stringify({ alunos, escolas: escolas.map(e => e.escola_id) }) }, 'Erro ao reordenar');
    if (d) { setSugestao(null); onAtualizar(d); }
  };

  const dndAlunos = useArrastar<Parada>(paradasAluno, nova => salvarOrdem(nova, paradasEscola));
  const dndEscolas = useArrastar<Parada>(paradasEscola, nova => salvarOrdem(paradasAluno, nova));

  const sugerir = async () => {
    const s = await chamar(`/api/rotas/${rota.id}/sugerir-ordem`, { method: 'POST' }, 'Erro ao sugerir ordem');
    if (s) setSugestao(s);
  };
  const aplicarSugestao = async () => {
    if (!sugestao) return;
    const d = await chamar(`/api/rotas/${rota.id}/ordem`, { method: 'PUT', body: JSON.stringify({ alunos: sugestao.alunos, escolas: sugestao.escolas }) }, 'Erro ao aplicar');
    if (d) { setSugestao(null); onAtualizar(d); }
  };
  const usarHorarioSugerido = async () => {
    const d = await chamar(`/api/rotas/${rota.id}`, { method: 'PUT', body: JSON.stringify({ ...rota, hora_saida: resumo.hora_saida_sugerida }) }, 'Erro ao atualizar horário');
    if (d) onAtualizar(d);
  };
  const trocarPonto = async (alunoId: number, pontoId: string) => {
    const d = await chamar(`/api/rotas/${rota.id}/alunos/${alunoId}`, { method: 'PUT', body: JSON.stringify({ ponto_encontro_id: pontoId || null }) }, 'Erro ao trocar ponto');
    if (d) onAtualizar(d);
  };
  const removerAluno = async (alunoId: number, nome: string) => {
    if (!confirm(`Tirar ${nome} desta rota?`)) return;
    const d = await chamar(`/api/rotas/${rota.id}/alunos/${alunoId}`, { method: 'DELETE' }, 'Erro ao remover aluno');
    if (d) onAtualizar(d);
  };

  const marcadores = useMemo<MarcadorMapa[]>(() => {
    const ms: MarcadorMapa[] = paradas.filter(p => p.lat !== null && p.lng !== null).map(p => ({
      id: p.seq,
      lat: p.lat!, lng: p.lng!,
      tipo: p.tipo === 'escola' ? 'escola' : p.tipo === 'partida' ? 'partida' : p.ponto_encontro_id ? 'ponto' : 'embarque',
      rotulo: p.tipo === 'escola' || p.tipo === 'partida' ? undefined : String(p.seq - (partida ? 1 : 0)),
      titulo: `${p.nome}${p.chegada ? `\nChegada: ${p.chegada}` : ''}${p.endereco ? `\n${p.endereco}` : ''}`,
      destaque: destaque === p.seq,
    }));
    const usados = new Set(paradas.map(p => p.ponto_encontro_id).filter(Boolean));
    for (const pt of pontos.filter(p => p.ativo && !usados.has(p.id))) {
      ms.push({ id: `pt${pt.id}`, lat: pt.lat, lng: pt.lng, tipo: 'ponto', apagado: true, titulo: `Ponto de encontro: ${pt.nome}` });
    }
    return ms;
  }, [paradas, pontos, destaque, partida]);

  const circulos = useMemo(() => areas.filter(a => a.ativo).map(a => ({ id: a.id, lat: a.lat, lng: a.lng, raio: a.raio_m, titulo: `Área restrita: ${a.nome}` })), [areas]);

  const focar = (seq: number) => {
    setDestaque(seq);
    refsParadas.current[seq]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const erros = detalhe.alertas.filter(a => a.nivel === 'erro');
  const avisos = detalhe.alertas.filter(a => a.nivel === 'aviso');
  const lotado = !!resumo.lugares && resumo.total_alunos > resumo.lugares;
  const bordoAlto = resumo.tempo_bordo_max_seg !== null && resumo.tempo_bordo_max_seg > rota.tempo_max_bordo_min * 60;

  const blocoEscolas = (
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
        {rota.tipo === 'volta' ? 'Buscar nas escolas' : 'Entregar nas escolas'} {paradasEscola.length > 1 && '· arraste para mudar a ordem'}
      </p>
      {paradasEscola.map((p, i) => (
        <div key={p.seq} ref={el => { refsParadas.current[p.seq] = el; }} {...(paradasEscola.length > 1 ? dndEscolas.props(i) : {})}
          onClick={() => setDestaque(p.seq)}
          className={`flex items-center gap-3 p-3 rounded-xl border bg-indigo-500/5 transition-all
            ${dndEscolas.sobre === i ? 'border-primary border-dashed' : 'border-indigo-200 dark:border-indigo-900'} ${destaque === p.seq ? 'ring-2 ring-primary' : ''}`}>
          {paradasEscola.length > 1 && <span className="material-symbols-outlined text-slate-300 cursor-grab">drag_indicator</span>}
          <span className="size-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[18px]">school</span>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{p.nome}</p>
            <p className="text-xs text-slate-500">
              {p.alunos.length} aluno(s){p.lat === null && <span className="text-rose-500 font-bold"> · sem localização</span>}
              {p.trecho && ` · ${formatarDistancia(p.trecho.metros)} / ${formatarDuracao(p.trecho.segundos)} do ponto anterior`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-black">{p.chegada || '--:--'}</p>
            {rota.tipo === 'volta' && p.saida && p.saida !== p.chegada && <p className="text-[10px] text-slate-400">sai {p.saida}</p>}
          </div>
          {paradasEscola.length > 1 && (
            <div className="flex flex-col">
              <button className="text-slate-300 hover:text-primary leading-none" onClick={e => { e.stopPropagation(); dndEscolas.mover(i, i - 1); }} title="Subir"><span className="material-symbols-outlined text-[18px]">expand_less</span></button>
              <button className="text-slate-300 hover:text-primary leading-none" onClick={e => { e.stopPropagation(); dndEscolas.mover(i, i + 1); }} title="Descer"><span className="material-symbols-outlined text-[18px]">expand_more</span></button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const blocoAlunos = (
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
        {rota.tipo === 'volta' ? 'Desembarques' : 'Embarques'} · arraste para mudar a ordem
      </p>
      {paradasAluno.length === 0 && (
        <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-400">
          Nenhum aluno com localização nesta rota ainda.
        </div>
      )}
      {paradasAluno.map((p, i) => (
        <div key={`${p.seq}-${p.alunos[0]?.aluno_id}`} ref={el => { refsParadas.current[p.seq] = el; }} {...dndAlunos.props(i)}
          onClick={() => setDestaque(p.seq)}
          className={`p-3 rounded-xl border bg-white dark:bg-slate-900 transition-all
            ${dndAlunos.sobre === i ? 'border-primary border-dashed' : 'border-slate-200 dark:border-slate-800'}
            ${dndAlunos.arrastando === i ? 'opacity-40' : ''} ${destaque === p.seq ? 'ring-2 ring-primary' : ''}`}>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-slate-300 cursor-grab">drag_indicator</span>
            <span className={`size-8 rounded-full text-white text-sm font-black flex items-center justify-center shrink-0 ${p.ponto_encontro_id ? 'bg-emerald-600' : 'bg-primary'}`}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate flex items-center gap-2">
                {p.ponto_encontro_id ? <><span className="material-symbols-outlined text-[16px] text-emerald-600">hail</span>{p.nome}</> : p.endereco || 'Endereço não informado'}
              </p>
              <p className="text-xs text-slate-500">
                {p.trecho ? `${formatarDistancia(p.trecho.metros)} / ${formatarDuracao(p.trecho.segundos)} do ponto anterior` : 'Primeira parada'}
              </p>
            </div>
            {p.irmaos && <Selo cor="roxo" icone="family_restroom">Irmãos</Selo>}
            <p className="text-sm font-black shrink-0">{p.chegada || '--:--'}</p>
            <div className="flex flex-col">
              <button className="text-slate-300 hover:text-primary leading-none" onClick={e => { e.stopPropagation(); dndAlunos.mover(i, i - 1); }} title="Subir"><span className="material-symbols-outlined text-[18px]">expand_less</span></button>
              <button className="text-slate-300 hover:text-primary leading-none" onClick={e => { e.stopPropagation(); dndAlunos.mover(i, i + 1); }} title="Descer"><span className="material-symbols-outlined text-[18px]">expand_more</span></button>
            </div>
          </div>
          <div className="mt-2 pl-[4.25rem] space-y-1.5">
            {p.alunos.map(a => (
              <div key={a.aluno_id} className="flex items-center gap-2 text-sm" onClick={e => e.stopPropagation()}>
                {a.foto_thumb
                  ? <img src={a.foto_thumb} alt="" className="size-6 rounded-full object-cover" />
                  : <span className="size-6 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-black text-primary flex items-center justify-center">{a.nome.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>}
                <span className="font-medium truncate">{a.nome}</span>
                <span className="text-xs text-slate-400 truncate hidden md:inline">{a.escola_nome}</span>
                <select value={a.ponto_encontro_id || ''} onChange={e => trocarPonto(a.aluno_id, e.target.value)} disabled={ocupado}
                  className="ml-auto h-7 text-xs rounded-md border-none bg-slate-50 dark:bg-slate-800 font-bold max-w-40" title={rota.tipo === 'volta' ? 'Onde desce' : 'Onde embarca'}>
                  <option value="">Em casa</option>
                  {pontos.filter(pt => pt.ativo || pt.id === a.ponto_encontro_id).map(pt => <option key={pt.id} value={pt.id}>{pt.nome}</option>)}
                </select>
                <button className="text-slate-300 hover:text-rose-500" title="Tirar da rota" onClick={() => removerAluno(a.aluno_id, a.nome)}>
                  <span className="material-symbols-outlined text-[18px]">person_remove</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-black tracking-tight">{rota.nome}</h2>
            <Selo cor="azul">{rota.periodo}</Selo>
            <Selo cor={rota.tipo === 'ida' ? 'verde' : 'roxo'} icone={rota.tipo === 'ida' ? 'east' : 'west'}>{rota.tipo === 'ida' ? 'Ida' : 'Volta'}</Selo>
            {rota.status === 'Inativa' && <Selo cor="cinza">Inativa</Selo>}
          </div>
          <p className="text-sm text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">airport_shuttle</span>{detalhe.veiculo ? `${detalhe.veiculo.placa} · ${detalhe.veiculo.modelo}` : 'Sem veículo'}</span>
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">badge</span>{detalhe.motorista?.nome || 'Sem motorista'}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao icone="person_add" onClick={onAdicionarAlunos}>Alunos</Botao>
          <Botao variante="secundario" icone="auto_fix_high" onClick={sugerir} carregando={ocupado && !sugestao} disabled={paradasAluno.length < 2}>Sugerir ordem</Botao>
          <Botao variante="secundario" icone="edit" onClick={onEditar}>Editar</Botao>
          {rota.tipo === 'ida' && <Botao variante="secundario" icone="u_turn_left" onClick={onCriarVolta}>Criar volta</Botao>}
          <Botao variante="perigo" icone="delete" onClick={onExcluir} title="Excluir rota" />
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Saída" valor={resumo.hora_saida || '--:--'} icone="schedule" />
        <Stat label="Término" valor={resumo.hora_fim || '--:--'} icone="flag" />
        <Stat label="Distância" valor={formatarDistancia(resumo.distancia_m)} icone="route" />
        <Stat label="Duração" valor={formatarDuracao(resumo.duracao_seg)} icone="timer" />
        <Stat label="Ocupação" valor={`${resumo.total_alunos}${resumo.lugares ? ` / ${resumo.lugares}` : ''}`} icone="airline_seat_recline_normal" alerta={lotado} />
        <Stat label="Máx. a bordo" valor={formatarDuracao(resumo.tempo_bordo_max_seg)} icone="child_care" alerta={bordoAlto} />
      </div>
      {detalhe.fonte_trajeto === 'estimativa' && paradas.length > 1 && (
        <p className="text-[11px] text-slate-400 -mt-2">Distâncias e tempos estimados (serviço de rotas por ruas indisponível no momento).</p>
      )}

      {erro && <p className="text-sm font-bold text-rose-500">{erro}</p>}

      {/* Horário sugerido */}
      {rota.tipo === 'ida' && resumo.hora_saida_sugerida && resumo.hora_saida_sugerida !== resumo.hora_saida && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-blue-500/10 text-blue-800 dark:text-blue-200">
          <span className="material-symbols-outlined">lightbulb</span>
          <p className="text-sm flex-1">
            Para chegar em todas as escolas com {rota.folga_escola_min} min de folga, saia às <b>{resumo.hora_saida_sugerida}</b>
            {resumo.hora_saida ? ` (hoje: ${resumo.hora_saida})` : ''}.
          </p>
          <Botao onClick={usarHorarioSugerido} carregando={ocupado}>Usar {resumo.hora_saida_sugerida}</Botao>
        </div>
      )}

      {/* Sugestão de ordem */}
      {sugestao && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
          <span className="material-symbols-outlined">auto_fix_high</span>
          <div className="text-sm flex-1">
            <p className="font-bold">{sugestao.motivo}</p>
            <p>
              Distância estimada: {formatarDistancia(sugestao.distancia_atual_m)} → <b>{formatarDistancia(sugestao.distancia_sugerida_m)}</b>
              {sugestao.atraso_atual_min > 0 && <> · atraso nas escolas: {sugestao.atraso_atual_min} → <b>{sugestao.atraso_sugerido_min} min</b></>}
              {sugestao.bordo_max_atual_min !== undefined && <> · maior tempo na van: {sugestao.bordo_max_atual_min} → <b>{sugestao.bordo_max_sugerido_min} min</b></>}
            </p>
            {sugestao.avisos?.map(a => <p key={a} className="text-amber-700 dark:text-amber-300 font-medium">⚠ {a}</p>)}
          </div>
          <Botao variante="secundario" onClick={() => setSugestao(null)}>Descartar</Botao>
          <Botao onClick={aplicarSugestao} carregando={ocupado}>Aplicar</Botao>
        </div>
      )}

      {/* Alertas */}
      {(erros.length > 0 || avisos.length > 0) && (
        <div className="space-y-1.5">
          {[...erros, ...avisos].map((a, i) => (
            <div key={i} className={`flex items-start gap-2 text-sm px-3 py-2 rounded-lg ${a.nivel === 'erro' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-200'}`}>
              <span className="material-symbols-outlined text-[18px]">{a.nivel === 'erro' ? 'error' : 'warning'}</span>
              <span className="flex-1">{a.msg}</span>
              {a.rota_id && <button className="font-bold underline" onClick={() => onAbrirRota(a.rota_id!)}>abrir</button>}
            </div>
          ))}
        </div>
      )}

      {/* Paradas + mapa */}
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
        <div className={`space-y-4 ${ocupado ? 'opacity-60 pointer-events-none' : ''}`}>
          {partida && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 text-white">
              <span className="material-symbols-outlined">garage</span>
              <p className="text-sm font-bold flex-1">{partida.endereco || 'Partida'}</p>
              <p className="text-sm font-black">{partida.chegada || '--:--'}</p>
            </div>
          )}
          {rota.tipo === 'volta' ? <>{blocoEscolas}{blocoAlunos}</> : <>{blocoAlunos}{blocoEscolas}</>}
          {detalhe.sem_localizacao.length > 0 && (
            <div className="p-3 rounded-xl border border-amber-300 bg-amber-500/5 space-y-1">
              <p className="text-xs font-black uppercase tracking-widest text-amber-700">Fora do trajeto: sem localização</p>
              {detalhe.sem_localizacao.map(a => (
                <div key={a.aluno_id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{a.nome} <span className="text-slate-400 text-xs">{a.escola_nome}</span></span>
                  <button className="text-slate-400 hover:text-rose-500" onClick={() => removerAluno(a.aluno_id, a.nome)} title="Tirar da rota">
                    <span className="material-symbols-outlined text-[18px]">person_remove</span>
                  </button>
                </div>
              ))}
              <p className="text-[11px] text-slate-500">Complete o endereço no cadastro do aluno (aba Endereço) para incluí-lo no cálculo.</p>
            </div>
          )}
        </div>
        <div className="2xl:sticky 2xl:top-4 self-start w-full">
          <Mapa
            className="h-[420px] 2xl:h-[calc(100vh-220px)]"
            marcadores={marcadores}
            linha={detalhe.geometria}
            circulos={circulos}
            chaveEnquadramento={`${rota.id}-${paradas.length}`}
            onClicarMarcador={id => typeof id === 'number' && focar(id)}
          />
        </div>
      </div>
    </div>
  );
};
