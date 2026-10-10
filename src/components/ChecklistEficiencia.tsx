import React, { useState, useEffect } from 'react';

import { apiFetch } from '../services/api';
interface Veiculo {
  id: number;
  placa: string;
  modelo: string;
}

interface Motorista {
  id: number;
  nome: string;
}

interface Checklist {
  id: number;
  veiculo_id: number;
  motorista_id: number;
  data_registro: string;
  freios: 'ok' | 'error';
  pneus: 'ok' | 'error';
  oleo: 'ok' | 'error';
  luzes: 'ok' | 'error';
  limpeza: 'ok' | 'error';
  cintos: 'ok' | 'error';
  extintor?: 'ok' | 'error' | null;
  observacoes: string | null;
  veiculo_placa: string;
  motorista_nome: string;
  resolvido: boolean;
}

export const ChecklistEficiencia: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextMaintenance, setNextMaintenance] = useState<any>(null);
  const [loadingMaintenance, setLoadingMaintenance] = useState(false);
  const [performance, setPerformance] = useState<any>(null);
  const [loadingPerformance, setLoadingPerformance] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [forceNew, setForceNew] = useState(false);
  const [expandedAlertId, setExpandedAlertId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    veiculo_id: '',
    motorista_id: '',
    freios: 'ok',
    pneus: 'ok',
    oleo: 'ok',
    luzes: 'ok',
    limpeza: 'ok',
    cintos: 'ok',
    observacoes: '',
  });

  const fetchData = async () => {
    try {
      const [resChecklists, resVeiculos, resMotoristas] = await Promise.all([
        apiFetch('/api/checklists'),
        apiFetch('/api/fleet/management'),
        apiFetch('/api/motoristas')
      ]);

      if (resChecklists.ok) setChecklists(await resChecklists.json());
      if (resVeiculos.ok) setVeiculos(await resVeiculos.json());
      if (resMotoristas.ok) setMotoristas(await resMotoristas.json());

    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (veiculos.length > 0 && !formData.veiculo_id) {
      setFormData(prev => ({ ...prev, veiculo_id: (veiculos[0] as any).veiculo_id || veiculos[0].id }));
    }
  }, [veiculos]);

  useEffect(() => {
    if (motoristas.length > 0 && !formData.motorista_id) {
      setFormData(prev => ({ ...prev, motorista_id: motoristas[0].id.toString() }));
    }
  }, [motoristas]);

  const activeVeiculoId = formData.veiculo_id || (veiculos.length > 0 ? ((veiculos[0] as any).veiculo_id || veiculos[0].id) : null);
  const activeVeiculo = veiculos.find(v => (v as any).veiculo_id == activeVeiculoId || v.id == activeVeiculoId);
  const activeMotoristaId = formData.motorista_id || (motoristas.length > 0 ? motoristas[0].id : null);
  const activeMotorista = motoristas.find(m => m.id == activeMotoristaId);

  useEffect(() => {
    if (activeVeiculoId) {
      const fetchVehicleData = async () => {
        setLoadingMaintenance(true);
        setLoadingPerformance(true);
        try {
          const [resNextMaint, resPerf] = await Promise.all([
            apiFetch(`/api/frota/${activeVeiculoId}/next-maintenance`),
            apiFetch(`/api/frota/${activeVeiculoId}/performance`)
          ]);
          if (resNextMaint.ok) {
            setNextMaintenance(await resNextMaint.json());
          }
          if (resPerf.ok) {
            setPerformance(await resPerf.json());
          }
        } catch (err) {
          console.error('Erro ao buscar dados do veículo:', err);
        } finally {
          setLoadingMaintenance(false);
          setLoadingPerformance(false);
        }
      };
      fetchVehicleData();
    }
  }, [activeVeiculoId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const submitData = {
      ...formData,
      veiculo_id: activeVeiculoId,
      motorista_id: activeMotoristaId,
    };

    try {
      const response = await apiFetch('/api/checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });

      if (response.ok) {
        setFormData(prev => ({
          ...prev, freios: 'ok', pneus: 'ok', oleo: 'ok', luzes: 'ok', limpeza: 'ok', cintos: 'ok', observacoes: '',
        }));
        setForceNew(false);
        fetchData();
      } else {
        alert('Erro ao salvar checklist');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar checklist');
    } finally {
      setSaving(false);
    }
  };

  const handleResolveAlert = async (id: number) => {
    try {
      const response = await apiFetch(`/api/checklists/${id}/resolve`, {
        method: 'PUT'
      });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleNavVeiculo = (direction: 'next' | 'prev') => {
    if (veiculos.length === 0) return;
    const currentIndex = veiculos.findIndex(v => (v as any).veiculo_id == activeVeiculoId || v.id == activeVeiculoId);
    if (currentIndex === -1) return;

    let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= veiculos.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = veiculos.length - 1;

    const nextV = veiculos[nextIndex];
    setFormData(prev => ({
      ...prev,
      veiculo_id: (nextV as any).veiculo_id || nextV.id,
      freios: 'ok', pneus: 'ok', oleo: 'ok', luzes: 'ok', limpeza: 'ok', cintos: 'ok', observacoes: ''
    }));
    setForceNew(false);
  };

  // Check if active vehicle already has a checklist for today
  const hasChecklistToday = checklists.some(c => {
    if (c.veiculo_id != activeVeiculoId) return false;
    const checklistDate = new Date(c.data_registro);
    const today = new Date();
    return checklistDate.getDate() === today.getDate() &&
      checklistDate.getMonth() === today.getMonth() &&
      checklistDate.getFullYear() === today.getFullYear();
  });

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
      {/* Vehicle Summary Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative">
            <div className="w-32 h-24 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 border-2 border-primary/20">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBcjTzqo9Cd_SaqGm_iFc-sDZeF2qljNsNB8avhKKWP8pN-NagAHoViurZidC7mQ1z8cbQSV0GpKLfzZHrn9iIZ55os7FjI1iNVdLicbDDcMnW8eFJvhmfs-Iwy0lonJLq0ZDUJ_T_wmscecO2HIO4jUGRK0KdyS-vQu4qa5qMRp1mZEy-_QZ1bt4aGl3YOGDBvWSF0xa93OyZ12AYsAa-ZpfiqqJJNdMrgwTFiNLvtUOKDMZ9yiQ2Q9-W5uVn_oQDU5o7Ed-jcCgLq"
                alt="Mercedes-Benz Sprinter"
                className="w-full h-full object-cover"
              />
            </div>
            <button className="absolute -bottom-2 -right-2 p-1.5 bg-primary text-white rounded-full shadow-lg hover:rotate-180 transition-transform duration-500">
              <span className="material-symbols-outlined text-sm">cached</span>
            </button>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 mr-1 print:hidden">
                <button
                  onClick={() => handleNavVeiculo('prev')}
                  title="Veículo Anterior"
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">chevron_left</span>
                </button>
                <button
                  onClick={() => handleNavVeiculo('next')}
                  title="Próximo Veículo"
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">chevron_right</span>
                </button>
              </div>
              <h1 className="text-2xl font-black tracking-tight">{activeVeiculo ? activeVeiculo.modelo : 'Mercedes-Benz Sprinter 516'}</h1>
              <span className="hidden sm:inline-block px-2.5 py-0.5 bg-emerald-500/10 text-emerald-500 text-[10px] font-black rounded-full border border-emerald-500/20 uppercase tracking-widest flex-shrink-0">EM OPERAÇÃO</span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-500 dark:text-slate-400 pl-[84px]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">pin</span>
                <span className="font-mono text-sm tracking-widest font-black text-slate-700 dark:text-slate-200 uppercase">{activeVeiculo ? activeVeiculo.placa : 'ABC-4G21'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">speed</span>
                <span className="text-sm font-bold">84.520 KM</span>
              </div>
              <div className="flex items-center gap-2 text-primary font-bold">
                <span className="material-symbols-outlined text-sm">person</span>
                <span className="text-sm">Motorista: {activeMotorista ? activeMotorista.nome : 'Carlos Almeida'}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-3 print:hidden">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors text-xs font-black uppercase tracking-widest">
            <span className="material-symbols-outlined text-lg">description</span>
            Relatório
          </button>
          <button
            onClick={() => {
              setForceNew(true);
              setFormData(prev => ({
                ...prev, freios: 'ok', pneus: 'ok', oleo: 'ok', luzes: 'ok', limpeza: 'ok', cintos: 'ok', observacoes: ''
              }));
              setTimeout(() => {
                document.getElementById('checklist-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 100);
            }}
            className="flex items-center gap-2 px-6 py-2 bg-primary text-white hover:bg-primary/90 rounded-lg transition-colors text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Novo Checklist
          </button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Column 1: Daily Checklist */}
        <div className="lg:col-span-3 print:hidden">
          <div id="checklist-form" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden h-full shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
              <h3 className="font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg">fact_check</span>
                Checklist Diário
              </h3>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Hoje</span>
            </div>

            {hasChecklistToday && !forceNew ? (
              <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-2">
                  <span className="material-symbols-outlined text-3xl">check_circle</span>
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-800 dark:text-slate-200">Perfeito!</h4>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">O checklist diário deste veículo já foi realizado hoje.</p>
                </div>
                <button
                  onClick={() => handleNavVeiculo('next')}
                  className="px-6 py-2 mt-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black text-xs uppercase tracking-widest rounded-lg transition-colors flex items-center gap-2"
                >
                  Próximo Veículo
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </button>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {[
                  { label: 'Sistema de Freios', field: 'freios' as const },
                  { label: 'Estado dos Pneus', field: 'pneus' as const },
                  { label: 'Nível do Óleo', field: 'oleo' as const },
                  { label: 'Luzes e Sinalização', field: 'luzes' as const },
                  { label: 'Limpeza Interna', field: 'limpeza' as const },
                  { label: 'Cintos de Segurança', field: 'cintos' as const },
                ].map((item, idx) => (
                  <div key={idx} className={`flex items-center justify-between group ${idx !== 0 ? 'border-t border-slate-100 dark:border-slate-800 pt-4' : ''}`}>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{item.label}</span>
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                      <button
                        onClick={() => setFormData(prev => ({ ...prev, [item.field]: 'ok' }))}
                        className={`px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${formData[item.field] === 'ok' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-emerald-500'}`}
                      >OK</button>
                      <button
                        onClick={() => setFormData(prev => ({ ...prev, [item.field]: 'error' }))}
                        className={`px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${formData[item.field] === 'error' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-400 hover:text-rose-500'}`}
                      >X</button>
                    </div>
                  </div>
                ))}
                <div className="pt-2">
                  <input
                    type="text"
                    placeholder="Ex: Pneu furado..."
                    value={formData.observacoes}
                    onChange={e => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="w-full py-3 bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all rounded-lg font-black text-xs uppercase tracking-widest mt-4 disabled:opacity-50"
                >
                  {saving ? 'INSERINDO...' : 'SALVAR CHECKLIST'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Next Maintenance */}
        <div className="lg:col-span-5 print:col-span-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between h-full shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-black text-xs uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">calendar_clock</span>
                  Próxima Manutenção
                </h3>
                <span className={`p-2 rounded-lg ${
                  nextMaintenance?.veiculo?.km_restantes <= 1000 ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary'
                }`}>
                  <span className="material-symbols-outlined">{nextMaintenance?.veiculo?.km_restantes <= 1000 ? 'warning' : 'build'}</span>
                </span>
              </div>
              <div className="text-center space-y-4 py-6">
                <div className="relative inline-flex items-center justify-center">
                  <svg className="size-48 -rotate-90">
                    <circle className="text-slate-100 dark:text-slate-800" cx="96" cy="96" fill="transparent" r="88" stroke="currentColor" strokeWidth="12"></circle>
                    <circle 
                      className={nextMaintenance?.veiculo?.km_restantes <= 1000 ? "text-amber-500" : "text-primary"}
                      cx="96" cy="96" fill="transparent" r="88" stroke="currentColor" 
                      strokeDasharray="552.92" 
                      strokeDashoffset={
                        nextMaintenance?.veiculo?.km_proxima_revisao && nextMaintenance?.veiculo?.km_atual 
                          ? 552.92 - (552.92 * Math.max(0, Math.min(nextMaintenance.veiculo.km_atual / nextMaintenance.veiculo.km_proxima_revisao, 1)))
                          : 552.92
                      } 
                      strokeWidth="12" strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
                    ></circle>
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    {loadingMaintenance ? (
                       <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                          {nextMaintenance?.veiculo?.km_restantes != null 
                            ? new Intl.NumberFormat('pt-BR').format(nextMaintenance.veiculo.km_restantes)
                            : '--'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">km restantes</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="pt-4">
                  <h4 className="text-xl font-black text-slate-900 dark:text-white">
                    {nextMaintenance?.next_maintenance?.servico || 'Nenhuma agendada'}
                  </h4>
                  {nextMaintenance?.next_maintenance?.data_agendada && (
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
                      Previsão: {new Date(nextMaintenance.next_maintenance.data_agendada + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {nextMaintenance?.next_maintenance && (
              <div className={`mt-6 p-4 border rounded-xl flex gap-4 ${
                nextMaintenance.next_maintenance.tipo === 'Urgente' 
                  ? 'bg-red-500/5 border-red-500/10' 
                  : 'bg-primary/5 border-primary/10'
              }`}>
                <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${
                  nextMaintenance.next_maintenance.tipo === 'Urgente'
                    ? 'bg-red-500/20 text-red-500'
                    : 'bg-primary/20 text-primary'
                }`}>
                  <span className="material-symbols-outlined">
                    {nextMaintenance.next_maintenance.tipo === 'Urgente' ? 'error' : 'build'}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                    {nextMaintenance.next_maintenance.tipo === 'Urgente' ? 'Atenção Imediata' : 'Preventiva Programada'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                    A manutenção está pendente. Verifique com a oficina a disponibilidade do veículo.
                  </p>
                </div>
              </div>
            )}
            {!nextMaintenance?.next_maintenance && (
              <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/50 rounded-xl flex gap-4">
                <div className="size-10 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center text-slate-400 shrink-0">
                  <span className="material-symbols-outlined">check_circle</span>
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Tudo em ordem</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">Nenhuma manutenção futura encontrada para este veículo no momento.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Performance */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col h-full">
            <h3 className="font-black text-xs uppercase tracking-widest mb-6 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">analytics</span>
                Consumo e Performance
              </span>
              <span className="text-[10px] text-slate-400">ESTE MÊS</span>
            </h3>
            
            {loadingPerformance ? (
               <div className="flex-1 flex items-center justify-center">
                 <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
               </div>
            ) : (
              <div className="space-y-6 flex-1 flex flex-col">
                {/* KM/L Metric */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Consumo Médio</p>
                      <p className="text-2xl font-black text-primary tracking-tight">
                        {performance?.consumo_medio || '0.0'} <span className="text-sm font-bold text-slate-400 uppercase">km/L</span>
                      </p>
                    </div>
                    {Number(performance?.consumo_medio) > 0 && (
                      <span className="text-emerald-500 text-xs font-black flex items-center">
                        <span className="material-symbols-outlined text-sm">trending_up</span> {performance?.variacao_consumo || ''}
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-primary h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min((performance?.consumo_medio || 0) * 10, 100)}%` }}></div>
                  </div>
                </div>
                {/* Cost per KM */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Custo por KM</p>
                      <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        R$ {performance?.custo_km?.replace('.', ',') || '0,00'}
                      </p>
                    </div>
                    {Number(performance?.custo_km) > 0 && (
                      <span className="text-rose-500 text-xs font-black flex items-center">
                        <span className="material-symbols-outlined text-sm">trending_up</span> {performance?.variacao_custo || ''}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1 h-8 items-end">
                    <div className="flex-1 bg-primary/20 h-2/3 rounded-t-sm"></div>
                    <div className="flex-1 bg-primary/20 h-3/4 rounded-t-sm"></div>
                    <div className="flex-1 bg-primary/20 h-1/2 rounded-t-sm"></div>
                    <div className="flex-1 bg-primary/20 h-4/5 rounded-t-sm"></div>
                    <div className="flex-1 bg-primary/20 h-3/5 rounded-t-sm"></div>
                    <div className="flex-1 bg-primary h-full rounded-t-sm shadow-[0_-4px_8px_rgba(19,127,236,0.3)]"></div>
                  </div>
                </div>
                {/* Total Spend */}
                <div className="p-4 bg-slate-900 dark:bg-slate-950 rounded-xl text-white shadow-lg mt-auto">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-primary/20 rounded-lg text-primary">
                      <span className="material-symbols-outlined">payments</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Gasto Total Combustível</p>
                  </div>
                  <p className="text-3xl font-black mb-1 tracking-tight">R$ {performance?.gasto_total?.replace('.', ',') || '0,00'}</p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    <span className="material-symbols-outlined text-xs">history</span>
                    <span>vs R$ {performance?.gasto_mes_anterior?.replace('.', ',') || '0,00'} mês anterior</span>
                  </div>
                </div>
              </div>
            )}
            <button 
              onClick={() => onNavigate && onNavigate('abastecimento')}
              className="w-full mt-6 py-3 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all print:hidden"
            >
              Ver Detalhes Financeiros
            </button>
          </div>
        </div>
      </div>

      {/* Recent Events Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm print:break-inside-avoid">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <h3 className="font-black text-xs uppercase tracking-widest">Alertas e Ocorrências Recentes</h3>
          <button className="text-primary text-[10px] font-black uppercase tracking-widest hover:underline print:hidden">Ver tudo</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/30 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Data</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Evento</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Responsável</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Impacto</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {checklists.filter(c => c.veiculo_id == activeVeiculoId).length === 0 && !loading && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500 font-bold">Nenhum registro encontrado para este veículo.</td></tr>
              )}
              {checklists.filter(c => c.veiculo_id == activeVeiculoId).map((item) => {
                const hasError = ['error'].some(status => [item.freios, item.pneus, item.oleo, item.luzes, item.limpeza, item.cintos, item.extintor].includes(status as any));
                const evento = hasError ? 'Problemas relatados no checklist' : 'Checklist concluído: 100% OK';
                const impacto = hasError ? (item.resolvido ? 'RESOLVIDO' : 'MÉDIO') : 'N/A';
                const statusStr = hasError ? (item.resolvido ? 'Resolvido' : 'Aguardando Revisão') : 'Confirmado';
                const dataFormatada = new Date(item.data_registro).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

                return (
                  <React.Fragment key={item.id}>
                    <tr onClick={() => hasError && setExpandedAlertId(expandedAlertId === item.id ? null : item.id)} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors ${hasError ? 'cursor-pointer' : ''}`}>
                      <td className="px-6 py-4 font-bold text-slate-500 text-xs">{dataFormatada}</td>
                      <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          {evento}
                          {hasError && (
                            <span className={`material-symbols-outlined text-sm text-slate-400 transition-transform ${expandedAlertId === item.id ? 'rotate-180' : ''}`}>
                              expand_more
                            </span>
                          )}
                        </div>
                      </td>
                    <td className="px-6 py-4 font-bold text-slate-600 dark:text-slate-400">{item.motorista_nome}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-[10px] font-black rounded border ${
                        impacto === 'MÉDIO' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 
                        impacto === 'RESOLVIDO' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 
                        'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        }`}>
                        {impacto}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`flex items-center gap-2 font-black text-[10px] uppercase tracking-widest ${
                          statusStr === 'Confirmado' || statusStr === 'Resolvido' ? 'text-emerald-500' : 'text-amber-500'
                          }`}>
                          <span className="material-symbols-outlined text-sm">
                            {statusStr === 'Confirmado' || statusStr === 'Resolvido' ? 'check_circle' : 'warning'}
                          </span>
                          {statusStr}
                        </div>
                        {statusStr === 'Aguardando Revisão' && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleResolveAlert(item.id); }}
                            className="p-1 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded transition-colors print:hidden"
                            title="Marcar como Resolvido"
                          >
                            <span className="material-symbols-outlined text-sm leading-none">done</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedAlertId === item.id && hasError && (
                    <tr className="bg-slate-50/30 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                      <td colSpan={5} className="px-6 py-4">
                        <div className="flex flex-col sm:flex-row gap-6 text-xs pl-8">
                          <div>
                            <span className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Itens com defeito reportados:</span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {item.freios === 'error' && <span className="px-2 py-1 bg-rose-500/10 text-rose-500 rounded font-bold uppercase text-[10px] tracking-widest border border-rose-500/20">Freios</span>}
                              {item.extintor === 'error' && <span className="px-2 py-1 bg-rose-500/10 text-rose-500 rounded font-bold uppercase text-[10px] tracking-widest border border-rose-500/20">Extintor</span>}
                              {item.pneus === 'error' && <span className="px-2 py-1 bg-rose-500/10 text-rose-500 rounded font-bold uppercase text-[10px] tracking-widest border border-rose-500/20">Pneus</span>}
                              {item.oleo === 'error' && <span className="px-2 py-1 bg-rose-500/10 text-rose-500 rounded font-bold uppercase text-[10px] tracking-widest border border-rose-500/20">Óleo</span>}
                              {item.luzes === 'error' && <span className="px-2 py-1 bg-rose-500/10 text-rose-500 rounded font-bold uppercase text-[10px] tracking-widest border border-rose-500/20">Luzes</span>}
                              {item.limpeza === 'error' && <span className="px-2 py-1 bg-rose-500/10 text-rose-500 rounded font-bold uppercase text-[10px] tracking-widest border border-rose-500/20">Limpeza</span>}
                              {item.cintos === 'error' && <span className="px-2 py-1 bg-rose-500/10 text-rose-500 rounded font-bold uppercase text-[10px] tracking-widest border border-rose-500/20">Cintos</span>}
                            </div>
                          </div>
                          {item.observacoes && (
                            <div className="flex-1">
                              <span className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Observações do Motorista:</span>
                              <p className="mt-2 text-slate-700 dark:text-slate-300 font-medium italic border-l-2 border-slate-300 dark:border-slate-700 pl-3">"{item.observacoes}"</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
