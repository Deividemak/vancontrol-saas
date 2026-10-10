// Histórico e replay do trajeto de qualquer viagem
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Selo, inputCls } from '../ui';
import { Mapa, MarcadorMapa } from '../mapa/Mapa';

interface Pos { lat: number; lng: number; vel: number | null; em: string; }
interface Trajeto {
  viagem: { id: number; rota_nome: string; data: string; placa: string | null; motorista_nome: string | null; status: string; iniciada_em: string | null; concluida_em: string | null };
  posicoes: Pos[];
  eventos: { tipo: string; lat: number | null; lng: number | null; aluno_nome: string | null; em: string }[];
  planejado: { lat: number; lng: number; tipo: string; nome: string; chegada: string | null }[];
  paradas_longas: { lat: number; lng: number; inicio: string; minutos: number }[];
  alertas: { tipo: string; nivel: string; mensagem: string; lat: number | null; lng: number | null; em: string }[];
  resumo: { km: number; velocidade_max: number; duracao_min: number; pontos: number };
}
interface LinhaDia { rota_id: number; rota_nome: string; viagem_id: number | null; placa: string | null; motorista_nome: string | null; iniciada: string | null; concluida: string | null; situacao: string; }

const ROTULO: Record<string, string> = {
  inicio: 'Saiu', chegada_parada: 'Chegou na parada', embarque: 'Embarcou', desembarque: 'Desceu', nao_compareceu: 'Não compareceu',
  desfazer: 'Correção', ocorrencia: 'Ocorrência', emergencia: 'EMERGÊNCIA', varredura: 'Varredura', fim: 'Encerrou',
};
const hora = (iso: string) => iso.slice(11, 19);
const ontem = () => { const d = new Date(Date.now() - 86400000 - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); };

export const Historico: React.FC<{ dataInicial?: string; viagemInicial?: number | null }> = ({ dataInicial, viagemInicial }) => {
  const [data, setData] = useState(dataInicial || ontem());
  const [linhas, setLinhas] = useState<LinhaDia[]>([]);
  const [viagemId, setViagemId] = useState<number | null>(viagemInicial ?? null);
  const [t, setT] = useState<Trajeto | null>(null);
  const [idx, setIdx] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [veloc, setVeloc] = useState(30);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    apiFetch(`/api/operacao/dia?data=${data}`).then(r => r.json()).then(j => setLinhas((j.viagens || []).filter((l: LinhaDia) => l.viagem_id))).catch(() => setLinhas([]));
  }, [data]);
  useEffect(() => {
    setT(null); setIdx(0); setTocando(false);
    if (!viagemId) return;
    apiFetch(`/api/operacao/viagens/${viagemId}/trajeto`).then(r => r.json()).then((j: Trajeto) => { setT(j); setIdx(Math.max(0, j.posicoes.length - 1)); });
  }, [viagemId]);

  // replay: avança no tempo real × velocidade escolhida
  useEffect(() => {
    if (!tocando || !t) return;
    const inicio = performance.now();
    const t0 = Date.parse(t.posicoes[idx]?.em || t.posicoes[0].em);
    const base = idx;
    const passo = () => {
      const alvo = t0 + (performance.now() - inicio) * veloc;
      let i = base;
      while (i < t.posicoes.length - 1 && Date.parse(t.posicoes[i + 1].em) <= alvo) i++;
      setIdx(i);
      if (i >= t.posicoes.length - 1) { setTocando(false); return; }
      ref.current = requestAnimationFrame(passo);
    };
    ref.current = requestAnimationFrame(passo);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [tocando, veloc]); // eslint-disable-line react-hooks/exhaustive-deps

  const atual = t?.posicoes[idx];
  const percorrido = useMemo(() => (t ? t.posicoes.slice(0, idx + 1).map(p => [p.lat, p.lng] as [number, number]) : []), [t, idx]);
  const marcadores = useMemo<MarcadorMapa[]>(() => {
    if (!t) return [];
    const ms: MarcadorMapa[] = t.planejado.filter(p => p.tipo !== 'partida').map((p, i) => ({
      id: `p${i}`, lat: p.lat, lng: p.lng, tipo: p.tipo === 'escola' ? 'escola' : 'embarque', rotulo: p.tipo === 'escola' ? undefined : String(i + 1),
      titulo: `${p.nome}${p.chegada ? `\nPrevisto ${p.chegada}` : ''}`, apagado: true,
    }));
    for (const [i, p] of t.paradas_longas.entries()) ms.push({ id: `pl${i}`, lat: p.lat, lng: p.lng, tipo: 'pin', cor: '#2563eb', titulo: `Parada de ${p.minutos} min às ${hora(p.inicio)}` });
    for (const [i, a] of t.alertas.entries()) if (a.lat != null) ms.push({ id: `a${i}`, lat: a.lat, lng: a.lng!, tipo: 'pin', cor: a.nivel === 'critico' ? '#e11d48' : '#d97706', titulo: `${hora(a.em)} · ${a.mensagem}` });
    if (atual) ms.push({ id: 'van', lat: atual.lat, lng: atual.lng, tipo: 'van', destaque: true, titulo: `${hora(atual.em)}${atual.vel != null ? ` · ${Math.round(atual.vel)} km/h` : ''}` });
    return ms;
  }, [t, atual]);

  const pular = (em: string) => {
    if (!t) return;
    const alvo = Date.parse(em);
    let i = 0;
    while (i < t.posicoes.length - 1 && Date.parse(t.posicoes[i + 1].em) <= alvo) i++;
    setTocando(false); setIdx(i);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" className={`${inputCls} !h-10 w-44`} value={data} onChange={e => { setData(e.target.value); setViagemId(null); }} aria-label="Data do histórico" />
        <select className={`${inputCls} !h-10 max-w-sm`} value={viagemId ?? ''} onChange={e => setViagemId(e.target.value ? Number(e.target.value) : null)} aria-label="Viagem">
          <option value="">{linhas.length ? 'Escolha a viagem...' : 'Nenhuma viagem neste dia'}</option>
          {linhas.map(l => <option key={l.viagem_id!} value={l.viagem_id!}>{l.rota_nome} · {l.iniciada || '--:--'}{l.concluida ? `–${l.concluida}` : ''} · {l.placa || ''} {l.motorista_nome || ''}</option>)}
        </select>
      </div>
      {viagemId && !t && <p className="text-slate-400 animate-pulse">Carregando trajeto...</p>}
      {t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[['Distância', `${t.resumo.km.toLocaleString('pt-BR')} km`], ['Duração', `${t.resumo.duracao_min} min`], ['Velocidade máxima', `${t.resumo.velocidade_max} km/h`], ['Paradas longas', String(t.paradas_longas.length)]].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{l}</p><p className="text-xl font-black">{v}</p>
              </div>
            ))}
          </div>
          {t.posicoes.length < 2 ? <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">Esta viagem não tem posições de GPS registradas.</p> : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex flex-wrap items-center gap-3">
              <Botao className="h-9" icone={tocando ? 'pause' : 'play_arrow'} onClick={() => { if (!tocando && idx >= t.posicoes.length - 1) setIdx(0); setTocando(!tocando); }}>{tocando ? 'Pausar' : 'Reproduzir'}</Botao>
              <select className={`${inputCls} !h-9 w-24`} value={veloc} onChange={e => setVeloc(Number(e.target.value))} aria-label="Velocidade do replay">
                {[10, 30, 60, 120].map(v => <option key={v} value={v}>{v}×</option>)}
              </select>
              <input type="range" min={0} max={t.posicoes.length - 1} value={idx} onChange={e => { setTocando(false); setIdx(Number(e.target.value)); }} className="flex-1 min-w-[200px]" aria-label="Linha do tempo" />
              <span className="font-mono font-black text-sm w-20 text-right">{atual ? hora(atual.em) : ''}</span>
              {atual?.vel != null && <Selo cor={atual.vel > 80 ? 'vermelho' : 'cinza'}>{Math.round(atual.vel)} km/h</Selo>}
            </div>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
            <Mapa className="h-[520px]" marcadores={marcadores} chaveEnquadramento={t.viagem.id}
              linhas={[
                { pontos: t.posicoes.map(p => [p.lat, p.lng]), cor: '#94a3b8', espessura: 4 },
                { pontos: percorrido, cor: '#137fec', espessura: 5 },
              ]} />
            <aside className="space-y-1 max-h-[520px] overflow-y-auto text-sm">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Linha do tempo</p>
              {[...t.eventos.map(e => ({ em: e.em, txt: `${ROTULO[e.tipo] || e.tipo}${e.aluno_nome ? ` · ${e.aluno_nome}` : ''}`, cor: e.tipo === 'emergencia' ? 'text-rose-600' : '' })),
                ...t.alertas.map(a => ({ em: a.em, txt: `⚠ ${a.mensagem}`, cor: a.nivel === 'critico' ? 'text-rose-600' : 'text-amber-600' })),
                ...t.paradas_longas.map(p => ({ em: p.inicio, txt: `Parada de ${p.minutos} min`, cor: 'text-blue-600' }))]
                .sort((a, b) => a.em.localeCompare(b.em))
                .map((e, i) => (
                  <button key={i} onClick={() => pular(e.em)} className={`w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 ${e.cor}`}>
                    <span className="font-mono text-xs text-slate-400 mr-2">{hora(e.em).slice(0, 5)}</span>{e.txt}
                  </button>
                ))}
            </aside>
          </div>
        </>
      )}
    </div>
  );
};
