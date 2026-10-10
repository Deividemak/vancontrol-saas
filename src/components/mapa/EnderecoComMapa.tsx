// Formulário de endereço com busca por CEP, geocodificação e pino arrastável.
import React, { useState } from 'react';
import { Mapa } from './Mapa';
import { Campo, inputCls, Botao, Selo } from '../ui';
import { Endereco, buscarCep, geocodificar, statusGeo } from '../../services/geo';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const PRECISAO: Record<string, string> = {
  endereco: 'no número da casa',
  rua: 'só na rua (confira o número)',
  bairro: 'só no bairro — arraste o pino até a casa',
  cidade: 'só na cidade — arraste o pino até a casa',
};

export const EnderecoComMapa: React.FC<{ valor: Endereco; onChange: (e: Endereco) => void; rotuloPino?: string }> = ({ valor, onChange, rotuloPino = 'Local' }) => {
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'info'; texto: string } | null>(null);
  const [enquadrar, setEnquadrar] = useState(0);

  const set = (patch: Partial<Endereco>) => onChange({ ...valor, ...patch });

  // Mudou o endereço depois de localizado automaticamente? marca para localizar de novo
  const setCampo = (patch: Partial<Endereco>) => {
    if (valor.geo_status === 'automatico') set({ ...patch, geo_status: 'pendente', lat: null, lng: null, geo_precisao: null });
    else set(patch);
  };

  const onCep = async (cep: string) => {
    const masc = cep.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
    setCampo({ cep: masc });
    if (masc.replace(/\D/g, '').length !== 8) return;
    setBuscandoCep(true);
    setMsg(null);
    try {
      const r = await buscarCep(masc);
      const novo = {
        ...valor, cep: r.cep,
        logradouro: r.logradouro || valor.logradouro,
        bairro: r.bairro || valor.bairro,
        cidade: r.cidade || valor.cidade,
        uf: r.uf || valor.uf,
      };
      if (valor.geo_status === 'automatico') Object.assign(novo, { geo_status: 'pendente', lat: null, lng: null });
      onChange(novo);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setBuscandoCep(false);
    }
  };

  const localizar = async () => {
    setLocalizando(true);
    setMsg(null);
    try {
      const r = await geocodificar(valor);
      set({ lat: r.lat, lng: r.lng, geo_status: 'automatico', geo_precisao: r.precisao });
      setEnquadrar(x => x + 1);
      setMsg({ tipo: 'info', texto: `Encontrado ${PRECISAO[r.precisao] || ''}. Confira no mapa e arraste o pino até o portão certo.` });
    } catch (e) {
      set({ geo_status: 'falhou', lat: null, lng: null });
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setLocalizando(false);
    }
  };

  const marcarManual = (lat: number, lng: number) => {
    set({ lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7, geo_status: 'manual' });
    setMsg(null);
  };

  const st = statusGeo[valor.geo_status];
  const temPino = valor.lat !== null && valor.lng !== null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-6 gap-3">
        <Campo label="CEP" className="col-span-2">
          <div className="relative">
            <input className={inputCls} value={valor.cep} onChange={e => onCep(e.target.value)} placeholder="00000-000" inputMode="numeric" />
            {buscandoCep && <span className="material-symbols-outlined absolute right-3 top-3 text-[18px] text-slate-400 animate-spin">progress_activity</span>}
          </div>
        </Campo>
        <Campo label="Rua / Quadra" className="col-span-4">
          <input className={inputCls} value={valor.logradouro} onChange={e => setCampo({ logradouro: e.target.value })} placeholder="Ex.: QE 38 Conjunto H" />
        </Campo>
        <Campo label="Número" className="col-span-2">
          <input className={inputCls} value={valor.numero} onChange={e => setCampo({ numero: e.target.value })} placeholder="Casa 10" />
        </Campo>
        <Campo label="Complemento" className="col-span-4">
          <input className={inputCls} value={valor.complemento} onChange={e => set({ complemento: e.target.value })} placeholder="Bloco, apto, referência" />
        </Campo>
        <Campo label="Bairro" className="col-span-2">
          <input className={inputCls} value={valor.bairro} onChange={e => setCampo({ bairro: e.target.value })} />
        </Campo>
        <Campo label="Cidade" className="col-span-3">
          <input className={inputCls} value={valor.cidade} onChange={e => setCampo({ cidade: e.target.value })} />
        </Campo>
        <Campo label="UF" className="col-span-1">
          <select className={inputCls} value={valor.uf} onChange={e => setCampo({ uf: e.target.value })}>
            <option value="">—</option>
            {UFS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </Campo>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Botao type="button" icone="travel_explore" variante="secundario" carregando={localizando} onClick={localizar}
          disabled={!valor.logradouro && !valor.cep}>
          Localizar no mapa
        </Botao>
        <Selo cor={st.cor} icone={st.icone}>{st.label}</Selo>
        {temPino && (
          <button type="button" className="text-xs font-bold text-slate-400 hover:text-rose-500"
            onClick={() => set({ lat: null, lng: null, geo_status: 'pendente', geo_precisao: null })}>
            Remover pino
          </button>
        )}
      </div>
      {msg && (
        <p className={`text-xs font-medium ${msg.tipo === 'erro' ? 'text-rose-500' : 'text-slate-500'}`}>{msg.texto}</p>
      )}
      <p className="text-[11px] text-slate-400">
        Clique no mapa para marcar o local ou arraste o pino. A posição conferida é a que a van usa na rota.
      </p>
      <Mapa
        className="h-64"
        chaveEnquadramento={enquadrar}
        marcadores={temPino ? [{ id: 'pino', lat: valor.lat!, lng: valor.lng!, tipo: 'pin', arrastavel: true, titulo: rotuloPino }] : []}
        onClique={marcarManual}
        onArrastar={(_, lat, lng) => marcarManual(lat, lng)}
      />
    </div>
  );
};
