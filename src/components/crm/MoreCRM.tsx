import React from 'react';
import { BarChart3, ChevronRight, ClipboardList, Database, Gamepad2, LogOut, Palette } from 'lucide-react';
import { RatingPeriodsCRM } from './RatingPeriodsCRM.tsx';

interface MoreCRMProps {
  onOpenTasks: () => void;
  onOpenAnalytics: () => void;
  onOpenData: () => void;
  onOpenTheme: () => void;
  onOpenGameEngine?: () => void;
  onLogout: () => void | Promise<void>;
}

export const MoreCRM: React.FC<MoreCRMProps> = ({
  onOpenTasks,
  onOpenAnalytics,
  onOpenData,
  onOpenTheme,
  onOpenGameEngine,
  onLogout,
}) => {
  const items = [
    { id: 'tasks', label: 'Все задачи', detail: 'Полная очередь задач CRM', icon: ClipboardList, onClick: onOpenTasks },
    { id: 'analytics', label: 'Аналитика', detail: 'Посещения, удержание и финансы', icon: BarChart3, onClick: onOpenAnalytics },
    { id: 'data', label: 'Данные и настройки', detail: 'Ачивки, магазин, ручные начисления и правка базы', icon: Database, onClick: onOpenData },
    { id: 'theme', label: 'Оформление', detail: 'Тема и визуальный режим', icon: Palette, onClick: onOpenTheme },
    ...(onOpenGameEngine ? [{ id: 'game', label: 'Игровой движок', detail: 'Проведение клубных игр', icon: Gamepad2, onClick: onOpenGameEngine }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div>
        <h2 className="text-[24px] font-black tracking-tight text-text-primary">Ещё</h2>
        <p className="mt-1 text-[13px] text-text-secondary">Редкие инструменты и настройки — отдельно от ежедневной работы.</p>
      </div>

      <RatingPeriodsCRM />

      <div className="overflow-hidden rounded-[18px] border border-border-soft bg-surface-1">
        {items.map(({ id, label, detail, icon: Icon, onClick }, index) => (
          <button
            key={id}
            type="button"
            onClick={onClick}
            className={`flex min-h-[68px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-surface-hover ${index ? 'border-t border-border-soft' : ''}`}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-surface-2 text-accent">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-[14px] font-bold text-text-primary">{label}</strong>
              <span className="mt-0.5 block text-[12px] text-text-secondary">{detail}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void onLogout()}
        className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[14px] border border-danger/25 bg-danger-soft px-4 text-[13px] font-bold text-danger"
      >
        <LogOut className="h-4.5 w-4.5" /> Выйти из CRM
      </button>
    </div>
  );
};

export default MoreCRM;
