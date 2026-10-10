/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL de tiles do mapa (opcional). Padrão: OpenStreetMap. */
  readonly VITE_MAP_TILE_URL?: string;
  readonly VITE_MAP_ATTRIBUTION?: string;
}
