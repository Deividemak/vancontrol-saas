import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../services/api';
import { Abas, Botao, Campo, Modal, Selo, inputCls, textareaCls, erroDaResposta } from './ui';
import { EnderecoComMapa } from './mapa/EnderecoComMapa';
import { AutorizadosAluno } from './operacao/AutorizadosAluno';
import { Endereco, enderecoDe, enderecoVazio, statusGeo, GeoStatus } from '../services/geo';

type Turno = 'Manhã' | 'Tarde' | 'Integral' | 'Noite';

interface Student {
  id: number;
  nome: string;
  escola_id: number | null;
  escola_nome?: string;
  responsavel_id?: number | null;
  responsavel_nome?: string | null;
  responsavel_telefone: string;
  valor_mensalidade: number;
  dia_vencimento?: number;
  turno: Turno;
  status: 'Ativo' | 'Inativo';
  data_nascimento?: string | null;
  endereco?: string | null;
  geo_status: GeoStatus;
  foto_thumb?: string | null;
  tem_alergia?: boolean;
  tem_necessidade?: boolean;
  rotas_nomes?: string | null;
  suspenso?: boolean;
  suspensao_motivo?: string | null;
}

interface School { id: number; nome: string; }
interface Responsible { id: number; nome: string; telefone?: string; }
interface Contato { nome: string; parentesco: string; telefone: string; }

interface FormAluno {
  nome: string;
  escola_id: string;
  responsavel_id: string;
  responsavel_telefone: string;
  valor_mensalidade: string;
  dia_vencimento: string;
  inicio_contrato: string;
  turno: Turno;
  status: 'Ativo' | 'Inativo';
  data_nascimento: string;
  alergias: string;
  condicoes_medicas: string;
  medicamentos: string;
  necessidades_especiais: string;
  tipo_sanguineo: string;
  observacoes: string;
  contatos_emergencia: Contato[];
  endereco: Endereco;
  foto?: string | null;        // undefined = não mexer
  foto_thumb?: string | null;
  foto_preview: string | null;
}

const formVazio = (): FormAluno => ({
  nome: '', escola_id: '', responsavel_id: '', responsavel_telefone: '', valor_mensalidade: '', dia_vencimento: '10', inicio_contrato: '',
  turno: 'Manhã', status: 'Ativo', data_nascimento: '', alergias: '', condicoes_medicas: '', medicamentos: '',
  necessidades_especiais: '', tipo_sanguineo: '', observacoes: '', contatos_emergencia: [], endereco: enderecoVazio(),
  foto_preview: null,
});

/** Redimensiona uma imagem no navegador e devolve data URL JPEG. */
function redimensionar(arquivo: File, max: number, qualidade = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      // recorte quadrado central para a miniatura
      const lado = Math.min(img.width, img.height);
      const quadrado = max <= 96;
      const canvas = document.createElement('canvas');
      canvas.width = quadrado ? max : Math.round(img.width * escala);
      canvas.height = quadrado ? max : Math.round(img.height * escala);
      const ctx = canvas.getContext('2d')!;
      if (quadrado) ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, max, max);
      else ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', qualidade));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
    img.src = url;
  });
}

const idade = (nasc?: string | null) => {
  if (!nasc) return null;
  const d = new Date(`${nasc}T12:00:00`);
  const h = new Date();
  let a = h.getFullYear() - d.getFullYear();
  if (h.getMonth() < d.getMonth() || (h.getMonth() === d.getMonth() && h.getDate() < d.getDate())) a--;
  return a;
};

const Avatar: React.FC<{ nome: string; foto?: string | null; tamanho?: string }> = ({ nome, foto, tamanho = 'size-10' }) =>
  foto ? (
    <img src={foto} alt={nome} className={`${tamanho} rounded-full object-cover mx-auto`} />
  ) : (
    <div className={`${tamanho} rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-primary mx-auto`}>
      {nome.split(' ').map(n => n[0]).join('').substring(0, 2)}
    </div>
  );

export const Alunos: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [responsibles, setResponsibles] = useState<Responsible[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'sem_local' | 'inativos'>('todos');

  const [aberto, setAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [aba, setAba] = useState('dados');
  const [form, setForm] = useState<FormAluno>(formVazio());
  const [carregandoAluno, setCarregandoAluno] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [stuRes, schRes, resRes] = await Promise.all([apiFetch('/api/alunos'), apiFetch('/api/escolas'), apiFetch('/api/responsaveis')]);
      if (stuRes.ok) setStudents(await stuRes.json());
      if (schRes.ok) setSchools(await schRes.json());
      if (resRes.ok) setResponsibles(await resRes.json());
    } catch (err) {
      console.error('Erro ao buscar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const abrir = async (student?: Student) => {
    setErro('');
    setAba('dados');
    setPreco(null);
    setAberto(true);
    if (!student) {
      setEditandoId(null);
      setForm(formVazio());
      return;
    }
    setEditandoId(student.id);
    setCarregandoAluno(true);
    try {
      const res = await apiFetch(`/api/alunos/${student.id}`);
      if (!res.ok) throw new Error(await erroDaResposta(res, 'Erro ao carregar aluno'));
      const a = await res.json();
      setForm({
        nome: a.nome,
        escola_id: a.escola_id ? String(a.escola_id) : '',
        responsavel_id: a.responsavel_id ? String(a.responsavel_id) : '',
        responsavel_telefone: a.responsavel_telefone || '',
        valor_mensalidade: a.valor_mensalidade !== null ? String(a.valor_mensalidade) : '',
        dia_vencimento: String(a.dia_vencimento || 10),
        inicio_contrato: a.inicio_contrato || '',
        turno: a.turno || 'Manhã',
        status: a.status || 'Ativo',
        data_nascimento: a.data_nascimento || '',
        alergias: a.alergias || '',
        condicoes_medicas: a.condicoes_medicas || '',
        medicamentos: a.medicamentos || '',
        necessidades_especiais: a.necessidades_especiais || '',
        tipo_sanguineo: a.tipo_sanguineo || '',
        observacoes: a.observacoes || '',
        contatos_emergencia: (a.contatos_emergencia || []).map((c: Contato) => ({ nome: c.nome || '', parentesco: c.parentesco || '', telefone: c.telefone || '' })),
        endereco: enderecoDe(a),
        foto_preview: a.foto || null,
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregandoAluno(false);
    }
  };

  const salvar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErro('');
    if (!form.nome.trim()) { setAba('dados'); setErro('Informe o nome do aluno.'); return; }
    if (form.valor_mensalidade === '') { setAba('dados'); setErro('Informe o valor da mensalidade.'); return; }
    const incompleto = form.contatos_emergencia.some(c => (c.nome || c.telefone) && (!c.nome || !c.telefone));
    if (incompleto) { setAba('emergencia'); setErro('Cada contato de emergência precisa de nome e telefone.'); return; }

    const { endereco, foto_preview, ...resto } = form;
    const corpo: Record<string, unknown> = { ...resto, ...endereco };
    if (form.foto === undefined) { delete corpo.foto; delete corpo.foto_thumb; }

    setSalvando(true);
    try {
      const res = await apiFetch(editandoId ? `/api/alunos/${editandoId}` : '/api/alunos', {
        method: editandoId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) throw new Error(await erroDaResposta(res, 'Erro ao salvar aluno'));
      setAberto(false);
      fetchData();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este aluno?')) return;
    const res = await apiFetch(`/api/alunos/${id}`, { method: 'DELETE' });
    if (res.ok) fetchData();
    else alert(await erroDaResposta(res, 'Erro ao excluir aluno'));
  };

  const escolherFoto = async (arquivo?: File) => {
    if (!arquivo) return;
    try {
      const [foto, thumb] = await Promise.all([redimensionar(arquivo, 320), redimensionar(arquivo, 64, 0.75)]);
      setForm(f => ({ ...f, foto, foto_thumb: thumb, foto_preview: foto }));
    } catch {
      setErro('Não foi possível ler a imagem.');
    }
  };

  const copiarEnderecoIrmao = () => {
    const irmao = students.find(s => s.responsavel_id && String(s.responsavel_id) === form.responsavel_id && s.id !== editandoId && s.geo_status !== 'pendente');
    if (!irmao) { alert('Nenhum outro aluno deste responsável tem endereço localizado.'); return; }
    apiFetch(`/api/alunos/${irmao.id}`).then(r => r.json()).then(a => setForm(f => ({ ...f, endereco: enderecoDe(a) })));
  };

  const filtrados = useMemo(() => students.filter(s => {
    const t = busca.toLowerCase();
    const casa = !t || s.nome.toLowerCase().includes(t) || (s.escola_nome || '').toLowerCase().includes(t) || (s.responsavel_nome || '').toLowerCase().includes(t);
    if (!casa) return false;
    if (filtro === 'sem_local') return s.status === 'Ativo' && (s.geo_status === 'pendente' || s.geo_status === 'falhou');
    if (filtro === 'inativos') return s.status === 'Inativo';
    return true;
  }), [students, busca, filtro]);

  const semLocal = students.filter(s => s.status === 'Ativo' && (s.geo_status === 'pendente' || s.geo_status === 'falhou')).length;
  const f = form;
  const set = (patch: Partial<FormAluno>) => setForm(x => ({ ...x, ...patch }));
  const [preco, setPreco] = useState<{ itens: { descricao: string; valor: number }[]; valor_sugerido: number; km: number | null; primeiro_mes?: { valor: number; dias: number; restantes: number } } | null>(null);
  const calcularPreco = async () => {
    const res = await apiFetch('/api/financeiro/preco-sugerido', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: form.endereco.lat, lng: form.endereco.lng, escola_id: form.escola_id || null, turno: form.turno,
        responsavel_id: form.responsavel_id || null, aluno_id: editandoId, inicio_contrato: form.inicio_contrato || null }),
    });
    if (!res.ok) return setErro(await erroDaResposta(res, 'Erro ao calcular'));
    const p = await res.json();
    setPreco(p);
    set({ valor_mensalidade: String(p.valor_sugerido) });
  };

  if (loading) return <div className="p-8 text-center font-bold">Carregando alunos...</div>;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-black tracking-tight">Gestão de Alunos</h2>
          <p className="text-slate-500 dark:text-slate-400">Cadastro completo: endereço no mapa, saúde e contatos de emergência.</p>
        </div>
        <button onClick={() => abrir()}
          className="flex items-center justify-center gap-2 rounded-lg h-11 px-6 bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110 transition-all">
          <span className="material-symbols-outlined text-[20px]">person_add</span>
          <span>Novo Aluno</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar aluno, escola ou responsável..."
            className="pl-10 pr-4 h-10 w-72 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        {(['todos', 'sem_local', 'inativos'] as const).map(op => (
          <button key={op} onClick={() => setFiltro(op)}
            className={`h-10 px-4 rounded-lg text-sm font-bold transition-all ${filtro === op ? 'bg-primary text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500'}`}>
            {op === 'todos' ? 'Todos' : op === 'sem_local' ? `Sem localização (${semLocal})` : 'Inativos'}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              {['', 'Aluno', 'Escola / Turno', 'Responsável', 'Localização', 'Rotas', 'Mensalidade', ''].map((h, i) => (
                <th key={i} className={`px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ${i === 7 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtrados.map(s => {
              const st = statusGeo[s.geo_status || 'pendente'];
              const anos = idade(s.data_nascimento);
              return (
                <tr key={s.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${s.status === 'Inativo' ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 w-16"><Avatar nome={s.nome} foto={s.foto_thumb} /></td>
                  <td className="px-5 py-3">
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{s.nome}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {anos !== null && <span className="text-[11px] text-slate-400">{anos} anos</span>}
                      {s.tem_alergia && <Selo cor="vermelho" icone="medical_information">Alergia</Selo>}
                      {s.tem_necessidade && <Selo cor="roxo" icone="accessible">Atenção especial</Selo>}
                      {s.suspenso && <Selo cor="vermelho" icone="block" title={s.suspensao_motivo || undefined}>Transporte suspenso</Selo>}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="text-sm text-slate-700 dark:text-slate-300">{s.escola_nome || 'Não informada'}</div>
                    <div className="text-[11px] text-slate-400">{s.turno}</div>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-700 dark:text-slate-300 font-medium">{s.responsavel_nome || s.responsavel_telefone || '—'}</td>
                  <td className="px-5 py-3">
                    <Selo cor={st.cor} icone={st.icone} title={s.endereco || undefined}>{st.label}</Selo>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500 max-w-[180px] truncate" title={s.rotas_nomes || ''}>{s.rotas_nomes || '—'}</td>
                  <td className="px-5 py-3 text-sm font-black text-slate-900 dark:text-slate-100">
                    R$ {Number(s.valor_mensalidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2 text-slate-400">
                      <button onClick={() => abrir(s)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg hover:text-primary transition-colors" title="Editar">
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                      <button onClick={() => excluir(s.id)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg hover:text-rose-500 transition-colors" title="Excluir">
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filtrados.length && (
              <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-400">Nenhum aluno encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo={editandoId ? 'Editar Aluno' : 'Novo Aluno'}
        tamanho="xl"
        rodape={<>
          {erro && <p className="text-sm text-rose-500 font-bold mr-auto self-center">{erro}</p>}
          <Botao variante="secundario" type="button" onClick={() => setAberto(false)}>Cancelar</Botao>
          <Botao type="button" onClick={() => salvar()} carregando={salvando} disabled={carregandoAluno}>Salvar</Botao>
        </>}
      >
        {carregandoAluno ? <p className="text-center py-10 font-bold text-slate-400">Carregando...</p> : (
          <form onSubmit={salvar} className="space-y-5">
            <Abas ativa={aba} onTrocar={setAba} abas={[
              { id: 'dados', label: 'Dados', icone: 'badge' },
              { id: 'endereco', label: 'Endereço', icone: 'location_on', alerta: f.endereco.geo_status === 'pendente' || f.endereco.geo_status === 'falhou' },
              { id: 'saude', label: 'Saúde', icone: 'medical_information' },
              { id: 'emergencia', label: 'Emergência', icone: 'emergency', alerta: f.contatos_emergencia.length === 0 },
              ...(editandoId ? [{ id: 'retirada', label: 'Quem busca', icone: 'how_to_reg' }] : []),
            ]} />
            {aba === 'retirada' && editandoId && <AutorizadosAluno alunoId={editandoId} />}

            {aba === 'dados' && (
              <div className="space-y-4">
                <div className="flex gap-5 items-start">
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <Avatar nome={f.nome || '?'} foto={f.foto_preview} tamanho="size-24" />
                    <label className="text-xs font-bold text-primary cursor-pointer hover:underline">
                      {f.foto_preview ? 'Trocar foto' : 'Adicionar foto'}
                      <input type="file" accept="image/*" className="hidden" onChange={e => escolherFoto(e.target.files?.[0])} />
                    </label>
                    {f.foto_preview && (
                      <button type="button" className="text-[11px] font-bold text-slate-400 hover:text-rose-500"
                        onClick={() => set({ foto: null, foto_thumb: null, foto_preview: null })}>Remover</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 flex-1">
                    <Campo label="Nome do aluno" className="col-span-2">
                      <input required className={inputCls} value={f.nome} onChange={e => set({ nome: e.target.value })} placeholder="Nome completo" />
                    </Campo>
                    <Campo label="Data de nascimento">
                      <input type="date" className={inputCls} value={f.data_nascimento} onChange={e => set({ data_nascimento: e.target.value })} />
                    </Campo>
                    <Campo label="Status">
                      <select className={inputCls} value={f.status} onChange={e => set({ status: e.target.value as FormAluno['status'] })}>
                        <option value="Ativo">Ativo</option>
                        <option value="Inativo">Inativo</option>
                      </select>
                    </Campo>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Campo label="Escola" className="col-span-2">
                    <select required className={inputCls} value={f.escola_id} onChange={e => set({ escola_id: e.target.value })}>
                      <option value="">Selecione</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Turno">
                    <select className={inputCls} value={f.turno} onChange={e => set({ turno: e.target.value as Turno })}>
                      {['Manhã', 'Tarde', 'Integral', 'Noite'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Início do contrato" dica="Não cobra antes; 1º mês pode ser proporcional">
                    <input type="date" className={inputCls} value={f.inicio_contrato} onChange={e => set({ inicio_contrato: e.target.value })} aria-label="Início do contrato" />
                  </Campo>
                  <Campo label="Mensalidade (R$)">
                    <div className="flex gap-2">
                      <input type="number" step="0.01" min="0" required className={inputCls} value={f.valor_mensalidade} onChange={e => set({ valor_mensalidade: e.target.value })} placeholder="0,00" aria-label="Mensalidade" />
                      <button type="button" onClick={calcularPreco} title="Sugerir valor pela distância, turno e irmãos"
                        className="shrink-0 h-11 px-3 rounded-lg bg-primary/10 text-primary text-xs font-black flex items-center gap-1 hover:bg-primary/20">
                        <span className="material-symbols-outlined text-[18px]">calculate</span>Calcular
                      </button>
                    </div>
                    {preco && (
                      <div className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-800 p-2 text-[11px] space-y-0.5">
                        {preco.itens.map((i, k) => <div key={k} className="flex justify-between gap-2"><span>{i.descricao}</span><b>{i.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b></div>)}
                        <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-0.5"><span>Sugerido</span><b>{preco.valor_sugerido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b></div>
                        {preco.primeiro_mes && <div className="text-slate-500">1º mês proporcional: {preco.primeiro_mes.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ({preco.primeiro_mes.restantes} de {preco.primeiro_mes.dias} dias)</div>}
                        {preco.km === null && <div className="text-amber-600">Sem distância: confirme o endereço no mapa e a escola.</div>}
                      </div>
                    )}
                  </Campo>
                  <Campo label="Dia de vencimento">
                    <input type="number" min="1" max="31" className={inputCls} value={f.dia_vencimento} onChange={e => set({ dia_vencimento: e.target.value })} />
                  </Campo>
                  <Campo label="Responsável" className="col-span-2">
                    <select className={inputCls} value={f.responsavel_id} onChange={e => set({ responsavel_id: e.target.value })}>
                      <option value="">Nenhum (usar telefone avulso)</option>
                      {responsibles.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                    </select>
                  </Campo>
                  {!f.responsavel_id && (
                    <Campo label="Telefone do responsável (avulso)" className="col-span-2">
                      <input className={inputCls} value={f.responsavel_telefone} onChange={e => set({ responsavel_telefone: e.target.value })} placeholder="(00) 00000-0000" />
                    </Campo>
                  )}
                </div>
              </div>
            )}

            {aba === 'endereco' && (
              <div className="space-y-3">
                {f.responsavel_id && (
                  <button type="button" onClick={copiarEnderecoIrmao} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    Usar o mesmo endereço de um irmão (mesmo responsável)
                  </button>
                )}
                <EnderecoComMapa valor={f.endereco} onChange={endereco => set({ endereco })} rotuloPino={f.nome || 'Casa do aluno'} />
              </div>
            )}

            {aba === 'saude' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo label="Alergias" dica="Alimentos, medicamentos, insetos...">
                  <textarea className={textareaCls} value={f.alergias} onChange={e => set({ alergias: e.target.value })} />
                </Campo>
                <Campo label="Condições médicas" dica="Asma, diabetes, epilepsia...">
                  <textarea className={textareaCls} value={f.condicoes_medicas} onChange={e => set({ condicoes_medicas: e.target.value })} />
                </Campo>
                <Campo label="Medicamentos de uso contínuo">
                  <textarea className={textareaCls} value={f.medicamentos} onChange={e => set({ medicamentos: e.target.value })} />
                </Campo>
                <Campo label="Necessidades especiais" dica="Mobilidade, TEA, cadeirinha, assento específico...">
                  <textarea className={textareaCls} value={f.necessidades_especiais} onChange={e => set({ necessidades_especiais: e.target.value })} />
                </Campo>
                <Campo label="Tipo sanguíneo">
                  <select className={inputCls} value={f.tipo_sanguineo} onChange={e => set({ tipo_sanguineo: e.target.value })}>
                    <option value="">Não informado</option>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Campo>
                <Campo label="Observações">
                  <textarea className={textareaCls} value={f.observacoes} onChange={e => set({ observacoes: e.target.value })} />
                </Campo>
                <p className="md:col-span-2 text-[11px] text-slate-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">lock</span>
                  Dados de saúde de menores são sensíveis (LGPD): só preencha o necessário para a segurança no transporte.
                </p>
              </div>
            )}

            {aba === 'emergencia' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">Quem chamar se o responsável principal não atender. Até 5 contatos.</p>
                {f.contatos_emergencia.map((c, i) => (
                  <div key={i} className="grid grid-cols-12 gap-3 items-end">
                    <Campo label="Nome" className="col-span-5">
                      <input className={inputCls} value={c.nome} onChange={e => set({ contatos_emergencia: f.contatos_emergencia.map((x, j) => j === i ? { ...x, nome: e.target.value } : x) })} />
                    </Campo>
                    <Campo label="Parentesco" className="col-span-3">
                      <input className={inputCls} value={c.parentesco} placeholder="Avó, tio..." onChange={e => set({ contatos_emergencia: f.contatos_emergencia.map((x, j) => j === i ? { ...x, parentesco: e.target.value } : x) })} />
                    </Campo>
                    <Campo label="Telefone" className="col-span-3">
                      <input className={inputCls} value={c.telefone} placeholder="(00) 00000-0000" onChange={e => set({ contatos_emergencia: f.contatos_emergencia.map((x, j) => j === i ? { ...x, telefone: e.target.value } : x) })} />
                    </Campo>
                    <button type="button" title="Remover" className="col-span-1 h-11 text-slate-400 hover:text-rose-500"
                      onClick={() => set({ contatos_emergencia: f.contatos_emergencia.filter((_, j) => j !== i) })}>
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                ))}
                {f.contatos_emergencia.length < 5 && (
                  <Botao type="button" variante="secundario" icone="add" onClick={() => set({ contatos_emergencia: [...f.contatos_emergencia, { nome: '', parentesco: '', telefone: '' }] })}>
                    Adicionar contato
                  </Botao>
                )}
              </div>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
};
