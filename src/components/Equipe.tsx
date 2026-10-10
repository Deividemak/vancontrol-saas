// Equipe da empresa: quem acessa o painel e com qual perfil (só o dono vê esta tela)
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import { Botao, Campo, Modal, Selo, inputCls, erroDaResposta } from './ui';
import { NOMES_PAPEIS, Papel } from '../permissoes';

interface Acesso {
  id: number; nome: string; email: string; papel: Papel; ativo: boolean; voce: boolean;
  ultimo_login: string | null; criado_em: string | null; vinculado_nome: string | null;
}

const PERFIS_PAINEL: { id: Papel; descricao: string }[] = [
  { id: 'dono', descricao: 'Tudo: operação, financeiro, contratos, equipe e privacidade (LGPD).' },
  { id: 'gestor', descricao: 'Operação do dia a dia: rotas, alunos, frota, motoristas, documentos, mensagens. Não vê financeiro nem contratos.' },
  { id: 'financeiro', descricao: 'Mensalidades, cobrança, inadimplência, contratos, responsáveis e mensagens. Não mexe na operação.' },
];

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca');

export const Equipe: React.FC = () => {
  const [lista, setLista] = useState<Acesso[]>([]);
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState<{ nome: string; email: string; senha: string; papel: Papel } | null>(null);
  const [senhaDe, setSenhaDe] = useState<{ a: Acesso; senha: string } | null>(null);
  const [erroModal, setErroModal] = useState('');

  const carregar = () => apiFetch('/api/equipe').then(async r => (r.ok ? setLista(await r.json()) : setErro(await erroDaResposta(r, 'Erro ao carregar')))).catch(() => setErro('Sem conexão com o servidor.'));
  useEffect(() => { carregar(); }, []);

  const alterar = async (a: Acesso, corpo: Record<string, unknown>) => {
    setErro('');
    const r = await apiFetch(`/api/equipe/${a.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    if (!r.ok) setErro(await erroDaResposta(r, 'Erro ao salvar'));
    carregar();
  };
  const remover = async (a: Acesso) => {
    if (!window.confirm(`Remover o acesso de ${a.nome}?`)) return;
    const r = await apiFetch(`/api/equipe/${a.id}`, { method: 'DELETE' });
    if (!r.ok) setErro(await erroDaResposta(r, 'Erro ao remover'));
    carregar();
  };
  const criar = async () => {
    setErroModal('');
    const r = await apiFetch('/api/equipe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(novo) });
    if (!r.ok) return setErroModal(await erroDaResposta(r, 'Erro ao cadastrar'));
    setNovo(null); carregar();
  };
  const trocarSenha = async () => {
    setErroModal('');
    const r = await apiFetch(`/api/equipe/${senhaDe!.a.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: senhaDe!.senha }) });
    if (!r.ok) return setErroModal(await erroDaResposta(r, 'Erro ao salvar'));
    setSenhaDe(null);
  };

  const painel = lista.filter(a => a.papel === 'dono' || a.papel === 'gestor' || a.papel === 'financeiro');
  const app = lista.filter(a => a.papel === 'motorista' || a.papel === 'monitor');

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight">Equipe e acessos</h2>
          <p className="text-slate-500 dark:text-slate-400">Quem entra no sistema e o que cada pessoa pode ver. Motoristas e monitores usam o app no celular.</p>
        </div>
        <Botao icone="person_add" onClick={() => { setErroModal(''); setNovo({ nome: '', email: '', senha: '', papel: 'gestor' }); }}>Novo acesso ao painel</Botao>
      </div>
      {erro && <p className="text-rose-600 font-bold">{erro}</p>}

      <div className="grid md:grid-cols-3 gap-3">
        {PERFIS_PAINEL.map(p => (
          <div key={p.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="font-black">{NOMES_PAPEIS[p.id]}</p>
            <p className="text-sm text-slate-500">{p.descricao}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <p className="px-4 py-3 font-black text-sm border-b border-slate-100 dark:border-slate-800">Painel</p>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-widest text-slate-400">
            <tr><th className="text-left px-4 py-2">Nome</th><th className="text-left px-4 py-2">Perfil</th><th className="text-left px-4 py-2">Último acesso</th><th className="text-left px-4 py-2">Situação</th><th /></tr>
          </thead>
          <tbody>
            {painel.map(a => (
              <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2"><p className="font-bold">{a.nome}{a.voce && <span className="text-xs text-slate-400 font-medium"> (você)</span>}</p><p className="text-xs text-slate-500">{a.email}</p></td>
                <td className="px-4 py-2">
                  <select className={`${inputCls} h-9 py-1`} value={a.papel} disabled={a.voce} aria-label={`Perfil de ${a.nome}`}
                    onChange={e => alterar(a, { papel: e.target.value })}>
                    {PERFIS_PAINEL.map(p => <option key={p.id} value={p.id}>{NOMES_PAPEIS[p.id]}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2 text-slate-500">{quando(a.ultimo_login)}</td>
                <td className="px-4 py-2">{a.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo cor="vermelho">Desativado</Selo>}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {!a.voce && (
                    <>
                      <button className="h-8 px-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => alterar(a, { ativo: !a.ativo })}>{a.ativo ? 'Desativar' : 'Reativar'}</button>
                      <button className="size-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Trocar senha" onClick={() => { setErroModal(''); setSenhaDe({ a, senha: '' }); }}><span className="material-symbols-outlined text-[18px]">key</span></button>
                      <button className="size-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remover" onClick={() => remover(a)}><span className="material-symbols-outlined text-[18px]">delete</span></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <p className="px-4 py-3 font-black text-sm border-b border-slate-100 dark:border-slate-800">App do celular (motoristas e monitores)</p>
        {app.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">Nenhum acesso ainda. Crie pelo botão “App” em Motoristas ou em Documentos → Monitores.</p>}
        {app.map(a => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-sm">
            <p className="flex-1 min-w-0"><b>{a.vinculado_nome || a.nome}</b> <span className="text-slate-500">· {NOMES_PAPEIS[a.papel]} · {a.email} · último acesso {quando(a.ultimo_login)}</span></p>
            {a.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo cor="vermelho">Desativado</Selo>}
            <button className="h-8 px-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => alterar(a, { ativo: !a.ativo })}>{a.ativo ? 'Desativar' : 'Reativar'}</button>
          </div>
        ))}
      </section>

      <Modal titulo="Novo acesso ao painel" aberto={!!novo} onFechar={() => setNovo(null)} tamanho="md"
        rodape={<><Botao variante="secundario" onClick={() => setNovo(null)}>Cancelar</Botao><Botao onClick={criar}>Cadastrar</Botao></>}>
        {novo && (
          <div className="space-y-3">
            <Campo label="Nome"><input className={inputCls} value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} aria-label="Nome" /></Campo>
            <Campo label="E-mail"><input type="email" className={inputCls} value={novo.email} onChange={e => setNovo({ ...novo, email: e.target.value })} aria-label="E-mail" /></Campo>
            <Campo label="Senha inicial (mínimo 8 caracteres)" dica="A pessoa pode trocar depois em Configurações.">
              <input type="text" className={inputCls} value={novo.senha} onChange={e => setNovo({ ...novo, senha: e.target.value })} aria-label="Senha" />
            </Campo>
            <Campo label="Perfil">
              <select className={inputCls} value={novo.papel} onChange={e => setNovo({ ...novo, papel: e.target.value as Papel })} aria-label="Perfil">
                {PERFIS_PAINEL.map(p => <option key={p.id} value={p.id}>{NOMES_PAPEIS[p.id]}</option>)}
              </select>
            </Campo>
            {erroModal && <p className="text-sm text-rose-600 font-bold">{erroModal}</p>}
          </div>
        )}
      </Modal>

      <Modal titulo={`Trocar senha · ${senhaDe?.a.nome || ''}`} aberto={!!senhaDe} onFechar={() => setSenhaDe(null)} tamanho="md"
        rodape={<><Botao variante="secundario" onClick={() => setSenhaDe(null)}>Cancelar</Botao><Botao onClick={trocarSenha}>Salvar</Botao></>}>
        {senhaDe && (
          <div className="space-y-3">
            <Campo label="Nova senha (mínimo 8 caracteres)"><input type="text" className={inputCls} value={senhaDe.senha} onChange={e => setSenhaDe({ ...senhaDe, senha: e.target.value })} aria-label="Nova senha" /></Campo>
            {erroModal && <p className="text-sm text-rose-600 font-bold">{erroModal}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
};
