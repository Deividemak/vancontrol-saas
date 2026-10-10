import React, { useEffect, useState } from 'react';
import { Papel, podeVer, NOMES_PAPEIS } from '../permissoes';
import { apiFetch } from '../services/api';

interface SidebarItemProps {
  icon: string;
  label: string;
  active?: boolean;
  badge?: number;
  badgeCor?: string;
  sub?: boolean;
  onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, active, badge, badgeCor = 'bg-emerald-500', sub, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 rounded-lg w-full transition-all ${sub ? 'pl-9 pr-3 py-2' : 'px-3 py-2.5'} ${
      active 
        ? 'bg-primary/10 text-primary font-bold' 
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
    }`}
  >
    <span className={`material-symbols-outlined ${sub ? 'text-[19px]' : 'text-[22px]'}`}>{icon}</span>
    <span className={`${sub ? 'text-[13px]' : 'text-sm'} flex-1 text-left`}>{label}</span>
    <Bolinha n={badge} cor={badgeCor} />
  </button>
);

const Bolinha: React.FC<{ n?: number; cor: string }> = ({ n, cor }) =>
  n ? <span className={`min-w-5 h-5 px-1.5 rounded-full ${cor} text-white text-[11px] font-black flex items-center justify-center`}>{n}</span> : null;

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  naoLidas?: number;
  papel?: Papel;
  usuario?: { nome: string; empresa_nome?: string | null } | null;
  onSair?: () => void;
}

type Item = { aba: string; icon: string; label: string };

// itens com "grupo" viram um grupo que abre e fecha (GRUPOS abaixo)
const ITENS: (Item | { grupo: string })[] = [
  { aba: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { aba: 'operacao', icon: 'radar', label: 'Operação' },
  { aba: 'mensagens', icon: 'forum', label: 'Mensagens' },
  { grupo: 'frota' },
  { aba: 'documentos', icon: 'folder_shared', label: 'Documentos' },
  { aba: 'motoristas', icon: 'badge', label: 'Motoristas' },
  { grupo: 'alunos' },
  { aba: 'financeiro', icon: 'account_balance_wallet', label: 'Financeiro' },
  { aba: 'rotas', icon: 'map', label: 'Rotas' },
  { aba: 'escolas', icon: 'domain', label: 'Escolas' },
  { aba: 'relatorios', icon: 'query_stats', label: 'Relatórios' },
  { aba: 'plano', icon: 'workspace_premium', label: 'Meu plano' },
  { aba: 'equipe', icon: 'manage_accounts', label: 'Equipe' },
  { aba: 'lgpd', icon: 'shield_person', label: 'Privacidade (LGPD)' },
];

// Grupos: abrem e fecham, com as telas recuadas; cada um lembra aberto/fechado na sua chave
interface Grupo { label: string; icon: string; chave: string; itens: Item[] }
const GRUPOS: Record<string, Grupo> = {
  frota: {
    label: 'Frota', icon: 'airport_shuttle', chave: 'vancontrol_menu_frota',
    itens: [
      { aba: 'frota', icon: 'airport_shuttle', label: 'Vans' },
      { aba: 'checklist', icon: 'fact_check', label: 'Checklist' },
      { aba: 'manutencao', icon: 'build', label: 'Manutenção' },
      { aba: 'abastecimento', icon: 'local_gas_station', label: 'Abastecimento' },
    ],
  },
  alunos: {
    label: 'Alunos', icon: 'groups', chave: 'vancontrol_menu_alunos',
    itens: [
      { aba: 'alunos', icon: 'groups', label: 'Alunos' },
      { aba: 'responsaveis', icon: 'family_history', label: 'Responsáveis' },
    ],
  },
};

function lerAberto(chave: string): boolean {
  try { return localStorage.getItem(chave) === '1'; } catch { return false; }
}
function salvarAberto(chave: string, v: boolean) {
  try { localStorage.setItem(chave, v ? '1' : '0'); } catch { /* sem armazenamento: só não lembra */ }
}

const GrupoMenu: React.FC<{
  grupo: Grupo;
  subitens: Item[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  badges?: Record<string, number>;
}> = ({ grupo, subitens, activeTab, setActiveTab, badges = {} }) => {
  const dentro = subitens.some(i => i.aba === activeTab);
  const [aberto, setAberto] = useState(() => lerAberto(grupo.chave) || dentro);
  const mudarAberto = (v: boolean) => { setAberto(v); salvarAberto(grupo.chave, v); };
  // abre sozinho ao entrar numa tela do grupo
  useEffect(() => { if (dentro && !aberto) mudarAberto(true); }, [dentro]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalBadges = subitens.reduce((s, i) => s + (badges[i.aba] || 0), 0);

  return (
    <div className="space-y-1">
      <div className={`flex items-center rounded-lg w-full transition-all ${
        dentro && !aberto ? 'bg-primary/10 text-primary font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
      }`}>
        <button onClick={() => { mudarAberto(true); setActiveTab(subitens[0].aba); }} className="flex items-center gap-3 pl-3 py-2.5 flex-1 min-w-0">
          <span className="material-symbols-outlined text-[22px]">{grupo.icon}</span>
          <span className="text-sm flex-1 text-left">{grupo.label}</span>
          {!aberto && <Bolinha n={totalBadges} cor="bg-amber-500" />}
        </button>
        <button onClick={() => mudarAberto(!aberto)} className="px-2 py-2.5" aria-label={aberto ? `Fechar o grupo ${grupo.label}` : `Abrir o grupo ${grupo.label}`} aria-expanded={aberto}>
          <span className="material-symbols-outlined text-[20px]">{aberto ? 'expand_more' : 'chevron_right'}</span>
        </button>
      </div>
      {aberto && subitens.map(s => (
        <SidebarItem
          key={s.aba}
          sub
          icon={s.icon}
          label={s.label}
          badge={badges[s.aba]}
          badgeCor="bg-amber-500"
          active={activeTab === s.aba}
          onClick={() => setActiveTab(s.aba)}
        />
      ))}
    </div>
  );
};

/** Checklists que pedem atenção hoje (pendentes + com problema); 0 se der erro. */
function useAlertasChecklist(ativo: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!ativo) { setN(0); return; }
    let vivo = true;
    const ler = () => apiFetch('/api/checklists/hoje')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (vivo) setN(j?.contadores ? Number(j.contadores.pendentes || 0) + Number(j.contadores.com_problema || 0) : 0); })
      .catch(() => { if (vivo) setN(0); });
    ler();
    const t = window.setInterval(ler, 2 * 60 * 1000);
    return () => { vivo = false; window.clearInterval(t); };
  }, [ativo]);
  return n;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, naoLidas = 0, papel = 'dono' as Papel, usuario, onSair }) => {
  const iniciais = (usuario?.nome || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const subitensDe = (id: string) => GRUPOS[id].itens.filter(i => podeVer(papel, i.aba));
  const alertasChecklist = useAlertasChecklist(podeVer(papel, 'checklist'));
  return (
    <aside className="w-64 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full shrink-0">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-primary p-2 rounded-lg text-white">
          <span className="material-symbols-outlined text-2xl">school</span>
        </div>
        <div className="min-w-0">
          <h1 className="font-bold text-lg leading-tight">VanControl</h1>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest truncate" title={usuario?.empresa_nome || ''}>
            {usuario?.empresa_nome || 'Painel'}
          </p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {ITENS.map(i => {
          if ('grupo' in i) {
            const subitens = subitensDe(i.grupo);
            // sem permissão para nenhuma tela do grupo: o grupo não aparece
            return subitens.length > 0 && (
              <GrupoMenu
                key={`grupo-${i.grupo}`}
                grupo={GRUPOS[i.grupo]}
                subitens={subitens}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                badges={i.grupo === 'frota' ? { checklist: alertasChecklist } : undefined}
              />
            );
          }
          return podeVer(papel, i.aba) && (
            <SidebarItem
              key={i.aba}
              icon={i.icon}
              label={i.label}
              badge={i.aba === 'mensagens' ? naoLidas : undefined}
              active={activeTab === i.aba}
              onClick={() => setActiveTab(i.aba)}
            />
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <button onClick={onSair} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-left" title="Sair do sistema">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-black text-primary shrink-0">{iniciais}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{usuario?.nome || 'Usuário'}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{NOMES_PAPEIS[papel]} · Sair</p>
          </div>
          <span className="material-symbols-outlined text-sm">logout</span>
        </button>
      </div>
    </aside>
  );
};
