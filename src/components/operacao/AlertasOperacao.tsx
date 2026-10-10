// Central de alertas de anomalia (van parada, sem sinal, desvio, velocidade, rota não encerrada) + configuração
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Campo, Modal, Selo, inputCls, erroDaResposta } from '../ui';

interface Alerta {
  id: number; viagem_id: number | null; rota_id: number | null; tipo: string; nivel: 'critico' | 'aviso'; mensagem: string;
  lat: number | null; lng: number | null; criado_em: string; atualizado_em: string; resolvido_em: string | null; resolvido_por: string | null;
  rota_nome: string | null; placa: string | null; motorista_nome: string | null; motorista_telefone: string | null;
}
const TIPO: Record<string, { label: string; icone: string }> = {
  parada: { label: 'Van parada', icone: 'front_hand' },
  sem_sinal: { label: 'Sem sinal', icone: 'signal_disconnected' },
  desvio: { label: 'Fora do trajeto', icone: 'alt_route' },
  velocidade: { label: 'Velocidade', icone: 'speed' },
  nao_encerrada: { label: 'Rota não encerrada', icone: 'running_with_errors' },
  atraso_previsto: { label: 'Atraso previsto na escola', icone: 'schedule' },
};
const quando = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`;

export const AlertasOperacao: React.FC<{ onAbrirRota: (rotaId: number) => void; onReplay: (viagemId: number, data: string) => void }> = ({ onAbrirRota, onReplay }) => {
  const [lista, setLista] = useState<Alerta[] | null>(null);
  const [todas, setTodas] = useState(false);
  const [config, setConfig] = useState(false);
  const carregar = () => apiFetch(`/api/operacao/anomalias${todas ? '?todas=1' : ''}`).then(r => r.json()).then(setLista).catch(() => setLista([]));
  useEffect(() => { carregar(); const t = setInterval(carregar, 20000); return () => clearInterval(t); }, [todas]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolver = async (id: number) => {
    await apiFetch(`/api/operacao/anomalias/${id}/resolver`, { method: 'PUT' });
    carregar();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-500 flex-1 min-w-[260px]">O sistema confere as vans a cada minuto. Alertas de parada, sinal e desvio se resolvem sozinhos quando a situação normaliza.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} /> Mostrar resolvidos (7 dias)</label>
        <Botao variante="secundario" icone="tune" onClick={() => setConfig(true)}>Configurar</Botao>
      </div>
      {!lista && <p className="text-center text-slate-400 animate-pulse py-8">Carregando...</p>}
      {lista?.length === 0 && <p className="text-center text-emerald-600 font-bold py-10">Nenhum alerta aberto. Tudo certo com as vans.</p>}
      <div className="space-y-2">
        {lista?.map(a => {
          const t = TIPO[a.tipo] || { label: a.tipo, icone: 'warning' };
          return (
            <div key={a.id} className={`rounded-xl border p-4 flex flex-wrap items-start gap-3 bg-white dark:bg-slate-900
              ${a.resolvido_em ? 'opacity-60 border-slate-200 dark:border-slate-800' : a.nivel === 'critico' ? 'border-rose-300 bg-rose-50/60 dark:bg-rose-900/10' : 'border-amber-300'}`}>
              <span className={`material-symbols-outlined text-3xl ${a.nivel === 'critico' ? 'text-rose-600' : 'text-amber-600'}`}>{t.icone}</span>
              <div className="flex-1 min-w-[240px]">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black">{t.label}</p>
                  <Selo cor={a.nivel === 'critico' ? 'vermelho' : 'amarelo'}>{a.nivel === 'critico' ? 'Crítico' : 'Aviso'}</Selo>
                  {a.resolvido_em && <Selo cor="verde">Resolvido {a.resolvido_por === 'automático' ? 'sozinho' : `por ${a.resolvido_por}`}</Selo>}
                </div>
                <p className="text-sm">{a.mensagem}</p>
                <p className="text-xs text-slate-500">{a.rota_nome || '—'} · {a.placa || ''} · {a.motorista_nome || ''} · desde {quando(a.criado_em)}{a.atualizado_em !== a.criado_em ? ` (atualizado ${a.atualizado_em.slice(11, 16)})` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {a.motorista_telefone && <a href={`tel:${a.motorista_telefone}`} className="h-8 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">call</span>Ligar</a>}
                {a.lat != null && <a href={`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center">Local</a>}
                {a.rota_id && !a.resolvido_em && <Botao variante="secundario" className="h-8 text-xs" onClick={() => onAbrirRota(a.rota_id!)}>Ver viagem</Botao>}
                {a.viagem_id && <Botao variante="secundario" className="h-8 text-xs" icone="replay" onClick={() => onReplay(a.viagem_id!, a.criado_em.slice(0, 10))}>Trajeto</Botao>}
                {!a.resolvido_em && <Botao className="h-8 text-xs" icone="check" onClick={() => resolver(a.id)}>Visto</Botao>}
              </div>
            </div>
          );
        })}
      </div>
      <ConfigAlertas aberto={config} onFechar={() => setConfig(false)} />
    </div>
  );
};

const ConfigAlertas: React.FC<{ aberto: boolean; onFechar: () => void }> = ({ aberto, onFechar }) => {
  const [c, setC] = useState<Record<string, any> | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (!aberto) return;
    setErro('');
    apiFetch('/api/operacao/config').then(r => r.json()).then(j => setC(j)).catch(() => setErro('Erro ao carregar'));
  }, [aberto]);
  const salvar = async () => {
    const r = await apiFetch('/api/operacao/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
    if (r.ok) onFechar(); else setErro(await erroDaResposta(r, 'Erro ao salvar'));
  };
  const campo = (k: string, label: string, dica?: string) => (
    <Campo label={label} dica={dica}>
      <input type="number" className={inputCls} value={c?.[k] ?? ''} onChange={e => setC({ ...c, [k]: e.target.value === '' ? '' : Number(e.target.value) })} aria-label={label} />
    </Campo>
  );
  return (
    <Modal titulo="Configurar alertas da operação" aberto={aberto} onFechar={onFechar} tamanho="md"
      rodape={<><Botao variante="secundario" onClick={onFechar}>Cancelar</Botao><Botao onClick={salvar}>Salvar</Botao></>}>
      {c && (
        <div className="space-y-4">
          <Campo label="WhatsApp para alertas" dica="Recebe os alertas importantes e o resumo diário de documentos vencendo. Deixe vazio para não receber.">
            <input className={inputCls} value={c.telefone_alertas || ''} onChange={e => setC({ ...c, telefone_alertas: e.target.value })} placeholder="(61) 99999-9999" aria-label="WhatsApp para alertas" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            {campo('velocidade_max_kmh', 'Velocidade máxima (km/h)')}
            {campo('parada_min', 'Parada fora do ponto (min)')}
            {campo('desvio_m', 'Desvio do trajeto (m)')}
            {campo('sem_sinal_min', 'Sem sinal após (min)')}
            {campo('fim_atrasado_min', 'Rota não encerrada (min após o fim)')}
          </div>
          {erro && <p className="text-sm text-rose-600 font-bold">{erro}</p>}
        </div>
      )}
    </Modal>
  );
};
