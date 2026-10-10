// Modal de criação/edição de rota
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Campo, Modal, inputCls, textareaCls, erroDaResposta } from '../ui';
import { Mapa } from '../mapa/Mapa';
import { RotaDetalhe, RotaResumo, TURNOS, Turno, TipoRota } from './tipos';

interface Veiculo { id: number; placa: string; modelo: string; capacidade: string; }
interface Motorista { id: number; nome: string; status?: string; }

interface Props {
  aberto: boolean;
  rota: RotaResumo | null;        // null = nova
  copiarDe?: RotaResumo | null;   // criar volta a partir de uma ida
  onFechar: () => void;
  onSalvo: (d: RotaDetalhe) => void;
}

const vazio = {
  nome: '', periodo: 'Manhã' as Turno, tipo: 'ida' as TipoRota, veiculo_id: '', motorista_id: '', monitor_id: '', hora_saida: '',
  partida_descricao: '', partida_lat: null as number | null, partida_lng: null as number | null,
  tempo_parada_seg: 60, velocidade_media_kmh: 25, folga_escola_min: 10, tempo_max_bordo_min: 60,
  status: 'Ativa' as 'Ativa' | 'Inativa', observacoes: '',
};

export const RotaForm: React.FC<Props> = ({ aberto, rota, copiarDe, onFechar, onSalvo }) => {
  const [f, setF] = useState(vazio);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [monitores, setMonitores] = useState<Motorista[]>([]);
  const [avancado, setAvancado] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErro('');
    Promise.all([apiFetch('/api/frota'), apiFetch('/api/motoristas')]).then(async ([v, m]) => {
      if (v.ok) setVeiculos(await v.json());
      if (m.ok) setMotoristas(await m.json());
    });
    apiFetch('/api/monitores').then(async r => r.ok && setMonitores((await r.json()).filter((x: Motorista) => x.status !== 'Inativo'))).catch(() => {});
    const base = rota || copiarDe;
    if (base) {
      setF({
        nome: rota ? base.nome : base.nome.replace(/\b[Ii]da\b/, 'Volta') + (/\b[Ii]da\b/.test(base.nome) ? '' : ' - Volta'),
        periodo: base.periodo, tipo: rota ? base.tipo : 'volta',
        veiculo_id: base.veiculo_id ? String(base.veiculo_id) : '', motorista_id: base.motorista_id ? String(base.motorista_id) : '',
        monitor_id: (base as any).monitor_id ? String((base as any).monitor_id) : '',
        hora_saida: rota ? base.hora_saida || '' : '',
        partida_descricao: base.partida_descricao || '', partida_lat: base.partida_lat, partida_lng: base.partida_lng,
        tempo_parada_seg: base.tempo_parada_seg, velocidade_media_kmh: base.velocidade_media_kmh,
        folga_escola_min: base.folga_escola_min, tempo_max_bordo_min: base.tempo_max_bordo_min,
        status: base.status, observacoes: rota ? base.observacoes || '' : '',
      });
    } else {
      setF(vazio);
    }
  }, [aberto, rota, copiarDe]);

  const salvar = async () => {
    if (!f.nome.trim()) { setErro('Informe o nome da rota.'); return; }
    setSalvando(true);
    setErro('');
    try {
      const corpo = { ...f, ...(copiarDe && !rota ? { copiar_alunos_de: copiarDe.id } : {}) };
      const res = await apiFetch(rota ? `/api/rotas/${rota.id}` : '/api/rotas', {
        method: rota ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) throw new Error(await erroDaResposta(res, 'Erro ao salvar rota'));
      onSalvo(await res.json());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const titulo = rota ? 'Editar rota' : copiarDe ? `Criar volta de "${copiarDe.nome}"` : 'Nova rota';

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo={titulo} tamanho="xl"
      rodape={<>
        {erro && <p className="text-sm text-rose-500 font-bold mr-auto self-center">{erro}</p>}
        <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao onClick={salvar} carregando={salvando}>Salvar</Botao>
      </>}>
      <div className="space-y-5">
        {copiarDe && !rota && (
          <p className="text-sm bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-lg p-3">
            Os alunos da ida serão copiados na ordem inversa (quem embarcou por último desce primeiro). Os pontos de encontro também são copiados.
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Campo label="Nome" className="col-span-2">
            <input className={inputCls} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Guará Manhã - Ida" />
          </Campo>
          <Campo label="Turno">
            <select className={inputCls} value={f.periodo} onChange={e => setF({ ...f, periodo: e.target.value as Turno })}>
              {TURNOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo label="Sentido">
            <select className={inputCls} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as TipoRota })}>
              <option value="ida">Ida (casa → escola)</option>
              <option value="volta">Volta (escola → casa)</option>
            </select>
          </Campo>
          <Campo label="Veículo" className="col-span-2" dica="O mesmo veículo pode fazer várias viagens por dia, desde que os horários não se sobreponham.">
            <select className={inputCls} value={f.veiculo_id} onChange={e => setF({ ...f, veiculo_id: e.target.value })}>
              <option value="">Sem veículo</option>
              {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.modelo} ({v.capacidade})</option>)}
            </select>
          </Campo>
          <Campo label="Motorista" className="col-span-2">
            <select className={inputCls} value={f.motorista_id} onChange={e => setF({ ...f, motorista_id: e.target.value })}>
              <option value="">Sem motorista</option>
              {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Monitor(a)" className="col-span-2" dica="Quem acompanha as crianças na van (opcional). Cadastre em Documentos → Monitores.">
            <select className={inputCls} value={f.monitor_id} onChange={e => setF({ ...f, monitor_id: e.target.value })} aria-label="Monitor">
              <option value="">Sem monitor</option>
              {monitores.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Horário de saída" dica={f.tipo === 'ida' ? 'Deixe vazio para o sistema sugerir.' : 'Normalmente perto da saída da escola.'}>
            <input type="time" className={inputCls} value={f.hora_saida} onChange={e => setF({ ...f, hora_saida: e.target.value })} />
          </Campo>
          <Campo label="Status">
            <select className={inputCls} value={f.status} onChange={e => setF({ ...f, status: e.target.value as 'Ativa' | 'Inativa' })}>
              <option value="Ativa">Ativa</option>
              <option value="Inativa">Inativa</option>
            </select>
          </Campo>
          <Campo label="Ponto de partida (garagem)" className="col-span-2">
            <input className={inputCls} value={f.partida_descricao} onChange={e => setF({ ...f, partida_descricao: e.target.value })} placeholder="Ex.: Garagem - casa do motorista" />
          </Campo>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Local de partida no mapa (opcional) — clique para marcar</p>
          <Mapa
            className="h-56"
            chaveEnquadramento={aberto ? (rota?.id ?? copiarDe?.id ?? 'novo') : 'fechado'}
            marcadores={f.partida_lat !== null && f.partida_lng !== null ? [{ id: 'partida', lat: f.partida_lat, lng: f.partida_lng, tipo: 'partida', arrastavel: true, titulo: 'Partida' }] : []}
            onClique={(lat, lng) => setF(x => ({ ...x, partida_lat: +lat.toFixed(7), partida_lng: +lng.toFixed(7) }))}
            onArrastar={(_, lat, lng) => setF(x => ({ ...x, partida_lat: +lat.toFixed(7), partida_lng: +lng.toFixed(7) }))}
          />
          {f.partida_lat !== null && (
            <button className="text-xs font-bold text-slate-400 hover:text-rose-500" onClick={() => setF({ ...f, partida_lat: null, partida_lng: null })}>Remover ponto de partida</button>
          )}
        </div>

        <button className="text-sm font-bold text-primary flex items-center gap-1" onClick={() => setAvancado(!avancado)}>
          <span className="material-symbols-outlined text-[18px]">{avancado ? 'expand_less' : 'tune'}</span>
          Parâmetros do cálculo
        </button>
        {avancado && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Campo label="Parada por aluno (seg)" dica="Tempo para embarcar/desembarcar">
              <input type="number" min={0} max={900} className={inputCls} value={f.tempo_parada_seg} onChange={e => setF({ ...f, tempo_parada_seg: Number(e.target.value) })} />
            </Campo>
            <Campo label="Velocidade média (km/h)" dica="Usada quando não há rota por ruas">
              <input type="number" min={5} max={90} className={inputCls} value={f.velocidade_media_kmh} onChange={e => setF({ ...f, velocidade_media_kmh: Number(e.target.value) })} />
            </Campo>
            <Campo label="Folga na escola (min)" dica="Chegar antes da entrada">
              <input type="number" min={0} max={60} className={inputCls} value={f.folga_escola_min} onChange={e => setF({ ...f, folga_escola_min: Number(e.target.value) })} />
            </Campo>
            <Campo label="Máx. a bordo (min)" dica="Alerta se uma criança passar disso">
              <input type="number" min={10} max={240} className={inputCls} value={f.tempo_max_bordo_min} onChange={e => setF({ ...f, tempo_max_bordo_min: Number(e.target.value) })} />
            </Campo>
          </div>
        )}
        <Campo label="Observações">
          <textarea className={textareaCls} value={f.observacoes} onChange={e => setF({ ...f, observacoes: e.target.value })} />
        </Campo>
      </div>
    </Modal>
  );
};
