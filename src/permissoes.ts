// Perfis de acesso do painel (o servidor também confere cada chamada).
export type Papel = 'dono' | 'gestor' | 'financeiro' | 'motorista' | 'monitor';

export const NOMES_PAPEIS: Record<Papel, string> = {
  dono: 'Dono', gestor: 'Gestor (operação)', financeiro: 'Financeiro', motorista: 'Motorista', monitor: 'Monitor',
};

const SO_DONO = ['equipe', 'lgpd'];
const FINANCEIRO = ['dashboard', 'financeiro', 'responsaveis', 'mensagens', 'relatorios', 'plano'];

/** Telas que o perfil enxerga no menu. */
export function podeVer(papel: Papel | undefined, aba: string): boolean {
  const p = papel || 'dono';
  if (p === 'dono') return true;
  if (SO_DONO.includes(aba)) return false;
  if (p === 'gestor') return aba !== 'financeiro' && aba !== 'plano';
  if (p === 'financeiro') return FINANCEIRO.includes(aba);
  return false;
}

/** Conta antiga salva no navegador (sem "papel"): trata como dono até o /auth/me responder. */
export function papelDoUsuario(u: { papel?: Papel; role?: string } | null): Papel {
  if (u?.papel) return u.papel;
  if (u?.role === 'motorista') return 'motorista';
  if (u?.role === 'monitor') return 'monitor';
  return 'dono';
}

/** Papel do usuário logado (lido do navegador; o servidor confere de novo). */
export function papelAtual(): Papel {
  try {
    return papelDoUsuario(JSON.parse(localStorage.getItem('vancontrol_user') || 'null'));
  } catch {
    return 'dono';
  }
}
