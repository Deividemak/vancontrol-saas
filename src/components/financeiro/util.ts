import React from 'react';
// Utilidades do financeiro (painel e portal dos pais)
export const BRL = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dataBR = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
export const competencia = (iso?: string | null) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const mesAtual = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7);

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export interface Recibo {
  numero: number; valor: number; valor_extenso: string; forma: string; pagamento: string; vencimento: string; competencia: string; referente: string;
  pagador: { nome: string; cpf: string | null };
  empresa: { nome: string; documento: string | null; endereco: string; telefone: string | null };
}

function abrirImpressao(titulo: string, corpo: string, estilo = '') {
  const w = window.open('', '_blank');
  if (!w) { alert('Permita pop-ups para imprimir.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    body{font-family:'Segoe UI',Arial,sans-serif;color:#111;max-width:760px;margin:32px auto;padding:0 24px;line-height:1.6}
    h1{font-size:22px;letter-spacing:2px;text-transform:uppercase;margin:0} .topo{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:24px}
    .muted{color:#555;font-size:13px} .valor{font-size:22px;font-weight:800} .assin{margin-top:64px;text-align:center} .linha{width:320px;border-top:1px solid #111;margin:0 auto 6px}
    pre{white-space:pre-wrap;font-family:inherit;font-size:14px} .caixa{border:1px solid #ccc;border-radius:8px;padding:12px 16px;margin-top:24px;font-size:13px}
    @media print{body{margin:0}} ${estilo}
  </style></head><body>${corpo}<script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
  w.document.close();
}

export function imprimirRecibo(r: Recibo) {
  abrirImpressao(`Recibo ${r.numero}`, `
    <div class="topo"><div><h1>Recibo</h1><div class="muted">${esc(r.empresa.nome)}${r.empresa.documento ? ` — ${esc(r.empresa.documento)}` : ''}<br>${esc(r.empresa.endereco)}${r.empresa.telefone ? ` — ${esc(r.empresa.telefone)}` : ''}</div></div>
    <div style="text-align:right"><div class="muted">Nº ${String(r.numero).padStart(6, '0')}</div><div class="valor">${BRL(r.valor)}</div></div></div>
    <p>Recebemos de <b>${esc(r.pagador.nome)}</b>${r.pagador.cpf ? `, CPF ${esc(r.pagador.cpf)},` : ''} a importância de <b>${BRL(r.valor)}</b> (${esc(r.valor_extenso)}),
    referente a ${esc(r.referente)}.</p>
    <p class="muted">Forma de pagamento: ${esc(r.forma)} · Pago em ${dataBR(r.pagamento)} · Vencimento ${dataBR(r.vencimento)}</p>
    <p>Damos plena quitação do valor acima.</p>
    <div class="assin"><div class="linha"></div>${esc(r.empresa.nome)}</div>`);
}

export interface Contrato {
  id: number; status: string; conteudo: string; hash_sha256: string; integro?: boolean; aluno_nome: string; responsavel_nome?: string | null;
  vigencia_inicio?: string | null; vigencia_fim?: string | null; assinado_em?: string | null; assinatura_nome?: string | null; assinatura_cpf?: string | null;
  assinatura_ip?: string | null; assinatura_user_agent?: string | null; valor?: number | null; criado_em?: string | null;
}

export function imprimirContrato(c: Contrato) {
  const assinatura = c.status === 'assinado'
    ? `<div class="caixa"><b>Assinado eletronicamente</b> por ${esc(c.assinatura_nome)} (CPF ${esc(c.assinatura_cpf)}) em ${new Date(c.assinado_em!).toLocaleString('pt-BR')}
       ${c.assinatura_ip ? `<br>IP: ${esc(c.assinatura_ip)}` : ''}${c.assinatura_user_agent ? `<br>Aparelho: ${esc(c.assinatura_user_agent)}` : ''}
       <br>Código de integridade (SHA-256): <code style="font-size:11px">${esc(c.hash_sha256)}</code></div>`
    : `<div class="caixa">Aguardando assinatura. Código de integridade (SHA-256): <code style="font-size:11px">${esc(c.hash_sha256)}</code></div>`;
  abrirImpressao(`Contrato - ${c.aluno_nome}`, `<pre>${esc(c.conteudo)}</pre>${assinatura}`);
}

export const statusMensalidade: Record<string, { cor: 'verde' | 'vermelho' | 'amarelo' | 'cinza'; icone: string }> = {
  Pago: { cor: 'verde', icone: 'check_circle' },
  Atrasado: { cor: 'vermelho', icone: 'warning' },
  Pendente: { cor: 'amarelo', icone: 'schedule' },
  Cancelado: { cor: 'cinza', icone: 'block' },
};

/** GET que devolve JSON ou lança um erro legível (inclusive quando o servidor está desatualizado). */
export async function buscarJson<T>(apiFetch: (u: string, i?: RequestInit) => Promise<Response>, url: string): Promise<T> {
  let r: Response;
  try { r = await apiFetch(url); } catch { throw new Error('Sem conexão com o servidor. Verifique se o "npm run server" está rodando.'); }
  const tipo = r.headers.get('content-type') || '';
  if (!tipo.includes('application/json')) {
    throw new Error(r.status === 404
      ? 'O servidor em execução ainda é a versão antiga. Pare o servidor (Ctrl+C) e rode "npm run server" de novo.'
      : `Resposta inesperada do servidor (${r.status}). Veja o terminal do "npm run server".`);
  }
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || `Erro ${r.status}`);
  return j as T;
}

export const ErroCarga: React.FC<{ msg: string }> = ({ msg }) =>
  React.createElement('div', { className: 'rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/20 p-4 text-sm font-bold text-rose-700' }, msg);
