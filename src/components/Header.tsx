import React from 'react';

interface User {
  id: number;
  nome: string;
  email: string;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  user: User;
  onLogout: () => void;
  onOpenConfig: () => void;
}

import { NotificacoesDropdown } from './NotificacoesDropdown';

export const Header: React.FC<HeaderProps> = ({ title, user, onLogout, onOpenConfig }) => {
  const [isNotificacoesOpen, setIsNotificacoesOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 sticky top-0 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md z-40">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md w-full">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
          <input
            type="text"
            placeholder="Buscar alunos, vans ou motoristas..."
            className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-primary text-sm placeholder:text-slate-500 dark:text-slate-100 transition-all"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <button 
            onClick={() => setIsNotificacoesOpen(!isNotificacoesOpen)}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors relative"
          >
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">notifications</span>
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-background-dark animate-pulse"></span>
            )}
          </button>
          
          <NotificacoesDropdown 
            isOpen={isNotificacoesOpen} 
            onClose={() => setIsNotificacoesOpen(false)} 
            onUnreadCount={setUnreadCount}
          />
        </div>

        <button 
          onClick={onOpenConfig}
          className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">settings</span>
        </button>
        <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800 mx-2"></div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1 max-w-[150px]">{user.nome}</p>
          </div>
          <button
            onClick={onLogout}
            className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-all flex items-center justify-center group"
            title="Sair"
          >
            <span className="material-symbols-outlined group-hover:scale-110 transition-transform">logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};
