import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Modal, Selo, erroDaResposta } from '../ui';
import { statusGeo, GeoStatus } from '../../services/geo';
import { RotaDetalhe, Turno } from './tipos';

interface Aluno { id: number; nome: string; turno: Turno; escola_nome: string | null; status: string; geo_status: GeoStatus; rotas_nomes: string | null; bairro: string | null; }

const compativel = (aluno: Turno, rota: Turno) => aluno === rota || (aluno === 'Integral' && (rota === 'Manhã' || rota === 'Tarde'));

export const AdicionarAlunos: React.FC<{ aberto: boolean; detalhe: RotaDetalhe; onFechar: () => void; onSalvo: (d: RotaDetalhe) => void }> = ({ aberto, detalhe, onFechar, onSalvo }) => {
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState('');
  const [soTurno, setSoTurno] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const naRota = useMemo(() => new Set([
    ...detalhe.paradas.flatMap(p => p.alunos.map(a => a.aluno_id)),
    ...detalhe.sem_localizacao.map(a => a.aluno_id),
  ]), [detalhe]);

  useEffect(() => {
    if (!aberto) return;
    setSel(new Set());
    setErro('');
    apiFetch('/api/alunos').then(r => r.json()).then(setAlunos);
  }, [aberto]);

  const lista = alunos.filter(a =>
    a.status === 'Ativo' && !naRota.has(a.id) &&
    (!soTurno || compativel(a.turno, detalhe.rota.periodo)) &&
    (!busca || `${a.nome} ${a.escola_nome || ''} ${a.bairro || ''}`.toLowerCase().includes(busca.toLowerCase())));

  const salvar = async () => {
    setSalvando(true);
    try {
      const res = await apiFetch(`/api/rotas/${detalhe.rota.id}/alunos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aluno_ids: [...sel] }),
      });
      if (!res.ok) throw new Error(await erroDaResposta(res, 'Erro ao adicionar'));
      onSalvo(await res.json());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const vagas = detalhe.resumo.lugares ? detalhe.resumo.lugares - detalhe.resumo.total_alunos : null;

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo={`Adicionar alunos — ${detalhe.rota.nome}`} tamanho="lg"
      rodape={<>
        {erro && <p className="text-sm text-rose-500 font-bold mr-auto self-center">{erro}</p>}
        {vagas !== null && <p className={`text-sm font-bold mr-auto self-center ${sel.size > vagas ? 'text-rose-500' : 'text-slate-500'}`}>{sel.size} selecionado(s) · {Math.max(vagas, 0)} vaga(s)</p>}
        <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao onClick={salvar} disabled={!sel.size} carregando={salvando}>Adicionar {sel.size || ''}</Botao>
      </>}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, escola ou bairro"
            className="flex-1 min-w-48 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm" />
          <label className="text-sm font-medium flex items-center gap-2">
            <input type="checkbox" checked={soTurno} onChange={e => setSoTurno(e.target.checked)} />
            Só turno {detalhe.rota.periodo}
          </label>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[50vh] overflow-y-auto custom-scrollbar">
          {lista.map(a => {
            const st = statusGeo[a.geo_status || 'pendente'];
            return (
              <label key={a.id} className="flex items-center gap-3 py-2.5 px-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded">
                <input type="checkbox" checked={sel.has(a.id)} onChange={e => {
                  const n = new Set(sel); if (e.target.checked) n.add(a.id); else n.delete(a.id); setSel(n);
                }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{a.nome}</p>
                  <p className="text-xs text-slate-500 truncate">{a.escola_nome || 'Sem escola'} · {a.turno}{a.bairro ? ` · ${a.bairro}` : ''}{a.rotas_nomes ? ` · já em: ${a.rotas_nomes}` : ''}</p>
                </div>
                <Selo cor={st.cor} icone={st.icone}>{st.label}</Selo>
              </label>
            );
          })}
          {!lista.length && <p className="text-sm text-slate-400 py-8 text-center">Nenhum aluno disponível com esses filtros.</p>}
        </div>
      </div>
    </Modal>
  );
};
