import React, { useState, useEffect } from 'react';

const StatCard = ({ title, value, change, isPositive, icon, iconColor = "text-primary", bgColor = "bg-primary/10", onClick, isActive }: any) => (
  <div
    onClick={onClick}
    className={`bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm flex flex-col justify-between transition-all cursor-pointer ${isActive ? 'ring-2 ring-primary border-transparent' : 'border border-slate-200 dark:border-slate-800 hover:shadow-md'}`}>
    <div className="flex justify-between items-start">
      <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">{title}</h3>
      <div className={`p-2 rounded-lg ${bgColor}`}>
        <span className={`material-symbols-outlined ${iconColor} text-xl`}>{icon}</span>
      </div>
    </div>
    <div className="mt-4 flex items-end gap-3">
      <span className="text-3xl font-black tracking-tight">{value}</span>
      <span className={`text-[10px] font-black uppercase tracking-widest mb-1.5 ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
        {change}
      </span>
    </div>
  </div>
);

export const Manutencao: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total_veiculos: 0, em_manutencao: 0, custo_mensal: 0 });
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [agenda, setAgenda] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'maintenance' | 'priority'>('all');

  // States for Modals and Forms
  const [showRegModal, setShowRegModal] = useState(false);
  const [showKmModal, setShowKmModal] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [activeMenu, setActiveMenu] = useState<number | null>(null);

  const [regFormData, setRegFormData] = useState({
    veiculo_id: '',
    servico: '',
    tipo: 'Preventiva',
    data_agendada: '',
    hora_agendada: '',
    custo: '',
    observacoes: ''
  });

  const [kmFormData, setKmFormData] = useState({ km_atual: '' });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashRes, agendaRes] = await Promise.all([
          fetch('/api/manutencoes/dashboard'),
          fetch('/api/manutencoes/agenda')
        ]);
        if (dashRes.ok && agendaRes.ok) {
          const dashData = await dashRes.json();
          const agendaData = await agendaRes.json();

          setStats(dashData.stats);

          // Process progress calculation
          const processedVehicles = (dashData.veiculos || []).map((v: any) => {
            const range = v.km_proxima_revisao - v.km_ultima_revisao;
            const current = v.km_atual - v.km_ultima_revisao;
            let progress = range > 0 ? Math.round((current / range) * 100) : 0;
            if (progress < 0) progress = 0;
            if (progress > 100) progress = 100;

            let progressText = 'PRÓXIMO';
            let progressColor = 'bg-primary';
            let textColor = 'text-primary';
            if (progress >= 100) {
              progressText = 'VENCIDO'; progressColor = 'bg-red-600'; textColor = 'text-red-600';
            } else if (progress >= 90) {
              progressText = 'ATENÇÃO'; progressColor = 'bg-orange-500'; textColor = 'text-orange-500';
            }

            let statusColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
            if (v.status === 'Manutenção' || v.status === 'Oficina') {
              statusColor = 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
            } else if (v.status !== 'Disponível' && v.status !== 'Ativo' && v.status !== 'Em Rota') {
              statusColor = 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400';
            }

            return {
              ...v,
              kmFormatted: new Intl.NumberFormat('pt-BR').format(v.km_atual),
              progress,
              progressText,
              progressColor,
              textColor,
              statusColor
            };
          });
          setVehicles(processedVehicles);
          setAgenda(agendaData);
        }
      } catch (err) {
        console.error("Error fetching maintenance data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleRegSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/manutencoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regFormData)
      });
      if (res.ok) {
        setShowRegModal(false);
        setRegFormData({ veiculo_id: '', servico: '', tipo: 'Preventiva', data_agendada: '', hora_agendada: '', custo: '', observacoes: '' });
        alert('Manutenção registrada com sucesso!');
        window.location.reload();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao registrar manutenção.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao salvar.');
    }
  };

  const handleKmSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle) return;
    try {
      const res = await fetch(`/api/frota/${selectedVehicle.id}/km`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kmFormData)
      });
      if (res.ok) {
        setShowKmModal(false);
        alert('KM Atualizado com sucesso!');
        window.location.reload();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao atualizar KM.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao atualizar KM.');
    }
  };

  const proximasCount = vehicles.filter((v: any) => v.progress >= 90).length;
  const formattedCusto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.custo_mensal);

  // Lógica de Filtragem com base nos Cards Interativos
  const filteredVehicles = vehicles.filter((v: any) => {
    if (activeFilter === 'maintenance') return v.status === 'Manutenção' || v.status === 'Oficina';
    if (activeFilter === 'priority') return v.progress >= 90;
    return true; // 'all'
  });

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight">Painel de Manutenção</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Gerenciamento preventivo e corretivo de veículos escolares</p>
        </div>
        <button onClick={() => setShowRegModal(true)} className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white text-sm font-black uppercase tracking-widest rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
          <span className="material-symbols-outlined text-lg">add_circle</span>
          Registrar Manutenção
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard title="TOTAL DE VEÍCULOS" value={stats.total_veiculos} change="Frota" isPositive={true} icon="directions_bus" onClick={() => setActiveFilter('all')} isActive={activeFilter === 'all'} />
        <StatCard title="EM MANUTENÇÃO" value={stats.em_manutencao.toString().padStart(2, '0')} change="Atualmente" isPositive={stats.em_manutencao === 0} icon="build" iconColor="text-orange-500" bgColor="bg-orange-500/10" onClick={() => setActiveFilter('maintenance')} isActive={activeFilter === 'maintenance'} />
        <StatCard title="PRÓXIMAS REVISÕES" value={proximasCount.toString().padStart(2, '0')} change={proximasCount > 0 ? "Prioridade" : "Em Dia"} isPositive={proximasCount === 0} icon="event_upcoming" iconColor="text-orange-500" bgColor="bg-orange-500/10" onClick={() => setActiveFilter('priority')} isActive={activeFilter === 'priority'} />
        <StatCard title="CUSTO MENSAL" value={formattedCusto} change="Pendentes / Previstos" isPositive={true} icon="payments" iconColor="text-emerald-500" bgColor="bg-emerald-500/10" isActive={false} />
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-base font-black">Monitoramento da Frota</h3>
            <button className="text-[10px] text-primary font-black tracking-widest uppercase hover:underline">Ver todos</button>
          </div>
          <div className="overflow-x-auto relative min-h-[200px]">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Veículo (Placa/Modelo)</th>
                    <th className="px-6 py-4 text-center">KM Atual</th>
                    <th className="px-6 py-4 w-64">Progresso Revisão</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredVehicles.map((v: any) => (
                    <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">{v.placa}</span>
                          <span className="text-[10px] text-slate-500 font-bold mt-0.5">{v.modelo}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center text-sm font-black">{v.kmFormatted}</td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col gap-2 w-full max-w-[200px]">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] font-black">{v.progress}% PERCORRIDO</span>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${v.textColor}`}>
                              {v.progressText}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full ${v.progressColor} rounded-full transition-all duration-1000`} style={{ width: `${v.progress}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${v.statusColor}`}>
                          {v.status}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right relative">
                        <button onClick={() => setActiveMenu(activeMenu === v.id ? null : v.id)} className="text-slate-400 hover:text-primary transition-colors p-2 hidden sm:inline-flex">
                          <span className="material-symbols-outlined text-sm">more_vert</span>
                        </button>
                        {activeMenu === v.id && (
                          <div className="absolute right-8 top-12 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-20">
                            <button
                              onClick={() => {
                                setSelectedVehicle(v);
                                setKmFormData({ km_atual: v.km_atual.toString() });
                                setShowKmModal(true);
                                setActiveMenu(null);
                              }}
                              className="w-full px-4 py-3 text-left text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[16px]">speed</span>
                              Atualizar KM
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredVehicles.length === 0 && !loading && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm font-bold">Nenhum veículo encontrado para este filtro.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside className="w-full lg:w-[320px] shrink-0 flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm min-h-[300px] flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-black text-sm">Agenda de Serviços</h3>
              <span className="material-symbols-outlined text-slate-300">calendar_month</span>
            </div>

            <div className="space-y-6 flex-1">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : agenda.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm font-medium">Nenhum serviço agendado futuro.</div>
              ) : agenda.map((item: any) => {
                let date;
                try {
                  const dataStr = item.data_agendada;
                  if (dataStr && typeof dataStr === 'string') {
                    // Extract YYYY-MM-DD directly from whatever format MariaDB gives us to avoid timezone shifts
                    const dateMatch = dataStr.match(/^(\d{4}-\d{2}-\d{2})/);
                    const cleanDate = dateMatch ? dateMatch[1] : dataStr.split('T')[0];
                    date = new Date(`${cleanDate}T${item.hora_agendada || '00:00:00'}`);
                  } else {
                    date = new Date(); // fallback
                  }
                } catch (e) {
                  date = new Date();
                }

                if (isNaN(date.getTime())) {
                  date = new Date();
                }

                const month = date.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
                const day = date.getDate().toString().padStart(2, '0');
                const time = date.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const isUrgent = item.tipo === 'Urgente';

                return (
                  <div key={item.id} className="flex gap-4 items-start animate-in fade-in duration-500">
                    <div className={`flex flex-col items-center justify-center rounded-xl px-3 py-2 min-w-[56px] border ${isUrgent ? 'bg-orange-50 dark:bg-orange-900/10 text-orange-500 border-orange-100 dark:border-orange-900/30' : 'bg-primary/10 text-primary border-transparent'}`}>
                      <span className="text-[9px] uppercase font-black tracking-widest">{month}</span>
                      <span className="text-xl font-black">{day}</span>
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate" title={item.servico}>{item.servico}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{item.placa} • {time}</p>
                      <span className={`text-[9px] mt-1.5 font-black uppercase tracking-widest ${isUrgent ? 'text-orange-500' : 'text-primary'}`}>{item.tipo}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={() => alert('Calendário completo estará disponível em breve.')} className="w-full mt-8 py-3 text-[10px] font-black uppercase tracking-widest border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300">
              Ver Calendário Completo
            </button>
          </div>

          <div className="bg-primary rounded-xl p-6 text-white shadow-lg shadow-primary/20 relative overflow-hidden">
            <div className="relative z-10">
              <h4 className="font-black text-[10px] mb-3 uppercase tracking-widest opacity-90">Dica de Gestão</h4>
              <p className="text-xs text-white/90 leading-relaxed font-medium">Veículos com manutenção preventiva em dia gastam em média 15% menos combustível.</p>
              <button onClick={() => alert('Você será redirecionado para o blog em breve.')} className="mt-5 text-[9px] font-black uppercase tracking-widest underline opacity-90 hover:opacity-100 transition-opacity">Ler mais no blog</button>
            </div>
            {/* Background decoration */}
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white opacity-5 rounded-full blur-2xl pointer-events-none"></div>
          </div>
        </aside>
      </div>

      {showRegModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-black">Registrar Manutenção</h3>
              <button onClick={() => setShowRegModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleRegSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Veículo</label>
                <select
                  required
                  value={regFormData.veiculo_id}
                  onChange={e => setRegFormData({ ...regFormData, veiculo_id: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="">Selecione uma Van</option>
                  {vehicles.map((v: any) => (
                    <option key={v.id} value={v.id}>{v.placa} - {v.modelo}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Serviço</label>
                  <input
                    type="text" required
                    value={regFormData.servico}
                    onChange={e => setRegFormData({ ...regFormData, servico: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="Ex: Troca de Óleo"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Tipo</label>
                  <select
                    required
                    value={regFormData.tipo}
                    onChange={e => setRegFormData({ ...regFormData, tipo: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    <option value="Preventiva">Preventiva</option>
                    <option value="Corretiva">Corretiva</option>
                    <option value="Urgente">Urgente</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Data Agendada</label>
                  <input
                    type="date" required
                    value={regFormData.data_agendada}
                    onChange={e => setRegFormData({ ...regFormData, data_agendada: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Custo (R$)</label>
                  <input
                    type="number" step="0.01" required
                    value={regFormData.custo}
                    onChange={e => setRegFormData({ ...regFormData, custo: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowRegModal(false)} className="flex-1 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 h-11 rounded-lg bg-primary font-bold text-sm text-white shadow-lg shadow-primary/20 hover:brightness-110 transition-all">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showKmModal && selectedVehicle && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-black">Atualizar KM</h3>
              <button onClick={() => setShowKmModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleKmSave} className="p-6 space-y-4">
              <div className="text-sm text-slate-500 mb-4">
                Veículo: <strong className="text-slate-900 dark:text-white">{selectedVehicle.placa} ({selectedVehicle.modelo})</strong>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Quilometragem Atual</label>
                <input
                  type="number" required
                  value={kmFormData.km_atual}
                  onChange={e => setKmFormData({ ...kmFormData, km_atual: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="Ex: 125000"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowKmModal(false)} className="flex-1 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 h-11 rounded-lg bg-primary font-bold text-sm text-white shadow-lg shadow-primary/20 hover:brightness-110 transition-all">Atualizar</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
