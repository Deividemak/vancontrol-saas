import React, { useEffect, useState } from 'react';

interface FleetVehicle {
  veiculo_id: number;
  placa: string;
  modelo: string;
  ano: number;
  capacidade: string;
  veiculo_status: string;
  motorista_nome: string;
  motorista_telefone: string;
  motorista_fixo_id?: number | null;
  rota_id?: number | null;
  rota_nome: string;
  rota_periodo: string;
  escola_id?: number | null;
  escola_nome: string;
}

interface Escola {
  id: number;
  nome: string;
}

interface Motorista {
  id: number;
  nome: string;
}

interface Rota {
  id: number;
  nome: string;
  periodo: string;
}

export const Frota: React.FC = () => {
  const [fleet, setFleet] = useState<FleetVehicle[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [escolas, setEscolas] = useState<Escola[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(null);
  const [formData, setFormData] = useState({
    placa: '',
    modelo: '',
    ano: new Date().getFullYear(),
    capacidade: '',
    status: 'Disponível',
    motorista_id: '' as string | number,
    rota_id: '' as string | number,
    escola_id: '' as string | number
  });

  const fetchFleet = () => {
    setLoading(true);
    fetch('/api/fleet/management')
      .then(res => res.json())
      .then(data => {
        setFleet(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao buscar frota:', err);
        setLoading(false);
      });
  };

  const fetchMotoristas = () => {
    fetch('/api/motoristas')
      .then(res => res.json())
      .then(data => setMotoristas(data))
      .catch(err => console.error('Erro ao buscar motoristas:', err));
  };

  const fetchRotas = () => {
    fetch('/api/rotas')
      .then(res => res.json())
      .then(data => setRotas(data))
      .catch(err => console.error('Erro ao buscar rotas:', err));
  };

  const fetchEscolas = () => {
    fetch('/api/escolas')
      .then(res => res.json())
      .then(data => setEscolas(data))
      .catch(err => console.error('Erro ao buscar escolas:', err));
  };

  useEffect(() => {
    fetchFleet();
    fetchMotoristas();
    fetchRotas();
    fetchEscolas();
  }, []);

  const handleOpenModal = (vehicle?: FleetVehicle) => {
    if (vehicle) {
      setEditingVehicle(vehicle);
      setFormData({
        placa: vehicle.placa,
        modelo: vehicle.modelo,
        ano: vehicle.ano,
        capacidade: vehicle.capacidade,
        status: vehicle.veiculo_status,
        motorista_id: vehicle.motorista_fixo_id || '',
        rota_id: vehicle.rota_id || '',
        escola_id: vehicle.escola_id || ''
      });
    } else {
      setEditingVehicle(null);
      setFormData({
        placa: '',
        modelo: '',
        ano: new Date().getFullYear(),
        capacidade: '',
        status: 'Disponível',
        motorista_id: '',
        rota_id: '',
        escola_id: ''
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingVehicle ? 'PUT' : 'POST';
    const url = editingVehicle ? `/api/frota/${editingVehicle.veiculo_id}` : '/api/frota';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(false);
        fetchFleet();
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Erro ao salvar veículo');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este veículo?')) return;

    try {
      const res = await fetch(`/api/frota/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchFleet();
      } else {
        alert('Erro ao excluir veículo');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão');
    }
  };

  if (loading) {
    return <div className="p-8 text-center font-bold">Carregando frota...</div>;
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500 relative">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black tracking-tight">Gestão da Frota</h2>
          <p className="text-slate-500 dark:text-slate-400">Controle seus veículos, documentação e disponibilidade.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
        >
          <span className="material-symbols-outlined">add_box</span>
          Novo Veículo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {fleet.map((v) => (
          <div key={v.veiculo_id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl group-hover:bg-primary/10 transition-colors">
                <span className="material-symbols-outlined text-primary text-3xl">airport_shuttle</span>
              </div>
              <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${v.veiculo_status === 'Em Rota' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                v.veiculo_status === 'Disponível' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                  v.veiculo_status === 'Sem Motorista' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400' :
                    'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                }`}>
                {v.veiculo_status}
              </span>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">{v.placa}</h3>
            <p className="text-sm text-slate-500 font-bold uppercase mb-4">{v.modelo} • {v.ano}</p>

            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Capacidade</span>
                <span className="font-bold">{v.capacidade}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Motorista</span>
                <span className={`font-bold ${!v.motorista_nome ? 'text-rose-500 flex items-center gap-1' : ''}`}>
                  {!v.motorista_nome && <span className="material-symbols-outlined text-sm">warning</span>}
                  {v.motorista_nome || 'Sem Motorista'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Escola</span>
                <span className="font-bold">{v.escola_nome || 'Não Vinculada'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Rota</span>
                <span className="font-bold">{v.rota_nome || 'N/A'} ({v.rota_periodo || '-'})</span>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-black uppercase tracking-widest transition-colors">Detalhes</button>
              <button
                onClick={() => handleOpenModal(v)}
                className="p-2 text-slate-400 hover:text-primary transition-colors"
                title="Editar"
              >
                <span className="material-symbols-outlined">edit</span>
              </button>
              <button
                onClick={() => handleDelete(v.veiculo_id)}
                className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                title="Excluir"
              >
                <span className="material-symbols-outlined">delete</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-black">{editingVehicle ? 'Editar Veículo' : 'Novo Veículo'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Placa</label>
                <input
                  type="text" required
                  value={formData.placa}
                  onChange={e => setFormData({ ...formData, placa: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="ABC-1234"
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Modelo</label>
                <input
                  type="text" required
                  value={formData.modelo}
                  onChange={e => setFormData({ ...formData, modelo: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="Ex: Mercedes Sprinter"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Ano</label>
                  <input
                    type="number" required
                    value={formData.ano}
                    onChange={e => setFormData({ ...formData, ano: parseInt(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Capacidade</label>
                  <input
                    type="text" required
                    value={formData.capacidade}
                    onChange={e => setFormData({ ...formData, capacidade: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="Ex: 20 Lugares"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Motorista Responsável</label>
                <select
                  value={formData.motorista_id}
                  onChange={e => setFormData({ ...formData, motorista_id: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all font-sans"
                >
                  <option value="">Selecione um motorista...</option>
                  {motoristas.map(m => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Escola Atendida</label>
                <select
                  value={formData.escola_id}
                  onChange={e => setFormData({ ...formData, escola_id: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all font-sans"
                >
                  <option value="">Selecione uma escola...</option>
                  {escolas.map(e => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Rota Atribuída</label>
                <select
                  value={formData.rota_id}
                  onChange={e => setFormData({ ...formData, rota_id: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all font-sans"
                >
                  <option value="">Nenhuma Rota</option>
                  {rotas.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.nome === r.periodo ? r.nome : `${r.nome} (${r.periodo})`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all font-sans"
                >
                  <option value="Disponível">Disponível</option>
                  <option value="Em Rota">Em Rota</option>
                  <option value="Manutenção">Manutenção</option>
                  <option value="Sem Motorista">Sem Motorista</option>
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 h-11 rounded-lg bg-primary font-bold text-sm text-white shadow-lg shadow-primary/20 hover:brightness-110 transition-all">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
