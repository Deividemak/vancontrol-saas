// App do motorista (celular): rotas do dia, checklist de saída e viagem.
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import { ViagemTela } from './ViagemTela';
import { Folha } from './componentes';
import { lerCache, salvarCache, novoId, useFila } from './offline';
import { ultimaPosicao } from './gps';
import { Hoje, RotaHoje, ViagemDetalhe } from './tipos';

const ITENS = [
  { campo: 'pneus', label: 'Pneus calibrados e sem danos', icone: 'tire_repair' },
  { campo: 'freios', label: 'Freios', icone: 'do_not_step' },
  { campo: 'cintos', label: 'Cintos de segurança funcionando', icone: 'airline_seat_recline_normal' },
  { campo: 'extintor', label: 'Extintor e kit de primeiros socorros', icone: 'fire_extinguisher' },
  { campo: 'luzes', label: 'Faróis, setas e luz de freio', icone: 'emoji_objects' },
  { campo: 'oleo', label: 'Nível de óleo e água', icone: 'oil_barrel' },
  { campo: 'limpeza', label: 'Veículo limpo e portas travando', icone: 'cleaning_services' },
] as const;

interface Props { usuario: { nome: string }; onSair: () => void; }

export const MotoristaApp: React.FC<Props> = ({ usuario, onSair }) => {
  const [hoje, setHoje] = useState<Hoje | null>(() => lerCache<Hoje>('hoje'));
  const [erro, setErro] = useState('');
  const [viagemAberta, setViagemAberta] = useState<number | null>(() => lerCache<number>('viagem_aberta'));
  const [checklistDe, setChecklistDe] = useState<RotaHoje | null>(null);
  const [iniciando, setIniciando] = useState<number | null>(null);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const fila = useFila();

  const carregar = useCallback(async () => {
    try {
      const res = await apiFetch('/api/motorista/hoje');
      const j = await res.json();
      if (!res.ok) { setErro(j.error || 'Erro ao carregar'); return; }
      setHoje(j);
      salvarCache('hoje', j);
      setErro('');
    } catch {
      setErro('Sem sinal. Mostrando os dados salvos no aparelho.');
    }
  }, []);

  useEffect(() => { if (viagemAberta === null) carregar(); }, [carregar, viagemAberta]);
  useEffect(() => { salvarCache('viagem_aberta', viagemAberta); }, [viagemAberta]);

  const iniciar = async (rota: RotaHoje, checklist?: Record<string, string>) => {
    setIniciando(rota.id);
    setErro('');
    const pos = ultimaPosicao();
    try {
      const res = await apiFetch('/api/motorista/viagens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rota_id: rota.id, uuid: novoId(), checklist, lat: pos?.lat, lng: pos?.lng, registrado_em: new Date().toISOString() }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (/checklist/i.test(j.error || '')) setChecklistDe(rota);
        else setErro(j.error || 'Erro ao iniciar');
        return;
      }
      const d = j as ViagemDetalhe;
      salvarCache(`viagem_${d.viagem.id}`, d);
      // atualiza a lista salva no aparelho: sem sinal, ela precisa mostrar "Continuar viagem"
      setHoje(h => {
        if (!h) return h;
        const novo = { ...h, rotas: h.rotas.map(x => (x.id === rota.id ? { ...x, checklist_feito: true, viagem: { id: d.viagem.id, status: d.viagem.status, resumo: d.resumo } } : x)) };
        salvarCache('hoje', novo);
        return novo;
      });
      setChecklistDe(null);
      setViagemAberta(d.viagem.id);
    } catch {
      setErro('Sem sinal. Para iniciar a viagem é preciso internet (depois o app funciona sem sinal).');
    } finally {
      setIniciando(null);
    }
  };

  const monitor = hoje?.papel === 'monitor';
  if (viagemAberta !== null) return <ViagemTela viagemId={viagemAberta} monitor={monitor} onVoltar={() => setViagemAberta(null)} />;

  const dataBR = hoje ? new Date(`${hoje.data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : '';

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-background-dark">
      <header className="bg-slate-900 text-white px-4 pt-5 pb-6 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest opacity-70">VanControl · {monitor ? 'Monitor' : 'Motorista'}</p>
          <div className="flex gap-2">
            <button onClick={() => setSenhaAberta(true)} className="size-10 rounded-full bg-white/10 flex items-center justify-center" aria-label="Trocar senha"><span className="material-symbols-outlined">key</span></button>
            <button onClick={onSair} className="size-10 rounded-full bg-white/10 flex items-center justify-center" aria-label="Sair"><span className="material-symbols-outlined">logout</span></button>
          </div>
        </div>
        <h1 className="text-2xl font-black">Olá, {(hoje?.motorista.nome || usuario.nome).split(' ')[0]}</h1>
        <p className="text-sm opacity-80 capitalize">{dataBR}</p>
        <p className={`text-xs ${fila.online ? 'text-emerald-300' : 'text-amber-300'}`}>{fila.online ? 'Online' : 'Sem sinal'}{fila.pendentes ? ` · ${fila.pendentes} registro(s) aguardando envio` : ''}</p>
      </header>

      <main className="p-4 space-y-3 -mt-3">
        {erro && <p className="rounded-2xl bg-amber-500/15 text-amber-800 dark:text-amber-200 p-3 text-sm font-medium">{erro}</p>}
        {hoje?.calendario.sem_aula_todas && (
          <p className="rounded-2xl bg-blue-500/10 text-blue-800 dark:text-blue-200 p-3 text-sm font-bold">Hoje não tem aula ({hoje.calendario.motivo}).</p>
        )}
        {!hoje && !erro && <p className="text-center py-10 font-bold text-slate-400">Carregando...</p>}
        {hoje && hoje.rotas.length === 0 && (
          <p className="rounded-2xl bg-white dark:bg-slate-900 p-6 text-center text-slate-500">Nenhuma rota atribuída a você. Fale com a empresa.</p>
        )}
        {hoje?.rotas.map(r => {
          const v = r.viagem;
          return (
            <div key={r.id} className={`rounded-3xl bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3 ${!r.tem_aula && !v ? 'opacity-70' : ''}`}>
              <div className="flex items-start gap-3">
                <span className={`size-12 rounded-2xl flex items-center justify-center text-white ${r.tipo === 'ida' ? 'bg-emerald-600' : 'bg-indigo-600'}`}>
                  <span className="material-symbols-outlined">{r.tipo === 'ida' ? 'school' : 'home'}</span>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-black leading-tight">{r.nome}</p>
                  <p className="text-sm text-slate-500">{r.tipo === 'ida' ? 'Ida' : 'Volta'} · {r.periodo} · saída {r.hora_saida || '--:--'}</p>
                  <p className="text-sm text-slate-500">{r.placa || 'sem veículo'} · {r.total_alunos} aluno(s){r.substituicao && <span className="ml-1 text-indigo-600 font-bold">· substituição</span>}</p>
                </div>
              </div>
              {v?.status === 'concluida' ? (
                <button onClick={() => setViagemAberta(v.id)} className="w-full h-12 rounded-2xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 font-black flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined">task_alt</span>Concluída
                </button>
              ) : v ? (
                <button onClick={() => setViagemAberta(v.id)} className="w-full h-14 rounded-2xl bg-primary text-white text-lg font-black">
                  Continuar viagem · {v.resumo?.embarcou || 0} a bordo
                </button>
              ) : monitor ? (
                <p className="w-full rounded-2xl bg-slate-100 dark:bg-slate-800 p-3 text-center text-sm font-bold text-slate-500">
                  {r.tem_aula ? 'Aguardando o motorista iniciar a viagem' : 'Sem aula hoje nas escolas desta rota.'}
                </p>
              ) : (
                <>
                  {!r.tem_aula && <p className="text-sm font-bold text-slate-500">Sem aula hoje nas escolas desta rota.</p>}
                  <button disabled={iniciando === r.id}
                    onClick={() => (r.checklist_feito ? iniciar(r) : setChecklistDe(r))}
                    className={`w-full h-14 rounded-2xl text-lg font-black disabled:opacity-50 ${r.tem_aula ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>
                    {iniciando === r.id ? 'Iniciando...' : r.checklist_feito ? 'Iniciar viagem' : 'Checklist e iniciar'}
                  </button>
                </>
              )}
            </div>
          );
        })}
        <button onClick={carregar} className="w-full h-12 rounded-2xl text-slate-500 font-bold flex items-center justify-center gap-2">
          <span className="material-symbols-outlined">refresh</span>Atualizar
        </button>
      </main>

      <ChecklistFolha rota={checklistDe} onFechar={() => setChecklistDe(null)} enviando={iniciando !== null} onConfirmar={(r, ck) => iniciar(r, ck)} />
      <TrocarSenha aberta={senhaAberta} onFechar={() => setSenhaAberta(false)} />
    </div>
  );
};

const ChecklistFolha: React.FC<{ rota: RotaHoje | null; onFechar: () => void; enviando: boolean; onConfirmar: (r: RotaHoje, ck: Record<string, string>) => void }> = ({ rota, onFechar, enviando, onConfirmar }) => {
  const [valores, setValores] = useState<Record<string, 'ok' | 'error' | ''>>({});
  const [obs, setObs] = useState('');
  useEffect(() => { if (rota) { setValores({}); setObs(''); } }, [rota]);
  const completo = ITENS.every(i => valores[i.campo]);
  const problemas = ITENS.filter(i => valores[i.campo] === 'error');
  return (
    <Folha aberta={!!rota} onFechar={onFechar} titulo={`Checklist · ${rota?.placa || ''}`}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Confira o veículo antes de sair. Fica registrado para a empresa.</p>
        {ITENS.map(i => (
          <div key={i.campo} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
            <p className="font-bold flex items-center gap-2"><span className="material-symbols-outlined text-slate-400">{i.icone}</span>{i.label}</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setValores(v => ({ ...v, [i.campo]: 'ok' }))} className={`h-11 rounded-xl font-black ${valores[i.campo] === 'ok' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>OK</button>
              <button onClick={() => setValores(v => ({ ...v, [i.campo]: 'error' }))} className={`h-11 rounded-xl font-black ${valores[i.campo] === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>Problema</button>
            </div>
          </div>
        ))}
        {problemas.length > 0 && (
          <textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Descreva o problema" className="w-full min-h-20 rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3" />
        )}
        {problemas.length > 0 && (
          <p className="text-sm font-bold text-rose-600">Problema em: {problemas.map(p => p.label).join(', ')}. Se não for seguro sair, avise a empresa.</p>
        )}
        <button disabled={!completo || enviando || (problemas.length > 0 && !obs.trim())}
          onClick={() => rota && onConfirmar(rota, { ...valores, observacoes: obs } as Record<string, string>)}
          className="w-full h-14 rounded-2xl bg-primary text-white text-lg font-black disabled:opacity-40">
          {enviando ? 'Iniciando...' : completo ? 'Confirmar e iniciar viagem' : 'Marque todos os itens'}
        </button>
      </div>
    </Folha>
  );
};

const TrocarSenha: React.FC<{ aberta: boolean; onFechar: () => void }> = ({ aberta, onFechar }) => {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { if (aberta) { setAtual(''); setNova(''); setMsg(''); } }, [aberta]);
  const salvar = async () => {
    const res = await apiFetch('/api/auth/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senhaAtual: atual, novaSenha: nova }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) onFechar(); else setMsg(j.error || 'Erro ao trocar senha');
  };
  return (
    <Folha aberta={aberta} onFechar={onFechar} titulo="Trocar senha">
      <div className="space-y-3">
        <input type="password" value={atual} onChange={e => setAtual(e.target.value)} placeholder="Senha atual" className="w-full h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border-none px-4" />
        <input type="password" value={nova} onChange={e => setNova(e.target.value)} placeholder="Nova senha (mín. 8)" className="w-full h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border-none px-4" />
        {msg && <p className="text-sm font-bold text-rose-600">{msg}</p>}
        <button onClick={salvar} className="w-full h-12 rounded-xl bg-primary text-white font-black">Salvar</button>
      </div>
    </Folha>
  );
};
