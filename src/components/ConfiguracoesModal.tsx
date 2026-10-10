import React, { useState, useEffect } from 'react';

import { apiFetch } from '../services/api';
interface User {
  id: number;
  nome: string;
  email: string;
}

interface ConfiguracoesModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onUpdateUser: (user: User) => void;
}

export const ConfiguracoesModal: React.FC<ConfiguracoesModalProps> = ({ isOpen, onClose, user, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'perfil' | 'seguranca' | 'aparencia'>('perfil');
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Perfil State
  const [nome, setNome] = useState(user.nome);
  const [email, setEmail] = useState(user.email);
  const [perfilLoading, setPerfilLoading] = useState(false);
  const [perfilMsg, setPerfilMsg] = useState({ type: '', text: '' });

  // Security State
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [senhaLoading, setSenhaLoading] = useState(false);
  const [senhaMsg, setSenhaMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    // Check initial dark mode from DOM
    const htmlEl = document.documentElement;
    setIsDarkMode(htmlEl.classList.contains('dark'));
  }, [isOpen]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setPerfilLoading(true);
    setPerfilMsg({ type: '', text: '' });

    try {
      const response = await apiFetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ nome, email })
      });

      const data = await response.json();

      if (response.ok) {
        setPerfilMsg({ type: 'success', text: 'Perfil atualizado com sucesso!' });
        onUpdateUser({ ...user, nome, email });
      } else {
        setPerfilMsg({ type: 'error', text: data.error || 'Erro ao atualizar perfil' });
      }
    } catch (error) {
      setPerfilMsg({ type: 'error', text: 'Falha na comunicação com o servidor' });
    } finally {
      setPerfilLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSenhaLoading(true);
    setSenhaMsg({ type: '', text: '' });

    try {
      const response = await apiFetch('/api/auth/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ senhaAtual, novaSenha })
      });

      const data = await response.json();

      if (response.ok) {
        setSenhaMsg({ type: 'success', text: 'Senha alterada com sucesso!' });
        setSenhaAtual('');
        setNovaSenha('');
      } else {
        setSenhaMsg({ type: 'error', text: data.error || 'Senha atual incorreta.' });
      }
    } catch (error) {
      setSenhaMsg({ type: 'error', text: 'Falha na comunicação com o servidor' });
    } finally {
      setSenhaLoading(false);
    }
  };

  const toggleDarkMode = () => {
    const htmlEl = document.documentElement;
    if (isDarkMode) {
      htmlEl.classList.remove('dark');
      localStorage.setItem('vancontrol_theme', 'light');
      setIsDarkMode(false);
    } else {
      htmlEl.classList.add('dark');
      localStorage.setItem('vancontrol_theme', 'dark');
      setIsDarkMode(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl flex overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        
        {/* Sidebar Tabs */}
        <div className="w-64 bg-slate-50 dark:bg-slate-800/50 border-r border-slate-200 dark:border-slate-800 p-6">
          <h2 className="text-lg font-black text-slate-900 dark:text-white mb-6">Configurações</h2>
          
          <div className="space-y-2">
            <button 
              onClick={() => setActiveTab('perfil')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${activeTab === 'perfil' ? 'bg-primary text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
            >
              <span className="material-symbols-outlined text-xl">person</span>
              Meu Perfil
            </button>
            <button 
              onClick={() => setActiveTab('seguranca')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${activeTab === 'seguranca' ? 'bg-primary text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
            >
              <span className="material-symbols-outlined text-xl">lock</span>
              Segurança
            </button>
            <button 
              onClick={() => setActiveTab('aparencia')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${activeTab === 'aparencia' ? 'bg-primary text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
            >
              <span className="material-symbols-outlined text-xl">palette</span>
              Aparência
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-8 relative">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>

          {activeTab === 'perfil' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Informações do Perfil</h3>
              <p className="text-sm text-slate-500 mb-8">Atualize seu nome de exibição e e-mail de acesso.</p>
              
              <form onSubmit={handleUpdateProfile} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Nome Completo</label>
                  <input 
                    type="text" 
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                    className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">E-mail</label>
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary outline-none transition-all"
                  />
                </div>

                {perfilMsg.text && (
                  <div className={`p-4 rounded-xl flex items-center gap-3 ${perfilMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                    <span className="material-symbols-outlined">
                      {perfilMsg.type === 'success' ? 'check_circle' : 'error'}
                    </span>
                    <span className="font-bold text-sm">{perfilMsg.text}</span>
                  </div>
                )}

                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={perfilLoading} className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold shadow-lg shadow-primary/30 transition-all flex items-center gap-2 disabled:opacity-50">
                    {perfilLoading ? <span className="animate-spin material-symbols-outlined text-sm">refresh</span> : 'Salvar Alterações'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'seguranca' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Segurança da Conta</h3>
              <p className="text-sm text-slate-500 mb-8">Altere sua senha de acesso periodicamente ou caso possua suspeitas de acesso.</p>
              
              <form onSubmit={handleUpdatePassword} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Senha Atual</label>
                  <input 
                    type="password" 
                    value={senhaAtual}
                    onChange={(e) => setSenhaAtual(e.target.value)}
                    required
                    className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Nova Senha</label>
                  <input 
                    type="password" 
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary outline-none transition-all"
                  />
                  <p className="text-xs text-slate-500 mt-2">Mínimo de 6 caracteres.</p>
                </div>

                {senhaMsg.text && (
                  <div className={`p-4 rounded-xl flex items-center gap-3 ${senhaMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                    <span className="material-symbols-outlined">
                      {senhaMsg.type === 'success' ? 'check_circle' : 'error'}
                    </span>
                    <span className="font-bold text-sm">{senhaMsg.text}</span>
                  </div>
                )}

                <div className="pt-4 flex justify-end gap-3">
                  <button type="submit" disabled={senhaLoading} className="px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-all flex items-center gap-2 disabled:opacity-50">
                    {senhaLoading ? <span className="animate-spin material-symbols-outlined text-sm">refresh</span> : 'Atualizar Senha'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'aparencia' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Aparência do Sistema</h3>
              <p className="text-sm text-slate-500 mb-8">Personalize como o VanControl é exibido no seu dispositivo.</p>
              
              <div className="flex items-center justify-between p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-slate-800 text-amber-400' : 'bg-amber-100 text-amber-500'}`}>
                    <span className="material-symbols-outlined text-2xl">{isDarkMode ? 'dark_mode' : 'light_mode'}</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-lg">Modo Escuro</h4>
                    <p className="text-sm text-slate-500">Alternar tema claro e escuro</p>
                  </div>
                </div>
                
                <button 
                  onClick={toggleDarkMode}
                  className={`w-14 h-8 rounded-full flex items-center transition-colors px-1 ${isDarkMode ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <div className={`w-6 h-6 bg-white rounded-full transition-transform shadow-md ${isDarkMode ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
