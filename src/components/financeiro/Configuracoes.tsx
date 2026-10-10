// Aba Configurações: empresa, Pix e cobrança, régua, preços e modelo de contrato
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Campo, Selo, inputCls, textareaCls, erroDaResposta } from '../ui';
import { buscarJson, ErroCarga } from './util';

type Obj = Record<string, any>;
interface Config { empresa: Obj; precos: Obj; cobranca: Obj; contrato: Obj; asaas: { chave_configurada: boolean; webhook_token_configurado: boolean; webhook_url: string; origem?: string } }

const Secao: React.FC<{ titulo: string; icone: string; children: React.ReactNode; onSalvar: () => void; status?: string }> = ({ titulo, icone, children, onSalvar, status }) => (
  <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
    <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-primary">{icone}</span>
      <h3 className="font-black flex-1">{titulo}</h3>
      {status && <span className={`text-xs font-bold ${status.startsWith('Erro') || status.includes('inválida') ? 'text-rose-600' : 'text-emerald-600'}`}>{status}</span>}
      <Botao className="h-9" onClick={onSalvar}>Salvar</Botao>
    </div>
    {children}
  </section>
);

export const Configuracoes: React.FC = () => {
  const [c, setC] = useState<Config | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [regua, setRegua] = useState('');
  const [erro, setErro] = useState('');
  const [asaasSeg, setAsaasSeg] = useState({ api_key: '', webhook_token: '' });

  useEffect(() => {
    buscarJson<Config>(apiFetch, '/api/financeiro/config').then(j => { setC(j); setRegua((j.cobranca.regua || []).join(', ')); }).catch(e => setErro(e.message));
  }, []);
  if (erro) return <ErroCarga msg={erro} />;
  if (!c) return <p className="text-center text-slate-500 animate-pulse py-8">Carregando...</p>;

  const set = (sec: keyof Config, k: string, v: unknown) => setC(x => x && { ...x, [sec]: { ...(x[sec] as Obj), [k]: v } });
  const salvar = async (sec: 'empresa' | 'precos' | 'cobranca' | 'contrato', corpo?: Obj) => {
    setStatus(s => ({ ...s, [sec]: 'Salvando...' }));
    const r = await apiFetch(`/api/financeiro/config/${sec}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || c[sec]) });
    if (!r.ok) {
      const e = await erroDaResposta(r, 'Erro ao salvar');
      setStatus(s => ({ ...s, [sec]: `Erro: ${e}` }));
      return;
    }
    const novo = await r.json();
    setC(x => x && { ...x, [sec]: novo });
    if (sec === 'cobranca') setRegua((novo.regua || []).join(', '));
    setStatus(s => ({ ...s, [sec]: 'Salvo ✓' }));
  };
  const txt = (sec: keyof Config, k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, dica?: string, cls = '') => (
    <Campo label={label} dica={dica} className={cls}>
      <input className={inputCls} value={(c[sec] as Obj)[k] ?? ''} onChange={e => set(sec, k, props.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} aria-label={label} {...props} />
    </Campo>
  );
  const salvarAsaas = async () => {
    setStatus(s => ({ ...s, asaas: 'Salvando...' }));
    const r = await apiFetch('/api/financeiro/config/asaas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(asaasSeg) });
    if (!r.ok) { const e = await erroDaResposta(r, 'Erro ao salvar'); setStatus(s => ({ ...s, asaas: `Erro: ${e}` })); return; }
    const j = await r.json();
    setC(x => x && { ...x, asaas: { ...x.asaas, ...j } });
    setAsaasSeg({ api_key: '', webhook_token: '' });
    setStatus(s => ({ ...s, asaas: 'Salvo ✓' }));
  };
  const rodarRegua = async () => {
    if (!window.confirm('Rodar a régua agora? Os responsáveis com mensalidade num dos dias da régua recebem a cobrança no WhatsApp (quem já recebeu hoje não recebe de novo).')) return;
    const r = await apiFetch('/api/financeiro/regua/executar', { method: 'POST' });
    const j = await r.json();
    setStatus(s => ({ ...s, cobranca: r.ok ? `${j.enviadas} mensagem(ns) na fila` : 'Erro ao rodar' }));
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <Secao titulo="Empresa (recibos e contratos)" icone="business" onSalvar={() => salvar('empresa')} status={status.empresa}>
        <div className="grid md:grid-cols-3 gap-3">
          {txt('empresa', 'razao_social', 'Razão social / nome', {}, undefined, 'md:col-span-2')}
          {txt('empresa', 'cnpj_cpf', 'CNPJ ou CPF')}
          {txt('empresa', 'endereco', 'Endereço', {}, undefined, 'md:col-span-2')}
          {txt('empresa', 'telefone', 'Telefone')}
          {txt('empresa', 'cidade', 'Cidade')}
          {txt('empresa', 'uf', 'UF', { maxLength: 2 })}
          {txt('empresa', 'email', 'E-mail')}
        </div>
      </Secao>

      <Secao titulo="Pix e cobrança" icone="pix" onSalvar={() => salvar('cobranca', { ...c.cobranca, regua })} status={status.cobranca}>
        <div className="flex flex-wrap gap-2">
          {[['pix_manual', 'Pix direto (sem taxa)', 'O responsável paga no Pix da empresa; você confirma a baixa no painel.'],
            ['asaas', 'Asaas (taxa por pagamento)', 'Boleto, cartão e Pix com baixa automática.']].map(([id, label, dica]) => (
            <button key={id} type="button" onClick={() => set('cobranca', 'provedor', id)} title={dica}
              className={`text-left rounded-lg border p-3 flex-1 min-w-[220px] ${c.cobranca.provedor === id ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-700'}`}>
              <p className="font-bold text-sm">{label}</p><p className="text-xs text-slate-500">{dica}</p>
            </button>
          ))}
        </div>
        {c.cobranca.provedor === 'pix_manual' && (
          <div className="grid md:grid-cols-4 gap-3">
            <Campo label="Tipo da chave">
              <select className={inputCls} value={c.cobranca.pix_tipo} onChange={e => set('cobranca', 'pix_tipo', e.target.value)} aria-label="Tipo da chave">
                <option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="telefone">Telefone</option><option value="email">E-mail</option><option value="aleatoria">Aleatória</option>
              </select>
            </Campo>
            {txt('cobranca', 'pix_chave', 'Chave Pix', {}, undefined, 'md:col-span-3')}
            {txt('cobranca', 'pix_nome', 'Nome do recebedor', { maxLength: 25 }, 'Como aparece no banco (até 25 letras)', 'md:col-span-2')}
            {txt('cobranca', 'pix_cidade', 'Cidade do recebedor', { maxLength: 15 }, undefined, 'md:col-span-2')}
          </div>
        )}
        {c.cobranca.provedor === 'asaas' && (
          <div className="text-sm space-y-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
            <p>Chave da API: {c.asaas.chave_configurada ? <Selo cor="verde">configurada</Selo> : <Selo cor="vermelho">faltando</Selo>}
              {' '}· Token do webhook: {c.asaas.webhook_token_configurado ? <Selo cor="verde">configurado</Selo> : <Selo cor="vermelho">faltando</Selo>}
              {c.asaas.origem === 'env' && <span className="text-xs text-slate-500"> (vindos do .env do servidor)</span>}</p>
            <div className="grid md:grid-cols-2 gap-3">
              <Campo label="Chave da API do Asaas" dica="Asaas → Integrações → Chave da API. Em branco = mantém a atual.">
                <input type="password" autoComplete="new-password" className={inputCls} value={asaasSeg.api_key} onChange={e => setAsaasSeg({ ...asaasSeg, api_key: e.target.value })} placeholder={c.asaas.chave_configurada ? '••••••••' : ''} aria-label="Chave da API do Asaas" />
              </Campo>
              <Campo label="Token do webhook" dica="Você inventa e cola o mesmo no Asaas → Webhooks.">
                <input type="password" autoComplete="new-password" className={inputCls} value={asaasSeg.webhook_token} onChange={e => setAsaasSeg({ ...asaasSeg, webhook_token: e.target.value })} placeholder={c.asaas.webhook_token_configurado ? '••••••••' : ''} aria-label="Token do webhook do Asaas" />
              </Campo>
            </div>
            <div className="flex items-center gap-3">
              <Botao variante="secundario" onClick={salvarAsaas} disabled={!asaasSeg.api_key && !asaasSeg.webhook_token}>Salvar chave e token</Botao>
              {status.asaas && <span className="text-xs font-bold text-slate-500">{status.asaas}</span>}
            </div>
            <Campo label="URL do webhook (cole no Asaas → Integrações → Webhooks)"><input readOnly className={`${inputCls} font-mono text-xs`} value={c.asaas.webhook_url} /></Campo>
            <Campo label="Ambiente">
              <select className={`${inputCls} max-w-[220px]`} value={c.cobranca.asaas_ambiente} onChange={e => set('cobranca', 'asaas_ambiente', e.target.value)}>
                <option value="sandbox">Sandbox (testes)</option><option value="producao">Produção</option>
              </select>
            </Campo>
            <p className="text-xs text-slate-500">O Asaas exige o CPF do responsável (cadastro em Responsáveis).</p>
          </div>
        )}
        <div className="grid md:grid-cols-4 gap-3">
          {txt('cobranca', 'multa_pct', 'Multa (%)', { type: 'number', step: '0.1', min: 0, max: 2 }, 'Máximo 2% (CDC)')}
          {txt('cobranca', 'juros_mes_pct', 'Juros ao mês (%)', { type: 'number', step: '0.1', min: 0, max: 1 }, 'Proporcional por dia')}
          {txt('cobranca', 'dia_vencimento_padrao', 'Vencimento padrão (dia)', { type: 'number', min: 1, max: 31 })}
          {txt('cobranca', 'dias_alerta_inadimplencia', 'Alerta após (dias)', { type: 'number', min: 1 })}
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
          <label className="flex items-center gap-2 font-bold text-sm"><input type="checkbox" checked={!!c.cobranca.regua_ativa} onChange={e => set('cobranca', 'regua_ativa', e.target.checked)} /> Régua de cobrança automática no WhatsApp</label>
          <div className="grid md:grid-cols-3 gap-3">
            <Campo label="Dias em relação ao vencimento" dica="Negativo = antes. Ex.: -3, 0, 1, 5, 10" className="md:col-span-2">
              <input className={inputCls} value={regua} onChange={e => setRegua(e.target.value)} aria-label="Dias da régua" />
            </Campo>
            {txt('cobranca', 'regua_hora', 'Horário de envio', { type: 'number', min: 6, max: 21 }, 'Hora cheia (6 a 21h)')}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-500 flex-1">Irmãos vão numa mensagem só, com o Pix do total em seguida e o link do portal. Cada passo é enviado uma vez só.</p>
            <Botao variante="secundario" className="h-9 text-xs" icone="play_arrow" onClick={rodarRegua}>Rodar agora</Botao>
          </div>
        </div>
      </Secao>

      <Secao titulo="Preço sugerido da mensalidade" icone="calculate" onSalvar={() => salvar('precos')} status={status.precos}>
        <div className="grid md:grid-cols-4 gap-3">
          {['Manhã', 'Tarde', 'Integral', 'Noite'].map(t => (
            <Campo key={t} label={`Base ${t} (R$)`}>
              <input type="number" className={inputCls} value={c.precos.base_por_turno?.[t] ?? ''} aria-label={`Base ${t}`}
                onChange={e => set('precos', 'base_por_turno', { ...c.precos.base_por_turno, [t]: e.target.value === '' ? '' : Number(e.target.value) })} />
            </Campo>
          ))}
          {txt('precos', 'km_incluso', 'Km incluso', { type: 'number', step: '0.5' }, 'Casa → escola sem custo extra')}
          {txt('precos', 'valor_km_extra', 'R$ por km extra', { type: 'number', step: '0.5' })}
          {txt('precos', 'desconto_irmao_pct', 'Desconto irmão (%)', { type: 'number' }, 'A partir do 2º filho')}
          {txt('precos', 'arredondar_para', 'Arredondar para (R$)', { type: 'number' })}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.precos.proporcional_entrada} onChange={e => set('precos', 'proporcional_entrada', e.target.checked)} /> Cobrar proporcional no mês de entrada (pelo "início do contrato" do aluno)</label>
      </Secao>

      <Secao titulo="Modelo de contrato" icone="history_edu" onSalvar={() => salvar('contrato')} status={status.contrato}>
        <div className="grid md:grid-cols-4 gap-3">{txt('contrato', 'vigencia_meses', 'Vigência (meses)', { type: 'number', min: 1, max: 60 })}</div>
        <Campo label="Texto" dica="Campos automáticos: {{responsavel_nome}}, {{responsavel_cpf}}, {{aluno_nome}}, {{escola_nome}}, {{turno}}, {{aluno_endereco}}, {{valor}}, {{valor_extenso}}, {{dia_vencimento}}, {{multa_pct}}, {{juros_mes_pct}}, {{vigencia_inicio}}, {{vigencia_fim}}, {{empresa_razao_social}}, {{empresa_cnpj_cpf}}, {{empresa_endereco}}, {{cidade}}, {{data_hoje}}">
          <textarea className={`${textareaCls} min-h-[360px] font-mono text-xs`} value={c.contrato.modelo} onChange={e => set('contrato', 'modelo', e.target.value)} aria-label="Modelo de contrato" />
        </Campo>
        <p className="text-xs text-slate-500">Sugestão: peça para um advogado revisar o modelo antes de usar com clientes.</p>
      </Secao>
    </div>
  );
};
