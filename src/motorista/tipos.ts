export type StatusPresenca = 'previsto' | 'ausente_avisado' | 'embarcou' | 'desembarcou' | 'nao_compareceu';

export interface RotaHoje {
  id: number; nome: string; tipo: 'ida' | 'volta'; periodo: string; hora_saida: string | null; hora_fim: string | null;
  placa: string | null; modelo: string | null; total_alunos: number; substituicao?: boolean; tem_aula: boolean; checklist_feito: boolean;
  viagem: { id: number; status: 'em_andamento' | 'concluida'; resumo: Record<string, number> } | null;
}
export interface Hoje { data: string; papel?: 'motorista' | 'monitor'; motorista: { id: number; nome: string }; calendario: { sem_aula_todas: boolean; motivo: string | null }; rotas: RotaHoje[]; }

export interface Contato { nome: string; parentesco: string | null; telefone: string; }
export interface Presenca {
  aluno_id: number; status: StatusPresenca; embarque_hora: string | null; desembarque_hora: string | null;
  nome: string; foto_thumb: string | null; turno: string; escola_nome: string | null;
  alergias?: string | null; condicoes_medicas?: string | null; medicamentos?: string | null; necessidades_especiais?: string | null; tipo_sanguineo?: string | null;
  responsavel_nome: string | null; responsavel_telefone: string | null; contatos_emergencia?: Contato[];
  autorizados?: { nome: string; parentesco: string | null; telefone: string | null; documento: string | null; valido_ate: string | null }[];
}
export interface ParadaViagem {
  seq: number; tipo: 'partida' | 'embarque' | 'desembarque' | 'escola'; escola_id: number | null; nome: string; endereco: string | null;
  lat: number | null; lng: number | null; ponto_encontro_id: number | null; irmaos: boolean; chegada: string | null;
  alunos: { aluno_id: number; nome: string; escola_id: number | null; escola_nome: string | null }[];
}
export interface Ocorrencia { id: number; tipo: string; gravidade: string; descricao: string | null; aluno_nome: string | null; status: string; tem_foto: boolean; registrado_em: string; resolucao?: string | null; lat?: number | null; lng?: number | null; }
export interface ViagemDetalhe {
  viagem: {
    id: number; rota_id: number; data: string; status: 'em_andamento' | 'concluida'; rota_nome: string; rota_tipo: 'ida' | 'volta';
    periodo: string; hora_saida: string | null; placa: string | null; modelo: string | null; motorista_nome: string | null; motorista_telefone: string | null;
    iniciada_em: string | null; concluida_em: string | null; ultima_posicao: { lat: number; lng: number; velocidade: number | null; em: string } | null;
  };
  presencas: Presenca[];
  paradas: ParadaViagem[];
  geometria: [number, number][];
  paradas_com_chegada: number[];
  ocorrencias: Ocorrencia[];
  resumo: Record<StatusPresenca | 'total', number>;
  eventos?: { id: number; tipo: string; aluno_nome: string | null; parada_seq: number | null; lat: number | null; lng: number | null; registrado_em: string; recebido_em: string; usuario_nome: string | null; dados: any }[];
  trilha?: [number, number][];
}

export const ROTULO_STATUS: Record<StatusPresenca, string> = {
  previsto: 'Aguardando', ausente_avisado: 'Ausência avisada', embarcou: 'A bordo', desembarcou: 'Entregue', nao_compareceu: 'Não veio',
};
export const TIPOS_OCORRENCIA: Record<string, string> = {
  atraso: 'Atraso', mal_estar: 'Aluno passou mal', comportamento: 'Comportamento', mecanico: 'Problema mecânico',
  transito: 'Trânsito / desvio', acidente: 'Acidente', outro: 'Outro', emergencia: 'EMERGÊNCIA',
};
