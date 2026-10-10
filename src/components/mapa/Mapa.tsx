// Mapa (Leaflet + OpenStreetMap). Componente controlado: recebe marcadores, linha e círculos.
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type TipoMarcador = 'embarque' | 'desembarque' | 'escola' | 'partida' | 'ponto' | 'pin' | 'aluno' | 'van';

export interface MarcadorMapa {
  id: string | number;
  lat: number;
  lng: number;
  tipo?: TipoMarcador;
  rotulo?: string;      // texto curto dentro do marcador (ex.: número da parada)
  titulo?: string;      // popup ao clicar
  arrastavel?: boolean;
  destaque?: boolean;
  apagado?: boolean;
  cor?: string;         // sobrescreve a cor do tipo
  icone?: string;       // ícone Material no lugar do padrão do tipo
}

export interface CirculoMapa {
  id: string | number;
  lat: number;
  lng: number;
  raio: number;
  titulo?: string;
  cor?: string;
}

export interface LinhaMapa { pontos: [number, number][]; cor?: string; tracejada?: boolean; espessura?: number; }

interface Props {
  marcadores?: MarcadorMapa[];
  linha?: [number, number][];
  linhas?: LinhaMapa[];
  circulos?: CirculoMapa[];
  /** Quando muda, o mapa reenquadra para mostrar tudo. */
  chaveEnquadramento?: string | number;
  centro?: [number, number];
  zoom?: number;
  className?: string;
  onClique?: (lat: number, lng: number) => void;
  onArrastar?: (id: string | number, lat: number, lng: number) => void;
  onClicarMarcador?: (id: string | number) => void;
}

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUICAO = import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const CENTRO_PADRAO: [number, number] = [-15.7939, -47.8828]; // Brasília

const CORES: Record<TipoMarcador, string> = {
  embarque: '#137fec',
  desembarque: '#137fec',
  aluno: '#137fec',
  escola: '#7c3aed',
  partida: '#0f172a',
  ponto: '#059669',
  pin: '#e11d48',
  van: '#0f172a',
};
const ICONES: Partial<Record<TipoMarcador, string>> = { escola: 'school', partida: 'garage', ponto: 'hail', van: 'airport_shuttle' };

const escapar = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function criarIcone(m: MarcadorMapa) {
  const tipo = m.tipo || 'pin';
  const cor = m.cor || CORES[tipo];
  if (tipo === 'pin') {
    return L.divIcon({
      className: '',
      html: `<div style="transform:translate(-50%,-100%);color:${cor};filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))">
               <span class="material-symbols-outlined" style="font-size:40px;font-variation-settings:'FILL' 1">location_on</span></div>`,
      iconSize: [0, 0],
    });
  }
  const tamanho = tipo === 'van' ? (m.destaque ? 40 : 34) : m.destaque ? 34 : 28;
  const icone = m.icone || ICONES[tipo];
  const conteudo = icone && !m.rotulo
    ? `<span class="material-symbols-outlined" style="font-size:17px">${icone}</span>`
    : `<span style="font-size:12px;font-weight:900">${escapar(m.rotulo || '')}</span>`;
  return L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-50%);width:${tamanho}px;height:${tamanho}px;border-radius:${tipo === 'escola' ? '8px' : '999px'};
             background:${cor};color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #fff;
             box-shadow:0 2px 6px rgba(0,0,0,.35);opacity:${m.apagado ? 0.45 : 1}">${conteudo}</div>`,
    iconSize: [0, 0],
  });
}

export const Mapa: React.FC<Props> = ({
  marcadores = [], linha, linhas = [], circulos = [], chaveEnquadramento, centro = CENTRO_PADRAO, zoom = 12,
  className = 'h-80', onClique, onArrastar, onClicarMarcador,
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaRef = useRef<L.LayerGroup | null>(null);
  // callbacks mais recentes sem recriar o mapa
  const cb = useRef({ onClique, onArrastar, onClicarMarcador });
  cb.current = { onClique, onArrastar, onClicarMarcador };

  useEffect(() => {
    if (!divRef.current || mapaRef.current) return;
    const mapa = L.map(divRef.current, { zoomControl: true, attributionControl: true }).setView(centro, zoom);
    L.tileLayer(TILE_URL, { attribution: ATRIBUICAO, maxZoom: 19 }).addTo(mapa);
    camadaRef.current = L.layerGroup().addTo(mapa);
    mapa.on('click', (e: L.LeafletMouseEvent) => cb.current.onClique?.(e.latlng.lat, e.latlng.lng));
    mapaRef.current = mapa;
    // o mapa pode nascer dentro de um modal/aba ainda sem tamanho
    const obs = new ResizeObserver(() => mapa.invalidateSize());
    obs.observe(divRef.current);
    return () => {
      obs.disconnect();
      mapa.remove();
      mapaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // desenha camadas
  useEffect(() => {
    const camada = camadaRef.current;
    if (!camada) return;
    camada.clearLayers();

    for (const c of circulos) {
      L.circle([c.lat, c.lng], { radius: c.raio, color: c.cor || '#e11d48', weight: 2, fillOpacity: 0.12, dashArray: '6 4' })
        .bindTooltip(escapar(c.titulo || ''), { sticky: true })
        .addTo(camada);
    }
    if (linha && linha.length > 1) {
      L.polyline(linha, { color: '#137fec', weight: 5, opacity: 0.75 }).addTo(camada);
    }
    for (const l of linhas) {
      if (l.pontos.length > 1) L.polyline(l.pontos, { color: l.cor || '#137fec', weight: l.espessura || 5, opacity: 0.8, dashArray: l.tracejada ? '8 6' : undefined }).addTo(camada);
    }
    for (const m of marcadores) {
      const mk = L.marker([m.lat, m.lng], { icon: criarIcone(m), draggable: !!m.arrastavel, zIndexOffset: m.destaque ? 1000 : 0 });
      if (m.titulo) mk.bindPopup(escapar(m.titulo).replace(/\n/g, '<br>'));
      mk.on('click', () => cb.current.onClicarMarcador?.(m.id));
      if (m.arrastavel) {
        mk.on('dragend', () => {
          const p = mk.getLatLng();
          cb.current.onArrastar?.(m.id, p.lat, p.lng);
        });
      }
      mk.addTo(camada);
    }
  }, [marcadores, linha, linhas, circulos]);

  // enquadramento
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const pts: L.LatLngExpression[] = [
      ...marcadores.map(m => [m.lat, m.lng] as [number, number]),
      ...circulos.map(c => [c.lat, c.lng] as [number, number]),
      ...linhas.flatMap(l => l.pontos),
    ];
    if (pts.length === 1) mapa.setView(pts[0], Math.max(mapa.getZoom(), 16));
    else if (pts.length > 1) mapa.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveEnquadramento]);

  return <div ref={divRef} className={`w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 z-0 ${className}`} />;
};
