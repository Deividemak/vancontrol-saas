// Financeiro: mensalidades, inadimplência, lucro por rota, contratos e configurações
import React, { useState } from 'react';
import { Abas } from './ui';
import { Mensalidades } from './financeiro/Mensalidades';
import { Inadimplencia } from './financeiro/Inadimplencia';
import { LucroRotas } from './financeiro/LucroRotas';
import { Contratos } from './financeiro/Contratos';
import { Configuracoes } from './financeiro/Configuracoes';

const ABAS = [
  { id: 'mensalidades', label: 'Mensalidades', icone: 'receipt_long' },
  { id: 'inadimplencia', label: 'Inadimplência', icone: 'running_with_errors' },
  { id: 'lucro', label: 'Lucro por rota', icone: 'monitoring' },
  { id: 'contratos', label: 'Contratos', icone: 'history_edu' },
  { id: 'config', label: 'Configurações', icone: 'settings' },
];

export const Financeiro: React.FC = () => {
  const [aba, setAba] = useState('mensalidades');
  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-black tracking-tight">Controle Financeiro</h2>
        <p className="text-slate-500 dark:text-slate-400">Mensalidades, cobrança por Pix e WhatsApp, inadimplência, contratos e lucro de cada rota</p>
      </div>
      <Abas abas={ABAS} ativa={aba} onTrocar={setAba} />
      {aba === 'mensalidades' && <Mensalidades />}
      {aba === 'inadimplencia' && <Inadimplencia />}
      {aba === 'lucro' && <LucroRotas />}
      {aba === 'contratos' && <Contratos />}
      {aba === 'config' && <Configuracoes />}
    </div>
  );
};
