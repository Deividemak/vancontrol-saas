import React, { useEffect, useState } from 'react';

interface Student {
  id: number;
  nome: string;
  escola_id: number;
  escola_nome?: string;
  responsavel_id?: number | null;
  responsavel_telefone: string;
  valor_mensalidade: number;
  dia_vencimento?: number;
  turno: 'Manhã' | 'Tarde' | 'Integral' | 'Noite';
  status: 'Ativo' | 'Inativo';
}

interface School {
  id: number;
  nome: string;
}

interface Responsible {
  id: number;
  nome: string;
}

export const Alunos: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [responsibles, setResponsibles] = useState<Responsible[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    escola_id: '',
    responsavel_id: '',
    responsavel_telefone: '',
    valor_mensalidade: '',
    dia_vencimento: '10',
    turno: 'Manhã',
    status: 'Ativo'
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [stuRes, schRes, resRes] = await Promise.all([
        fetch('/api/alunos'),
        fetch('/api/escolas'),
        fetch('/api/responsaveis')
      ]);

      if (stuRes.ok) setStudents(await stuRes.json());
      if (schRes.ok) setSchools(await schRes.json());
      if (resRes.ok) setResponsibles(await resRes.json());

      setLoading(false);
    } catch (err) {
      console.error('Erro ao buscar dados:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = (student?: Student) => {
    if (student) {
      setEditingStudent(student);
      setFormData({
        nome: student.nome,
        escola_id: (student.escola_id || '').toString(),
        responsavel_id: (student.responsavel_id || '').toString(),
        responsavel_telefone: student.responsavel_telefone || '',
        valor_mensalidade: (student.valor_mensalidade || '').toString(),
        dia_vencimento: (student.dia_vencimento || 10).toString(),
        turno: student.turno || 'Manhã',
        status: student.status || 'Ativo'
      });
    } else {
      setEditingStudent(null);
      setFormData({
        nome: '',
        escola_id: '',
        responsavel_id: '',
        responsavel_telefone: '',
        valor_mensalidade: '',
        dia_vencimento: '10',
        turno: 'Manhã',
        status: 'Ativo'
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingStudent ? 'PUT' : 'POST';
    const url = editingStudent ? `/api/alunos/${editingStudent.id}` : '/api/alunos';

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
        alert(errorData.error || 'Erro ao salvar aluno');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este aluno?')) return;
    try {
      const res = await fetch(`/api/alunos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Erro ao excluir aluno');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão');
    }
  };

  if (loading) {
    return <div className="p-8 text-center font-bold">Carregando alunos...</div>;
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-black tracking-tight">Gestão de Alunos</h2>
          <p className="text-slate-500 dark:text-slate-400">Administre as matrículas, pagamentos e rotas dos seus alunos em um só lugar.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-2 rounded-lg h-11 px-6 bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110 transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">person_add</span>
          <span>Novo Aluno</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-16 text-center">Iniciais</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nome do Aluno</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Escola</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Responsável</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mensalidade</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {students.map((student) => (
              <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="size-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-primary mx-auto">
                    {student.nome.split(' ').map(n => n[0]).join('').substring(0, 2)}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{student.nome}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-slate-700 dark:text-slate-300">{student.escola_nome || 'Não informada'}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                    {responsibles.find(r => r.id === student.responsavel_id)?.nome || student.responsavel_telefone || 'N/A'}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-black text-slate-900 dark:text-slate-100">
                  R$ {Number(student.valor_mensalidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 text-slate-400">
                    <button
                      onClick={() => handleOpenModal(student)}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg hover:text-primary transition-colors" title="Editar"
                    >
                      <span className="material-symbols-outlined text-[20px]">edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(student.id)}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg hover:text-rose-500 transition-colors" title="Excluir"
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

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-black">{editingStudent ? 'Editar Aluno' : 'Novo Aluno'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Nome do Aluno</label>
                <input
                  type="text" required
                  value={formData.nome}
                  onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="Nome completo"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Turno</label>
                  <select
                    required
                    value={formData.turno}
                    onChange={e => setFormData({ ...formData, turno: e.target.value as any })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    <option value="Manhã">Manhã</option>
                    <option value="Tarde">Tarde</option>
                    <option value="Integral">Integral</option>
                    <option value="Noite">Noite</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Status</label>
                  <select
                    required
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Escola</label>
                  <select
                    required
                    value={formData.escola_id}
                    onChange={e => setFormData({ ...formData, escola_id: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    <option value="">Selecione</option>
                    {schools.map(school => (
                      <option key={school.id} value={school.id}>{school.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Mensalidade</label>
                  <input
                    type="number" step="0.01" required
                    value={formData.valor_mensalidade}
                    onChange={e => setFormData({ ...formData, valor_mensalidade: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Dia Vencimento</label>
                  <input
                    type="number" min="1" max="31" required
                    value={formData.dia_vencimento}
                    onChange={e => setFormData({ ...formData, dia_vencimento: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="10"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Responsável em Cadastro</label>
                <select
                  value={formData.responsavel_id}
                  onChange={e => setFormData({ ...formData, responsavel_id: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="">Nenhum (usar telefone avulso)</option>
                  {responsibles.map(res => (
                    <option key={res.id} value={res.id}>{res.nome}</option>
                  ))}
                </select>
              </div>
              {!formData.responsavel_id && (
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Telefone Responsável (Avulso)</label>
                  <input
                    type="text"
                    value={formData.responsavel_telefone}
                    onChange={e => setFormData({ ...formData, responsavel_telefone: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg h-11 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="(00) 00000-0000"
                  />
                </div>
              )}
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
