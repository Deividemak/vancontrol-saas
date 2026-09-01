import React, { useEffect, useState } from 'react';

interface Driver {
  id: number;
  nome: string;
  telefone: string;
  cnh: string;
  vencimento_cnh: string;
  categoria: string;
  status?: string;
  avatar?: string;
}

export const Motoristas: React.FC = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    cnh: '',
    vencimento_cnh: '',
    categoria: '',
    status: 'Ativo'
  });

  const fetchDrivers = () => {
    setLoading(true);
    fetch('/api/motoristas')
      .then(res => res.json())
      .then(data => {
        const enriched = data.map((d: any) => ({
          ...d,
          // Formatar data para exibição se necessário, mas aqui usaremos como string do banco
          vencimento_cnh: d.vencimento_cnh ? d.vencimento_cnh.split('T')[0] : '',
          avatar: d.avatar_url || `https://picsum.photos/seed/driver${d.id}/200`
        }));
        setDrivers(enriched);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao buscar motoristas:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  const handleOpenModal = (driver?: Driver) => {
    if (driver) {
      setEditingDriver(driver);
      setFormData({
        nome: driver.nome,
        telefone: driver.telefone,
        cnh: driver.cnh,
        vencimento_cnh: driver.vencimento_cnh,
        categoria: driver.categoria,
        status: driver.status || 'Ativo'
      });
    } else {
      setEditingDriver(null);
      setFormData({
        nome: '',
        telefone: '',
        cnh: '',
        vencimento_cnh: '',
        categoria: '',
        status: 'Ativo'
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingDriver ? 'PUT' : 'POST';
    const url = editingDriver ? `/api/motoristas/${editingDriver.id}` : '/api/motoristas';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(false);
        fetchDrivers();
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Erro ao salvar motorista');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este motorista?')) return;

    try {
      const res = await fetch(`/api/motoristas/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchDrivers();
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Erro ao excluir motorista');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão');
    }
  };

  if (loading) {
    return <div className="p-8 text-center font-bold">Carregando motoristas...</div>;
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500 relative">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black tracking-tight">Motoristas</h2>
          <p className="text-slate-500 dark:text-slate-400">Gerencie sua equipe de condutores e documentação.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
        >
          <span className="material-symbols-outlined">person_add</span>
          Novo Motorista
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {drivers.map((d) => (
          <div key={d.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex gap-6 items-center group hover:shadow-md transition-all">
            <div className="size-24 rounded-2xl border-2 border-slate-100 dark:border-slate-800 overflow-hidden shrink-0 group-hover:border-primary/20 transition-colors">
              <img src={d.avatar} alt={d.nome} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-black text-lg truncate text-slate-900 dark:text-white">{d.nome}</h3>
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${d.status === 'Ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                  {d.status}
                </span>
              </div>

              <div className="space-y-1 mb-3">
                <p className="text-[10px] text-slate-500 font-bold uppercase">
                  CNH: <span className="text-slate-900 dark:text-slate-300">{d.cnh}</span>
                  <span className="mx-2">•</span>
                  Cat: <span className="text-primary">{d.categoria}</span>
                </p>
                <p className="text-[10px] text-slate-500 font-bold uppercase">
                  Vencimento: <span className={new Date(d.vencimento_cnh) < new Date() ? 'text-rose-500' : 'text-slate-900 dark:text-slate-300'}>
                    {new Date(d.vencimento_cnh).toLocaleDateString('pt-BR')}
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined text-sm">call</span>
                <span className="text-xs font-bold">{d.telefone}</span>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleOpenModal(d)}
                  className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-black">{editingDriver ? 'Editar Motorista' : 'Novo Motorista'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Nome Completo</label>
                  <input
                    type="text" required
                    value={formData.nome}
                    onChange={e => setFormData({ ...formData, nome: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="Ex: João Silva"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Número CNH</label>
                  <input
                    type="text" required
                    value={formData.cnh}
                    onChange={e => setFormData({ ...formData, cnh: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="00000000000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Categoria</label>
                  <select
                    required
                    value={formData.categoria}
                    onChange={e => setFormData({ ...formData, categoria: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    <option value="">Selecione</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="AB">AB</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                    <option value="E">E</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Vencimento CNH</label>
                  <input
                    type="date" required
                    value={formData.vencimento_cnh}
                    onChange={e => setFormData({ ...formData, vencimento_cnh: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Telefone</label>
                  <input
                    type="text" required
                    value={formData.telefone}
                    onChange={e => setFormData({ ...formData, telefone: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="(11) 99999-9999"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                    <option value="Afastado">Afastado</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 h-12 rounded-xl bg-primary font-bold text-sm text-white shadow-lg shadow-primary/20 hover:brightness-110 transition-all">Salvar Motorista</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
