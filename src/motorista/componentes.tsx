// Peças de interface do app do motorista (telas grandes, botões fáceis de tocar)
import React, { useEffect, useRef, useState } from 'react';
import { Presenca } from './tipos';

/** Botão que só confirma depois de segurar (evita toque acidental). */
export const BotaoSegurar: React.FC<{ segundos?: number; onConfirmar: () => void; className?: string; children: React.ReactNode; desativado?: boolean }> = ({
  segundos = 2, onConfirmar, className = '', children, desativado,
}) => {
  const [progresso, setProgresso] = useState(0);
  const inicio = useRef<number | null>(null);
  const frame = useRef<number | undefined>(undefined);
  const parar = () => { inicio.current = null; if (frame.current) cancelAnimationFrame(frame.current); setProgresso(0); };
  const passo = () => {
    if (inicio.current === null) return;
    const p = Math.min(1, (Date.now() - inicio.current) / (segundos * 1000));
    setProgresso(p);
    if (p >= 1) { parar(); if (navigator.vibrate) navigator.vibrate(200); onConfirmar(); return; }
    frame.current = requestAnimationFrame(passo);
  };
  useEffect(() => parar, []);
  return (
    <button
      type="button"
      disabled={desativado}
      onPointerDown={e => { if (desativado) return; e.currentTarget.setPointerCapture?.(e.pointerId); inicio.current = Date.now(); passo(); }}
      onPointerUp={parar} onPointerLeave={parar} onPointerCancel={parar}
      onContextMenu={e => e.preventDefault()}
      className={`relative overflow-hidden select-none touch-none disabled:opacity-40 ${className}`}
    >
      <span className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${progresso * 100}%` }} />
      <span className="relative">{children}</span>
    </button>
  );
};

export const Folha: React.FC<{ aberta: boolean; onFechar: () => void; titulo: string; children: React.ReactNode }> = ({ aberta, onFechar, titulo, children }) => {
  if (!aberta) return null;
  return (
    <div className="fixed inset-0 z-[2000] bg-black/50 flex items-end sm:items-center justify-center" onMouseDown={e => e.target === e.currentTarget && onFechar()}>
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-black">{titulo}</h3>
          <button onClick={onFechar} className="size-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800" aria-label="Fechar">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const AvatarAluno: React.FC<{ p: { nome: string; foto_thumb?: string | null }; tamanho?: string }> = ({ p, tamanho = 'size-12' }) =>
  p.foto_thumb
    ? <img src={p.foto_thumb} alt="" className={`${tamanho} rounded-full object-cover shrink-0`} />
    : <span className={`${tamanho} rounded-full bg-primary/10 text-primary font-black flex items-center justify-center shrink-0`}>{p.nome.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>;

export const temAlertaSaude = (p: Presenca) => !!(p.alergias || p.condicoes_medicas || p.necessidades_especiais || p.medicamentos);

export const FichaAluno: React.FC<{ p: Presenca | null; onFechar: () => void }> = ({ p, onFechar }) => (
  <Folha aberta={!!p} onFechar={onFechar} titulo={p?.nome || ''}>
    {p && (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <AvatarAluno p={p} tamanho="size-16" />
          <div>
            <p className="font-bold">{p.escola_nome || 'Sem escola'}</p>
            <p className="text-sm text-slate-500">Turno {p.turno}{p.tipo_sanguineo ? ` · Sangue ${p.tipo_sanguineo}` : ''}</p>
          </div>
        </div>
        {[['Alergias', p.alergias], ['Condições médicas', p.condicoes_medicas], ['Medicamentos', p.medicamentos], ['Necessidades especiais', p.necessidades_especiais]]
          .filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-rose-500/10 p-3">
              <p className="text-xs font-black uppercase tracking-widest text-rose-600">{k}</p>
              <p className="font-medium">{v}</p>
            </div>
          ))}
        {!temAlertaSaude(p) && <p className="text-sm text-slate-500">Sem informações de saúde cadastradas.</p>}
        {(p.autorizados || []).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Podem receber a criança</p>
            {p.autorizados!.map((a, i) => (
              <div key={i} className="rounded-xl bg-emerald-500/10 p-3">
                <p className="font-bold">{a.nome}{a.parentesco ? ` (${a.parentesco})` : ''}</p>
                <p className="text-xs text-slate-500">{[a.documento && `Doc. ${a.documento}`, a.telefone, a.valido_ate && `válido até ${a.valido_ate.split('-').reverse().join('/')}`].filter(Boolean).join(' · ')}</p>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Contatos</p>
          {p.responsavel_telefone && <Ligar nome={p.responsavel_nome || 'Responsável'} detalhe="Responsável" tel={p.responsavel_telefone} />}
          {(p.contatos_emergencia || []).map((c, i) => <Ligar key={i} nome={c.nome} detalhe={c.parentesco || 'Emergência'} tel={c.telefone} />)}
          {!p.responsavel_telefone && !(p.contatos_emergencia || []).length && <p className="text-sm text-slate-500">Nenhum telefone cadastrado.</p>}
        </div>
      </div>
    )}
  </Folha>
);

export const Ligar: React.FC<{ nome: string; detalhe?: string; tel: string; cor?: string }> = ({ nome, detalhe, tel, cor = 'bg-emerald-600' }) => (
  <a href={`tel:${tel.replace(/[^\d+]/g, '')}`} className={`flex items-center gap-3 rounded-2xl ${cor} text-white px-4 py-3 active:scale-[.98]`}>
    <span className="material-symbols-outlined">call</span>
    <span className="flex-1">
      <span className="block font-black leading-tight">{nome}</span>
      {detalhe && <span className="block text-xs opacity-80">{detalhe} · {tel}</span>}
    </span>
  </a>
);

/** Reduz a foto da câmera antes de guardar/enviar. */
export function reduzirFoto(arquivo: File, max = 1280, qualidade = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', qualidade));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
    img.src = url;
  });
}

export const linkMaps = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
export const linkWaze = (lat: number, lng: number) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
