// Pessoas autorizadas a buscar/receber o aluno (painel). Os pais também cadastram pelo portal.
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Campo, Selo, inputCls, erroDaResposta } from '../ui';

interface Autorizado { id: number; nome: string; parentesco: string | null; telefone: string | null; documento: string | null; valido_ate: string | null; origem: string; }
const vazio = { nome: '', parentesco: '', telefone: '', documento: '', valido_ate: '' };

export const AutorizadosAluno: React.FC<{ alunoId: number }> = ({ alunoId }) => {
  const [lista, setLista] = useState<Autorizado[]>([]);
  const [f, setF] = useState(vazio);
  const [erro, setErro] = useState('');
  const carregar = useCallback(async () => {
    const r = await apiFetch(`/api/alunos/${alunoId}/autorizados`);
    if (r.ok) setLista(await r.json());
  }, [alunoId]);
  useEffect(() => { carregar(); }, [carregar]);
  const adicionar = async () => {
    setErro('');
    const r = await apiFetch(`/api/alunos/${alunoId}/autorizados`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    if (!r.ok) { setErro(await erroDaResposta(r, 'Erro ao salvar')); return; }
    setF(vazio);
    carregar();
  };
  const remover = async (id: number) => {
    if (!confirm('Remover esta autorização?')) return;
    await apiFetch(`/api/alunos/${alunoId}/autorizados/${id}`, { method: 'DELETE' });
    carregar();
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Quem, além do responsável, pode receber a criança em casa ou buscá-la. O motorista vê esta lista no app na hora da entrega.</p>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {lista.length === 0 && <p className="text-sm text-slate-400 py-2">Ninguém cadastrado.</p>}
        {lista.map(a => (
          <div key={a.id} className="flex items-center gap-3 py-2">
            <div className="flex-1">
              <p className="text-sm font-bold">{a.nome}{a.parentesco ? ` (${a.parentesco})` : ''} {a.origem === 'portal' && <Selo cor="azul">pelos pais</Selo>}</p>
              <p className="text-xs text-slate-500">{[a.telefone, a.documento && `Doc. ${a.documento}`, a.valido_ate && `até ${a.valido_ate.split('-').reverse().join('/')}`].filter(Boolean).join(' · ')}</p>
            </div>
            <button type="button" onClick={() => remover(a.id)} className="text-slate-400 hover:text-rose-500" title="Remover"><span className="material-symbols-outlined">delete</span></button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <Campo label="Nome" className="col-span-2"><input className={inputCls} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo label="Parentesco"><input className={inputCls} value={f.parentesco} onChange={e => setF({ ...f, parentesco: e.target.value })} placeholder="Avó" /></Campo>
        <Campo label="Telefone"><input className={inputCls} value={f.telefone} onChange={e => setF({ ...f, telefone: e.target.value })} /></Campo>
        <Campo label="Válido até"><input type="date" className={inputCls} value={f.valido_ate} onChange={e => setF({ ...f, valido_ate: e.target.value })} /></Campo>
        <Botao type="button" icone="person_add" onClick={adicionar} disabled={!f.nome.trim()}>Adicionar</Botao>
      </div>
      {erro && <p className="text-sm font-bold text-rose-500">{erro}</p>}
    </div>
  );
};
