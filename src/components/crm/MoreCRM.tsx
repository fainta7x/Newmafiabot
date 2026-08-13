import React, { useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  ClipboardList,
  Coins,
  Database,
  Dice5,
  Gamepad2,
  LogOut,
  Palette,
  Send,
  Trophy,
  UserCog,
} from 'lucide-react';
import { BettingAdminCRM } from './BettingAdminCRM.tsx';
import CommerceAdminCRM from './CommerceAdminCRM.tsx';
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

type Subscreen = 'data' | 'betting' | 'commerce' | 'telegram' | 'player_roles' | 'ratings' | 'system' | null;

type MenuItem = {
  id: string;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
};

type MenuGroup = {
  title: string;
  description: string;
  items: MenuItem[];
};

const subscreenTitles: Record<Exclude<Subscreen, null>, string> = {
  data: 'Данные и настройки',
  betting: 'Управление ставками',
  commerce: 'Оплата и поддержка',
  telegram: 'Telegram',
  player_roles: 'Статусы и роли игроков',
  ratings: 'Рейтинговые периоды',
  system: 'Состояние системы',
};

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
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="flex items-center gap-3 rounded-[18px] border border-border-soft bg-surface-1 p-3">
          <button
            type="button"
            onClick={() => setSubscreen(null)}
            aria-label="Назад в раздел Ещё"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft bg-surface-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">Ещё</div>
            <h2 className="truncate text-[17px] font-black text-text-primary">{subscreenTitles[subscreen]}</h2>
          </div>
        </div>

        {subscreen === 'data' ? <DataSettingsCRM /> : null}
        {subscreen === 'betting' ? <BettingAdminCRM /> : null}
        {subscreen === 'commerce' ? <CommerceAdminCRM /> : null}
        {subscreen === 'player_roles' ? <PlayerRolesAdminCRM /> : null}
        {subscreen === 'telegram' ? <TelegramCRM /> : null}
        {subscreen === 'ratings' ? <RatingPeriodsCRM /> : null}
        {subscreen === 'system' ? <SystemStatusCard /> : null}
      </div>
    );
  }

  const groups: MenuGroup[] = [
    {
      title: 'Работа клуба',
      description: 'Инструменты, которые нужны время от времени, но не должны перегружать основные вкладки.',
      items: [
        { id: 'tasks', label: 'Все задачи', detail: 'Полная очередь задач CRM', icon: ClipboardList, onClick: onOpenTasks },
        { id: 'analytics', label: 'Аналитика', detail: 'Посещения, игроки, рассылки и финансы', icon: BarChart3, onClick: onOpenAnalytics },
        { id: 'commerce', label: 'Оплата и поддержка', detail: 'СБП, пакеты жетонов, поддержка, сборы и VK', icon: Coins, onClick: () => setSubscreen('commerce') },
        { id: 'telegram', label: 'Telegram', detail: 'Каналы, шаблоны и публикации клуба', icon: Send, onClick: () => setSubscreen('telegram') },
        { id: 'ratings', label: 'Рейтинговые периоды', detail: 'Сезоны, границы периодов и расчёт рейтинга', icon: Trophy, onClick: () => setSubscreen('ratings') },
      ],
    },
    {
      title: 'Игроки и игровая система',
      description: 'Права, экономика и инструменты проведения игр.',
      items: [
        { id: 'player_roles', label: 'Статусы и роли игроков', detail: 'Допуски, ведущие, судьи и взаимодействие', icon: UserCog, onClick: () => setSubscreen('player_roles') },
        { id: 'betting', label: 'Управление ставками', detail: 'Банки, ставки, выплаты, возвраты и пересчёт', icon: Dice5, onClick: () => setSubscreen('betting') },
        ...(onOpenGameEngine
          ? [{ id: 'game', label: 'Игровой движок', detail: 'Проведение клубных игр', icon: Gamepad2, onClick: onOpenGameEngine }]
          : []),
      ],
    },
    {
      title: 'Настройки и обслуживание',
      description: 'Редкие административные действия отделены от ежедневной работы.',
      items: [
        { id: 'data', label: 'Данные и настройки', detail: 'Ачивки, магазин, начисления и экспертная правка', icon: Database, onClick: () => setSubscreen('data') },
        { id: 'system', label: 'Состояние системы', detail: 'Проверка сервисов и технического состояния', icon: Activity, onClick: () => setSubscreen('system') },
        { id: 'theme', label: 'Оформление', detail: 'Тема и визуальный режим приложения', icon: Palette, onClick: onOpenTheme },
      ],
    },
  ];

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div>
        <h2 className="text-[24px] font-black tracking-tight text-text-primary">Ещё</h2>
        <p className="mt-1 text-[13px] leading-5 text-text-secondary">Дополнительные инструменты собраны здесь, чтобы ежедневные экраны CRM оставались короткими и понятными.</p>
      </div>

      {groups.map((group) => (
        <section key={group.title} className="space-y-2">
          <div className="px-1">
            <h3 className="text-[12px] font-black uppercase tracking-[0.08em] text-text-primary">{group.title}</h3>
            <p className="mt-0.5 text-[11px] leading-4 text-text-muted">{group.description}</p>
          </div>

          <div className="overflow-hidden rounded-[18px] border border-border-soft bg-surface-1">
            {group.items.map(({ id, label, detail, icon: Icon, onClick }, index) => (
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
                  <span className="mt-0.5 block text-[12px] leading-4 text-text-secondary">{detail}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" />
              </button>
            ))}
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={() => void onLogout()}
        className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[14px] border border-danger/25 bg-danger-soft px-4 text-[13px] font-bold text-danger"
      >
        <LogOut className="h-[18px] w-[18px]" /> Выйти из CRM
      </button>
    </div>
  );
};

export default MoreCRM;
