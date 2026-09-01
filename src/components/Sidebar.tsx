import React from 'react';

interface SidebarItemProps {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full transition-all ${
      active 
        ? 'bg-primary/10 text-primary font-bold' 
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
    }`}
  >
    <span className="material-symbols-outlined text-[22px]">{icon}</span>
    <span className="text-sm">{label}</span>
  </button>
);

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <aside className="w-64 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full shrink-0">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-primary p-2 rounded-lg text-white">
          <span className="material-symbols-outlined text-2xl">school</span>
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight">VanControl</h1>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest">Admin v2.4</p>
        </div>
      </div>
      
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        <SidebarItem 
          icon="dashboard" 
          label="Dashboard" 
          active={activeTab === 'dashboard'} 
          onClick={() => setActiveTab('dashboard')} 
        />
        <SidebarItem 
          icon="airport_shuttle" 
          label="Frota" 
          active={activeTab === 'frota'} 
          onClick={() => setActiveTab('frota')} 
        />
        <SidebarItem 
          icon="fact_check" 
          label="Checklist" 
          active={activeTab === 'checklist'} 
          onClick={() => setActiveTab('checklist')} 
        />
        <SidebarItem 
          icon="badge" 
          label="Motoristas" 
          active={activeTab === 'motoristas'} 
          onClick={() => setActiveTab('motoristas')} 
        />
        <SidebarItem 
          icon="groups" 
          label="Alunos" 
          active={activeTab === 'alunos'} 
          onClick={() => setActiveTab('alunos')} 
        />
        <SidebarItem 
          icon="family_history" 
          label="Responsáveis" 
          active={activeTab === 'responsaveis'} 
          onClick={() => setActiveTab('responsaveis')} 
        />
        <SidebarItem 
          icon="account_balance_wallet" 
          label="Financeiro" 
          active={activeTab === 'financeiro'} 
          onClick={() => setActiveTab('financeiro')} 
        />
        <SidebarItem 
          icon="local_gas_station" 
          label="Abastecimento" 
          active={activeTab === 'abastecimento'} 
          onClick={() => setActiveTab('abastecimento')} 
        />
        <SidebarItem 
          icon="map" 
          label="Rotas" 
          active={activeTab === 'rotas'} 
          onClick={() => setActiveTab('rotas')} 
        />
        <SidebarItem 
          icon="build" 
          label="Manutenção" 
          active={activeTab === 'manutencao'} 
          onClick={() => setActiveTab('manutencao')} 
        />
        <SidebarItem 
          icon="domain" 
          label="Escolas" 
          active={activeTab === 'escolas'} 
          onClick={() => setActiveTab('escolas')} 
        />
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer transition-colors">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 overflow-hidden">
            <img 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDQVngHCWmRbj-qnbkLkrUC7byb7R1OkYvmrH8sferFpRan9pKyh21L3FwFg7rjLYKON4wb8SH9xc5K7C-ytJW-XzS5roYli41RHZwgvOEDpVuQojR26aQBJlXFt7U8MwPQD2_v-Fwa8Y-fXunBESuxGoHHvH9gWkb4vu99BkuFp_0DeiOy6BnAYXepl2KgHsnL9yKce2ZKdJMceuAgQ8O_RwF55l9QH8MrBF161NHMMpNtB9dctKNG_BuX8ogsTdLM08ka_Lrk-Eiz" 
              alt="User" 
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">Ricardo Santos</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">Sair do sistema</p>
          </div>
          <span className="material-symbols-outlined text-sm">logout</span>
        </div>
      </div>
    </aside>
  );
};
