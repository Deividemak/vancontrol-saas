import React from 'react';
import { Papel, podeVer, NOMES_PAPEIS } from '../permissoes';

interface SidebarItemProps {
  icon: string;
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, active, badge, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full transition-all ${
      active 
        ? 'bg-primary/10 text-primary font-bold' 
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
    }`}
  >
    <span className="material-symbols-outlined text-[22px]">{icon}</span>
    <span className="text-sm flex-1 text-left">{label}</span>
    {!!badge && <span className="min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-black flex items-center justify-center">{badge}</span>}
  </button>
);

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  naoLidas?: number;
  papel?: Papel;
  usuario?: { nome: string; empresa_nome?: string | null } | null;
  onSair?: () => void;
}

const ITENS: { aba: string; icon: string; label: string }[] = [
  { aba: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { aba: 'operacao', icon: 'radar', label: 'Operação' },
  { aba: 'mensagens', icon: 'forum', label: 'Mensagens' },
  { aba: 'frota', icon: 'airport_shuttle', label: 'Frota' },
  { aba: 'checklist', icon: 'fact_check', label: 'Checklist' },
  { aba: 'documentos', icon: 'folder_shared', label: 'Documentos' },
  { aba: 'motoristas', icon: 'badge', label: 'Motoristas' },
  { aba: 'alunos', icon: 'groups', label: 'Alunos' },
  { aba: 'responsaveis', icon: 'family_history', label: 'Responsáveis' },
  { aba: 'financeiro', icon: 'account_balance_wallet', label: 'Financeiro' },
  { aba: 'abastecimento', icon: 'local_gas_station', label: 'Abastecimento' },
  { aba: 'rotas', icon: 'map', label: 'Rotas' },
  { aba: 'manutencao', icon: 'build', label: 'Manutenção' },
  { aba: 'escolas', icon: 'domain', label: 'Escolas' },
  { aba: 'relatorios', icon: 'query_stats', label: 'Relatórios' },
  { aba: 'plano', icon: 'workspace_premium', label: 'Meu plano' },
  { aba: 'equipe', icon: 'manage_accounts', label: 'Equipe' },
  { aba: 'lgpd', icon: 'shield_person', label: 'Privacidade (LGPD)' },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, naoLidas = 0, papel = 'dono' as Papel, usuario, onSair }) => {
  const iniciais = (usuario?.nome || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  return (
    <aside className="w-64 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full shrink-0">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-primary p-2 rounded-lg text-white">
          <span className="material-symbols-outlined text-2xl">school</span>
        </div>
        <div className="min-w-0">
          <h1 className="font-bold text-lg leading-tight">VanControl</h1>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest truncate" title={usuario?.empresa_nome || ''}>
            {usuario?.empresa_nome || 'Painel'}
          </p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {ITENS.filter(i => podeVer(papel, i.aba)).map(i => (
          <SidebarItem
            key={i.aba}
            icon={i.icon}
            label={i.label}
            badge={i.aba === 'mensagens' ? naoLidas : undefined}
            active={activeTab === i.aba}
            onClick={() => setActiveTab(i.aba)}
          />
        ))}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <button onClick={onSair} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-left" title="Sair do sistema">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-black text-primary shrink-0">{iniciais}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{usuario?.nome || 'Usuário'}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{NOMES_PAPEIS[papel]} · Sair</p>
          </div>
          <span className="material-symbols-outlined text-sm">logout</span>
        </button>
      </div>
    </aside>
  );
};
