import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { Alunos } from './components/Alunos';
import { Financeiro } from './components/Financeiro';
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

interface User {
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
      case 'checklist':
        return <ChecklistEficiencia onNavigate={setActiveTab} />;
      case 'abastecimento':
        return <Abastecimento />;
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
      abastecimento: 'Histórico de Abastecimento'
    };
    return titles[activeTab] || 'VanControl';
  };

  if (!user || !token) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 print:h-auto print:overflow-visible print:bg-white print:text-black">
      <div className="print:hidden shrink-0">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
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
