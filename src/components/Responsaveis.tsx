import React, { useEffect, useState } from 'react';

import { apiFetch } from '../services/api';
import { PortalResponsavel } from './operacao/PortalResponsavel';
import { FamiliaResponsavel } from './familia/Familia';
interface Responsible {
  id: number;
  nome: string;
  email: string;
  cpf: string;
  telefone: string;
  endereco_residencial?: string;
  status: string;
  total_alunos: number;
  alunos_nomes?: string;
  whatsapp_ativo?: boolean;
  portal_ultimo_acesso?: string | null;
}

export const Responsaveis: React.FC<{ onAdicionarFilho?: (resp: { id: number; nome: string }) => void }> = ({ onAdicionarFilho }) => {
  const [responsibles, setResponsibles] = useState<Responsible[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRes, setEditingRes] = useState<Responsible | null>(null);
  const [portalDe, setPortalDe] = useState<Responsible | null>(null);
  const [familiaDe, setFamiliaDe] = useState<Responsible | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    cpf: '',
    telefone: '',
    endereco_residencial: '',
    status: 'Ativo'
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/responsaveis');
      if (res.ok) {
        const data = await res.json();
        setResponsibles(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    } catch (err) {
      console.error('Erro ao buscar responsáveis:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = (res?: Responsible) => {
    if (res) {
      setEditingRes(res);
      setFormData({
        nome: res.nome,
        email: res.email || '',
        cpf: res.cpf || '',
        telefone: res.telefone,
        endereco_residencial: res.endereco_residencial || '',
        status: res.status || 'Ativo'
      });
    } else {
      setEditingRes(null);
      setFormData({
        nome: '',
        email: '',
        cpf: '',
        telefone: '',
        endereco_residencial: '',
        status: 'Ativo'
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingRes ? 'PUT' : 'POST';
    const url = editingRes ? `/api/responsaveis/${editingRes.id}` : '/api/responsaveis';

    try {
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(false);
        fetchData();
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Erro ao salvar responsável');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este responsável?')) return;
    try {
      const res = await apiFetch(`/api/responsaveis/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Erro ao excluir responsável');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão');
    }
  };

  if (loading) {
    return <div className="p-8 text-center font-bold">Carregando responsáveis...</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-500">
      <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8 custom-scrollbar">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-3xl font-black tracking-tight">Gestão de Responsáveis</h2>
            <p className="text-slate-500 dark:text-slate-400">Gerencie os vínculos familiares e a comunicação direta.</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center justify-center gap-2 rounded-lg h-11 px-6 bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">person_add</span>
            <span>Novo Responsável</span>
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Responsável</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Documentos</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Contato</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Alunos</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {responsibles.map((res) => (
                  <tr key={res.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-5">
                      <button onClick={() => setFamiliaDe(res)} className="text-sm font-bold text-slate-900 dark:text-slate-100 hover:text-primary hover:underline text-left" title="Ver a família">{res.nome}</button>
                      <div className="text-xs text-slate-500">{res.email || 'Sem email'}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm text-slate-600 dark:text-slate-400 font-medium">{res.cpf || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-slate-600 dark:text-slate-400 font-medium">{res.telefone}</div>
                        {res.whatsapp_ativo === false && <span title="Avisos automáticos desligados" className="material-symbols-outlined text-[18px] text-slate-400">notifications_off</span>}
                        <a href={`https://wa.me/55${res.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="p-1.5 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 rounded-md cursor-pointer hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined text-[18px]">chat</span>
                        </a>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <button onClick={() => setFamiliaDe(res)} title="Ver a família" className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-primary/10 rounded-md text-xs font-bold text-primary w-fit">
                          {res.total_alunos} {res.total_alunos === 1 ? 'Aluno' : 'Alunos'}
                        </button>
                        {res.alunos_nomes && (
                          <div className="text-[10px] text-slate-500 font-medium truncate max-w-[200px]" title={res.alunos_nomes}>
                            {res.alunos_nomes}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${res.status === 'Ativo' ? 'bg-emerald-100 text-emerald-600' :
                        res.status === 'Bloqueado' ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                        {res.status || 'Ativo'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 text-slate-400">
                        <button
                          onClick={() => setFamiliaDe(res)}
                          title="Família: filhos, escola, rota e mensalidade"
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-[20px]">family_restroom</span>
                        </button>
                        <button
                          onClick={() => setPortalDe(res)}
                          title="Portal e avisos no WhatsApp"
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-[20px]">phonelink_ring</span>
                        </button>
                        <button
                          onClick={() => handleOpenModal(res)}
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(res.id)}
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg hover:text-rose-500 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-black">{editingRes ? 'Editar Responsável' : 'Novo Responsável'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Nome Completo</label>
                <input
                  type="text" required
                  value={formData.nome}
                  onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="Nome do responsável"
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">CPF</label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={e => setFormData({ ...formData, cpf: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Telefone</label>
                  <input
                    type="text" required
                    value={formData.telefone}
                    onChange={e => setFormData({ ...formData, telefone: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                    <option value="Bloqueado">Bloqueado</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Endereço Residencial</label>
                <textarea
                  value={formData.endereco_residencial}
                  onChange={e => setFormData({ ...formData, endereco_residencial: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg p-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all min-h-[80px]"
                  placeholder="Rua, Número, Bairro, Cidade..."
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
      <PortalResponsavel resp={portalDe} onFechar={() => setPortalDe(null)} onMudou={fetchData} />
      <FamiliaResponsavel resp={familiaDe} onFechar={() => setFamiliaDe(null)} onAbrirPortal={() => { setPortalDe(familiaDe); setFamiliaDe(null); }}
        onAdicionarFilho={onAdicionarFilho && familiaDe ? () => { const r = familiaDe; setFamiliaDe(null); onAdicionarFilho(r); } : undefined} />
    </div>
  );
};
