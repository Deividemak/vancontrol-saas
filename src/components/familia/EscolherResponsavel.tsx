// Escolha do responsável no cadastro do aluno: busca entre os cadastrados, "+ Novo responsável"
// (criado junto com o aluno) e, por último, só um telefone avulso.
import React, { useMemo, useState } from 'react';
import { Botao, Campo, inputCls } from '../ui';

export interface RespResumo { id: number; nome: string; telefone?: string | null; cpf?: string | null }
export interface RespNovo { nome: string; telefone: string; cpf: string; email: string }
export type ModoResp = 'cadastrado' | 'novo' | 'avulso';

export const respNovoVazio = (): RespNovo => ({ nome: '', telefone: '', cpf: '', email: '' });

const soDigitos = (v?: string | null) => String(v || '').replace(/\D/g, '');
// telefone sem o 55 do Brasil, para comparar "(61) 99999-0000" com "5561999990000"
const telefoneBase = (v?: string | null) => { const d = soDigitos(v); return d.length >= 12 && d.startsWith('55') ? d.slice(2) : d; };

/** Responsável já cadastrado com o mesmo telefone ou CPF (para não duplicar). */
export function responsavelRepetido(lista: RespResumo[], novo: RespNovo): { resp: RespResumo; campo: 'telefone' | 'CPF' } | null {
  const tel = telefoneBase(novo.telefone), cpf = soDigitos(novo.cpf);
  const t = tel.length >= 10 && lista.find(r => telefoneBase(r.telefone) === tel);
  if (t) return { resp: t, campo: 'telefone' };
  const c = cpf.length === 11 && lista.find(r => soDigitos(r.cpf) === cpf);
  if (c) return { resp: c, campo: 'CPF' };
  return null;
}

export const EscolherResponsavel: React.FC<{
  lista: RespResumo[];
  modo: ModoResp;
  onModo: (m: ModoResp) => void;
  responsavelId: string;
  onResponsavel: (id: string) => void;
  novo: RespNovo;
  onNovo: (n: RespNovo) => void;
  telefoneAvulso: string;
  onTelefoneAvulso: (t: string) => void;
}> = ({ lista, modo, onModo, responsavelId, onResponsavel, novo, onNovo, telefoneAvulso, onTelefoneAvulso }) => {
  const [busca, setBusca] = useState('');
  const escolhido = lista.find(r => String(r.id) === responsavelId);

  const achados = useMemo(() => {
    const t = busca.trim().toLowerCase(), d = soDigitos(busca);
    if (!t) return lista.slice(0, 6);
    return lista.filter(r =>
      r.nome.toLowerCase().includes(t) ||
      (d.length >= 3 && (soDigitos(r.telefone).includes(d) || soDigitos(r.cpf).includes(d)))).slice(0, 8);
  }, [busca, lista]);

  const repetido = modo === 'novo' ? responsavelRepetido(lista, novo) : null;
  const usar = (id: number) => { onResponsavel(String(id)); onModo('cadastrado'); setBusca(''); };

  if (modo === 'novo') {
    const campo = (k: keyof RespNovo) => ({ value: novo[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => onNovo({ ...novo, [k]: e.target.value }) });
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black flex items-center gap-1"><span className="material-symbols-outlined text-[18px]">person_add</span>Novo responsável</p>
          <button type="button" className="text-xs font-bold text-slate-500 hover:text-primary" onClick={() => onModo('cadastrado')}>Buscar um cadastrado</button>
        </div>
        <p className="text-xs text-slate-500">Ele é cadastrado junto com o aluno, ao salvar.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Nome"><input className={inputCls} {...campo('nome')} placeholder="Nome completo" aria-label="Nome do responsável" /></Campo>
          <Campo label="Telefone (WhatsApp)"><input className={inputCls} {...campo('telefone')} placeholder="(00) 00000-0000" inputMode="tel" aria-label="Telefone do responsável" /></Campo>
          <Campo label="CPF (opcional)"><input className={inputCls} {...campo('cpf')} placeholder="000.000.000-00" inputMode="numeric" aria-label="CPF do responsável" /></Campo>
          <Campo label="E-mail (opcional)"><input type="email" className={inputCls} {...campo('email')} placeholder="email@exemplo.com" aria-label="E-mail do responsável" /></Campo>
        </div>
        {repetido && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-500/10 px-3 py-2">
            <p className="text-sm font-bold text-amber-700 flex-1">Esse {repetido.campo} já é de {repetido.resp.nome}. Usar esse responsável?</p>
            <Botao type="button" icone="how_to_reg" onClick={() => usar(repetido.resp.id)}>Usar {repetido.resp.nome.split(' ')[0]}</Botao>
          </div>
        )}
      </div>
    );
  }

  if (modo === 'avulso') {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black">Sem responsável cadastrado — só um telefone</p>
          <button type="button" className="text-xs font-bold text-slate-500 hover:text-primary" onClick={() => onModo('cadastrado')}>Escolher responsável</button>
        </div>
        <p className="text-xs text-slate-500">Sem responsável cadastrado, a família não recebe avisos da van nem acessa o portal.</p>
        <input className={inputCls} value={telefoneAvulso} onChange={e => onTelefoneAvulso(e.target.value)} placeholder="(00) 00000-0000" inputMode="tel" aria-label="Telefone avulso" />
      </div>
    );
  }

  // cadastrado
  if (escolhido) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
        <span className="material-symbols-outlined text-primary">family_restroom</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate">{escolhido.nome}</p>
          <p className="text-xs text-slate-500">{escolhido.telefone || 'Sem telefone'}{escolhido.cpf ? ` · CPF ${escolhido.cpf}` : ''}</p>
        </div>
        <Botao type="button" variante="secundario" icone="swap_horiz" onClick={() => onResponsavel('')}>Trocar</Botao>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
        <input className={`${inputCls} pl-10`} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, telefone ou CPF" aria-label="Buscar responsável" />
      </div>
      {achados.length > 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
          {achados.map(r => (
            <button key={r.id} type="button" onClick={() => usar(r.id)} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <p className="text-sm font-bold">{r.nome}</p>
              <p className="text-xs text-slate-500">{r.telefone || 'Sem telefone'}{r.cpf ? ` · CPF ${r.cpf}` : ''}</p>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 px-1">{lista.length ? 'Nenhum responsável encontrado.' : 'Nenhum responsável cadastrado ainda.'}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
        <Botao type="button" variante="secundario" icone="person_add" onClick={() => onModo('novo')}>Novo responsável</Botao>
        <button type="button" className="text-xs font-bold text-slate-500 hover:text-primary" onClick={() => onModo('avulso')}>
          Sem responsável cadastrado — usar só um telefone
        </button>
      </div>
    </div>
  );
};
