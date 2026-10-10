export type Turno = 'Manhã' | 'Tarde' | 'Integral' | 'Noite';
export type TipoRota = 'ida' | 'volta';

export interface RotaResumo {
  id: number;
  nome: string;
  periodo: Turno;
  tipo: TipoRota;
  status: 'Ativa' | 'Inativa';
  veiculo_id: number | null;
  motorista_id: number | null;
  hora_saida: string | null;
  hora_fim: string | null;
  partida_descricao: string | null;
  partida_lat: number | null;
  partida_lng: number | null;
  tempo_parada_seg: number;
  velocidade_media_kmh: number;
  folga_escola_min: number;
  tempo_max_bordo_min: number;
  observacoes: string | null;
  duracao_seg: number | null;
  distancia_m: number | null;
  // só na listagem
  placa?: string | null;
  modelo?: string | null;
  lugares?: number | null;
  motorista_nome?: string | null;
  total_alunos?: number;
  alunos_sem_local?: number;
}

export interface AlunoParada {
  aluno_id: number;
  nome: string;
  escola_id: number | null;
  escola_nome: string | null;
  turno: Turno;
  foto_thumb: string | null;
  ponto_encontro_id: number | null;
}

export interface Parada {
  seq: number;
  tipo: 'partida' | 'embarque' | 'desembarque' | 'escola';
  escola_id: number | null;
  nome: string;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  ponto_encontro_id: number | null;
  irmaos: boolean;
  alunos: AlunoParada[];
  chegada: string | null;
  saida: string | null;
  trecho: { metros: number; segundos: number } | null;
}

export interface Alerta {
  nivel: 'erro' | 'aviso';
  codigo: string;
  msg: string;
  aluno_id?: number;
  rota_id?: number;
}

export interface RotaDetalhe {
  rota: RotaResumo;
  veiculo: { id: number; placa: string; modelo: string; capacidade: string; lugares: number | null } | null;
  motorista: { id: number; nome: string; telefone: string } | null;
  escolas: { escola_id: number; nome: string; ordem: number; horarios: Record<string, { entrada: string; saida: string }> }[];
  paradas: Parada[];
  sem_localizacao: { aluno_id: number; nome: string; escola_nome: string | null }[];
  geometria: [number, number][];
  fonte_trajeto: 'osrm' | 'estimativa' | 'nenhuma';
  resumo: {
    total_alunos: number;
    lugares: number | null;
    distancia_m: number;
    duracao_seg: number;
    hora_saida: string | null;
    hora_fim: string | null;
    hora_saida_sugerida: string | null;
    tempo_bordo_max_seg: number | null;
    tempo_bordo: { aluno_id: number; nome: string; segundos: number }[];
  };
  alertas: Alerta[];
}

export interface Sugestao {
  bordo_max_atual_min?: number; bordo_max_sugerido_min?: number; acima_limite_atual?: number; acima_limite_sugerido?: number;
  hora_saida_sugerida?: string | null; avisos?: string[];
  alunos: number[];
  escolas: number[];
  distancia_atual_m: number;
  distancia_sugerida_m: number;
  atraso_atual_min: number;
  atraso_sugerido_min: number;
  motivo: string;
}

export interface PontoEncontro { id: number; nome: string; referencia: string | null; lat: number; lng: number; ativo: boolean; em_uso?: number; }
export interface AreaRestrita { id: number; nome: string; descricao: string | null; lat: number; lng: number; raio_m: number; ativo: boolean; }

export const TURNOS: Turno[] = ['Manhã', 'Tarde', 'Integral', 'Noite'];
