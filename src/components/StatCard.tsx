import React from 'react';

export interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  isPositive?: boolean;
  icon: string;
  iconColor?: string;
  bgColor?: string;
  subtitle?: string;
  onClick?: () => void;
  isActive?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  change, 
  isPositive, 
  icon, 
  iconColor = 'text-primary', 
  bgColor = 'bg-primary/10',
  subtitle,
  onClick,
  isActive
}) => {
  return (
    <div 
      onClick={onClick}
      className={`flex flex-col gap-2 rounded-xl p-6 bg-white dark:bg-slate-900 border ${isActive ? 'border-primary shadow-md ring-2 ring-primary/20 scale-[1.02]' : 'border-slate-200 dark:border-slate-800 shadow-sm'} transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.02]' : ''}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">{title}</p>
        <div className={`p-2 ${bgColor} rounded-lg`}>
          <span className={`material-symbols-outlined ${iconColor}`}>{icon}</span>
        </div>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-slate-900 dark:text-white text-3xl font-black leading-tight tracking-tight">{value}</p>
        {change && (
          <p className={`text-sm font-bold ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
            {change}
          </p>
        )}
      </div>
      {subtitle && <p className="text-slate-400 text-xs font-medium mt-1">{subtitle}</p>}
    </div>
  );
};
