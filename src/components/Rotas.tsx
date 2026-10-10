// Tela de Rotas: lista de rotas reais, detalhe com mapa, agenda da frota e restrições.
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import { Abas, Botao, Selo, erroDaResposta } from './ui';
import { RotaDetalhe } from './rotas/RotaDetalhe';
import { RotaForm } from './rotas/RotaForm';
import { AdicionarAlunos } from './rotas/AdicionarAlunos';
import { AgendaFrota } from './rotas/AgendaFrota';
import { PontosRestricoes } from './rotas/PontosRestricoes';
import { SimularAluno } from './rotas/SimularAluno';
import { AreaRestrita, PontoEncontro, RotaDetalhe as Detalhe, RotaResumo, TURNOS, Turno } from './rotas/tipos';

export const Rotas: React.FC = () => {
  const [aba, setAba] = useState<'rotas' | 'agenda' | 'restricoes'>('rotas');
  const [simular, setSimular] = useState(false);
  const [rotas, setRotas] = useState<RotaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<Turno | 'todas'>('todas');
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [pontos, setPontos] = useState<PontoEncontro[]>([]);
  const [areas, setAreas] = useState<AreaRestrita[]>([]);
  const [form, setForm] = useState<{ aberto: boolean; rota: RotaResumo | null; copiarDe: RotaResumo | null }>({ aberto: false, rota: null, copiarDe: null });
  const [adicionando, setAdicionando] = useState(false);

  const carregarRotas = useCallback(async () => {
    const res = await apiFetch('/api/rotas');
    if (res.ok) setRotas(await res.json());
    setCarregando(false);
  }, []);

  const carregarRestricoes = useCallback(async () => {
    const [p, a] = await Promise.all([apiFetch('/api/pontos-encontro'), apiFetch('/api/areas-restritas')]);
    if (p.ok) setPontos(await p.json());
    if (a.ok) setAreas(await a.json());
  }, []);

  useEffect(() => { carregarRotas(); carregarRestricoes(); }, [carregarRotas, carregarRestricoes]);

  // seleciona a primeira rota ao abrir
  useEffect(() => {
    if (selecionada === null && rotas.length) setSelecionada(rotas[0].id);
  }, [rotas, selecionada]);

  useEffect(() => {
    if (selecionada === null) { setDetalhe(null); return; }
    let cancelado = false;
    setCarregandoDetalhe(true);
    apiFetch(`/api/rotas/${selecionada}`)
      .then(async r => (r.ok ? r.json() : Promise.reject(new Error(await erroDaResposta(r, 'Erro ao carregar rota')))))
      .then(d => { if (!cancelado) setDetalhe(d); })
      .catch(() => { if (!cancelado) setDetalhe(null); })
      .finally(() => { if (!cancelado) setCarregandoDetalhe(false); });
    return () => { cancelado = true; };
  }, [selecionada]);

  const atualizar = (d: Detalhe) => {
    setDetalhe(d);
    setSelecionada(d.rota.id);
    carregarRotas();
  };

  const abrirRota = (id: number) => { setAba('rotas'); setSelecionada(id); };

  const excluir = async () => {
    if (!detalhe || !confirm(`Excluir a rota "${detalhe.rota.nome}"? Os alunos não são apagados, só saem da rota.`)) return;
    const res = await apiFetch(`/api/rotas/${detalhe.rota.id}`, { method: 'DELETE' });
    if (!res.ok) { alert(await erroDaResposta(res, 'Erro ao excluir')); return; }
    setSelecionada(null);
    setDetalhe(null);
    carregarRotas();
  };

  const lista = rotas.filter(r => filtro === 'todas' || r.periodo === filtro);

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight">Rotas</h2>
          <p className="text-slate-500 dark:text-slate-400">Monte as rotas no mapa, defina a ordem das paradas e confira horários, lotação e conflitos.</p>
        </div>
        <div className="flex gap-2">
          <Botao variante="secundario" icone="person_add" onClick={() => setSimular(true)}>Simular aluno novo</Botao>
          <Botao icone="add_road" onClick={() => setForm({ aberto: true, rota: null, copiarDe: null })}>Nova rota</Botao>
        </div>
      </div>

      <Abas ativa={aba} onTrocar={id => setAba(id as typeof aba)} abas={[
        { id: 'rotas', label: 'Rotas', icone: 'route' },
        { id: 'agenda', label: 'Agenda da frota', icone: 'view_timeline' },
        { id: 'restricoes', label: 'Pontos e restrições', icone: 'hail' },
      ]} />

      {aba === 'agenda' && <AgendaFrota onAbrirRota={abrirRota} />}
      {aba === 'restricoes' && <PontosRestricoes pontos={pontos} areas={areas} onMudou={carregarRestricoes} />}

      {aba === 'rotas' && (
        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
          <aside className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {(['todas', ...TURNOS] as const).map(t => (
                <button key={t} onClick={() => setFiltro(t)}
                  className={`px-3 h-8 rounded-lg text-xs font-bold ${filtro === t ? 'bg-primary text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500'}`}>
                  {t === 'todas' ? 'Todas' : t}
                </button>
              ))}
            </div>
            {carregando && <p className="text-sm text-slate-400">Carregando...</p>}
            {!carregando && lista.length === 0 && (
              <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-sm text-slate-400">
                Nenhuma rota{filtro !== 'todas' ? ` no turno ${filtro}` : ''}. Clique em “Nova rota”.
              </div>
            )}
            {lista.map(r => {
              const lotada = !!r.lugares && (r.total_alunos || 0) > r.lugares;
              return (
                <button key={r.id} onClick={() => setSelecionada(r.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${selecionada === r.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'} ${r.status === 'Inativa' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-black text-sm leading-tight">{r.nome}</p>
                    <Selo cor={r.tipo === 'ida' ? 'verde' : 'roxo'}>{r.tipo}</Selo>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {r.periodo} · {r.hora_saida ? `${r.hora_saida}${r.hora_fim ? `–${r.hora_fim}` : ''}` : 'sem horário'}
                  </p>
                  <p className="text-xs text-slate-500">{r.placa || 'sem veículo'} · {r.motorista_nome || 'sem motorista'}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Selo cor={lotada ? 'vermelho' : 'cinza'} icone="groups">{r.total_alunos || 0}{r.lugares ? `/${r.lugares}` : ''}</Selo>
                    {!!r.alunos_sem_local && <Selo cor="amarelo" icone="location_off">{r.alunos_sem_local} sem local</Selo>}
                    {r.status === 'Inativa' && <Selo>Inativa</Selo>}
                  </div>
                </button>
              );
            })}
          </aside>

          <section className="min-w-0">
            {carregandoDetalhe && !detalhe && <p className="p-8 text-center font-bold text-slate-400">Carregando rota...</p>}
            {!carregandoDetalhe && !detalhe && !carregando && rotas.length > 0 && (
              <p className="p-8 text-center text-slate-400">Selecione uma rota.</p>
            )}
            {detalhe && (
              <div className={carregandoDetalhe ? 'opacity-60' : ''}>
                <RotaDetalhe
                  detalhe={detalhe}
                  pontos={pontos}
                  areas={areas}
                  onAtualizar={atualizar}
                  onEditar={() => setForm({ aberto: true, rota: detalhe.rota, copiarDe: null })}
                  onCriarVolta={() => setForm({ aberto: true, rota: null, copiarDe: detalhe.rota })}
                  onExcluir={excluir}
                  onAdicionarAlunos={() => setAdicionando(true)}
                  onAbrirRota={abrirRota}
                />
              </div>
            )}
          </section>
        </div>
      )}

      <SimularAluno aberto={simular} onFechar={() => setSimular(false)} />
      <RotaForm
        aberto={form.aberto}
        rota={form.rota}
        copiarDe={form.copiarDe}
        onFechar={() => setForm({ aberto: false, rota: null, copiarDe: null })}
        onSalvo={d => { setForm({ aberto: false, rota: null, copiarDe: null }); atualizar(d); }}
      />
      {detalhe && (
        <AdicionarAlunos aberto={adicionando} detalhe={detalhe} onFechar={() => setAdicionando(false)}
          onSalvo={d => { setAdicionando(false); atualizar(d); }} />
      )}
    </div>
  );
};
