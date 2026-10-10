import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { Alunos } from './components/Alunos';
import { Financeiro } from './components/Financeiro';
import { Documentos } from './components/Documentos';
import { Manutencao } from './components/Manutencao';
import { Frota } from './components/Frota';
import { Motoristas } from './components/Motoristas';
import { ChecklistEficiencia } from './components/ChecklistEficiencia';
import { Abastecimento } from './components/Abastecimento';
import { Responsaveis } from './components/Responsaveis';
import { Rotas } from './components/Rotas';
import { Escolas } from './components/Escolas';
import { Login } from './components/Login';
import { ConfiguracoesModal } from './components/ConfiguracoesModal';

import { UNAUTHORIZED_EVENT } from './services/api';
import { Operacao } from './components/Operacao';
import { AlertaEmergencia } from './components/operacao/AlertaEmergencia';
import { MotoristaApp } from './motorista/MotoristaApp';
import { Portal } from './portal/Portal';
import { Mensagens } from './components/Mensagens';
import { apiFetch } from './services/api';
import { Equipe } from './components/Equipe';
import { Privacidade } from './components/Privacidade';
import { EscolaPortal } from './escola/EscolaPortal';
import { Relatorios } from './components/Relatorios';
import { MeuPlano } from './components/MeuPlano';
import { Papel, podeVer, papelDoUsuario } from './permissoes';
interface User {
  role?: 'admin' | 'motorista' | 'monitor';
  papel?: Papel;
  motorista_id?: number | null;
  monitor_id?: number | null;
  empresa_id?: number;
  empresa_nome?: string | null;
  id: number;
  nome: string;
  email: string;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('vancontrol_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem('vancontrol_token'));
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);

  const papel = papelDoUsuario(user);
  const noApp = papel === 'motorista' || papel === 'monitor';

  // atualiza perfil/empresa do usuário (o dono pode ter mudado o perfil)
  React.useEffect(() => {
    if (!token || (window.location.pathname.startsWith('/acompanhar') || window.location.pathname.startsWith('/escola'))) return;
    apiFetch('/api/auth/me').then(r => (r.ok ? r.json() : null)).then(u => {
      if (!u) return;
      setUser(u);
      localStorage.setItem('vancontrol_user', JSON.stringify(u));
    }).catch(() => {});
  }, [token]);

  // se o perfil não pode ver a aba aberta, volta para o início
  React.useEffect(() => {
    if (!podeVer(papel, activeTab)) setActiveTab('dashboard');
  }, [papel, activeTab]);

  // contador de mensagens não lidas (só para o painel)
  React.useEffect(() => {
    if (!token || noApp || (window.location.pathname.startsWith('/acompanhar') || window.location.pathname.startsWith('/escola'))) return;
    const buscar = () => apiFetch('/api/mensagens/nao-lidas').then(r => (r.ok ? r.json() : null)).then(j => j && setNaoLidas(j.total)).catch(() => {});
    buscar();
    const t = setInterval(buscar, 30000);
    return () => clearInterval(t);
  }, [token, noApp, activeTab]);

  const handleLogin = (user: User, token: string) => {
    setUser(user);
    setToken(token);
    localStorage.setItem('vancontrol_user', JSON.stringify(user));
    localStorage.setItem('vancontrol_token', token);
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('vancontrol_user', JSON.stringify(updatedUser));
  };

  React.useEffect(() => {
    // Carrega a preferência de tema ao iniciar o App
    const savedTheme = localStorage.getItem('vancontrol_theme');
    const htmlEl = document.documentElement;
    if (savedTheme === 'dark' || (!savedTheme && htmlEl.classList.contains('dark'))) {
      htmlEl.classList.add('dark');
      localStorage.setItem('vancontrol_theme', 'dark');
    } else {
      htmlEl.classList.remove('dark');
      localStorage.setItem('vancontrol_theme', 'light');
    }
  }, []);

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('vancontrol_user');
    localStorage.removeItem('vancontrol_token');
  };

  // Sessão expirada/inválida: qualquer resposta 401 da API desloga o usuário
  React.useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, handleLogout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleLogout);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'alunos':
        return <Alunos />;
      case 'financeiro':
        return <Financeiro />;
      case 'manutencao':
        return <Manutencao />;
      case 'frota':
        return <Frota />;
      case 'motoristas':
        return <Motoristas />;
      case 'responsaveis':
        return <Responsaveis />;
      case 'rotas':
        return <Rotas />;
      case 'escolas':
        return <Escolas />;
      case 'operacao':
        return <Operacao />;
      case 'mensagens':
        return <Mensagens />;
      case 'checklist':
        return <ChecklistEficiencia onNavigate={setActiveTab} />;
      case 'abastecimento':
        return <Abastecimento />;
      case 'documentos':
        return <Documentos />;
      case 'equipe':
        return <Equipe />;
      case 'lgpd':
        return <Privacidade />;
      case 'relatorios':
        return <Relatorios />;
      case 'plano':
        return <MeuPlano />;
      default:
        return (
          <div className="p-8 flex flex-col items-center justify-center h-[calc(100vh-64px)] text-center">
            <div className="bg-slate-100 dark:bg-slate-800 p-8 rounded-full mb-6">
              <span className="material-symbols-outlined text-6xl text-slate-400">construction</span>
            </div>
            <h2 className="text-2xl font-black mb-2">Página em Construção</h2>
            <p className="text-slate-500 max-w-md">Estamos trabalhando para trazer esta funcionalidade o mais rápido possível para você.</p>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="mt-8 px-6 py-2.5 bg-primary text-white font-bold rounded-lg shadow-lg shadow-primary/20"
            >
              Voltar ao Início
            </button>
          </div>
        );
    }
  };

  const getHeaderTitle = () => {
    const titles: Record<string, string> = {
      dashboard: 'Dashboard',
      frota: 'Gestão de Frota',
      motoristas: 'Motoristas',
      alunos: 'Alunos',
      responsaveis: 'Responsáveis',
      financeiro: 'Financeiro',
      rotas: 'Rotas',
      manutencao: 'Manutenção',
      escolas: 'Escolas',
      checklist: 'Checklist e Eficiência',
      abastecimento: 'Histórico de Abastecimento',
      operacao: 'Operação do dia',
      mensagens: 'Mensagens',
      documentos: 'Documentos',
      equipe: 'Equipe e acessos',
      lgpd: 'Privacidade (LGPD)',
      relatorios: 'Relatórios',
      plano: 'Meu plano'
    };
    return titles[activeTab] || 'VanControl';
  };

  // Portal da escola: acesso por link, sem login
  if (window.location.pathname.startsWith('/escola')) {
    return <EscolaPortal />;
  }

  // Portal dos pais: acesso por link, sem login
  if (window.location.pathname.startsWith('/acompanhar')) {
    return <Portal />;
  }

  if (!user || !token) {
    return <Login onLogin={handleLogin} />;
  }

  // Motorista e monitor: app próprio, sem acesso ao painel
  if (noApp) {
    return <MotoristaApp usuario={user} onSair={handleLogout} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 print:h-auto print:overflow-visible print:bg-white print:text-black">
      <div className="print:hidden shrink-0">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} naoLidas={naoLidas} papel={papel} usuario={user} onSair={handleLogout} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible">
        <div className="print:hidden">
          <Header
            title={getHeaderTitle()}
            user={user}
            onLogout={handleLogout}
            onOpenConfig={() => setIsConfigOpen(true)}
          />
        </div>

        {podeVer(papel, 'operacao') && <AlertaEmergencia onVer={() => setActiveTab('operacao')} />}
        <main className="flex-1 overflow-y-auto custom-scrollbar print:overflow-visible print:p-0">
          {renderContent()}
        </main>
      </div>

      {user && (
        <ConfiguracoesModal 
          isOpen={isConfigOpen} 
          onClose={() => setIsConfigOpen(false)} 
          user={user} 
          onUpdateUser={handleUpdateUser}
        />
      )}
    </div>
  );
};

export default App;
