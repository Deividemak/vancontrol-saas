// Modal: link do portal do responsável (copiar, enviar no WhatsApp, gerar novo) e avisos automáticos
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { Botao, Modal, inputCls, erroDaResposta } from '../ui';

export const PortalResponsavel: React.FC<{ resp: { id: number; nome: string; whatsapp_ativo?: boolean; portal_ultimo_acesso?: string | null } | null; onFechar: () => void; onMudou: () => void }> = ({ resp, onFechar, onMudou }) => {
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [zap, setZap] = useState(true);

  const pedir = async (corpo: Record<string, unknown>) => {
    if (!resp) return;
    setOcupado(true);
    setMsg(null);
    const r = await apiFetch(`/api/mensagens/portal/${resp.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    setOcupado(false);
    if (!r.ok) { setMsg({ ok: false, t: await erroDaResposta(r, 'Erro') }); return; }
    const j = await r.json();
    setLink(j.link);
    if (corpo.enviar) setMsg({ ok: true, t: 'Link enviado no WhatsApp do responsável.' });
    if (corpo.novo) setMsg({ ok: true, t: 'Novo link gerado. O anterior não funciona mais.' });
  };

  useEffect(() => { if (resp) { setLink(''); setMsg(null); setZap(resp.whatsapp_ativo !== false); pedir({}); } }, [resp?.id]);

  const alternarZap = async () => {
    if (!resp) return;
    const novo = !zap;
    const r = await apiFetch(`/api/mensagens/whatsapp/${resp.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: novo }) });
    if (r.ok) { setZap(novo); onMudou(); }
  };

  return (
    <Modal aberto={!!resp} onFechar={onFechar} titulo={`Portal e avisos — ${resp?.nome || ''}`} tamanho="md">
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm text-slate-500">
            Pelo portal o responsável vê a van ao vivo, avisa faltas, cadastra quem pode buscar a criança, vê as mensalidades e conversa com a empresa. Não precisa de senha: o link é pessoal.
          </p>
          <div className="flex gap-2">
            <input readOnly value={link} placeholder="Gerando..." className={`${inputCls} font-mono !text-xs`} onFocus={e => e.target.select()} />
            <Botao variante="secundario" icone="content_copy" disabled={!link} onClick={() => { navigator.clipboard?.writeText(link); setMsg({ ok: true, t: 'Link copiado.' }); }}>Copiar</Botao>
          </div>
          <div className="flex flex-wrap gap-2">
            <Botao icone="send" carregando={ocupado} onClick={() => pedir({ enviar: true })}>Enviar no WhatsApp</Botao>
            <Botao variante="secundario" icone="lock_reset" onClick={() => { if (confirm('Gerar um novo link? O link atual deixa de funcionar.')) pedir({ novo: true }); }}>Gerar novo link</Botao>
          </div>
          {resp?.portal_ultimo_acesso && <p className="text-xs text-slate-400">Último acesso ao portal: {resp.portal_ultimo_acesso.slice(0, 16).replace('T', ' ')}</p>}
          {msg && <p className={`text-sm font-bold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.t}</p>}
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-4 cursor-pointer">
          <span>
            <span className="block font-bold">Avisos automáticos no WhatsApp</span>
            <span className="block text-xs text-slate-500">Van chegando, embarcou, chegou na escola, entregue em casa.</span>
          </span>
          <input type="checkbox" className="size-6" checked={zap} onChange={alternarZap} />
        </label>
      </div>
    </Modal>
  );
};
