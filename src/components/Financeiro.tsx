import React, { useEffect, useState } from 'react';
import { StatCard } from './StatCard';

interface Mensalidade {
  id: number;
  aluno_id: number;
  aluno: string;
  responsavel_telefone: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: 'Pendente' | 'Pago' | 'Atrasado' | 'Cancelado';
}

export const Financeiro: React.FC = () => {
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const fetchDashboard = () => {
    fetch('/api/financeiro/dashboard')
      .then(res => res.json())
      .then(data => {
        setMensalidades(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao buscar dashboard financeiro:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleRegistrarPagamento = async (id: number) => {
    if (!window.confirm('Confirmar o recebimento desta mensalidade? O status será alterado para Pago.')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/financeiro/pagar/${id}`, { method: 'PUT' });
      if (res.ok) {
        fetchDashboard();
      } else {
        alert('Erro ao registrar pagamento');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de comunicação com o servidor.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center font-bold text-slate-500 animate-pulse">
        Carregando painel financeiro...
      </div>
    );
  }

  if (!Array.isArray(mensalidades)) {
    return (
      <div className="p-8 max-w-2xl mx-auto mt-20 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col items-center justify-center text-center gap-4 py-16 animate-in slide-in-from-bottom-4">
        <span className="material-symbols-outlined text-6xl text-rose-500">error</span>
        <h2 className="text-2xl font-black text-rose-900 tracking-tight">Erro no Servidor</h2>
        <p className="text-rose-700 font-medium">Ocorreu um problema ao carregar os dados financeiros no banco de dados.</p>
        <p className="text-sm font-bold text-rose-500 bg-white px-4 py-2 rounded-lg mt-2 shadow-sm">Detalhes: {(mensalidades as any)?.error || 'Resposta inválida da API'}</p>
        <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2 bg-rose-600 text-white font-black rounded-lg shadow hover:bg-rose-700 transition">Tentar Novamente</button>
      </div>
    );
  }

  // KPIs Math
  const curMonth = new Date().getMonth();
  const curYear = new Date().getFullYear();
  
  const receitaMes = mensalidades
    .filter(m => m.status === 'Pago' && new Date(m.data_pagamento || m.data_vencimento).getMonth() === curMonth && new Date(m.data_pagamento || m.data_vencimento).getFullYear() === curYear)
    .reduce((acc, curr) => acc + Number(curr.valor), 0);
  
  const pendenteTotal = mensalidades
    .filter(m => m.status === 'Pendente' || m.status === 'Atrasado')
    .reduce((acc, curr) => acc + Number(curr.valor), 0);

  const ativos = mensalidades.filter(m => m.status !== 'Cancelado');
  const inadimplenciaCount = ativos.filter(m => m.status === 'Atrasado').length;
  const inadimplencia = ativos.length > 0 ? (inadimplenciaCount / ativos.length) * 100 : 0;

  const getStatusConfig = (status: string) => {
    switch(status) {
      case 'Pago': return { color: 'text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400', icon: 'check_circle' };
      case 'Atrasado': return { color: 'text-rose-800 bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400', icon: 'warning' };
      case 'Pendente': return { color: 'text-amber-800 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400', icon: 'schedule' };
      default: return { color: 'text-slate-800 bg-slate-100 dark:bg-slate-800 dark:text-slate-400', icon: 'block' };
    }
  };

  const filteredMensalidades = filter 
    ? mensalidades.filter(m => m.status === filter) 
    : mensalidades;

  const handleRelatorio = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, permita pop-ups para gerar o relatório.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Relatório Financeiro</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #f0f0f0; padding-bottom: 20px; }
            .header h1 { margin: 0 0 10px 0; color: #1a202c; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
            .header p { margin: 0; color: #718096; font-size: 14px; }
            .kpi-container { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 40px; }
            .kpi { flex: 1; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; text-align: center; background: #fafafa; }
            .kpi h3 { margin: 0 0 10px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
            .kpi h2 { margin: 0; font-size: 24px; color: #0f172a; }
            .kpi-val-receita { color: #10b981; }
            .kpi-val-pendente { color: #f59e0b; }
            .kpi-val-inadimplencia { color: #ef4444; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
            th, td { border-bottom: 1px solid #e2e8f0; padding: 12px 16px; text-align: left; }
            th { background-color: #f8fafc; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .status-Pago { color: #059669; font-weight: 700; }
            .status-Pendente { color: #d97706; font-weight: 700; }
            .status-Atrasado { color: #dc2626; font-weight: 700; }
            .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #94a3b8; }
            @media print {
              body { padding: 0; }
              @page { margin: 1.5cm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Relatório Financeiro</h1>
            <p>Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
            <p><strong>Filtro aplicado:</strong> ${filter ? filter.toUpperCase() : 'TODOS OS REGISTROS'}</p>
          </div>
          
          <div class="kpi-container">
            <div class="kpi">
              <h3>Receita Recebida (Mês)</h3>
              <h2 class="kpi-val-receita">R$ ${receitaMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
            </div>
            <div class="kpi">
              <h3>Total Pendente (Geral)</h3>
              <h2 class="kpi-val-pendente">R$ ${pendenteTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
            </div>
            <div class="kpi">
              <h3>Índice de Inadimplência</h3>
              <h2 class="kpi-val-inadimplencia">${inadimplencia.toFixed(1)}%</h2>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Pagamento</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredMensalidades.map(m => `
                <tr>
                  <td><strong>${m.aluno}</strong></td>
                  <td>R$ ${Number(m.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>${new Date(m.data_vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                  <td>${m.data_pagamento ? new Date(m.data_pagamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}</td>
                  <td class="status-${m.status}">${m.status.toUpperCase()}</td>
                </tr>
              `).join('')}
              ${filteredMensalidades.length === 0 ? '<tr><td colspan="5" style="text-align: center;">Nenhum registro encontrado.</td></tr>' : ''}
            </tbody>
          </table>

          <div class="footer">
            Documento gerado pelo sistema VanControl
          </div>

          <script>
            window.onload = () => { 
              setTimeout(() => {
                window.print(); 
                window.close(); 
              }, 250);
            }
          </script>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleRecibo = (item: Mensalidade) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, permita pop-ups para gerar o recibo.');
      return;
    }

    const valFormatado = Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const dataPag = item.data_pagamento ? new Date(item.data_pagamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '';
    const dataVenc = new Date(item.data_vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    const mesRef = dataVenc.split('/')[1] + '/' + dataVenc.split('/')[2];

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Recibo - ${item.aluno}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; padding: 40px; color: #111; line-height: 1.6; max-width: 800px; margin: 0 auto; border: 1px solid #ddd; margin-top: 40px; border-radius: 8px;}
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px dashed #ccc; padding-bottom: 20px; }
            .header h1 { margin: 0 0 10px 0; font-size: 28px; text-transform: uppercase; letter-spacing: 2px; }
            .header p { margin: 0; font-size: 14px; color: #555;}
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 16px; }
            .row strong { display: inline-block; width: 140px; text-transform: uppercase;}
            .content { padding: 20px 0; border-bottom: 2px dashed #ccc; margin-bottom: 40px;}
            .text-body { font-size: 18px; text-align: justify; margin: 30px 0; line-height: 1.8;}
            .signature { margin-top: 60px; text-align: center; }
            .sign-line { width: 300px; border-top: 1px solid #111; margin: 0 auto 10px auto; }
            @media print {
              body { border: none; margin-top: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>RECIBO DE PAGAMENTO</h1>
            <p><strong>Nº ${item.id.toString().padStart(6, '0')}</strong></p>
          </div>
          
          <div class="content">
            <div class="row">
              <span><strong>VALOR:</strong> R$ ${valFormatado}</span>
              <span><strong>DATA PAGAMENTO:</strong> ${dataPag}</span>
            </div>
            
            <p class="text-body">
              Recebemos a importância de <strong>R$ ${valFormatado}</strong> referente ao pagamento da prestação de serviço de transporte escolar do aluno(a) <strong>${item.aluno.toUpperCase()}</strong>, vencimento original em ${dataVenc} (Ref: ${mesRef}).
            </p>
            
            <p style="text-align: right; margin-top: 40px; font-size: 16px;">
              Declaramos para os devidos fins a quitação deste valor.<br>
              Emitido em ${new Date().toLocaleDateString('pt-BR')}
            </p>
          </div>

          <div class="signature">
            <div class="sign-line"></div>
            <p><strong>VanControl - Transporte Escolar</strong></p>
            <p style="font-size: 12px; color: #666;">Assinatura do Recebedor</p>
          </div>

          <script>
            window.onload = () => { 
              setTimeout(() => {
                window.print(); 
                window.close(); 
              }, 250);
            }
          </script>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-black tracking-tight">Controle Financeiro</h2>
          <p className="text-slate-500 dark:text-slate-400">Acompanhe e gerencie as cobranças da sua frota em tempo real</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleRelatorio}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-sm shadow-sm"
          >
            <span className="material-symbols-outlined">picture_as_pdf</span>
            Relatório
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Receita Recebida (Mês)"
          value={`R$ ${receitaMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          change={`${mensalidades.filter(m => m.status === 'Pago' && new Date(m.data_pagamento || m.data_vencimento).getMonth() === curMonth).length} pagamentos`}
          isPositive={true}
          icon="payments"
          iconColor="text-emerald-500"
          bgColor="bg-emerald-500/10"
          onClick={() => setFilter(filter === 'Pago' ? null : 'Pago')}
          isActive={filter === 'Pago'}
        />
        <StatCard
          title="Total Pendente (Geral)"
          value={`R$ ${pendenteTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          change={`${mensalidades.filter(m => m.status === 'Pendente' || m.status === 'Atrasado').length} registros em aberto`}
          isPositive={false}
          icon="pending_actions"
          iconColor="text-amber-500"
          bgColor="bg-amber-500/10"
          onClick={() => setFilter(filter === 'Pendente' ? null : 'Pendente')}
          isActive={filter === 'Pendente'}
        />
        <StatCard
          title="Índice de Inadimplência"
          value={`${inadimplencia.toFixed(1)}%`}
          change={`${inadimplenciaCount} cobranças atrasadas`}
          isPositive={inadimplencia < 15}
          icon="warning"
          iconColor={inadimplencia < 15 ? 'text-emerald-500' : 'text-rose-500'}
          bgColor={inadimplencia < 15 ? 'bg-emerald-500/10' : 'bg-rose-500/10'}
          onClick={() => setFilter(filter === 'Atrasado' ? null : 'Atrasado')}
          isActive={filter === 'Atrasado'}
        />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
          <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Painel de Mensalidades</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4 text-slate-600 dark:text-slate-400 font-black text-[10px] uppercase tracking-widest">Aluno</th>
                <th className="px-6 py-4 text-slate-600 dark:text-slate-400 font-black text-[10px] uppercase tracking-widest">Valor</th>
                <th className="px-6 py-4 text-slate-600 dark:text-slate-400 font-black text-[10px] uppercase tracking-widest">Vencimento</th>
                <th className="px-6 py-4 text-slate-600 dark:text-slate-400 font-black text-[10px] uppercase tracking-widest">Pagamento</th>
                <th className="px-6 py-4 text-slate-600 dark:text-slate-400 font-black text-[10px] uppercase tracking-widest text-center">Status</th>
                <th className="px-6 py-4 text-slate-600 dark:text-slate-400 font-black text-[10px] uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMensalidades.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-bold">Nenhuma mensalidade encontrada.</td>
                </tr>
              )}
              {filteredMensalidades.map((item) => {
                const config = getStatusConfig(item.status);
                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[10px] font-black text-slate-600 dark:text-slate-300 shadow-sm">
                          {item.aluno ? item.aluno.split(' ').map(n => n[0]).slice(0, 2).join('') : '?'}
                        </div>
                        <span className="text-slate-900 dark:text-slate-100 font-black text-sm uppercase tracking-wider">{item.aluno}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-slate-900 dark:text-slate-100">
                      R$ {Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 font-bold">
                      {new Date(item.data_vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 font-medium">
                      {item.data_pagamento ? new Date(item.data_pagamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10 shadow-sm ${config.color}`}>
                        <span className="material-symbols-outlined text-[12px]">{config.icon}</span>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex justify-end gap-2 opacity-100 md:opacity-80 md:group-hover:opacity-100 transition-opacity">
                        {item.status !== 'Pago' && item.responsavel_telefone && (
                          <a 
                            href={`https://wa.me/55${item.responsavel_telefone.replace(/\D/g, '')}?text=${encodeURIComponent(
                              item.status === 'Atrasado'
                                ? `Olá! 🚐\nIdentificamos uma mensalidade em atraso no valor de R$ ${Number(item.valor).toFixed(2)} referente ao mês ${item.data_vencimento.split('-')[1]} do aluno ${item.aluno}.\nPor favor, nos contate para regularização!`
                                : `Olá! 🚐\nGostaríamos de lembrar que a mensalidade do aluno ${item.aluno} no valor de R$ ${Number(item.valor).toFixed(2)} vence no dia ${item.data_vencimento.split('-')[2]}/${item.data_vencimento.split('-')[1]}.\nQualquer dúvida, estamos à disposição!`
                            )}`}
                            target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-sm"
                          >
                            <span className="material-symbols-outlined !text-[14px]">chat</span>
                            Cobrar
                          </a>
                        )}
                        
                        {(item.status === 'Pendente' || item.status === 'Atrasado') && (
                          <button 
                            disabled={saving}
                            onClick={() => handleRegistrarPagamento(item.id)}
                            title="Registrar Pagamento"
                            className="px-3 py-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-primary/20 bg-primary/5 hover:border-primary disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-[16px]">price_check</span>
                            <span className="text-[10px] font-black uppercase tracking-widest">Dar Baixa</span>
                          </button>
                        )}

                        {item.status === 'Pago' && (
                          <button 
                            title="Ver Recibo"
                            onClick={() => handleRecibo(item)}
                            className="px-3 py-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-slate-200 dark:border-slate-700 disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                            <span className="text-[10px] font-black uppercase tracking-widest">Recibo</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/10">
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
            Exibindo {filteredMensalidades.length} registros
          </p>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed font-black text-[10px] uppercase">
              Anterior
            </button>
            <button className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-black text-[10px] uppercase hover:bg-slate-100 dark:hover:bg-slate-800">
              Próximo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
