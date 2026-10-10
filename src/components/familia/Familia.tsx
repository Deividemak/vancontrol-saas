// Visão da família: responsáveis do aluno (ficha do aluno) e filhos do responsável (tela de responsáveis)
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Modal, Selo, erroDaResposta } from '../ui';
import { PortalResponsavel } from '../operacao/PortalResponsavel';

interface RespDoAluno {
  id: number; nome: string; telefone: string; email?: string | null; status?: string | null;
  whatsapp_ativo: boolean; portal_ultimo_acesso?: string | null; principal: boolean;
}
interface FamiliaAluno { responsaveis: RespDoAluno[]; telefone_avulso: string | null; irmaos: { id: number; nome: string; status: string }[] }

interface Filho {
  id: number; nome: string; turno: string; status: string; suspenso: boolean; escola_nome: string | null;
  rotas: { nome: string; tipo: string; hora: string | null }[];
  mensalidade?: number; dia_vencimento?: number;
  em_aberto?: { qtd: number; total: number; atrasadas: number };
}
interface FamiliaResp { alunos: Filho[]; ve_valores: boolean; total: { mensalidades: number; em_aberto: number; atrasadas: number } | null }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHoraBR = (d: string) => `${d.slice(0, 10).split('-').reverse().join('/')} ${d.slice(11, 16)}`;
const cartao = 'rounded-xl border border-slate-200 dark:border-slate-800 p-4';

const Erro: React.FC<{ msg: string | null }> = ({ msg }) =>
  msg ? <p role="alert" className="text-sm font-bold text-rose-600 bg-rose-500/10 rounded-lg px-3 py-2">{msg}</p> : null;

async function lerJson<T>(url: string): Promise<{ dados?: T; erro?: string }> {
  const r = await apiFetch(url).catch(() => null);
  if (!r) return { erro: 'Sem conexão com o servidor.' };
  if (!r.ok) return { erro: await erroDaResposta(r, 'Não foi possível carregar.') };
  return { dados: await r.json() };
}

// ---------- Ficha do aluno: seção "Responsáveis" ----------
export const ResponsaveisDoAluno: React.FC<{
  alunoId: number;
  /** o responsável escolhido no formulário mudou e ainda não foi salvo */
  alterado?: boolean;
  onEscolher: () => void;
  onCadastrar?: () => void;
}> = ({ alunoId, alterado, onEscolher, onCadastrar }) => {
  const [dados, setDados] = useState<FamiliaAluno | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [portalDe, setPortalDe] = useState<RespDoAluno | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    lerJson<FamiliaAluno>(`/api/alunos/${alunoId}/familia`).then(r => {
      if (!vivo) return;
      setErro(r.erro || null);
      if (r.dados) setDados(r.dados);
    });
    return () => { vivo = false; };
  }, [alunoId, versao]);

  if (erro) return <Erro msg={erro} />;
  if (!dados) return <p className="text-sm text-slate-400 py-6 text-center">Carregando…</p>;

  return (
    <div className="space-y-4">
      {alterado && (
        <p className="text-sm font-bold text-amber-700 bg-amber-500/10 rounded-lg px-3 py-2">
          Você trocou o responsável na aba Dados. Salve o aluno para esta lista mostrar a mudança.
        </p>
      )}

      {!dados.responsaveis.length ? (
        <div className={`${cartao} border-dashed text-center space-y-3`}>
          <span className="material-symbols-outlined text-4xl text-slate-300">family_restroom</span>
          <p className="font-bold">Nenhum responsável cadastrado para este aluno</p>
          <p className="text-sm text-slate-500">
            Sem responsável, a família não recebe avisos da van nem acessa o portal.
            {dados.telefone_avulso && <> Hoje há só um telefone avulso: <b>{dados.telefone_avulso}</b>.</>}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Botao type="button" icone="person_search" onClick={onEscolher}>Escolher responsável</Botao>
            {onCadastrar && <Botao type="button" variante="secundario" icone="person_add" onClick={onCadastrar}>Cadastrar novo responsável</Botao>}
          </div>
        </div>
      ) : dados.responsaveis.map(r => (
        <div key={r.id} className={`${cartao} space-y-3`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-black">{r.nome}</p>
              <p className="text-sm text-slate-500">{r.telefone}{r.email ? ` · ${r.email}` : ''}</p>
            </div>
            <div className="flex flex-wrap gap-1 justify-end">
              {r.principal && <Selo cor="azul" icone="star">Principal · financeiro</Selo>}
              {r.status && r.status !== 'Ativo' && <Selo cor="vermelho">{r.status}</Selo>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {r.whatsapp_ativo
              ? <Selo cor="verde" icone="notifications_active">Avisos no WhatsApp ligados</Selo>
              : <Selo cor="cinza" icone="notifications_off">Avisos no WhatsApp desligados</Selo>}
            {r.portal_ultimo_acesso
              ? <Selo cor="verde" icone="phonelink_ring">Portal acessado em {dataHoraBR(r.portal_ultimo_acesso)}</Selo>
              : <Selo cor="amarelo" icone="phonelink_off">Nunca acessou o portal</Selo>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Botao type="button" variante="secundario" icone="phonelink_ring" onClick={() => setPortalDe(r)}>Portal e avisos</Botao>
            <a href={`https://wa.me/55${r.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg h-10 px-4 text-sm font-bold bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20">
              <span className="material-symbols-outlined text-[18px]">chat</span>Conversar
            </a>
          </div>
        </div>
      ))}

      {dados.irmaos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Irmãos (mesmo responsável)</p>
          <div className="flex flex-wrap gap-2">
            {dados.irmaos.map(i => <Selo key={i.id} cor={i.status === 'Ativo' ? 'roxo' : 'cinza'} icone="child_care">{i.nome}</Selo>)}
          </div>
        </div>
      )}

      <PortalResponsavel resp={portalDe} onFechar={() => setPortalDe(null)} onMudou={() => setVersao(v => v + 1)} />
    </div>
  );
};

// ---------- Tela de responsáveis: família do responsável ----------
export const FamiliaResponsavel: React.FC<{
  resp: { id: number; nome: string } | null;
  onFechar: () => void;
  onAbrirPortal?: () => void;
}> = ({ resp, onFechar, onAbrirPortal }) => {
  const [dados, setDados] = useState<FamiliaResp | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!resp) return;
    let vivo = true;
    setDados(null); setErro(null);
    lerJson<FamiliaResp>(`/api/responsaveis/${resp.id}/familia`).then(r => {
      if (!vivo) return;
      setErro(r.erro || null);
      if (r.dados) setDados(r.dados);
    });
    return () => { vivo = false; };
  }, [resp?.id]);

  return (
    <Modal aberto={!!resp} onFechar={onFechar} titulo={`Família — ${resp?.nome || ''}`} tamanho="lg"
      rodape={<>
        {onAbrirPortal && <Botao variante="secundario" icone="phonelink_ring" onClick={onAbrirPortal}>Portal e avisos</Botao>}
        <Botao onClick={onFechar}>Fechar</Botao>
      </>}>
      <div className="space-y-4">
        <Erro msg={erro} />
        {!dados && !erro && <p className="text-sm text-slate-400 py-6 text-center">Carregando…</p>}
        {dados && !dados.alunos.length && (
          <p className="text-sm text-slate-400 py-6 text-center">Nenhum aluno ligado a este responsável. Ligue pela ficha do aluno, no campo "Responsável".</p>
        )}
        {dados && dados.alunos.map(a => (
          <div key={a.id} className={`${cartao} space-y-2`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-black">{a.nome}</p>
                <p className="text-sm text-slate-500">{a.escola_nome || 'Sem escola'} · {a.turno}</p>
              </div>
              <div className="flex flex-wrap gap-1 justify-end">
                {a.status !== 'Ativo' ? <Selo>Inativo</Selo> : a.suspenso ? <Selo cor="amarelo">Suspenso</Selo> : <Selo cor="verde">Ativo</Selo>}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {a.rotas.length
                ? a.rotas.map((r, i) => <Selo key={i} cor="azul" icone={r.tipo === 'volta' ? 'home' : 'school'}>{r.nome}{r.hora ? ` · ${r.hora}` : ''}</Selo>)
                : <Selo cor="amarelo" icone="route">Sem rota</Selo>}
            </div>
            {dados.ve_valores && a.mensalidade !== undefined && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm pt-2 border-t border-slate-100 dark:border-slate-800">
                <span>Mensalidade: <b>{brl(a.mensalidade)}</b>{a.dia_vencimento ? ` · vence dia ${a.dia_vencimento}` : ''}</span>
                {a.em_aberto && a.em_aberto.qtd > 0 && (
                  <span className={a.em_aberto.atrasadas ? 'text-rose-600 font-bold' : 'text-amber-600 font-bold'}>
                    Em aberto: {brl(a.em_aberto.total)} ({a.em_aberto.qtd}{a.em_aberto.atrasadas ? `, ${a.em_aberto.atrasadas} atrasada(s)` : ''})
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
        {dados && dados.total && dados.alunos.length > 0 && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <p>Total da família por mês: <b className="text-lg">{brl(dados.total.mensalidades)}</b></p>
            <p className={dados.total.atrasadas ? 'text-rose-600 font-bold' : dados.total.em_aberto ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
              {dados.total.em_aberto ? `Em aberto: ${brl(dados.total.em_aberto)}${dados.total.atrasadas ? ` (${dados.total.atrasadas} atrasada(s))` : ''}` : 'Nada em aberto'}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};
