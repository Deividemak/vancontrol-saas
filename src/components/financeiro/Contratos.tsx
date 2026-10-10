// Aba Contratos: gerar do modelo, enviar para o responsável assinar no portal, ver/imprimir
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Modal, Campo, Selo, inputCls, textareaCls, erroDaResposta } from '../ui';
import { BRL, dataBR, imprimirContrato, Contrato, buscarJson, ErroCarga } from './util';

interface Item {
  id: number; aluno_id: number; aluno_nome: string; responsavel_nome: string | null; status: 'pendente' | 'assinado' | 'cancelado';
  valor: number | null; vigencia_inicio: string; vigencia_fim: string; criado_em: string; enviado_em: string | null; assinado_em: string | null;
}
const COR = { pendente: 'amarelo', assinado: 'verde', cancelado: 'cinza' } as const;

export const Contratos: React.FC = () => {
  const [lista, setLista] = useState<Item[] | null>(null);
  const [novo, setNovo] = useState(false);
  const [alunos, setAlunos] = useState<{ id: number; nome: string; responsavel_nome: string | null }[]>([]);
  const [alunoId, setAlunoId] = useState('');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [ver, setVer] = useState<Contrato | null>(null);
  const [aviso, setAviso] = useState('');
  const [erroCarga, setErroCarga] = useState('');

  const carregar = () => buscarJson<Item[]>(apiFetch, '/api/contratos').then(setLista).catch(e => setErroCarga(e.message));
  useEffect(() => { carregar(); }, []);

  const abrirNovo = async () => {
    setNovo(true); setAlunoId(''); setTexto(''); setErro('');
    const r = await apiFetch('/api/alunos');
    const j = await r.json();
    setAlunos(j.filter((a: any) => a.status === 'Ativo'));
  };
  const escolher = async (id: string) => {
    setAlunoId(id); setTexto(''); setErro('');
    if (!id) return;
    const r = await apiFetch(`/api/contratos/previa?aluno_id=${id}`);
    if (r.ok) setTexto((await r.json()).conteudo); else setErro(await erroDaResposta(r, 'Erro'));
  };
  const gerar = async (enviar: boolean) => {
    setErro('');
    const r = await apiFetch('/api/contratos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aluno_id: Number(alunoId), conteudo: texto }) });
    if (!r.ok) return setErro(await erroDaResposta(r, 'Erro ao gerar'));
    const { id } = await r.json();
    if (enviar) await enviarContrato(id);
    setNovo(false); carregar();
  };
  const enviarContrato = async (id: number) => {
    const r = await apiFetch(`/api/contratos/${id}/enviar`, { method: 'POST' });
    if (r.ok) setAviso('Contrato enviado no WhatsApp do responsável, com o link do portal para assinar.');
    else alert(await erroDaResposta(r, 'Erro ao enviar'));
    carregar();
  };
  const cancelar = async (id: number) => {
    if (!window.confirm('Cancelar este contrato pendente?')) return;
    await apiFetch(`/api/contratos/${id}/cancelar`, { method: 'POST' });
    carregar();
  };
  const abrir = async (id: number) => setVer(await (await apiFetch(`/api/contratos/${id}`)).json());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <p className="text-sm text-slate-500 flex-1 min-w-[260px]">O responsável lê e assina pelo portal (nome + CPF + aceite). Guardamos data, IP, aparelho e um código SHA-256 do texto — qualquer alteração depois é detectada.</p>
        <Botao icone="add" onClick={abrirNovo}>Novo contrato</Botao>
      </div>
      {aviso && <p className="text-sm text-emerald-600 font-bold">{aviso}</p>}
      {erroCarga && <ErroCarga msg={erroCarga} />}
      {!lista && !erroCarga && <p className="text-center text-slate-500 animate-pulse py-8">Carregando...</p>}
      {lista?.length === 0 && <p className="text-center text-slate-500 py-10">Nenhum contrato ainda. Gere o primeiro a partir do modelo (edite o modelo em Configurações).</p>}
      {lista && lista.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] uppercase tracking-widest text-slate-500 font-black">
              <tr><th className="px-4 py-3">Aluno</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Vigência</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3 text-right">Ações</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lista.map(c => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-black">{c.aluno_nome}</td>
                  <td className="px-4 py-3">{c.responsavel_nome || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{c.valor !== null ? BRL(c.valor) : '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{dataBR(c.vigencia_inicio)} a {dataBR(c.vigencia_fim)}</td>
                  <td className="px-4 py-3">
                    <Selo cor={COR[c.status]}>{c.status}</Selo>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {c.status === 'assinado' ? `em ${new Date(c.assinado_em!).toLocaleString('pt-BR')}` : c.status === 'pendente' ? (c.enviado_em ? `enviado ${new Date(c.enviado_em).toLocaleDateString('pt-BR')}` : 'não enviado') : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Botao variante="secundario" className="h-8 text-xs" icone="visibility" onClick={() => abrir(c.id)}>Ver</Botao>
                      {c.status === 'pendente' && <>
                        <Botao className="h-8 text-xs" icone="send" onClick={() => enviarContrato(c.id)}>{c.enviado_em ? 'Reenviar' : 'Enviar'}</Botao>
                        <button title="Cancelar" className="size-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => cancelar(c.id)}><span className="material-symbols-outlined text-[18px]">block</span></button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal titulo="Novo contrato" aberto={novo} onFechar={() => setNovo(false)} tamanho="xl"
        rodape={<>
          <Botao variante="secundario" onClick={() => setNovo(false)}>Cancelar</Botao>
          <Botao variante="secundario" disabled={!texto} onClick={() => gerar(false)}>Só gerar</Botao>
          <Botao icone="send" disabled={!texto} onClick={() => gerar(true)}>Gerar e enviar</Botao>
        </>}>
        <Campo label="Aluno">
          <select className={inputCls} value={alunoId} onChange={e => escolher(e.target.value)} aria-label="Aluno do contrato">
            <option value="">Selecione...</option>
            {alunos.map(a => <option key={a.id} value={a.id}>{a.nome}{a.responsavel_nome ? ` — ${a.responsavel_nome}` : ' (sem responsável)'}</option>)}
          </select>
        </Campo>
        {texto && <Campo label="Texto (pode ajustar antes de gerar; depois fica travado)" className="mt-4">
          <textarea className={`${textareaCls} min-h-[380px] font-mono text-xs`} value={texto} onChange={e => setTexto(e.target.value)} aria-label="Texto do contrato" />
        </Campo>}
        {erro && <p className="text-sm text-rose-600 font-bold mt-3">{erro}</p>}
      </Modal>

      <Modal titulo={ver ? `Contrato · ${ver.aluno_nome}` : ''} aberto={!!ver} onFechar={() => setVer(null)} tamanho="xl"
        rodape={<><Botao variante="secundario" onClick={() => setVer(null)}>Fechar</Botao><Botao icone="print" onClick={() => imprimirContrato(ver!)}>Imprimir</Botao></>}>
        {ver && (
          <div className="space-y-4">
            {ver.integro === false && <p className="text-sm font-bold text-rose-600 bg-rose-50 rounded-lg p-3">Atenção: o texto foi alterado depois de gerado (o código SHA-256 não confere).</p>}
            {ver.status === 'assinado' && (
              <div className="text-sm rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3">
                <b>Assinado</b> por {ver.assinatura_nome} (CPF {ver.assinatura_cpf}) em {new Date(ver.assinado_em!).toLocaleString('pt-BR')}
                <div className="text-xs text-slate-500 mt-1">IP {ver.assinatura_ip} · {ver.assinatura_user_agent}</div>
              </div>
            )}
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{ver.conteudo}</pre>
            <p className="text-[11px] text-slate-400 break-all">SHA-256: {ver.hash_sha256}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};
