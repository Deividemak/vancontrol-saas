// Componentes de interface compartilhados (seguem o visual já usado no sistema)
import React, { useEffect } from 'react';

export const inputCls =
  'w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-60';
export const textareaCls =
  'w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg p-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 transition-all min-h-[72px]';

export const Campo: React.FC<{ label: string; dica?: string; className?: string; children: React.ReactNode }> = ({ label, dica, className, children }) => (
  <div className={className}>
    <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">{label}</label>
    {children}
    {dica && <p className="text-[11px] text-slate-400 mt-1">{dica}</p>}
  </div>
);

type Tamanho = 'md' | 'lg' | 'xl' | '2xl';
const larguras: Record<Tamanho, string> = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-6xl' };

export const Modal: React.FC<{
  titulo: string;
  aberto: boolean;
  onFechar: () => void;
  tamanho?: Tamanho;
  rodape?: React.ReactNode;
  children: React.ReactNode;
}> = ({ titulo, aberto, onFechar, tamanho = 'lg', rodape, children }) => {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000] flex items-center justify-center p-4" onMouseDown={e => e.target === e.currentTarget && onFechar()}>
      <div className={`bg-white dark:bg-slate-900 w-full ${larguras[tamanho]} rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in duration-200`}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
          <h3 className="text-xl font-black">{titulo}</h3>
          <button type="button" onClick={onFechar} className="text-slate-400 hover:text-slate-600 transition-colors" aria-label="Fechar">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">{children}</div>
        {rodape && <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-3 justify-end shrink-0">{rodape}</div>}
      </div>
    </div>
  );
};

export const Abas: React.FC<{
  abas: { id: string; label: string; icone?: string; alerta?: boolean }[];
  ativa: string;
  onTrocar: (id: string) => void;
}> = ({ abas, ativa, onTrocar }) => (
  <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
    {abas.map(a => (
      <button
        key={a.id}
        type="button"
        onClick={() => onTrocar(a.id)}
        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap transition-colors ${
          ativa === a.id ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        {a.icone && <span className="material-symbols-outlined text-[18px]">{a.icone}</span>}
        {a.label}
        {a.alerta && <span className="size-2 rounded-full bg-amber-500" />}
      </button>
    ))}
  </div>
);

export const Botao: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' | 'perigo' | 'fantasma'; icone?: string; carregando?: boolean }> = ({
  variante = 'primario', icone, carregando, children, className = '', disabled, ...rest
}) => {
  const estilos = {
    primario: 'bg-primary text-white shadow-lg shadow-primary/20 hover:brightness-110',
    secundario: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700',
    perigo: 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20',
    fantasma: 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
  }[variante];
  return (
    <button
      {...rest}
      disabled={disabled || carregando}
      className={`inline-flex items-center justify-center gap-2 rounded-lg h-10 px-4 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${estilos} ${className}`}
    >
      {carregando ? <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span> : icone && <span className="material-symbols-outlined text-[18px]">{icone}</span>}
      {children}
    </button>
  );
};

const coresSelo = {
  cinza: 'bg-slate-500/10 text-slate-500',
  verde: 'bg-emerald-500/10 text-emerald-600',
  azul: 'bg-blue-500/10 text-blue-600',
  amarelo: 'bg-amber-500/10 text-amber-600',
  vermelho: 'bg-rose-500/10 text-rose-600',
  roxo: 'bg-indigo-500/10 text-indigo-500',
};
export type CorSelo = keyof typeof coresSelo;

export const Selo: React.FC<{ cor?: CorSelo; icone?: string; title?: string; children: React.ReactNode }> = ({ cor = 'cinza', icone, title, children }) => (
  <span title={title} className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${coresSelo[cor]}`}>
    {icone && <span className="material-symbols-outlined text-[13px]">{icone}</span>}
    {children}
  </span>
);

/** Lê a mensagem de erro da API ou devolve uma padrão. */
export async function erroDaResposta(res: Response, padrao: string): Promise<string> {
  try {
    const j = await res.json();
    return j?.error || padrao;
  } catch {
    return padrao;
  }
}

export const formatarDistancia = (m?: number | null) =>
  m === null || m === undefined ? '—' : m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`;

export const formatarDuracao = (s?: number | null) => {
  if (s === null || s === undefined) return '—';
  const min = Math.round(s / 60);
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`;
};
