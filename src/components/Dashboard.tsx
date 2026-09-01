import React, { useState, useEffect } from 'react';
import { StatCard } from './StatCard';

interface DashboardData {
  kpis: {
    totalAlunos: number;
    vansAtivas: number;
    receitaMensal: number;
    atrasos: number;
  };
  grafico: { mes: string; total: number }[];
  alertas: {
    manutencoes: { placa: string; servico: string; data_agendada: string }[];
    cnhVencendo: { nome: string; vencimento_cnh: string }[];
    inadimplentesCount: number;
  };
}

export const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(async res => {
         const text = await res.text();
         try {
            const d = JSON.parse(text);
            if (!res.ok || d.error) throw new Error(d.error || 'Falha na resposta da API');
            return d;
         } catch {
            throw new Error(text || 'Falha no servidor');
         }
      })
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch((err: Error) => {
        console.error('Erro ao buscar dashboard:', err);
        setApiError(err.message);
        setLoading(false);
      });
  }, []);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const formatMonthLabel = (yyyyMM: string) => {
    if (!yyyyMM) return '';
    const [, month] = yyyyMM.split('-');
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return months[parseInt(month, 10) - 1];
  };

  const renderChart = () => {
    if (!data?.grafico || data.grafico.length === 0) return null;
    
    const paddedData = [...data.grafico];
    while(paddedData.length < 6) {
      paddedData.unshift({ mes: '', total: 0 });
    }
    const last6 = paddedData.slice(-6);
    const max = Math.max(...last6.map(d => d.total), 1000); // at least 1000 base
    
    const w = 400;
    const h = 130;
    const PADDING_TOP = 20;
    const effectiveH = h - PADDING_TOP;

    const points = last6.map((d, i) => {
      const x = (i / 5) * w;
      const y = h - ((d.total / max) * effectiveH);
      return { x, y, label: formatMonthLabel(d.mes), value: d.total };
    });

    const pathD = points.reduce((acc, point, i, a) => {
      if (i === 0) return `M ${point.x},${point.y}`;
      const prevX = a[i - 1].x;
      const prevY = a[i - 1].y;
      const cp1x = prevX + (point.x - prevX) / 2;
      const cp1y = prevY;
      const cp2x = prevX + (point.x - prevX) / 2;
      const cp2y = point.y;
      return `${acc} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${point.x},${point.y}`;
    }, "");

    const fillD = `${pathD} L ${w} 150 L 0 150 Z`;

    const totalLast6 = last6.reduce((acc, curr) => acc + curr.total, 0);

    return (
      <div className="lg:col-span-2 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm animate-in fade-in zoom-in duration-700">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h4 className="font-bold text-lg">Evolução da Receita</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">Últimos 6 meses de pagamento</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-primary">{formatCurrency(totalLast6)}</p>
            <p className="text-xs text-emerald-500 font-bold uppercase">Total do Período</p>
          </div>
        </div>
        <div className="relative h-64 w-full">
          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 150">
            <defs>
              <linearGradient id="chartGradient" x1="0%" x2="0%" y1="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: 'rgba(19, 127, 236, 0.4)', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: 'rgba(19, 127, 236, 0.05)', stopOpacity: 1 }} />
              </linearGradient>
            </defs>
            <path d={fillD} fill="url(#chartGradient)" className="animate-pulse" style={{ animationDuration: '3s' }}/>
            <path d={pathD} fill="none" stroke="#137fec" strokeWidth="3" className="stroke-primary drop-shadow-[0_4px_6px_rgba(19,127,236,0.3)]" />
            
            {points.map((p, idx) => (
               <circle key={idx} cx={p.x} cy={p.y} r="4" fill="#137fec" className="transition-all duration-300 hover:r-[6px]" />
            ))}
          </svg>
          <div className="flex justify-between mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {points.map((p, idx) => (
              <span key={idx}>{p.label || '-'}</span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-8 space-y-8 flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-black tracking-tight">Painel de Controle</h2>
        <p className="text-slate-500 dark:text-slate-400">Visão geral da frota e desempenho financeiro.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total de Alunos" 
          value={data?.kpis?.totalAlunos?.toString() || '0'} 
          change="Ativos" 
          isPositive={true} 
          icon="person" 
        />
        <StatCard 
          title="Vans Ativas" 
          value={data?.kpis?.vansAtivas?.toString() || '0'} 
          change="Operacionais" 
          isPositive={true} 
          icon="airport_shuttle" 
        />
        <StatCard 
          title="Receita Mensal" 
          value={formatCurrency(data?.kpis?.receitaMensal || 0)} 
          change="Liquidados este mês" 
          isPositive={true} 
          icon="payments" 
          iconColor="text-emerald-500"
          bgColor="bg-emerald-500/10"
        />
        <StatCard 
          title="Atrasos" 
          value={formatCurrency(data?.kpis?.atrasos || 0)} 
          change="Déficit atual" 
          isPositive={false} 
          icon="warning" 
          iconColor="text-rose-500"
          bgColor="bg-rose-500/10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {renderChart()}

        <div className="flex flex-col gap-6">
          <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm animate-in fade-in slide-in-from-right-4 duration-500">
            <h4 className="font-bold text-lg mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-500">notifications_active</span>
              Alertas Críticos
            </h4>
            <div className="space-y-4 max-h-[310px] overflow-y-auto pr-2 custom-scrollbar">
              
              {/* API Error Warning */}
              {apiError && (
                <div className="flex gap-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">
                  <span className="material-symbols-outlined">error</span>
                  <div>
                    <p className="text-sm font-bold">Erro no Servidor</p>
                    <p className="text-xs">{apiError}. Verifique o terminal do backend.</p>
                  </div>
                </div>
              )}

              {/* Alerta de Manutenções */}
              {data?.alertas?.manutencoes?.map((m, idx) => (
                <div key={'man_'+idx} className="flex gap-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <span className="material-symbols-outlined text-amber-500">build</span>
                  <div>
                    <p className="text-sm font-bold">Manutenção Pendente</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Van {m.placa} precisa de {m.servico || 'Revisão'} (Agendado: {m.data_agendada ? new Date(m.data_agendada).toLocaleDateString('pt-BR', {timeZone:'UTC'}) : 'Sem data'}).
                    </p>
                  </div>
                </div>
              ))}

              {/* Alerta de CNH Vencendo */}
              {data?.alertas?.cnhVencendo?.map((c, idx) => {
                 const baseDate = c.vencimento_cnh ? new Date(c.vencimento_cnh).getTime() : 0;
                 const diffDays = Math.ceil((baseDate - new Date().getTime()) / (1000 * 3600 * 24));
                 const isVencida = diffDays < 0;
                 return (
                  <div key={'cnh_'+idx} className="flex gap-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                    <span className="material-symbols-outlined text-rose-500">assignment_ind</span>
                    <div>
                      <p className="text-sm font-bold">{isVencida ? 'CNH Vencida!' : 'Vencimento de CNH'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Motorista {c.nome} possui CNH {isVencida ? 'vencida!' : `vencendo em ${diffDays} dias.`}
                      </p>
                    </div>
                  </div>
                 );
              })}

              {/* Alerta de Inadimplência Geral */}
              {(data?.alertas?.inadimplentesCount || 0) > 0 && (
                <div className="flex gap-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="material-symbols-outlined text-slate-500">person_off</span>
                  <div>
                    <p className="text-sm font-bold">Atrasos Ativos</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Existem {data?.alertas.inadimplentesCount} parcelas de alunos marcadas como 'Atrasado'.
                    </p>
                  </div>
                </div>
              )}

              {/* Nenhum alerta */}
              {!apiError && (!data?.alertas?.manutencoes?.length && !data?.alertas?.cnhVencendo?.length && (!data?.alertas?.inadimplentesCount)) && (
                <div className="text-center py-8 text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-2 opacity-50">check_circle</span>
                  <p className="text-sm font-bold text-slate-500">Tudo sob controle!</p>
                  <p className="text-xs">Nenhum alerta crítico encontrado hoje.</p>
                </div>
              )}

            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 text-white flex-1 relative overflow-hidden group shadow-lg min-h-[140px]">
            <div className="absolute inset-0 opacity-30">
              <img 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAupsjjAMzIDWVHuGvgCxa3QCFkZD92krq27scY6jIxAx94wH4p0ecS6Y7xVffawW0lqE_xlc75Gv_EKsm8hSjI7wXTwlpjCVoExk8lk1RKzVecD2N-uwhMRVo1vw1GwuWyZ6NGT_cN40m1BVKhX8KYHK6UP1UVNOM9iToCr6azwojiPOMPFMt8RpnYGemAP-S4rY6du_ATYxlvy44BifJDP8kN2E60QZ9yDGPaAyubYOYRK-1gKTaNCc0p1HMlVg2N_cGqydeoe4wJ" 
                alt="Map" 
                className="w-full h-full object-cover grayscale transition-transform duration-1000 group-hover:scale-110"
              />
            </div>
            <div className="relative z-10 flex flex-col justify-between h-full">
              <div>
                <h4 className="font-bold text-sm mb-1">Mapa de Rotas</h4>
                <p className="text-xs text-slate-400">{data?.kpis.vansAtivas || 0} vans em operação</p>
              </div>
              <div className="mt-4 self-start inline-flex items-center gap-2 bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-[0_0_15px_rgba(19,127,236,0.5)]">
                <span className="flex h-2 w-2 rounded-full bg-white animate-pulse"></span>
                AO VIVO
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
