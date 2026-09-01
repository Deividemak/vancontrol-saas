import React, { useState } from 'react';

interface Route {
  id: string;
  name: string;
  driver: string;
  vehicle: string;
  status: 'transit' | 'waiting' | 'unavailable';
  studentsCount: number;
  capacity: number;
  period: 'morning' | 'afternoon' | 'night';
}

interface StudentOnRoute {
  order: string;
  name: string;
  stop: string;
  school: string;
  time: string;
  status: 'boarded' | 'next' | 'waiting';
}

export const Rotas: React.FC = () => {
  const [activeRouteId, setActiveRouteId] = useState('1');
  const [filter, setFilter] = useState<'all' | 'morning' | 'afternoon' | 'night'>('all');

  const routes: Route[] = [
    {
      id: '1',
      name: 'Rota Norte - Manhã',
      driver: 'Ricardo Silva',
      vehicle: 'Van 08 - PLX-4921',
      status: 'transit',
      studentsCount: 12,
      capacity: 15,
      period: 'morning',
    },
    {
      id: '2',
      name: 'Rota Sul - Tarde',
      driver: 'Ana Paula',
      vehicle: 'Van 03 - KJG-1188',
      status: 'waiting',
      studentsCount: 15,
      capacity: 15,
      period: 'afternoon',
    },
    {
      id: '3',
      name: 'Rota Leste - Noite',
      driver: 'Marcos Oliveira',
      vehicle: 'Van 12 - MOP-5520',
      status: 'waiting',
      studentsCount: 8,
      capacity: 15,
      period: 'night',
    },
    {
      id: '4',
      name: 'Rota Centro - Especial',
      driver: 'Carlos Alberto',
      vehicle: 'Van 05 - XYZ-1234',
      status: 'unavailable',
      studentsCount: 0,
      capacity: 10,
      period: 'morning',
    },
  ];

  const students: StudentOnRoute[] = [
    { order: '01', name: 'Enzo Gabriel Santos', stop: 'R. das Flores, 120 - Jd. Primavera', school: 'Colégio Dom Bosco', time: '06:20', status: 'boarded' },
    { order: '02', name: 'Maria Eduarda Lima', stop: 'Av. Central, 500 - Centro', school: 'Colégio Dom Bosco', time: '06:35', status: 'boarded' },
    { order: '03', name: 'Lucas Oliveira Silva', stop: 'R. México, 24 - Bairro das Nações', school: 'Inst. Federal (IFSP)', time: '06:55', status: 'next' },
    { order: '04', name: 'Giovanna Ferreira', stop: 'R. São Paulo, 99 - Vila Nova', school: 'Colégio Dom Bosco', time: '07:10', status: 'waiting' },
  ];

  const filteredRoutes = filter === 'all' ? routes : routes.filter(r => r.period === filter);

  return (
    <div className="flex h-full overflow-hidden animate-in fade-in duration-500">
      {/* Sidebar List */}
      <aside className="w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black tracking-tight">Listagem de Rotas</h2>
            <button className="p-2 bg-primary text-white rounded-lg shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-[20px]">add</span>
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
            <button 
              onClick={() => setFilter('all')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === 'all' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
            >
              Todas
            </button>
            <button 
              onClick={() => setFilter('morning')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === 'morning' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
            >
              Manhã
            </button>
            <button 
              onClick={() => setFilter('afternoon')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === 'afternoon' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
            >
              Tarde
            </button>
            <button 
              onClick={() => setFilter('night')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === 'night' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
            >
              Noite
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3 custom-scrollbar">
          {filteredRoutes.map((route) => (
            <div 
              key={route.id}
              onClick={() => setActiveRouteId(route.id)}
              className={`p-4 rounded-xl border cursor-pointer transition-all relative group ${
                activeRouteId === route.id 
                  ? 'bg-primary/5 border-primary shadow-sm' 
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {activeRouteId === route.id && (
                <div className="absolute top-4 right-4 size-2 rounded-full bg-primary animate-pulse"></div>
              )}
              <div className="flex items-start gap-3 mb-3">
                <div className={`p-2 rounded-lg ${activeRouteId === route.id ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                  <span className="material-symbols-outlined text-[20px]">route</span>
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-tight">{route.name}</h3>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold mt-0.5">
                    <span className="material-symbols-outlined text-[12px]">person</span>
                    <span>{route.driver}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold mt-0.5">
                    <span className="material-symbols-outlined text-[12px]">airport_shuttle</span>
                    <span>{route.vehicle}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                    route.status === 'transit' ? 'bg-blue-500/10 text-blue-500' :
                    route.status === 'waiting' ? 'bg-slate-500/10 text-slate-500' :
                    'bg-rose-500/10 text-rose-500'
                  }`}>
                    {route.status === 'transit' ? 'Em Trânsito' : route.status === 'waiting' ? 'Aguardando' : 'Indisponível'}
                  </span>
                  <span className="text-[10px] font-black text-slate-400">{route.studentsCount}/{route.capacity} Alunos</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${route.status === 'unavailable' ? 'bg-rose-500' : 'bg-primary'}`}
                    style={{ width: `${(route.studentsCount / route.capacity) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Map Header */}
        <div className="p-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-black tracking-tight">Mapa de Rota - Norte</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="size-2 rounded-full bg-blue-500"></div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Escola</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-2 rounded-full bg-slate-400"></div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Parada</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-2 rounded-full bg-emerald-500"></div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Veículo</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-primary/20 transition-colors">
              <span className="material-symbols-outlined text-[18px]">auto_fix</span>
              Otimizar Rota
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <span className="material-symbols-outlined text-[18px]">print</span>
              Imprimir
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:brightness-125 transition-all">
              <span className="material-symbols-outlined text-[18px]">add_location</span>
              Adicionar Parada
            </button>
          </div>
        </div>

        {/* Map Placeholder */}
        <div className="flex-1 relative overflow-hidden bg-slate-200 dark:bg-slate-900">
          <img 
            src="https://picsum.photos/seed/van-route-map/1920/1080?blur=2" 
            alt="Route Map" 
            className="w-full h-full object-cover opacity-50 dark:opacity-30"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="p-8 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl border border-white dark:border-slate-800 shadow-2xl text-center max-w-md">
              <span className="material-symbols-outlined text-5xl text-primary mb-4">map</span>
              <h3 className="text-xl font-black mb-2">Visualização do Mapa</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Integração com Google Maps API para rastreamento em tempo real e otimização de trajetos.</p>
            </div>
          </div>

          {/* ETA Widget */}
          <div className="absolute bottom-8 left-8 p-6 bg-slate-900/90 dark:bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl text-white">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Tempo Estimado de Chegada</p>
            <div className="flex items-baseline gap-2">
              <h4 className="text-3xl font-black tracking-tighter">07:15 AM</h4>
              <span className="text-xs font-bold text-emerald-400">-3 min (No tempo)</span>
            </div>
          </div>
        </div>

        {/* Students Table */}
        <div className="h-80 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-black tracking-tight flex items-center gap-2">
              Alunos Vinculados <span className="text-primary">(12)</span>
            </h3>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span>Ordem de Embarque Automática</span>
              <span className="material-symbols-outlined text-[16px]">swap_vert</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                  <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Ordem</th>
                  <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Aluno</th>
                  <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Ponto / Bairro</th>
                  <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Escola</th>
                  <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Embarque</th>
                  <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {students.map((student) => (
                  <tr key={student.order} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 text-sm font-black text-primary">{student.order}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <img 
                            src={`https://i.pravatar.cc/150?u=${student.name}`} 
                            alt={student.name} 
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-sm font-bold">{student.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-slate-600 dark:text-slate-400 font-medium max-w-[200px] truncate">{student.stop}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-500">{student.school}</span>
                    </td>
                    <td className="px-6 py-4 text-sm font-black tracking-tight">{student.time}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded ${
                        student.status === 'boarded' ? 'bg-emerald-500/10 text-emerald-500' :
                        student.status === 'next' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-slate-500/10 text-slate-500'
                      }`}>
                        {student.status === 'boarded' ? 'Embarcado' : student.status === 'next' ? 'Próximo Ponto' : 'Aguardando'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
