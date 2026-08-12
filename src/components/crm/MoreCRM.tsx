import React, { useState } from 'react';
import { ArrowLeft, BarChart3, ChevronRight, ClipboardList, Database, Dice5, Gamepad2, LogOut, Palette, Send, UserCog } from 'lucide-react';
import { BettingAdminCRM } from './BettingAdminCRM.tsx';
import { DataSettingsCRM } from './DataSettingsCRM.tsx';
import { PlayerRolesAdminCRM } from './PlayerRolesAdminCRM.tsx';
import { RatingPeriodsCRM } from './RatingPeriodsCRM.tsx';
import { TelegramCRM } from './TelegramCRM.tsx';
import { SystemStatusCard } from './SystemStatusCard.tsx';

interface MoreCRMProps {
  onOpenTasks: () => void;
  onOpenAnalytics: () => void;
  onOpenTheme: () => void;
  onOpenGameEngine?: () => void;
  onLogout: () => void | Promise<void>;
}

type Subscreen = 'data' | 'betting' | 'telegram' | 'player_roles' | null;

export const MoreCRM: React.FC<MoreCRMProps> = ({
  onOpenTasks,
  onOpenAnalytics,
  onOpenTheme,
  onOpenGameEngine,
  onLogout,
}) => {
  const [subscreen, setSubscreen] = useState<Subscreen>(null);

  if (subscreen) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSubscreen(null)}
          className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-border-soft bg-surface-1 px-3 text-[12px] font-bold text-text-secondary"
        >
          <ArrowLeft className="h-4 w-4" /> Назад в «Ещё»
        </button>
        {subscreen === 'data'
          ? <DataSettingsCRM />
          : subscreen === 'betting'
            ? <BettingAdminCRM />
            : subscreen === 'player_roles'
              ? <PlayerRolesAdminCRM />
              : <TelegramCRM />}
      </div>
    );
  }

  const items = [
    { id: 'tasks', label: 'Все задачи', detail: 'Полная очередь задач CRM', icon: ClipboardList, onClick: onOpenTasks },
    { id: 'analytics', label: 'Аналитика', detail: 'Воронка игроков, рассылки, посещения и финансы', icon: BarChart3, onClick: onOpenAnalytics },
    { id: 'player_roles', label: 'Статусы и роли игроков', detail: 'Игровой допуск, ведущие, судьи и статус взаимодействия', icon: UserCog, onClick: () => setSubscreen('player_roles') },
    { id: 'telegram', label: 'Telegram', detail: 'Каналы, темы и автоматическая публикация событий', icon: Send, onClick: () => setSubscreen('telegram') },
    { id: 'data', label: 'Данные и настройки', detail: 'Ачивки, магазин, ручные начисления и правка базы', icon: Database, onClick: () => setSubscreen('data') },
    { id: 'betting', label: 'Управление ставками', detail: 'Банки, ставки игроков, выплаты, возвраты и пересчёт', icon: Dice5, onClick: () => setSubscreen('betting') },
    { id: 'theme', label: 'Оформление', detail: 'Тема и визуальный режим', icon: Palette, onClick: onOpenTheme },
    ...(onOpenGameEngine ? [{ id: 'game', label: 'Игровой движок', detail: 'Проведение клубных игр', icon: Gamepad2, onClick: onOpenGameEngine }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div>
        <h2 className="text-[24px] font-black tracking-tight text-text-primary">Ещё</h2>
        <p className="mt-1 text-[13px] text-text-secondary">Редкие инструменты, мониторинг и настройки — отдельно от ежедневной работы.</p>
      </div>

      <SystemStatusCard />
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
