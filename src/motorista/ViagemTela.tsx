// Tela da viagem em andamento: parada atual, check-in dos alunos, ocorrências, emergência e encerramento.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../services/api';
import { useGps, ultimaPosicao, distanciaM } from './gps';
import { enfileirar, enviarAgora, lerCache, salvarCache, aoMudar, pendentes, novoId, useFila } from './offline';
import { BotaoSegurar, Folha, AvatarAluno, FichaAluno, Ligar, temAlertaSaude, reduzirFoto, linkMaps, linkWaze } from './componentes';
import { ParadaViagem, Presenca, StatusPresenca, ViagemDetalhe, ROTULO_STATUS, TIPOS_OCORRENCIA } from './tipos';

type TipoEvento = 'embarque' | 'desembarque' | 'nao_compareceu' | 'desfazer' | 'chegada_parada';

function aplicarLocal(p: Presenca, tipo: TipoEvento): Presenca {
  const hora = new Date().toTimeString().slice(0, 5);
  switch (tipo) {
    case 'embarque': return { ...p, status: 'embarcou', embarque_hora: hora };
    case 'desembarque': return p.status === 'embarcou' ? { ...p, status: 'desembarcou', desembarque_hora: hora } : p;
    case 'nao_compareceu': return { ...p, status: 'nao_compareceu' };
    case 'desfazer': return p.status === 'desembarcou' ? { ...p, status: 'embarcou', desembarque_hora: null } : { ...p, status: 'previsto', embarque_hora: null };
    default: return p;
  }
}

// monitor: acompanha a viagem (presença, ocorrência, emergência); GPS e encerrar ficam com o motorista
export const ViagemTela: React.FC<{ viagemId: number; onVoltar: () => void; monitor?: boolean }> = ({ viagemId, onVoltar, monitor = false }) => {
  const [det, setDet] = useState<ViagemDetalhe | null>(() => lerCache<ViagemDetalhe>(`viagem_${viagemId}`));
  const [erro, setErro] = useState('');
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  const [ficha, setFicha] = useState<Presenca | null>(null);
  const [folha, setFolha] = useState<'ocorrencia' | 'emergencia' | 'finalizar' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const fila = useFila();
  const { estado: gps, posicao } = useGps(det?.viagem.status === 'em_andamento' && !monitor ? viagemId : null);
  // paradas em que a van esteve perto (para detectar a saída) e paradas cuja pergunta foi dispensada
  const [esteve, setEsteve] = useState<number[]>([]);
  const [dispensadas, setDispensadas] = useState<number[]>([]);
  const [saida, setSaida] = useState<{ seq: number; alunos: { aluno_id: number; nome: string }[] } | null>(null);
  const recarregando = useRef<number>();

  const carregar = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/motorista/viagens/${viagemId}`);
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErro(j.error || 'Erro ao carregar'); return; }
      const d: ViagemDetalhe = await res.json();
      // só substitui o estado local se não houver ações esperando envio
      if (pendentes() === 0) { setDet(d); salvarCache(`viagem_${viagemId}`, d); setErro(''); }
    } catch { /* sem sinal: segue com o que está no aparelho */ }
  }, [viagemId]);

  useEffect(() => { carregar(); }, [carregar]);
  // quando a fila esvazia, confere com o servidor
  useEffect(() => aoMudar(() => {
    if (pendentes() === 0) { clearTimeout(recarregando.current); recarregando.current = window.setTimeout(carregar, 1200); }
  }), [carregar]);

  const mostrar = (msg: string) => { setAviso(msg); window.setTimeout(() => setAviso(a => (a === msg ? null : a)), 3500); };

  const atualizarLocal = (fn: (d: ViagemDetalhe) => ViagemDetalhe) => setDet(d => {
    if (!d) return d;
    const novo = fn(d);
    salvarCache(`viagem_${viagemId}`, novo);
    return novo;
  });

  const registrar = (tipo: TipoEvento, alunoId?: number, seq?: number, dados?: Record<string, unknown>) => {
    const pos = ultimaPosicao();
    const ev = { uuid: novoId(), tipo, aluno_id: alunoId, parada_seq: seq, lat: pos?.lat, lng: pos?.lng, registrado_em: new Date().toISOString(), dados };
    if (navigator.vibrate) navigator.vibrate(40);
    atualizarLocal(d => {
      if (tipo === 'chegada_parada') return d.paradas_com_chegada.includes(seq!) ? d : { ...d, paradas_com_chegada: [...d.paradas_com_chegada, seq!] };
      const presencas = d.presencas.map(p => (p.aluno_id === alunoId ? aplicarLocal(p, tipo) : p));
      const resumo = presencas.reduce((c, p) => ({ ...c, [p.status]: (c[p.status] || 0) + 1 }), { total: presencas.length } as Record<string, number>);
      return { ...d, presencas, resumo: resumo as ViagemDetalhe['resumo'] };
    });
    enfileirar(`/api/motorista/viagens/${viagemId}/eventos`, { eventos: [ev] });
  };

  const pres = useMemo(() => new Map((det?.presencas || []).map(p => [p.aluno_id, p])), [det]);
  const paradas = useMemo(() => (det?.paradas || []).filter(p => p.tipo !== 'partida'), [det]);
  const tipoRota = det?.viagem.rota_tipo || 'ida';

  const ehEmbarque = (p: ParadaViagem) => p.tipo === 'embarque' || (p.tipo === 'escola' && tipoRota === 'volta');
  const pendente = (p: ParadaViagem) => p.alunos.some(a => {
    const s = pres.get(a.aluno_id)?.status;
    return ehEmbarque(p) ? s === 'previsto' : s === 'embarcou';
  });
  const idxPendente = paradas.findIndex(pendente);
  const idx = selecionada !== null && selecionada < paradas.length ? selecionada : Math.max(0, idxPendente);
  const atual = paradas[idx];
  const aBordo = (det?.presencas || []).filter(p => p.status === 'embarcou');

  const faltantes = (p: ParadaViagem) => p.alunos.filter(a => pres.get(a.aluno_id)?.status === 'previsto');

  /** Quem não embarcou nesta parada vira "não veio". */
  const marcarFaltas = (p: ParadaViagem, auto: boolean) => {
    for (const a of faltantes(p)) registrar('nao_compareceu', a.aluno_id, p.seq, auto ? { automatico: true } : undefined);
  };

  /** Botão "Próxima parada": o motorista decidiu seguir. */
  const seguir = () => {
    if (atual && ehEmbarque(atual)) marcarFaltas(atual, false);
    setSaida(null);
    setSelecionada(null); // volta para a próxima parada pendente
  };

  // GPS: chegada automática e aviso ao sair com aluno sem embarcar
  useEffect(() => {
    if (!det || det.viagem.status !== 'em_andamento' || !posicao) return;
    if (posicao.precisao_m !== null && posicao.precisao_m > 80) return; // leitura imprecisa: ignora
    const RAIO_CHEGADA = 60, RAIO_SAIDA = 150;

    // chegada: a parada mais próxima dentro do raio (a van pode pular uma parada pendente)
    let alvo: ParadaViagem | null = null;
    let menor = Infinity;
    for (const p of paradas) {
      if (p.lat === null || p.lng === null) continue;
      const dist = distanciaM(posicao, { lat: p.lat, lng: p.lng });
      if (dist <= RAIO_CHEGADA && dist < menor) { menor = dist; alvo = p; }
    }
    if (alvo) {
      if (!esteve.includes(alvo.seq)) setEsteve(e => [...e, alvo!.seq]);
      if (!det.paradas_com_chegada.includes(alvo.seq)) registrar('chegada_parada', undefined, alvo.seq, { automatico: true, aluno_ids: alvo.alunos.map(a => a.aluno_id) });
      // chegou em outra parada sem responder a pergunta da anterior: vale como falta
      if (saida && saida.seq !== alvo.seq) {
        const anterior = paradas.find(p => p.seq === saida.seq);
        if (anterior) marcarFaltas(anterior, true);
        setSaida(null);
      }
    }

    // saída: van se afastou de uma parada de embarque onde esteve, e ainda tem aluno sem registro
    if (!saida) {
      for (const p of paradas) {
        if (!esteve.includes(p.seq) || dispensadas.includes(p.seq) || !ehEmbarque(p) || p.lat === null || p.lng === null) continue;
        const sem = faltantes(p);
        if (sem.length && distanciaM(posicao, { lat: p.lat, lng: p.lng }) > RAIO_SAIDA) {
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          setSaida({ seq: p.seq, alunos: sem.map(a => ({ aluno_id: a.aluno_id, nome: a.nome })) });
          break;
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posicao]);

  if (!det) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-bold">{erro || (fila.online ? 'Carregando viagem...' : 'Sem sinal e sem dados salvos desta viagem.')}</p>
        <button onClick={onVoltar} className="text-primary font-bold">Voltar</button>
      </div>
    );
  }

  const r = det.resumo;
  const concluida = det.viagem.status === 'concluida';

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-background-dark pb-28">
      {/* topo */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white px-4 pt-3 pb-3 space-y-2">
        <div className="flex items-center gap-3">
          <button onClick={onVoltar} className="size-10 rounded-full bg-white/10 flex items-center justify-center" aria-label="Voltar">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-black truncate">{det.viagem.rota_nome}</p>
            <p className="text-xs opacity-70">{det.viagem.rota_tipo === 'ida' ? 'Ida' : 'Volta'} · {det.viagem.placa || 'sem veículo'}</p>
          </div>
          <div className="text-right text-[11px] leading-tight">
            <p className={fila.online ? 'text-emerald-300' : 'text-amber-300'}>
              {fila.online ? 'Online' : 'Sem sinal'}{fila.pendentes ? ` · ${fila.pendentes} p/ enviar` : ''}
            </p>
            {!concluida && !monitor && <p className={gps === 'ok' ? 'text-emerald-300' : 'text-amber-300'}>GPS {gps === 'ok' ? 'ativo' : gps === 'negado' ? 'bloqueado' : gps === 'indisponivel' ? 'indisponível' : '...'}</p>}
          </div>
        </div>
        <div className="flex gap-2 text-center text-[11px] font-bold">
          <div className="flex-1 rounded-lg bg-white/10 py-1"><p className="text-lg font-black leading-none">{r.embarcou || 0}</p>a bordo</div>
          <div className="flex-1 rounded-lg bg-white/10 py-1"><p className="text-lg font-black leading-none">{r.desembarcou || 0}</p>entregues</div>
          <div className="flex-1 rounded-lg bg-white/10 py-1"><p className="text-lg font-black leading-none">{r.previsto || 0}</p>aguardando</div>
          <div className="flex-1 rounded-lg bg-white/10 py-1"><p className="text-lg font-black leading-none">{(r.nao_compareceu || 0) + (r.ausente_avisado || 0)}</p>faltas</div>
        </div>
      </header>

      {gps === 'negado' && !concluida && !monitor && (
        <p className="m-3 p-3 rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-200 text-sm">
          A localização está bloqueada. Libere o acesso à localização para este site nas configurações do navegador, para os pais acompanharem a van.
        </p>
      )}

      {concluida ? (
        <div className="p-4 space-y-3">
          <div className="rounded-3xl bg-emerald-600 text-white p-6 text-center space-y-1">
            <span className="material-symbols-outlined text-5xl">task_alt</span>
            <p className="text-xl font-black">Viagem encerrada</p>
            <p className="text-sm opacity-90">Varredura confirmada. {r.desembarcou || 0} aluno(s) entregue(s).</p>
          </div>
          <button onClick={onVoltar} className="w-full h-14 rounded-2xl bg-slate-900 text-white font-black">Voltar para minhas rotas</button>
        </div>
      ) : (
        <main className="p-3 space-y-3">
          {saida && (
            <div className="rounded-3xl bg-amber-500 text-white p-4 space-y-3 shadow-lg" role="alert">
              <p className="text-lg font-black leading-tight">
                {saida.alunos.map(a => a.nome.split(' ')[0]).join(', ')} {saida.alunos.length > 1 ? 'não embarcaram' : 'não embarcou'}.
              </p>
              <p className="text-sm">A van saiu do ponto. Marcar como “não veio”?</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setDispensadas(d => [...d, saida.seq]); setSaida(null); }} className="h-12 rounded-xl bg-white/25 font-black">Ainda vou buscar</button>
                <button onClick={() => { const p = paradas.find(x => x.seq === saida.seq); if (p) marcarFaltas(p, true); setSaida(null); }} className="h-12 rounded-xl bg-white text-amber-700 font-black">Marcar não veio</button>
              </div>
            </div>
          )}
          {/* navegação entre paradas */}
          {paradas.length > 0 && atual && (
            <section className="rounded-3xl bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 pt-3">
                <button disabled={idx === 0} onClick={() => setSelecionada(idx - 1)} className="size-11 rounded-full bg-slate-100 dark:bg-slate-800 disabled:opacity-30 flex items-center justify-center" aria-label="Parada anterior">
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Parada {idx + 1} de {paradas.length}</p>
                <button disabled={idx >= paradas.length - 1} onClick={() => setSelecionada(idx + 1)} className="size-11 rounded-full bg-slate-100 dark:bg-slate-800 disabled:opacity-30 flex items-center justify-center" aria-label="Próxima parada">
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>

              <div className="px-4 pb-4 pt-2 space-y-3">
                <div className="flex items-start gap-3">
                  <span className={`size-12 rounded-2xl text-white flex items-center justify-center shrink-0 ${atual.tipo === 'escola' ? 'bg-indigo-600' : atual.ponto_encontro_id ? 'bg-emerald-600' : 'bg-primary'}`}>
                    <span className="material-symbols-outlined">{atual.tipo === 'escola' ? 'school' : atual.ponto_encontro_id ? 'hail' : 'home'}</span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-black leading-tight">{atual.tipo === 'escola' ? atual.nome : atual.ponto_encontro_id ? atual.nome : atual.endereco || atual.nome}</p>
                    {atual.tipo !== 'escola' && !atual.ponto_encontro_id && atual.endereco && <p className="text-sm text-slate-500">{atual.alunos.map(a => a.nome.split(' ')[0]).join(', ')}</p>}
                    {atual.tipo === 'escola' && <p className="text-sm text-slate-500">{atual.endereco}</p>}
                    <p className="text-sm font-bold text-slate-500">Previsto {atual.chegada || '--:--'}{atual.irmaos ? ' · irmãos' : ''}</p>
                  </div>
                </div>

                {atual.lat !== null && atual.lng !== null && (
                  <div className="grid grid-cols-2 gap-2">
                    <a href={linkMaps(atual.lat, atual.lng)} target="_blank" rel="noreferrer" className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined">map</span>Google Maps
                    </a>
                    <a href={linkWaze(atual.lat, atual.lng)} target="_blank" rel="noreferrer" className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined">navigation</span>Waze
                    </a>
                  </div>
                )}

                {det.paradas_com_chegada.includes(atual.seq)
                  ? <p className="text-sm font-bold text-emerald-600 flex items-center gap-1"><span className="material-symbols-outlined text-[18px]">where_to_vote</span>Chegada registrada{esteve.includes(atual.seq) ? ' pelo GPS' : ''}</p>
                  : <button onClick={() => registrar('chegada_parada', undefined, atual.seq, { aluno_ids: atual.alunos.map(a => a.aluno_id) })} className="w-full h-14 rounded-2xl bg-primary text-white text-lg font-black flex items-center justify-center gap-2 active:scale-[.98]">
                      <span className="material-symbols-outlined">pin_drop</span>Cheguei no ponto
                    </button>}

                <div className="space-y-2">
                  {atual.alunos.map(a => {
                    const p = pres.get(a.aluno_id);
                    if (!p) return null;
                    const embarque = ehEmbarque(atual);
                    return (
                      <div key={a.aluno_id} className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 p-2.5">
                        <button onClick={() => setFicha(p)} className="relative" aria-label={`Ficha de ${p.nome}`}>
                          <AvatarAluno p={p} />
                          {temAlertaSaude(p) && <span className="absolute -top-1 -right-1 size-5 rounded-full bg-rose-600 text-white text-[12px] font-black flex items-center justify-center">!</span>}
                        </button>
                        <div className="flex-1 min-w-0" onClick={() => setFicha(p)}>
                          <p className="font-black leading-tight truncate">{p.nome}</p>
                          {!embarque && tipoRota === 'volta' && (p.autorizados || []).length > 0 && <p className="text-[11px] font-bold text-emerald-700 truncate">Recebe: responsável ou {p.autorizados!.map(x => x.nome.split(' ')[0]).join(', ')}</p>}
                          <p className="text-xs text-slate-500 truncate">{ROTULO_STATUS[p.status]}{p.embarque_hora && p.status !== 'previsto' ? ` · ${p.embarque_hora}` : ''}{p.desembarque_hora ? ` → ${p.desembarque_hora}` : ''}</p>
                        </div>
                        <AcoesAluno status={p.status} embarque={embarque}
                          onAcao={t => registrar(t, a.aluno_id, atual.seq)} />
                      </div>
                    );
                  })}
                </div>

                {ehEmbarque(atual) && faltantes(atual).length > 1 && (
                  <button onClick={() => faltantes(atual).forEach(a => registrar('embarque', a.aluno_id, atual.seq))}
                    className="w-full h-12 rounded-2xl bg-emerald-600 text-white font-black">Todos embarcaram ({faltantes(atual).length})</button>
                )}
                {!ehEmbarque(atual) && atual.alunos.filter(a => pres.get(a.aluno_id)?.status === 'embarcou').length > 1 && (
                  <button onClick={() => atual.alunos.filter(a => pres.get(a.aluno_id)?.status === 'embarcou').forEach(a => registrar('desembarque', a.aluno_id, atual.seq))}
                    className="w-full h-12 rounded-2xl bg-emerald-600 text-white font-black">Todos desceram aqui</button>
                )}
                {idx < paradas.length - 1 && (!pendente(atual) || ehEmbarque(atual)) && (
                  <button onClick={seguir} className="w-full h-12 rounded-2xl bg-slate-900 text-white font-black flex items-center justify-center gap-2">
                    {ehEmbarque(atual) && faltantes(atual).length
                      ? `Seguir · ${faltantes(atual).length === 1 ? faltantes(atual)[0].nome.split(' ')[0] + ' não veio' : faltantes(atual).length + ' não vieram'}`
                      : 'Próxima parada'}
                    <span className="material-symbols-outlined">arrow_forward</span>
                  </button>
                )}
                {idxPendente === -1 && !monitor && (
                  <button onClick={() => setFolha('finalizar')} className="w-full h-14 rounded-2xl bg-emerald-600 text-white text-lg font-black">Todas as paradas feitas · Encerrar</button>
                )}
              </div>
            </section>
          )}
          {paradas.length === 0 && (
            <p className="rounded-2xl bg-white dark:bg-slate-900 p-6 text-center text-slate-500">Nenhuma parada hoje (todos avisaram ausência).</p>
          )}

          {/* todas as paradas */}
          <section className="rounded-3xl bg-white dark:bg-slate-900 shadow-sm">
            <button onClick={() => setVerTodas(!verTodas)} className="w-full flex items-center justify-between px-4 h-12 font-black">
              Todas as paradas <span className="material-symbols-outlined">{verTodas ? 'expand_less' : 'expand_more'}</span>
            </button>
            {verTodas && (
              <ol className="px-2 pb-2">
                {paradas.map((p, i) => {
                  const feita = !pendente(p);
                  return (
                    <li key={p.seq}>
                      <button onClick={() => { setSelecionada(i); setVerTodas(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left ${i === idx ? 'bg-primary/10' : ''}`}>
                        <span className={`size-8 rounded-full text-sm font-black flex items-center justify-center ${feita ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>
                          {feita ? <span className="material-symbols-outlined text-[18px]">check</span> : i + 1}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-bold truncate">{p.tipo === 'escola' ? p.nome : p.alunos.map(a => a.nome.split(' ')[0]).join(', ')}</span>
                          <span className="block text-xs text-slate-500 truncate">{p.chegada || '--:--'} · {p.tipo === 'escola' ? 'Escola' : p.ponto_encontro_id ? p.nome : p.endereco}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </main>
      )}

      {/* barra inferior */}
      {!concluida && (
        <nav className={`fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-3 grid gap-2 ${monitor ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <button onClick={() => setFolha('ocorrencia')} className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 font-bold flex flex-col items-center justify-center text-xs">
            <span className="material-symbols-outlined">report</span>Ocorrência
          </button>
          {!monitor && (
          <button onClick={() => setFolha('finalizar')} className="h-14 rounded-2xl bg-slate-900 text-white font-bold flex flex-col items-center justify-center text-xs">
            <span className="material-symbols-outlined">flag</span>Encerrar
          </button>
          )}
          <button onClick={() => setFolha('emergencia')} className="h-14 rounded-2xl bg-rose-600 text-white font-black flex flex-col items-center justify-center text-xs">
            <span className="material-symbols-outlined">sos</span>EMERGÊNCIA
          </button>
        </nav>
      )}

      {aviso && <div className="fixed bottom-24 inset-x-4 z-50 rounded-2xl bg-slate-900 text-white px-4 py-3 text-sm font-bold shadow-xl text-center">{aviso}</div>}

      <FichaAluno p={ficha} onFechar={() => setFicha(null)} />
      <OcorrenciaFolha aberta={folha === 'ocorrencia'} onFechar={() => setFolha(null)} viagemId={viagemId} presencas={det.presencas}
        onEnviada={() => { setFolha(null); mostrar(fila.online ? 'Ocorrência enviada à empresa.' : 'Ocorrência salva. Será enviada quando houver sinal.'); }} />
      <EmergenciaFolha aberta={folha === 'emergencia'} onFechar={() => setFolha(null)} viagemId={viagemId} aBordo={aBordo} onFicha={setFicha} />
      <FinalizarFolha aberta={folha === 'finalizar'} onFechar={() => setFolha(null)} viagemId={viagemId} aBordo={aBordo}
        onDesceu={id => registrar('desembarque', id)}
        onConcluida={d => { setFolha(null); if (d) { setDet(d); salvarCache(`viagem_${viagemId}`, d); } else atualizarLocal(x => ({ ...x, viagem: { ...x.viagem, status: 'concluida' } })); }} />
    </div>
  );
};

const AcoesAluno: React.FC<{ status: StatusPresenca; embarque: boolean; onAcao: (t: TipoEvento) => void }> = ({ status, embarque, onAcao }) => {
  const desfazer = (
    <button onClick={() => onAcao('desfazer')} className="h-11 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold" title="Desfazer">
      <span className="material-symbols-outlined text-[20px]">undo</span>
    </button>
  );
  if (embarque) {
    if (status === 'previsto' || status === 'ausente_avisado') return (
      <div className="flex gap-1.5">
        <button onClick={() => onAcao('nao_compareceu')} className="h-12 px-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-sm font-black">Não veio</button>
        <button onClick={() => onAcao('embarque')} className="h-12 px-4 rounded-xl bg-emerald-600 text-white text-sm font-black">Embarcou</button>
      </div>
    );
    if (status === 'embarcou') return <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-emerald-600">check_circle</span>{desfazer}</div>;
    if (status === 'nao_compareceu') return <div className="flex items-center gap-1.5"><span className="text-xs font-black text-slate-400">FALTOU</span>{desfazer}</div>;
    return <span className="material-symbols-outlined text-emerald-600">done_all</span>;
  }
  if (status === 'embarcou') return <button onClick={() => onAcao('desembarque')} className="h-12 px-4 rounded-xl bg-emerald-600 text-white text-sm font-black">Desceu</button>;
  if (status === 'desembarcou') return <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-emerald-600">done_all</span>{desfazer}</div>;
  return <span className="text-xs font-black text-slate-400">NÃO EMBARCOU</span>;
};

const OcorrenciaFolha: React.FC<{ aberta: boolean; onFechar: () => void; viagemId: number; presencas: Presenca[]; onEnviada: () => void }> = ({ aberta, onFechar, viagemId, presencas, onEnviada }) => {
  const [tipo, setTipo] = useState('atraso');
  const [alunoId, setAlunoId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => { if (aberta) { setTipo('atraso'); setAlunoId(''); setDescricao(''); setFoto(null); setErro(''); } }, [aberta]);
  const enviar = () => {
    if (!descricao.trim() && !foto) { setErro('Escreva o que aconteceu ou tire uma foto.'); return; }
    const pos = ultimaPosicao();
    enfileirar(`/api/motorista/viagens/${viagemId}/ocorrencias`, {
      uuid: novoId(), tipo, aluno_id: alunoId || null, descricao, foto, lat: pos?.lat, lng: pos?.lng, registrado_em: new Date().toISOString(),
    });
    onEnviada();
  };
  return (
    <Folha aberta={aberta} onFechar={onFechar} titulo="Registrar ocorrência">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(TIPOS_OCORRENCIA).filter(([k]) => k !== 'emergencia').map(([k, v]) => (
            <button key={k} onClick={() => setTipo(k)} className={`h-12 rounded-xl text-sm font-bold ${tipo === k ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{v}</button>
          ))}
        </div>
        <select value={alunoId} onChange={e => setAlunoId(e.target.value)} className="w-full h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border-none font-bold">
          <option value="">Nenhum aluno específico</option>
          {presencas.map(p => <option key={p.aluno_id} value={p.aluno_id}>{p.nome}</option>)}
        </select>
        <textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="O que aconteceu?" className="w-full min-h-24 rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3" />
        <label className="flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 font-bold cursor-pointer">
          <span className="material-symbols-outlined">photo_camera</span>{foto ? 'Trocar foto' : 'Tirar foto'}
          <input type="file" accept="image/*" capture="environment" className="hidden"
            onChange={async e => { const f = e.target.files?.[0]; if (f) setFoto(await reduzirFoto(f)); }} />
        </label>
        {foto && <img src={foto} alt="Foto da ocorrência" className="w-full max-h-56 object-contain rounded-xl" />}
        {erro && <p className="text-sm font-bold text-rose-600">{erro}</p>}
        <button onClick={enviar} className="w-full h-14 rounded-2xl bg-primary text-white text-lg font-black">Enviar</button>
      </div>
    </Folha>
  );
};

const EmergenciaFolha: React.FC<{ aberta: boolean; onFechar: () => void; viagemId: number; aBordo: Presenca[]; onFicha: (p: Presenca) => void }> = ({ aberta, onFechar, viagemId, aBordo, onFicha }) => {
  const [estado, setEstado] = useState<'pronto' | 'enviando' | 'enviado' | 'pendente' | 'erro'>('pronto');
  useEffect(() => { if (aberta) setEstado('pronto'); }, [aberta]);
  const disparar = async () => {
    setEstado('enviando');
    const pos = ultimaPosicao();
    const r = await enviarAgora(`/api/motorista/viagens/${viagemId}/emergencia`, {
      uuid: novoId(), lat: pos?.lat, lng: pos?.lng, descricao: 'Botão de emergência acionado pelo motorista', registrado_em: new Date().toISOString(),
    });
    setEstado(r.status === 'ok' ? 'enviado' : r.status === 'pendente' ? 'pendente' : 'erro');
  };
  return (
    <Folha aberta={aberta} onFechar={onFechar} titulo="Emergência">
      <div className="space-y-4">
        {estado === 'pronto' || estado === 'enviando' ? (
          <BotaoSegurar segundos={2} onConfirmar={disparar} desativado={estado === 'enviando'}
            className="w-full h-24 rounded-3xl bg-rose-600 text-white text-xl font-black">
            {estado === 'enviando' ? 'Enviando alerta...' : 'SEGURE PARA AVISAR A EMPRESA'}
          </BotaoSegurar>
        ) : (
          <div className={`rounded-2xl p-4 font-bold ${estado === 'enviado' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
            {estado === 'enviado' && 'Alerta enviado. A empresa está vendo sua localização.'}
            {estado === 'pendente' && 'Sem sinal: o alerta será enviado assim que houver conexão. Ligue para os números abaixo.'}
            {estado === 'erro' && 'Não foi possível enviar o alerta. Ligue para os números abaixo.'}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <a href="tel:192" className="h-16 rounded-2xl bg-slate-900 text-white font-black flex flex-col items-center justify-center"><span className="text-xl">192</span><span className="text-[10px]">SAMU</span></a>
          <a href="tel:193" className="h-16 rounded-2xl bg-slate-900 text-white font-black flex flex-col items-center justify-center"><span className="text-xl">193</span><span className="text-[10px]">Bombeiros</span></a>
          <a href="tel:190" className="h-16 rounded-2xl bg-slate-900 text-white font-black flex flex-col items-center justify-center"><span className="text-xl">190</span><span className="text-[10px]">Polícia</span></a>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">A bordo agora ({aBordo.length})</p>
          {aBordo.map(p => (
            <button key={p.aluno_id} onClick={() => onFicha(p)} className="w-full flex items-center gap-3 rounded-2xl bg-slate-100 dark:bg-slate-800 p-2.5 text-left">
              <AvatarAluno p={p} tamanho="size-10" />
              <span className="flex-1 font-bold">{p.nome}</span>
              {temAlertaSaude(p) && <span className="text-xs font-black text-rose-600">SAÚDE</span>}
              <span className="material-symbols-outlined text-slate-400">chevron_right</span>
            </button>
          ))}
          {aBordo.length === 0 && <p className="text-sm text-slate-500">Nenhum aluno a bordo.</p>}
        </div>
      </div>
    </Folha>
  );
};

const ITENS_VARREDURA = [
  'Percorri o corredor até o último banco',
  'Olhei embaixo e entre os bancos',
  'Não ficou nenhuma criança no veículo',
];

const FinalizarFolha: React.FC<{ aberta: boolean; onFechar: () => void; viagemId: number; aBordo: Presenca[]; onDesceu: (id: number) => void; onConcluida: (d: ViagemDetalhe | null) => void }> = ({ aberta, onFechar, viagemId, aBordo, onDesceu, onConcluida }) => {
  const [marcados, setMarcados] = useState<boolean[]>(ITENS_VARREDURA.map(() => false));
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (aberta) { setMarcados(ITENS_VARREDURA.map(() => false)); setMsg(''); } }, [aberta]);
  const pronto = aBordo.length === 0 && marcados.every(Boolean);
  const encerrar = async () => {
    setEnviando(true);
    setMsg('');
    const pos = ultimaPosicao();
    const r = await enviarAgora(`/api/motorista/viagens/${viagemId}/finalizar`, {
      uuid: novoId(), varredura_confirmada: true, lat: pos?.lat, lng: pos?.lng, registrado_em: new Date().toISOString(),
    });
    setEnviando(false);
    if (r.status === 'ok') onConcluida(r.dados);
    else if (r.status === 'pendente') onConcluida(null);
    else setMsg(r.mensagem);
  };
  return (
    <Folha aberta={aberta} onFechar={onFechar} titulo="Encerrar viagem">
      <div className="space-y-4">
        {aBordo.length > 0 && (
          <div className="rounded-2xl bg-rose-500/10 p-3 space-y-2">
            <p className="font-black text-rose-700 dark:text-rose-300">Ainda constam a bordo:</p>
            {aBordo.map(p => (
              <div key={p.aluno_id} className="flex items-center gap-3">
                <AvatarAluno p={p} tamanho="size-10" />
                <span className="flex-1 font-bold">{p.nome}</span>
                <button onClick={() => onDesceu(p.aluno_id)} className="h-11 px-4 rounded-xl bg-emerald-600 text-white font-black">Desceu</button>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Varredura obrigatória do veículo</p>
          {ITENS_VARREDURA.map((t, i) => (
            <label key={t} className={`flex items-center gap-3 rounded-2xl p-3 border-2 ${marcados[i] ? 'border-emerald-600 bg-emerald-500/10' : 'border-slate-200 dark:border-slate-700'}`}>
              <input type="checkbox" className="size-6" checked={marcados[i]} onChange={e => setMarcados(m => m.map((x, j) => (j === i ? e.target.checked : x)))} />
              <span className="font-bold">{t}</span>
            </label>
          ))}
        </div>
        {msg && <p className="text-sm font-bold text-rose-600">{msg}</p>}
        <BotaoSegurar segundos={3} onConfirmar={encerrar} desativado={!pronto || enviando}
          className="w-full h-16 rounded-2xl bg-emerald-600 text-white text-lg font-black">
          {enviando ? 'Encerrando...' : pronto ? 'SEGURE 3s PARA ENCERRAR' : 'Complete a varredura'}
        </BotaoSegurar>
      </div>
    </Folha>
  );
};
