import React, { useEffect, useState } from 'react';

interface School {
  id: number;
  nome: string;
  endereco: string;
  telefone: string;
  responsavel_contato: string;
  tipo: 'Pública' | 'Particular';
  studentsCount: number;
  activeVans: number;
  activeVansDetails?: string;
}

export const Escolas: React.FC = () => {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    endereco: '',
    telefone: '',
    responsavel_contato: '',
    tipo: 'Particular' as 'Pública' | 'Particular'
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/escolas');
      if (res.ok) {
        const data = await res.json();
        setSchools(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    } catch (err) {
      console.error('Erro ao buscar escolas:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = (school?: School) => {
    if (school) {
      setEditingSchool(school);
      setFormData({
        nome: school.nome,
        endereco: school.endereco || '',
        telefone: school.telefone || '',
        responsavel_contato: school.responsavel_contato || '',
        tipo: school.tipo || 'Particular'
      });
    } else {
      setEditingSchool(null);
      setFormData({
        nome: '',
        endereco: '',
        telefone: '',
        responsavel_contato: '',
        tipo: 'Particular'
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingSchool ? 'PUT' : 'POST';
    const url = editingSchool ? `/api/escolas/${editingSchool.id}` : '/api/escolas';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(false);
        fetchData();
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Erro ao salvar escola');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta escola?')) return;
    try {
      const res = await fetch(`/api/escolas/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Erro ao excluir escola');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão');
    }
  };

  const filteredSchools = schools.filter(school =>
    school.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (school.endereco || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="p-8 text-center font-bold">Carregando escolas...</div>;
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight">Gestão de Escolas</h2>
          <p className="text-slate-500 dark:text-slate-400">Administre as unidades de ensino e os pontos de embarque/desembarque.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
            <input
              type="text"
              placeholder="Buscar escola..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 h-11 w-64 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center justify-center gap-2 rounded-lg h-11 px-6 bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">add_business</span>
            <span>Nova Escola</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredSchools.map((school) => (
          <div key={school.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl">domain</span>
                </div>
                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded ${school.tipo === 'Particular' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-emerald-500/10 text-emerald-500'
                  }`}>
                  {school.tipo || 'Particular'}
                </span>
              </div>

              <div>
                <h3 className="text-lg font-black tracking-tight group-hover:text-primary transition-colors">{school.nome}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                  <span className="material-symbols-outlined text-[14px]">location_on</span>
                  {school.endereco || 'Sem endereço'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Alunos</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black tracking-tight">{school.studentsCount}</span>
                    <span className="material-symbols-outlined text-slate-300 text-[18px]">groups</span>
                  </div>
                </div>
                <div title={school.activeVansDetails ? `Vans: ${school.activeVansDetails}` : 'Nenhuma van vinculada'}>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Vans Ativas</p>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black tracking-tight">{school.activeVans}</span>
                      <span className="material-symbols-outlined text-slate-300 text-[18px]">airport_shuttle</span>
                    </div>
                    {school.activeVansDetails && (
                      <div className="text-[10px] text-slate-500 font-medium truncate max-w-[120px]">
                        {school.activeVansDetails}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Contato:</span>
                  <span className="font-bold">{school.responsavel_contato || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Telefone:</span>
                  <span className="font-bold">{school.telefone || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
              <button className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">Ver Rotas</button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenModal(school)}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-primary transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
                <button
                  onClick={() => handleDelete(school.id)}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-rose-500 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-black">{editingSchool ? 'Editar Escola' : 'Nova Escola'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Nome da Escola</label>
                <input
                  type="text" required
                  value={formData.nome}
                  onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="Ex: Colégio Dom Bosco"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Telefone</label>
                  <input
                    type="text"
                    value={formData.telefone}
                    onChange={e => setFormData({ ...formData, telefone: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="(00) 0000-0000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Tipo</label>
                  <select
                    value={formData.tipo}
                    onChange={e => setFormData({ ...formData, tipo: e.target.value as any })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    <option value="Particular">Particular</option>
                    <option value="Pública">Pública</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Responsável Contato</label>
                <input
                  type="text"
                  value={formData.responsavel_contato}
                  onChange={e => setFormData({ ...formData, responsavel_contato: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="Ex: Diretora Márcia"
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Endereço</label>
                <textarea
                  value={formData.endereco}
                  onChange={e => setFormData({ ...formData, endereco: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg p-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all min-h-[80px]"
                  placeholder="Rua, Número, Bairro..."
                />
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
