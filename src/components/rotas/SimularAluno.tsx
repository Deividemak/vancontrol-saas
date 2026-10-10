// Simulação "e se": quanto cada rota aumenta se um aluno novo entrar (antes de aceitar a matrícula)
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { buscarCep, geocodificar, enderecoVazio } from '../../services/geo';
import { Botao, Campo, Modal, Selo, inputCls, erroDaResposta } from '../ui';
import { Mapa } from '../mapa/Mapa';

interface Resultado {
  rota_id: number; rota_nome: string; tipo: 'ida' | 'volta'; periodo: string; placa: string | null; escola_nova: boolean;
  acrescimo_min: number; acrescimo_km: number; horario_previsto: string | null; tempo_van_min: number | null;
  depois_de: string | null; antes_de: string | null; lugares: number | null; viavel: boolean;
  antes: { duracao_min: number; distancia_km: number; hora_fim: string | null; bordo_max_min: number; alunos: number };
  depois: { duracao_min: number; distancia_km: number; hora_fim: string | null; bordo_max_min: number; alunos: number };
  alertas_novos: { nivel: string; msg: string }[];
}
interface Simulacao { turno: string; escola: string; rotas: Resultado[]; preco: { valor_sugerido: number; km: number | null; itens: { descricao: string; valor: number }[] } }

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const SimularAluno: React.FC<{ aberto: boolean; onFechar: () => void }> = ({ aberto, onFechar }) => {
  const [escolas, setEscolas] = useState<{ id: number; nome: string }[]>([]);
  const [escola, setEscola] = useState('');
  const [turno, setTurno] = useState('Manhã');
  const [cep, setCep] = useState('');
  const [numero, setNumero] = useState('');
  const [local, setLocal] = useState<{ lat: number; lng: number } | null>(null);
  const [res, setRes] = useState<Simulacao | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setRes(null); setErro('');
    apiFetch('/api/escolas').then(r => r.json()).then(setEscolas).catch(() => {});
  }, [aberto]);

  const localizar = async () => {
    setErro('');
    try {
      const c = await buscarCep(cep);
      const g = await geocodificar({ ...enderecoVazio(), ...c, numero });
      setLocal({ lat: g.lat, lng: g.lng });
    } catch (e: any) {
      setErro(`${e.message}. Marque o local clicando no mapa.`);
    }
  };
  const simular = async () => {
    setErro(''); setOcupado(true);
    const r = await apiFetch('/api/rotas/simular', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...local, escola_id: escola, turno }) });
    setOcupado(false);
    if (!r.ok) return setErro(await erroDaResposta(r, 'Erro ao simular'));
    setRes(await r.json());
    // leva a tela até o resultado (fica embaixo do mapa)
    setTimeout(() => document.getElementById('resultado-simulacao')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  return (
    <Modal titulo="Simular aluno novo" aberto={aberto} onFechar={onFechar} tamanho="xl"
      rodape={<><Botao variante="secundario" onClick={onFechar}>Fechar</Botao><Botao icone="calculate" onClick={simular} carregando={ocupado} disabled={!local || !escola}>Simular</Botao></>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Veja quanto cada rota do turno aumenta com o aluno novo e qual preço cobrar, antes de aceitar a matrícula. Nada é gravado.</p>
        <div className="grid md:grid-cols-4 gap-3">
          <Campo label="Escola" className="md:col-span-2">
            <select className={inputCls} value={escola} onChange={e => setEscola(e.target.value)} aria-label="Escola do aluno novo">
              <option value="">Escolha...</option>
              {escolas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Turno">
            <select className={inputCls} value={turno} onChange={e => setTurno(e.target.value)} aria-label="Turno do aluno novo">
              {['Manhã', 'Tarde', 'Integral', 'Noite'].map(t => <option key={t}>{t}</option>)}
            </select>
          </Campo>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Campo label="CEP"><input className={inputCls} value={cep} onChange={e => setCep(e.target.value)} placeholder="00000-000" aria-label="CEP do aluno novo" /></Campo>
          <Campo label="Número"><input className={inputCls} value={numero} onChange={e => setNumero(e.target.value)} aria-label="Número" /></Campo>
          <Botao variante="secundario" icone="search" onClick={localizar} disabled={cep.replace(/\D/g, '').length !== 8}>Localizar</Botao>
          <span className="text-xs text-slate-500">ou clique no mapa {local ? <Selo cor="verde">local marcado</Selo> : null}</span>
        </div>
        <Mapa className="h-56" chaveEnquadramento={aberto ? 'simular' : 'fechado'}
          marcadores={local ? [{ id: 'novo', lat: local.lat, lng: local.lng, tipo: 'aluno', titulo: 'Aluno novo', arrastavel: true }] : []}
          onClique={(lat, lng) => setLocal({ lat: +lat.toFixed(7), lng: +lng.toFixed(7) })}
          onArrastar={(_, lat, lng) => setLocal({ lat: +lat.toFixed(7), lng: +lng.toFixed(7) })} />
        {erro && <p className="text-sm text-rose-600 font-bold">{erro}</p>}

        {res && (
          <div id="resultado-simulacao" className="space-y-3">
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-sm">
              <b>Preço sugerido: {BRL(res.preco.valor_sugerido)}/mês</b>
              {res.preco.km !== null && <span className="text-slate-500"> · {res.preco.km} km até a escola</span>}
              <span className="text-slate-500"> ({res.preco.itens.map(i => `${i.descricao}: ${BRL(i.valor)}`).join(' · ')})</span>
            </div>
            {res.rotas.length === 0 && <p className="text-sm text-slate-500">Nenhuma rota ativa no turno {res.turno}. Crie uma rota nova para este aluno.</p>}
            {res.rotas.map((r, i) => (
              <div key={r.rota_id} className={`rounded-xl border p-3 text-sm space-y-1 ${r.viavel ? 'border-slate-200 dark:border-slate-800' : 'border-rose-300 bg-rose-500/5'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black flex-1">{r.rota_nome} <span className="text-slate-500 font-medium">· {r.tipo === 'ida' ? 'Ida' : 'Volta'}{r.placa ? ` · ${r.placa}` : ''}</span></p>
                  {i === 0 && r.viavel && <Selo cor="verde" icone="star">Melhor opção</Selo>}
                  {!r.viavel && <Selo cor="vermelho">Não cabe sem ajustes</Selo>}
                  {r.escola_nova && <Selo cor="amarelo">Escola nova na rota</Selo>}
                </div>
                <p><b>+{r.acrescimo_min} min</b> e <b>+{r.acrescimo_km.toLocaleString('pt-BR')} km</b> por viagem (≈ {Math.round(r.acrescimo_km * 21)} km/mês) · fim às {r.antes.hora_fim || '--'} → <b>{r.depois.hora_fim || '--'}</b></p>
                <p className="text-slate-500">
                  {r.tipo === 'ida' ? 'Embarque' : 'Entrega'} previsto às {r.horario_previsto || '--'}{r.tempo_van_min !== null && ` · ${r.tempo_van_min} min na van`}
                  {(r.depois_de || r.antes_de) && ` · entra ${r.depois_de ? `depois de ${r.depois_de}` : ''}${r.depois_de && r.antes_de ? ' e ' : ''}${r.antes_de ? `antes de ${r.antes_de}` : ''}`}
                  {` · ${r.depois.alunos}${r.lugares ? `/${r.lugares}` : ''} alunos`}
                </p>
                {r.alertas_novos.map(a => <p key={a.msg} className={a.nivel === 'erro' ? 'text-rose-600 font-bold' : 'text-amber-700'}>⚠ {a.msg}</p>)}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
