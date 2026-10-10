import { apiFetch } from './api';

export type GeoStatus = 'pendente' | 'automatico' | 'manual' | 'falhou';

export interface Endereco {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  lat: number | null;
  lng: number | null;
  geo_status: GeoStatus;
  geo_precisao: string | null;
}

export const enderecoVazio = (): Endereco => ({
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
  lat: null, lng: null, geo_status: 'pendente', geo_precisao: null,
});

export function enderecoDe(o: Partial<Record<keyof Endereco, unknown>>): Endereco {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  return {
    cep: s(o.cep), logradouro: s(o.logradouro), numero: s(o.numero), complemento: s(o.complemento),
    bairro: s(o.bairro), cidade: s(o.cidade), uf: s(o.uf),
    lat: n(o.lat), lng: n(o.lng),
    geo_status: (o.geo_status as GeoStatus) || 'pendente',
    geo_precisao: (o.geo_precisao as string) || null,
  };
}

export function formatarEndereco(e: Partial<Endereco>) {
  const l1 = [e.logradouro, e.numero].filter(Boolean).join(', ');
  return [l1, e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
}

export async function buscarCep(cep: string) {
  const res = await apiFetch(`/api/geo/cep/${cep.replace(/\D/g, '')}`);
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error || 'CEP não encontrado');
  return j as { cep: string; logradouro: string; complemento: string; bairro: string; cidade: string; uf: string };
}

export async function geocodificar(e: Endereco) {
  const res = await apiFetch('/api/geo/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(e),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error || 'Endereço não localizado');
  return j as { lat: number; lng: number; descricao: string; precisao: string; fonte: string };
}

export const statusGeo: Record<GeoStatus, { label: string; cor: 'verde' | 'azul' | 'amarelo' | 'vermelho'; icone: string }> = {
  manual: { label: 'Conferido no mapa', cor: 'verde', icone: 'where_to_vote' },
  automatico: { label: 'Localizado', cor: 'azul', icone: 'location_on' },
  pendente: { label: 'Sem localização', cor: 'amarelo', icone: 'location_off' },
  falhou: { label: 'Não localizado', cor: 'vermelho', icone: 'wrong_location' },
};
