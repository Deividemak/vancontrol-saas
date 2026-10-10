// QR Code em SVG (para o Pix copia e cola)
import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';

export const QrCode: React.FC<{ texto: string; tamanho?: number; className?: string }> = ({ texto, tamanho = 220, className }) => {
  const caminho = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    return { d, n: n + 8 };
  }, [texto]);
  return (
    <svg role="img" aria-label="QR Code Pix" width={tamanho} height={tamanho} viewBox={`0 0 ${caminho.n} ${caminho.n}`} className={className} shapeRendering="crispEdges">
      <rect width="100%" height="100%" fill="#fff" />
      <path d={caminho.d} fill="#000" />
    </svg>
  );
};
