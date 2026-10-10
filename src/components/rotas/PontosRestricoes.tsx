// Pontos de encontro e áreas onde a van não entra
import React, { useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Campo, inputCls, erroDaResposta } from '../ui';
import { Mapa, MarcadorMapa } from '../mapa/Mapa';
import { AreaRestrita, PontoEncontro } from './tipos';

type Item = { tipo: 'ponto'; dados: Partial<PontoEncontro> } | { tipo: 'area'; dados: Partial<AreaRestrita> };

export const PontosRestricoes: React.FC<{ pontos: PontoEncontro[]; areas: AreaRestrita[]; onMudou: () => void }> = ({ pontos, areas, onMudou }) => {
  const [item, setItem] = useState<Item | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [enquadrar, setEnquadrar] = useState(0);

  const marcar = (lat: number, lng: number) => {
    if (!item) return;
    const p = { lat: +lat.toFixed(7), lng: +lng.toFixed(7) };
    setItem({ ...item, dados: { ...item.dados, ...p } } as Item);
  };

  const salvar = async () => {
    if (!item) return;
    setSalvando(true);
    setErro('');
    const base = item.tipo === 'ponto' ? '/api/pontos-encontro' : '/api/areas-restritas';
    try {
      const res = await apiFetch(item.dados.id ? `${base}/${item.dados.id}` : base, {
        method: item.dados.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.dados),
      });
      if (!res.ok) throw new Error(await erroDaResposta(res, 'Erro ao salvar'));
      setItem(null);
      onMudou();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (tipo: 'ponto' | 'area', id: number, nome: string) => {
    if (!confirm(`Excluir "${nome}"?`)) return;
    const res = await apiFetch(`${tipo === 'ponto' ? '/api/pontos-encontro' : '/api/areas-restritas'}/${id}`, { method: 'DELETE' });
    if (!res.ok) alert(await erroDaResposta(res, 'Erro ao excluir'));
    onMudou();
  };

  const marcadores: MarcadorMapa[] = [
    ...pontos.filter(p => !(item?.tipo === 'ponto' && item.dados.id === p.id)).map(p => ({
      id: `p${p.id}`, lat: p.lat, lng: p.lng, tipo: 'ponto' as const, apagado: !p.ativo, titulo: `${p.nome}${p.referencia ? `\n${p.referencia}` : ''}`,
    })),
    ...(item && item.dados.lat !== undefined && item.dados.lng !== undefined
      ? [{ id: 'novo', lat: item.dados.lat!, lng: item.dados.lng!, tipo: (item.tipo === 'ponto' ? 'ponto' : 'pin') as 'ponto' | 'pin', arrastavel: true, destaque: true }]
      : []),
  ];
  const circulos = [
    ...areas.filter(a => !(item?.tipo === 'area' && item.dados.id === a.id)).map(a => ({ id: a.id, lat: a.lat, lng: a.lng, raio: a.raio_m, titulo: a.nome })),
    ...(item?.tipo === 'area' && item.dados.lat !== undefined ? [{ id: 'nova', lat: item.dados.lat!, lng: item.dados.lng!, raio: item.dados.raio_m || 100, titulo: item.dados.nome || 'Nova área', cor: '#f59e0b' }] : []),
  ];

  function lista<T extends { id: number; nome: string; ativo: boolean }>({ titulo, icone, itens, tipo, desc, novo }: {
    titulo: string; icone: string; itens: T[]; tipo: 'ponto' | 'area'; desc: (x: T) => string; novo: () => void;
  }) {
    return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-black flex items-center gap-2"><span className="material-symbols-outlined text-[20px]">{icone}</span>{titulo}</h3>
        <Botao variante="secundario" icone="add" onClick={novo}>Novo</Botao>
      </div>
      {itens.length === 0 && <p className="text-sm text-slate-400">Nenhum cadastrado.</p>}
      {itens.map(x => (
        <div key={x.id} className={`flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 ${x.ativo ? '' : 'opacity-50'}`}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{x.nome}</p>
            <p className="text-xs text-slate-500 truncate">{desc(x)}</p>
          </div>
          <button className="text-slate-400 hover:text-primary" title="Editar" onClick={() => { setErro(''); setItem({ tipo, dados: { ...x } } as Item); setEnquadrar(n => n + 1); }}>
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button className="text-slate-400 hover:text-rose-500" title="Excluir" onClick={() => excluir(tipo, x.id, x.nome)}>
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      ))}
    </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5">
      <div className="space-y-4">
        {lista<PontoEncontro>({ titulo: 'Pontos de encontro', icone: 'hail', itens: pontos, tipo: 'ponto',
          desc: p => `${p.referencia || 'Sem referência'}${p.em_uso ? ` · em uso por ${p.em_uso} aluno(s)` : ''}`,
          novo: () => { setErro(''); setItem({ tipo: 'ponto', dados: { ativo: true } }); } })}
        {lista<AreaRestrita>({ titulo: 'Áreas onde a van não entra', icone: 'block', itens: areas, tipo: 'area',
          desc: a => `Raio de ${a.raio_m} m${a.descricao ? ` · ${a.descricao}` : ''}`,
          novo: () => { setErro(''); setItem({ tipo: 'area', dados: { ativo: true, raio_m: 100 } }); } })}
        <p className="text-[11px] text-slate-400">
          Paradas dentro de uma área restrita geram alerta na rota, sugerindo um ponto de encontro. Irmãos e vizinhos a até 25 m entram automaticamente na mesma parada.
        </p>
      </div>

      <div className="space-y-3">
        {item && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-primary p-4 space-y-3">
            <p className="font-black">{item.dados.id ? 'Editar' : 'Novo'} {item.tipo === 'ponto' ? 'ponto de encontro' : 'área restrita'} — clique no mapa para posicionar</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Campo label="Nome" className="col-span-2">
                <input className={inputCls} value={item.dados.nome || ''} onChange={e => setItem({ ...item, dados: { ...item.dados, nome: e.target.value } } as Item)}
                  placeholder={item.tipo === 'ponto' ? 'Ex.: Padaria da QE 40' : 'Ex.: Rua estreita sem retorno'} />
              </Campo>
              {item.tipo === 'ponto' ? (
                <Campo label="Referência" className="col-span-2">
                  <input className={inputCls} value={item.dados.referencia || ''} onChange={e => setItem({ ...item, dados: { ...item.dados, referencia: e.target.value } })} placeholder="Em frente ao portão" />
                </Campo>
              ) : (<>
                <Campo label="Raio (m)">
                  <input type="number" min={10} max={5000} className={inputCls} value={item.dados.raio_m || 100} onChange={e => setItem({ ...item, dados: { ...item.dados, raio_m: Number(e.target.value) } })} />
                </Campo>
                <Campo label="Motivo">
                  <input className={inputCls} value={item.dados.descricao || ''} onChange={e => setItem({ ...item, dados: { ...item.dados, descricao: e.target.value } })} />
                </Campo>
              </>)}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium flex items-center gap-2 mr-auto">
                <input type="checkbox" checked={item.dados.ativo !== false} onChange={e => setItem({ ...item, dados: { ...item.dados, ativo: e.target.checked } } as Item)} /> Ativo
              </label>
              {erro && <p className="text-sm text-rose-500 font-bold">{erro}</p>}
              <Botao variante="secundario" onClick={() => setItem(null)}>Cancelar</Botao>
              <Botao onClick={salvar} carregando={salvando} disabled={item.dados.lat === undefined}>Salvar</Botao>
            </div>
          </div>
        )}
        <Mapa className="h-[560px]" marcadores={marcadores} circulos={circulos} chaveEnquadramento={`${pontos.length}-${areas.length}-${enquadrar}`}
          onClique={marcar} onArrastar={(_, lat, lng) => marcar(lat, lng)} />
      </div>
    </div>
  );
};
