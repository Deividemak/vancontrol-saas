import React, { useState, useEffect, useMemo } from 'react';
import { StatCard } from './StatCard';

interface FuelLog {
  id: number;
  data_abastecimento: string;
  placa: string;
  motorista_nome: string;
  tipo_combustivel: string;
  litros: string | number;
  valor_unitario: string | number;
  custo_total: string | number;
  km_atual: number;
}

export const Abastecimento: React.FC = () => {
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [motoristas, setMotoristas] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedVeiculoId, setSelectedVeiculoId] = useState<number | null>(null);
  const [selectedMotoristaId, setSelectedMotoristaId] = useState<number | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('30');
  const [viewLog, setViewLog] = useState<any>(null);

  const filteredLogs = fuelLogs.filter((log: any) => {
    if (selectedVeiculoId && log.veiculo_id !== selectedVeiculoId) return false;
    if (selectedMotoristaId && log.motorista_id !== selectedMotoristaId) return false;
    
    if (selectedPeriod !== 'all') {
      const days = Number(selectedPeriod);
      const logDate = new Date(log.data_abastecimento);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      if (logDate < cutoffDate) return false;
    }
    
    return true;
  });

  const totalGasto = filteredLogs.reduce((acc, log) => acc + Number(log.custo_total || 0), 0);
  const formatoMoeda = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const chartData = useMemo(() => {
    const data = [];
    const today = new Date();
    
    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthIndex = d.getMonth();
      const year = d.getFullYear();
      
      const monthName = d.toLocaleString('pt-BR', { month: 'short' }).split('.')[0].toUpperCase();
      
      const monthLogs = filteredLogs.filter(log => {
        const logDate = new Date(log.data_abastecimento);
        return logDate.getUTCFullYear() === year && logDate.getUTCMonth() === monthIndex;
      });
      
      const total = monthLogs.reduce((acc, log) => acc + Number(log.custo_total || 0), 0);
      data.push({ label: monthName, total });
    }
    
    const maxTotal = Math.max(...data.map(d => d.total));
    const finalMax = maxTotal > 0 ? maxTotal : 1; 
    
    return data.map(d => ({
      ...d,
      heightPercentage: Math.max((d.total / finalMax) * 100, 2) // At least 2% height to be visible
    }));
  }, [filteredLogs]);

  const [formData, setFormData] = useState({
    veiculo_id: '', motorista_id: '', litros: '', valor_unitario: '', custo_total: '',
    km_atual: '', tipo_combustivel: 'Diesel S10', data_abastecimento: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    try {
      const [resLogs, resVeiculos, resMotoristas] = await Promise.all([
        fetch('/api/abastecimentos'), fetch('/api/fleet/management'), fetch('/api/motoristas')
      ]);
      if (resLogs.ok) setFuelLogs(await resLogs.json());
      if (resVeiculos.ok) setVeiculos(await resVeiculos.json());
      if (resMotoristas.ok) setMotoristas(await resMotoristas.json());
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/abastecimentos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
      });
      if (res.ok) {
        setIsModalOpen(false);
        setFormData({ veiculo_id: '', motorista_id: '', litros: '', valor_unitario: '', custo_total: '', km_atual: '', tipo_combustivel: 'Diesel S10', data_abastecimento: new Date().toISOString().split('T')[0] });
        fetchData();
      } else alert('Erro ao registrar abastecimento');
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleDeleteLog = async (id: number) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro? A ação não poderá ser desfeita.')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/abastecimentos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setViewLog(null);
        fetchData();
      } else {
        alert('Erro ao excluir registro');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto relative">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight">Histórico de Abastecimento</h2>
          <p className="text-slate-500 dark:text-slate-400">Controle de custos, litragem e eficiência da frota escolar.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-primary transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
            <span className="material-symbols-outlined text-primary text-[20px] absolute left-4 pointer-events-none">airport_shuttle</span>
            <select
              value={selectedVeiculoId || ''}
              onChange={(e) => setSelectedVeiculoId(e.target.value ? Number(e.target.value) : null)}
              className="appearance-none bg-transparent w-full py-2 pl-12 pr-10 text-sm font-bold cursor-pointer outline-none focus:ring-0 text-slate-900 dark:text-slate-100"
            >
              <option value="" className="text-slate-900 dark:bg-slate-900 dark:text-white">Van: Todas</option>
              {veiculos.map(v => (
                <option key={v.id || v.veiculo_id} value={v.id || v.veiculo_id} className="text-slate-900 dark:bg-slate-900 dark:text-white">
                  {v.placa}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined text-slate-400 text-[18px] absolute right-3 pointer-events-none">expand_more</span>
          </div>
          <div className="relative flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-primary transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
            <span className="material-symbols-outlined text-primary text-[20px] absolute left-4 pointer-events-none">person</span>
            <select
              value={selectedMotoristaId || ''}
              onChange={(e) => setSelectedMotoristaId(e.target.value ? Number(e.target.value) : null)}
              className="appearance-none bg-transparent w-full py-2 pl-12 pr-10 text-sm font-bold cursor-pointer outline-none focus:ring-0 text-slate-900 dark:text-slate-100 placeholder-slate-500"
            >
              <option value="" className="text-slate-900 dark:bg-slate-900 dark:text-white">Motorista: Todos</option>
              {motoristas.map(m => (
                <option key={m.id} value={m.id} className="text-slate-900 dark:bg-slate-900 dark:text-white">
                  {m.nome}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined text-slate-400 text-[18px] absolute right-3 pointer-events-none">expand_more</span>
          </div>
          <div className="relative flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-primary transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
            <span className="material-symbols-outlined text-primary text-[20px] absolute left-4 pointer-events-none">calendar_month</span>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="appearance-none bg-transparent w-full py-2 pl-12 pr-10 text-sm font-bold cursor-pointer outline-none focus:ring-0 text-slate-900 dark:text-slate-100 placeholder-slate-500"
            >
              <option value="7" className="text-slate-900 dark:bg-slate-900 dark:text-white">Últimos 7 dias</option>
              <option value="15" className="text-slate-900 dark:bg-slate-900 dark:text-white">Últimos 15 dias</option>
              <option value="30" className="text-slate-900 dark:bg-slate-900 dark:text-white">Últimos 30 dias</option>
              <option value="90" className="text-slate-900 dark:bg-slate-900 dark:text-white">Últimos 90 dias</option>
              <option value="all" className="text-slate-900 dark:bg-slate-900 dark:text-white">Todo o histórico</option>
            </select>
            <span className="material-symbols-outlined text-slate-400 text-[18px] absolute right-3 pointer-events-none">expand_more</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="Gasto Total (Mês)" 
          value={formatoMoeda(totalGasto)} 
          change={`${filteredLogs.length} ABASTECIMENTO(S)`} 
          isPositive={false} 
          icon="payments" 
          iconColor="text-primary"
          bgColor="bg-primary/10"
        />
        <StatCard 
          title="Média Geral de Consumo" 
          value="8.5 km/L" 
          change="-2.1% EFICIÊNCIA" 
          isPositive={false} 
          icon="speed" 
          iconColor="text-amber-500"
          bgColor="bg-amber-500/10"
        />
        <StatCard 
          title="Van Mais Eficiente" 
          value="ABC-1234" 
          subtitle="Motorista: Ricardo Alves"
          icon="emoji_events" 
          iconColor="text-primary"
          bgColor="bg-primary/10"
        />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h4 className="font-bold text-lg text-slate-900 dark:text-white">Gasto Mensal de Combustível {selectedVeiculoId ? '' : '(Frota Total)'}</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">Evolução do investimento nos últimos 6 meses</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-primary/80"></span>
            <span className="text-xs font-bold text-slate-500 uppercase">Investimento Total R$</span>
          </div>
        </div>
        <div className="relative h-64 w-full mt-12">
          <div className="absolute inset-0 flex items-end justify-between px-2 sm:px-8 pb-1 z-10">
            {chartData.map((item, i) => (
              <div key={item.label + i} className="flex flex-col items-center justify-end gap-3 flex-1 h-full mt-auto">
                <div 
                  className="w-full max-w-[60px] bg-slate-100 dark:bg-slate-800 rounded-t-lg relative group transition-all duration-500 ease-in-out hover:bg-primary/20" 
                  style={{ height: `${item.heightPercentage}%` }}
                >
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-black px-3 py-1.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap pointer-events-none">
                    {formatoMoeda(item.total)}
                  </div>
                  <div className={`absolute inset-0 bg-primary/30 rounded-t-lg transition-colors ${i === 5 ? 'bg-primary/50' : ''}`}></div>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-slate-200 dark:bg-slate-800"></div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
          <h3 className="font-black text-xs uppercase tracking-widest">Registros Detalhados</h3>
          <button className="text-primary text-[10px] font-black uppercase tracking-widest hover:underline">Exportar CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/30 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Data</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Van (Placa)</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Motorista</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Combustível</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Litros</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">R$ / L</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Total</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">KM</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.length === 0 && !loading && (
                <tr><td colSpan={9} className="px-6 py-8 text-center text-slate-500 font-bold">Nenhum abastecimento registrado.</td></tr>
              )}
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-slate-500">
                    {log.data_abastecimento ? new Date(log.data_abastecimento).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : ''}
                  </td>
                  <td className="px-6 py-4 text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">{log.placa}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">{log.motorista_nome || 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black rounded uppercase tracking-widest border border-slate-200 dark:border-slate-700">
                      {log.tipo_combustivel}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-700 dark:text-slate-200">{Number(log.litros).toFixed(2)} L</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-500">R$ {Number(log.valor_unitario).toFixed(2)}</td>
                  <td className="px-6 py-4 text-sm font-black text-slate-900 dark:text-white">R$ {Number(log.custo_total).toFixed(2)}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-500">{log.km_atual} km</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => setViewLog(log)} title="Ver Detalhes" className="p-1.5 text-slate-400 hover:text-primary transition-colors cursor-pointer relative z-10">
                      <span className="material-symbols-outlined text-lg">description</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Exibindo {filteredLogs.length} registros</p>
          <div className="flex gap-2">
            <button className="px-4 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-not-allowed">Anterior</button>
            <button className="px-4 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Próximo</button>
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <button 
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-8 right-8 flex items-center gap-3 px-6 py-4 bg-primary text-white font-black rounded-full shadow-2xl shadow-primary/40 hover:scale-105 active:scale-95 transition-all z-50 group"
      >
        <span className="material-symbols-outlined group-hover:rotate-90 transition-transform">add_circle</span>
        <span className="text-sm uppercase tracking-widest">Registrar Novo Abastecimento</span>
      </button>

      {/* Modal Novo Abastecimento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
              <h3 className="font-black text-lg tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">local_gas_station</span>
                Registrar Abastecimento
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Veículo *</label>
                  <select required value={formData.veiculo_id} onChange={e => setFormData({...formData, veiculo_id: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white">
                    <option value="">Selecione a Van...</option>
                    {veiculos.map(v => (
                      <option key={v.id || v.veiculo_id} value={v.id || v.veiculo_id}>{v.placa} - {v.modelo || v.marca}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Motorista *</label>
                  <select required value={formData.motorista_id} onChange={e => setFormData({...formData, motorista_id: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white">
                    <option value="">Selecione o Motorista...</option>
                    {motoristas.map(m => (
                      <option key={m.id} value={m.id}>{m.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Litros *</label>
                  <input type="number" step="0.01" required value={formData.litros} onChange={e => {
                    const l = e.target.value;
                    const v = formData.valor_unitario;
                    const t = l && v ? (Number(l) * Number(v)).toFixed(2) : formData.custo_total;
                    setFormData({...formData, litros: l, custo_total: t});
                  }} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">R$ / Litro *</label>
                  <input type="number" step="0.01" required value={formData.valor_unitario} onChange={e => {
                    const v = e.target.value;
                    const l = formData.litros;
                    const t = l && v ? (Number(l) * Number(v)).toFixed(2) : formData.custo_total;
                    setFormData({...formData, valor_unitario: v, custo_total: t});
                  }} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Gasto Total *</label>
                  <input type="number" step="0.01" required value={formData.custo_total} onChange={e => setFormData({...formData, custo_total: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-primary/20 rounded-xl p-4 text-sm font-black text-primary focus:ring-2 focus:ring-primary/50" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Hodômetro *</label>
                  <input type="number" required value={formData.km_atual} onChange={e => setFormData({...formData, km_atual: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white" placeholder="KM Atual" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Combustível</label>
                  <select value={formData.tipo_combustivel} onChange={e => setFormData({...formData, tipo_combustivel: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white">
                    <option>Diesel S10</option>
                    <option>Diesel Comum</option>
                    <option>Gasolina Comum</option>
                    <option>Etanol</option>
                    <option>GNV</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Data</label>
                  <input type="date" required value={formData.data_abastecimento} onChange={e => setFormData({...formData, data_abastecimento: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white" />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="px-8 py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all flex items-center gap-2">
                  {saving ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> SALVANDO...</>
                  ) : (
                    <><span className="material-symbols-outlined text-sm">check_circle</span> SALVAR</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal View Details */}
      {viewLog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="font-black text-lg tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">receipt_long</span>
                Comprovante
              </h3>
              <button disabled={saving} onClick={() => setViewLog(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="text-center pb-6 border-b border-dashed border-slate-200 dark:border-slate-700">
                <p className="text-3xl font-black text-slate-900 dark:text-white">R$ {Number(viewLog.custo_total).toFixed(2)}</p>
                <p className="text-sm font-bold text-slate-500 mt-1">{viewLog.data_abastecimento ? new Date(viewLog.data_abastecimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : ''}</p>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Veículo</span>
                  <span className="text-sm font-black uppercase text-slate-900 dark:text-white">{viewLog.placa}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Motorista</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{viewLog.motorista_nome || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Combustível</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{viewLog.tipo_combustivel}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Quantidade</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{Number(viewLog.litros).toFixed(2)} L</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Valor Unit.</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">R$ {Number(viewLog.valor_unitario).toFixed(2)} / L</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Odômetro</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{viewLog.km_atual} km</span>
                </div>
              </div>
            </div>
            <div className="p-5 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center gap-4">
              <button 
                onClick={() => handleDeleteLog(viewLog.id)} 
                disabled={saving}
                className="flex items-center gap-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-4 py-2 rounded-lg font-bold transition-colors text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                {saving ? 'Excluindo...' : 'Excluir'}
              </button>
              <button onClick={() => setViewLog(null)} disabled={saving} className="px-8 py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-black text-xs uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
