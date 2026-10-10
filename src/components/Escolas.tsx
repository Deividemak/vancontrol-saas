import React, { useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import { Abas, Botao, Campo, Modal, Selo, inputCls, erroDaResposta } from './ui';
import { EnderecoComMapa } from './mapa/EnderecoComMapa';
import { Endereco, enderecoDe, enderecoVazio, statusGeo, GeoStatus } from '../services/geo';
import { Calendario } from './escolas/Calendario';

const TURNOS = ['Manhã', 'Tarde', 'Integral', 'Noite'] as const;
interface Horario { turno: string; entrada: string; saida: string; }

interface School {
  id: number;
  nome: string;
  endereco: string;
  geo_status: GeoStatus;
  horarios: Horario[];
  telefone: string;
  responsavel_contato: string;
  tipo: 'Pública' | 'Particular';
  studentsCount: number;
  activeVans: number;
  activeVansDetails?: string;
}

export const Escolas: React.FC = () => {
  const [schools, setSchools] = useState<School[]>([]);
  const [portal, setPortal] = useState<{ nome: string; id: number; link: string } | null>(null);
  const abrirPortal = async (id: number, nome: string, novo = false) => {
    const r = await apiFetch(`/api/escolas/${id}/portal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ novo }) });
    const j = await r.json();
    if (r.ok) setPortal({ id, nome, link: j.link }); else alert(j.error || 'Erro ao gerar link');
  };

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [pagina, setPagina] = useState<'escolas' | 'calendario'>('escolas');
  const [aba, setAba] = useState('dados');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [endereco, setEndereco] = useState<Endereco>(enderecoVazio());
  const [horarios, setHorarios] = useState<Horario[]>([]);
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
      const res = await apiFetch('/api/escolas');
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
      setEndereco(enderecoDe(school as unknown as Record<string, unknown>));
      setHorarios(TURNOS.map(t => {
        const h = (school.horarios || []).find(x => x.turno === t);
        return { turno: t, entrada: h?.entrada || '', saida: h?.saida || '' };
      }));
    } else {
      setEditingSchool(null);
      setFormData({
        nome: '',
        endereco: '',
        telefone: '',
        responsavel_contato: '',
        tipo: 'Particular'
      });
      setEndereco(enderecoVazio());
      setHorarios(TURNOS.map(t => ({ turno: t, entrada: '', saida: '' })));
    }
    setErro('');
    setAba('dados');
    setShowModal(true);
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErro('');
    if (!formData.nome.trim()) { setAba('dados'); setErro('Informe o nome da escola.'); return; }
    const method = editingSchool ? 'PUT' : 'POST';
    const url = editingSchool ? `/api/escolas/${editingSchool.id}` : '/api/escolas';
    setSalvando(true);
    try {
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, ...endereco, horarios: horarios.filter(h => h.entrada || h.saida) })
      });
      if (!res.ok) throw new Error(await erroDaResposta(res, 'Erro ao salvar escola'));
      setShowModal(false);
      fetchData();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta escola?')) return;
    try {
      const res = await apiFetch(`/api/escolas/${id}`, { method: 'DELETE' });
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
    <div className="p-6 lg:p-8 space-y-8 animate-in fade-in duration-500">
      <Abas ativa={pagina} onTrocar={id => setPagina(id as 'escolas' | 'calendario')} abas={[
        { id: 'escolas', label: 'Escolas', icone: 'domain' },
        { id: 'calendario', label: 'Calendário escolar', icone: 'calendar_month' },
      ]} />
      {pagina === 'calendario' ? <Calendario escolas={schools.map(s => ({ id: s.id, nome: s.nome }))} /> : <>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight">Gestão de Escolas</h2>
          <p className="text-slate-500 dark:text-slate-400">Unidades de ensino, localização no mapa e horários de entrada e saída por turno.</p>
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
                <div className="flex flex-wrap gap-1 mt-2">
                  <Selo cor={statusGeo[school.geo_status || 'pendente'].cor} icone={statusGeo[school.geo_status || 'pendente'].icone}>
                    {statusGeo[school.geo_status || 'pendente'].label}
                  </Selo>
                  {(school.horarios || []).length === 0
                    ? <Selo cor="amarelo" icone="schedule">Sem horários</Selo>
                    : school.horarios.map(h => (
                      <Selo key={h.turno} cor="azul" icone="schedule">{h.turno} {h.entrada || '--:--'}–{h.saida || '--:--'}</Selo>
                    ))}
                </div>
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
              <button onClick={() => handleOpenModal(school)} className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">Horários e mapa</button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => abrirPortal(school.id, school.nome)}
                  title="Portal da escola"
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-primary transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">co_present</span>
                </button>
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

      </>}

      <Modal
        aberto={showModal}
        onFechar={() => setShowModal(false)}
        titulo={editingSchool ? 'Editar Escola' : 'Nova Escola'}
        tamanho="xl"
        rodape={<>
          {erro && <p className="text-sm text-rose-500 font-bold mr-auto self-center">{erro}</p>}
          <Botao variante="secundario" type="button" onClick={() => setShowModal(false)}>Cancelar</Botao>
          <Botao type="button" onClick={() => handleSave()} carregando={salvando}>Salvar</Botao>
        </>}
      >
        <form onSubmit={handleSave} className="space-y-5">
          <Abas ativa={aba} onTrocar={setAba} abas={[
            { id: 'dados', label: 'Dados', icone: 'domain' },
            { id: 'endereco', label: 'Endereço', icone: 'location_on', alerta: endereco.geo_status === 'pendente' || endereco.geo_status === 'falhou' },
            { id: 'horarios', label: 'Horários', icone: 'schedule', alerta: !horarios.some(h => h.entrada || h.saida) },
          ]} />
          {aba === 'dados' && (
            <div className="grid grid-cols-2 gap-4">
              <Campo label="Nome da escola" className="col-span-2">
                <input required className={inputCls} value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })} placeholder="Ex: Colégio Dom Bosco" />
              </Campo>
              <Campo label="Telefone">
                <input className={inputCls} value={formData.telefone} onChange={e => setFormData({ ...formData, telefone: e.target.value })} placeholder="(00) 0000-0000" />
              </Campo>
              <Campo label="Tipo">
                <select className={inputCls} value={formData.tipo} onChange={e => setFormData({ ...formData, tipo: e.target.value as 'Pública' | 'Particular' })}>
                  <option value="Particular">Particular</option>
                  <option value="Pública">Pública</option>
                </select>
              </Campo>
              <Campo label="Responsável / contato" className="col-span-2">
                <input className={inputCls} value={formData.responsavel_contato} onChange={e => setFormData({ ...formData, responsavel_contato: e.target.value })} placeholder="Ex: Diretora Márcia" />
              </Campo>
              {editingSchool && !endereco.logradouro && formData.endereco && (
                <p className="col-span-2 text-xs text-amber-600 bg-amber-500/10 rounded-lg p-3">
                  Endereço antigo (texto livre): <b>{formData.endereco}</b>. Preencha a aba Endereço para a escola aparecer no mapa.
                </p>
              )}
            </div>
          )}
          {aba === 'endereco' && <EnderecoComMapa valor={endereco} onChange={setEndereco} rotuloPino={formData.nome || 'Escola'} />}
          {aba === 'horarios' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Usados para calcular o horário de saída das rotas e avisar quando a van chegaria atrasada. Deixe em branco os turnos que a escola não tem.</p>
              <div className="grid grid-cols-3 gap-3 text-xs font-black uppercase tracking-widest text-slate-500">
                <span>Turno</span><span>Entrada</span><span>Saída</span>
              </div>
              {horarios.map((h, i) => (
                <div key={h.turno} className="grid grid-cols-3 gap-3 items-center">
                  <span className="text-sm font-bold">{h.turno}</span>
                  <input type="time" className={inputCls} value={h.entrada} onChange={e => setHorarios(horarios.map((x, j) => j === i ? { ...x, entrada: e.target.value } : x))} />
                  <input type="time" className={inputCls} value={h.saida} onChange={e => setHorarios(horarios.map((x, j) => j === i ? { ...x, saida: e.target.value } : x))} />
                </div>
              ))}
            </div>
          )}
        </form>
      </Modal>
      {portal && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4" onMouseDown={e => e.target === e.currentTarget && setPortal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-lg space-y-3">
            <h3 className="text-xl font-black">Portal da escola · {portal.nome}</h3>
            <p className="text-sm text-slate-500">Envie este link para a secretaria/portaria. A escola vê, sem senha, quais alunos dela estão chegando, em qual van e quando — só nome e situação, sem endereço nem dados de saúde.</p>
            <input readOnly className="w-full bg-slate-50 dark:bg-slate-800 rounded-lg h-10 px-3 font-mono text-xs" value={portal.link} onFocus={e => e.target.select()} aria-label="Link do portal da escola" />
            <div className="flex flex-wrap gap-2 justify-end">
              <button className="px-4 h-10 rounded-lg font-bold text-rose-600" onClick={() => { if (confirm('Gerar um link novo? O link antigo para de funcionar.')) abrirPortal(portal.id, portal.nome, true); }}>Gerar link novo</button>
              <button className="px-4 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold" onClick={() => navigator.clipboard?.writeText(portal.link)}>Copiar</button>
              <button className="px-4 h-10 rounded-lg bg-primary text-white font-bold" onClick={() => setPortal(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
