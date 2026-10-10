// Modais de cobrança (Pix/WhatsApp) e de baixa de pagamento
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Modal, Botao, Campo, inputCls, erroDaResposta } from '../ui';
import { QrCode } from './QrCode';
import { BRL, dataBR, competencia } from './util';

export interface Cobranca {
  mensalidade_id: number; aluno_nome: string; vencimento: string; competencia: string; status: string;
  valor: number; multa: number; juros: number; dias_atraso: number; valor_original: number; provedor: 'pix_manual' | 'asaas';
  pix_copia_cola: string | null; pix_qr_base64: string | null; link_fatura: string | null; link_boleto: string | null;
}

/** Bloco de pagamento: QR + copia e cola (+ links do Asaas). Usado no painel e no portal. */
export const BlocoPix: React.FC<{ c: Cobranca }> = ({ c }) => {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(c.pix_copia_cola || ''); } catch { /* sem permissão: o campo fica selecionável */ }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };
  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">{c.aluno_nome} · {c.competencia}</p>
        <p className="text-3xl font-black mt-1">{BRL(c.valor)}</p>
        {c.dias_atraso > 0 && (
          <p className="text-xs text-rose-600 font-bold mt-1">
            Vencida em {dataBR(c.vencimento)} ({c.dias_atraso} dia{c.dias_atraso > 1 ? 's' : ''}): {BRL(c.valor_original)} + multa {BRL(c.multa)} + juros {BRL(c.juros)}
          </p>
        )}
        {c.dias_atraso === 0 && <p className="text-xs text-slate-500 mt-1">Vence em {dataBR(c.vencimento)}</p>}
      </div>
      {c.pix_copia_cola ? (
        <>
          <div className="flex justify-center">
            {c.pix_qr_base64
              ? <img src={`data:image/png;base64,${c.pix_qr_base64}`} alt="QR Code Pix" className="size-56 rounded-lg border border-slate-200" />
              : <QrCode texto={c.pix_copia_cola} className="rounded-lg border border-slate-200" />}
          </div>
          <Campo label="Pix copia e cola">
            <div className="flex gap-2">
              <input readOnly value={c.pix_copia_cola} onFocus={e => e.currentTarget.select()} className={`${inputCls} font-mono text-xs`} aria-label="Pix copia e cola" />
              <Botao type="button" icone={copiado ? 'check' : 'content_copy'} onClick={copiar}>{copiado ? 'Copiado' : 'Copiar'}</Botao>
            </div>
          </Campo>
        </>
      ) : (
        <p className="text-sm text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">Pix indisponível: cadastre a chave Pix em Financeiro → Configurações.</p>
      )}
      {(c.link_fatura || c.link_boleto) && (
        <div className="flex flex-wrap gap-2 justify-center">
          {c.link_fatura && <a href={c.link_fatura} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary underline">Fatura (cartão/boleto/Pix)</a>}
          {c.link_boleto && <a href={c.link_boleto} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary underline">Boleto em PDF</a>}
        </div>
      )}
    </div>
  );
};

export const CobrancaModal: React.FC<{ mensalidadeId: number | null; onFechar: () => void }> = ({ mensalidadeId, onFechar }) => {
  const [c, setC] = useState<Cobranca | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    setC(null); setErro(''); setEnviado(false);
    if (!mensalidadeId) return;
    apiFetch(`/api/financeiro/mensalidades/${mensalidadeId}/cobranca`)
      .then(async r => (r.ok ? setC(await r.json()) : setErro(await erroDaResposta(r, 'Erro ao gerar a cobrança'))))
      .catch(() => setErro('Erro de comunicação com o servidor.'));
  }, [mensalidadeId]);

  const enviar = async () => {
    setEnviando(true);
    const r = await apiFetch(`/api/financeiro/mensalidades/${mensalidadeId}/cobrar`, { method: 'POST' });
    setEnviando(false);
    if (r.ok) setEnviado(true);
    else setErro(await erroDaResposta(r, 'Erro ao enviar'));
  };

  return (
    <Modal titulo="Cobrar mensalidade" aberto={!!mensalidadeId} onFechar={onFechar} tamanho="md"
      rodape={<>
        <Botao variante="secundario" onClick={onFechar}>Fechar</Botao>
        <Botao icone={enviado ? 'check' : 'send'} onClick={enviar} carregando={enviando} disabled={!c || enviado}>{enviado ? 'Enviado' : 'Enviar no WhatsApp'}</Botao>
      </>}>
      {erro && <p className="text-sm text-rose-600 font-bold mb-3">{erro}</p>}
      {!c && !erro && <p className="text-center text-slate-500 animate-pulse">Gerando cobrança...</p>}
      {c && <BlocoPix c={c} />}
      {enviado && <p className="text-sm text-emerald-600 font-bold text-center mt-4">Cobrança enviada no WhatsApp do responsável (com o Pix e o link do portal).</p>}
    </Modal>
  );
};

const FORMAS = [
  { id: 'pix', label: 'Pix' }, { id: 'dinheiro', label: 'Dinheiro' }, { id: 'transferencia', label: 'Transferência' },
  { id: 'cartao', label: 'Cartão' }, { id: 'boleto', label: 'Boleto' }, { id: 'outro', label: 'Outro' },
];

export interface MensalidadeBasica { id: number; aluno: string; valor: number; data_vencimento: string; status: string }

export const PagamentoModal: React.FC<{ m: MensalidadeBasica | null; onFechar: () => void; onSalvo: (recibo: number) => void }> = ({ m, onFechar, onSalvo }) => {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const [forma, setForma] = useState('pix');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hoje);
  const [obs, setObs] = useState('');
  const [avisar, setAvisar] = useState(true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!m) return;
    setForma('pix'); setData(hoje); setObs(''); setErro(''); setAvisar(true);
    setValor(String(m.valor));
    // se estiver vencida, sugere o valor com multa e juros
    if (m.status === 'Atrasado') {
      apiFetch(`/api/financeiro/mensalidades/${m.id}/cobranca`).then(r => r.ok && r.json()).then(c => c && setValor(String(c.valor))).catch(() => {});
    }
  }, [m]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async () => {
    setSalvando(true); setErro('');
    const r = await apiFetch(`/api/financeiro/mensalidades/${m!.id}/pagamento`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forma, valor: Number(String(valor).replace(',', '.')), data, observacao: obs, avisar }),
    });
    setSalvando(false);
    if (!r.ok) return setErro(await erroDaResposta(r, 'Erro ao registrar pagamento'));
    const j = await r.json();
    onSalvo(j.recibo_numero);
  };

  return (
    <Modal titulo="Registrar pagamento" aberto={!!m} onFechar={onFechar} tamanho="md"
      rodape={<>
        <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao icone="price_check" onClick={salvar} carregando={salvando}>Confirmar recebimento</Botao>
      </>}>
      {m && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500"><b className="text-slate-800 dark:text-slate-100">{m.aluno}</b> · {competencia(m.data_vencimento)} · vence {dataBR(m.data_vencimento)} · {BRL(m.valor)}</p>
          <Campo label="Forma de pagamento">
            <div className="flex flex-wrap gap-2">
              {FORMAS.map(f => (
                <button key={f.id} type="button" onClick={() => setForma(f.id)}
                  className={`px-3 h-9 rounded-lg text-sm font-bold border ${forma === f.id ? 'bg-primary text-white border-primary' : 'border-slate-200 dark:border-slate-700'}`}>{f.label}</button>
              ))}
            </div>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Valor recebido (R$)"><input className={inputCls} inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} aria-label="Valor recebido" /></Campo>
            <Campo label="Data"><input type="date" className={inputCls} max={hoje} value={data} onChange={e => setData(e.target.value)} aria-label="Data do pagamento" /></Campo>
          </div>
          <Campo label="Observação"><input className={inputCls} value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" /></Campo>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={avisar} onChange={e => setAvisar(e.target.checked)} /> Enviar confirmação com recibo no WhatsApp
          </label>
          {erro && <p className="text-sm text-rose-600 font-bold">{erro}</p>}
        </div>
      )}
    </Modal>
  );
};
