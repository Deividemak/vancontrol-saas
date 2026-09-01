import React, { useEffect, useState, useRef } from 'react';

interface NotificacoesData {
  manutencoes: { placa: string; servico: string; data_agendada: string }[];
  cnhVencendo: { nome: string; vencimento_cnh: string }[];
  inadimplentesCount: number;
}

interface NotificacoesDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCount: (count: number) => void;
}

export const NotificacoesDropdown: React.FC<NotificacoesDropdownProps> = ({ isOpen, onClose, onUnreadCount }) => {
  const [data, setData] = useState<NotificacoesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('vancontrol_token')}` }
      });
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setErrorStatus(false);
        
        let total = 0;
        if (d.manutencoes) total += d.manutencoes.length;
        if (d.cnhVencendo) total += d.cnhVencendo.length;
        if (d.inadimplentesCount > 0) total += 1;
        
        onUnreadCount(total);
      } else {
        setErrorStatus(true);
      }
    } catch (err) {
      console.error('Erro ao buscar notificações:', err);
      setErrorStatus(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Carregar inicialmente
    fetchData();
    
    // Configurar polling a cada 5 minutos
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Recarregar automaticamente se o usuário abrir o painel
  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      ref={dropdownRef}
      className="absolute top-[calc(100%+12px)] right-0 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-4 duration-200 origin-top-right transform"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/20">
        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">notifications</span>
          Notificações
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          <span className="material-symbols-outlined text-sm font-bold">close</span>
        </button>
      </div>

      <div className="max-h-[360px] overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1">
        {loading && !data && !errorStatus && (
          <div className="py-8 flex justify-center">
            <span className="animate-spin material-symbols-outlined text-primary text-2xl">refresh</span>
          </div>
        )}

        {errorStatus && !loading && (
          <div className="py-8 text-center px-4">
            <span className="material-symbols-outlined text-4xl text-rose-500/50 mb-2">cloud_off</span>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Servidor Offline</p>
            <p className="text-xs text-slate-500 mt-1 flex flex-col items-center">
              <span>Não foi possível carregar as notificações.</span>
              <button onClick={() => fetchData()} className="text-primary mt-3 hover:underline text-xs font-bold transition-all px-4 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20">
                Tentar Novamente
              </button>
            </p>
          </div>
        )}

        {!loading && data && !errorStatus && (data.manutencoes.length === 0 && data.cnhVencendo.length === 0 && data.inadimplentesCount === 0) && (
          <div className="py-10 text-center px-4">
            <span className="material-symbols-outlined text-4xl text-emerald-500/50 mb-2">check_circle</span>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Tudo limpo!</p>
            <p className="text-xs text-slate-500 mt-1">Você não possui nenhum alerta crítico no momento.</p>
          </div>
        )}

        {/* Inadimplência Geral */}
        {data && data.inadimplentesCount > 0 && (
          <div className="flex gap-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-colors cursor-default">
            <div className="shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <span className="material-symbols-outlined text-[18px]">person_off</span>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Atrasos de Pagamento</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Existem <strong className="text-slate-700 dark:text-slate-200">{data.inadimplentesCount} parcelas</strong> registradas como 'Atrasado'.
              </p>
            </div>
          </div>
        )}

        {/* Manutenções */}
        {data && data.manutencoes.map((m, idx) => (
          <div key={`man_${idx}`} className="flex gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors cursor-default">
            <div className="shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <span className="material-symbols-outlined text-[18px]">build</span>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Manutenção Pendente</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                A van <strong>{m.placa}</strong> exige {m.servico.toLowerCase()} para o dia {new Date(m.data_agendada).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}.
              </p>
            </div>
          </div>
        ))}

        {/* CNHs */}
        {data && data.cnhVencendo.map((c, idx) => {
          const isVencida = new Date(c.vencimento_cnh).getTime() < new Date().getTime();
          return (
            <div key={`cnh_${idx}`} className="flex gap-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors cursor-default">
              <div className="shrink-0 w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <span className="material-symbols-outlined text-[18px]">assignment_ind</span>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{isVencida ? 'CNH Vencida!' : 'CNH Vencendo'}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  O motorista <strong>{c.nome}</strong> está com a CNH {isVencida ? 'vencida' : 'próxima do vencimento'}.
                </p>
              </div>
            </div>
          );
        })}
      </div>
{data && (data.manutencoes.length > 0 || data.cnhVencendo.length > 0 || data.inadimplentesCount > 0) && (
      <div className="p-3 border-t border-slate-100 dark:border-slate-800/50 text-center">
        <button className="text-xs font-bold text-primary hover:text-primary-hover transition-colors">
          Solucionar alertas no Dashboard
        </button>
      </div>
      )}
    </div>
  );
};
