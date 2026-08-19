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

const menuTone = (id: string) => {
  if (id === 'tasks' || id === 'betting') return 'border-amber-200/10 bg-amber-200/[0.08] text-amber-100';
  if (id === 'analytics' || id === 'telegram') return 'border-sky-200/10 bg-sky-300/[0.08] text-sky-100';
  if (id === 'commerce' || id === 'system') return 'border-emerald-200/10 bg-emerald-300/[0.08] text-emerald-100';
  if (id === 'ratings' || id === 'theme') return 'border-violet-200/10 bg-violet-300/[0.08] text-violet-100';
  if (id === 'player_roles' || id === 'game') return 'border-[color-mix(in_srgb,var(--ds-accent)_18%,transparent)] bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]';
  return 'border-white/[0.07] bg-white/[0.06] text-white/60';
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
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <div className="flex items-center gap-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-3">
          <button
            type="button"
            onClick={() => setSubscreen(null)}
            aria-label="Назад в раздел Ещё"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-black/20 text-white/55 transition-colors active:bg-white/[0.07] active:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Ещё</div>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-white">{subscreenTitles[subscreen]}</h2>
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
      description: 'Инструменты для организации вечеров и текущей работы.',
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
      description: 'Редкие административные действия и служебные параметры.',
      items: [
        { id: 'data', label: 'Данные и настройки', detail: 'Ачивки, магазин, начисления и экспертная правка', icon: Database, onClick: () => setSubscreen('data') },
        { id: 'system', label: 'Состояние системы', detail: 'Проверка сервисов и технического состояния', icon: Activity, onClick: () => setSubscreen('system') },
        { id: 'theme', label: 'Оформление', detail: 'Тема и визуальный режим приложения', icon: Palette, onClick: onOpenTheme },
      ],
    },
  ];

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <header className="px-1 pb-1 pt-1">
        <h2 className="text-2xl font-semibold text-white">Ещё</h2>
        <p className="mt-1 text-xs leading-5 text-white/40">Дополнительные инструменты организатора без перегрузки основных экранов</p>
      </header>

      {groups.map((group) => (
        <section key={group.title} className="space-y-2">
          <div className="px-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{group.title}</h3>
            <p className="mt-1 text-[11px] leading-4 text-white/28">{group.description}</p>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-2">
            {group.items.map(({ id, label, detail, icon: Icon, onClick }, index) => (
              <button
                key={id}
                data-testid={`crm-more-${id}`}
                type="button"
                onClick={onClick}
                className={`flex min-h-[64px] w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors active:bg-white/[0.055] ${index ? 'mt-1' : ''}`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border ${menuTone(id)}`}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-semibold text-white">{label}</strong>
                  <span className="mt-0.5 block text-xs leading-4 text-white/35">{detail}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-white/18" />
              </button>
            ))}
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={() => void onLogout()}
        className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-4 text-sm font-semibold text-rose-100/75"
      >
        <LogOut className="h-[18px] w-[18px]" /> Выйти из CRM
      </button>
    </div>
  );
};

export default MoreCRM;
