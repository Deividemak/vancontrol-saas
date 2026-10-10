// Modal para criar/alterar/remover o acesso do motorista ao app
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Campo, Modal, inputCls, erroDaResposta } from '../ui';

export const AcessoMotorista: React.FC<{ motorista: { id: number; nome: string } | null; emailAtual: string | null; onFechar: () => void; onMudou: () => void }> = ({ motorista, emailAtual, onFechar, onMudou }) => {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setEmail(emailAtual || ''); setSenha(''); setErro(''); }, [motorista, emailAtual]);

  const salvar = async () => {
    if (!motorista) return;
    setSalvando(true);
    setErro('');
    const res = await apiFetch(`/api/motoristas-acesso/${motorista.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });
    setSalvando(false);
    if (!res.ok) { setErro(await erroDaResposta(res, 'Erro ao salvar')); return; }
    onMudou();
    onFechar();
  };
  const remover = async () => {
    if (!motorista || !confirm(`Remover o acesso de ${motorista.nome} ao app?`)) return;
    await apiFetch(`/api/motoristas-acesso/${motorista.id}`, { method: 'DELETE' });
    onMudou();
    onFechar();
  };

  return (
    <Modal aberto={!!motorista} onFechar={onFechar} titulo={`Acesso ao app — ${motorista?.nome || ''}`} tamanho="md"
      rodape={<>
        {erro && <p className="text-sm text-rose-500 font-bold mr-auto self-center">{erro}</p>}
        {emailAtual && <Botao variante="perigo" icone="person_off" onClick={remover}>Remover acesso</Botao>}
        <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao onClick={salvar} carregando={salvando}>Salvar</Botao>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          O motorista entra no mesmo endereço do sistema, pelo celular, com este e-mail e senha. Ele só vê as rotas dele: lista do dia, check-in dos alunos, ocorrências e emergência.
        </p>
        <Campo label="E-mail de login">
          <input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="motorista@email.com" />
        </Campo>
        <Campo label={emailAtual ? 'Nova senha (deixe vazio para manter)' : 'Senha'} dica="Mínimo de 8 caracteres. Ele pode trocar depois pelo app.">
          <input type="text" className={inputCls} value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" />
        </Campo>
      </div>
    </Modal>
  );
};
