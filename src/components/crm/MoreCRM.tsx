import React, { useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Coins,
  Database,
  Dice5,
  FlaskConical,
  Gamepad2,
  LogOut,
  Music2,
  Palette,
  Send,
} from 'lucide-react';
import { BettingAdminCRM } from './BettingAdminCRM.tsx';
import CommerceAdminCRM from './CommerceAdminCRM.tsx';
import { DataSettingsCRM } from './DataSettingsCRM.tsx';
import { DeveloperTestModeCRM } from './DeveloperTestModeCRM.tsx';
import { TelegramCRM } from './TelegramCRM.tsx';
import { SystemStatusCard } from './SystemStatusCard.tsx';
import { MusicLibraryCRM } from './MusicLibraryCRM.tsx';
import type { GameEvening } from '../../lib/api.ts';

interface MoreCRMProps {
  onOpenTasks: () => void;
  onOpenAnalytics: () => void;
  onOpenTheme: () => void;
  onOpenGameEngine?: () => void;
  evenings?: GameEvening[];
  onLogout: () => void | Promise<void>;
}

type Subscreen = 'data' | 'betting' | 'commerce' | 'telegram' | 'system' | 'developer' | 'music' | null;

type MenuItem = {
  id: string;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
};

const subscreenTitles: Record<Exclude<Subscreen, null>, string> = {
  data: 'Данные и настройки',
  betting: 'Управление ставками',
  commerce: 'Оплата и поддержка',
  telegram: 'Telegram',
  system: 'Состояние системы',
  developer: '[TEST] Тестовый режим',
  music: 'Музыкальная база',
};

const menuTone = (id: string) => {
  if (id === 'tasks' || id === 'betting') return 'border-amber-200/10 bg-amber-200/[0.08] text-amber-100';
  if (id === 'analytics' || id === 'telegram') return 'border-sky-200/10 bg-sky-300/[0.08] text-sky-100';
  if (id === 'commerce' || id === 'system') return 'border-emerald-200/10 bg-emerald-300/[0.08] text-emerald-100';
  if (id === 'developer') return 'border-amber-300/15 bg-amber-300/[0.08] text-amber-100';
  if (id === 'theme') return 'border-violet-200/10 bg-violet-300/[0.08] text-violet-100';
  if (id === 'game') return 'border-[color-mix(in_srgb,var(--ds-accent)_18%,transparent)] bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]';
  return 'border-white/[0.07] bg-white/[0.06] text-white/60';
};

const MenuRow = ({ id, label, detail, icon: Icon, onClick }: MenuItem) => (
  <button
    data-testid={`crm-more-${id}`}
    type="button"
    onClick={onClick}
    className="flex min-h-[58px] w-full items-center gap-3 rounded-[16px] px-2.5 text-left transition-colors active:bg-white/[0.055] sm:min-h-[64px] sm:px-3"
  >
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border ${menuTone(id)}`}>
      <Icon className="h-[18px] w-[18px]" />
    </span>
    <span className="min-w-0 flex-1">
      <strong className="block text-[13px] font-semibold text-white sm:text-sm">{label}</strong>
      <span className="mt-0.5 block truncate text-[10px] leading-4 text-white/32 sm:text-xs">{detail}</span>
    </span>
    <ChevronRight className="h-5 w-5 shrink-0 text-white/18" />
  </button>
);

export const MoreCRM: React.FC<MoreCRMProps> = ({
  onOpenTasks,
  onOpenAnalytics,
  onOpenTheme,
  onOpenGameEngine,
  onLogout,
}) => {
  const [subscreen, setSubscreen] = useState<Subscreen>(null);
  const [serviceOpen, setServiceOpen] = useState(false);

  if (subscreen) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <div className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.04] p-3 sm:rounded-[24px]">
          <button
            type="button"
            onClick={() => setSubscreen(null)}
            aria-label="Назад в раздел Ещё"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-black/20 text-white/55 transition-colors active:bg-white/[0.07] active:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Ещё</div>
            <h2 className="mt-0.5 truncate text-[17px] font-semibold text-white sm:text-lg">{subscreenTitles[subscreen]}</h2>
          </div>
        </div>

        {subscreen === 'data' ? <DataSettingsCRM /> : null}
        {subscreen === 'betting' ? <BettingAdminCRM /> : null}
        {subscreen === 'commerce' ? <CommerceAdminCRM /> : null}
        {subscreen === 'telegram' ? <TelegramCRM /> : null}
        {subscreen === 'system' ? <SystemStatusCard /> : null}
        {subscreen === 'developer' ? <DeveloperTestModeCRM /> : null}
        {subscreen === 'music' ? <MusicLibraryCRM evenings={evenings || []} /> : null}
      </div>
    );
  }

  const workItems: MenuItem[] = [
    { id: 'music', label: 'Музыкальная база', detail: 'База ведущего и плейлист выбранного вечера', icon: Music2, onClick: () => setSubscreen('music') },
    { id: 'tasks', label: 'Задачи', detail: 'Что нужно сделать и кому написать', icon: ClipboardList, onClick: onOpenTasks },
    { id: 'analytics', label: 'Аналитика', detail: 'Посещения, игроки и финансы', icon: BarChart3, onClick: onOpenAnalytics },
    { id: 'telegram', label: 'Telegram', detail: 'Каналы, публикации и общие настройки', icon: Send, onClick: () => setSubscreen('telegram') },
    { id: 'commerce', label: 'Оплата и поддержка', detail: 'Жетоны и ручные операции', icon: Coins, onClick: () => setSubscreen('commerce') },
  ];

  const otherTools: MenuItem[] = [
    { id: 'betting', label: 'Управление ставками', detail: 'Банки, выплаты и возвраты', icon: Dice5, onClick: () => setSubscreen('betting') },
    ...(onOpenGameEngine
      ? [{ id: 'game', label: 'Игровой движок', detail: 'Проведение клубных игр', icon: Gamepad2, onClick: onOpenGameEngine }]
      : []),
  ];

  const serviceItems: MenuItem[] = [
    { id: 'developer', label: '[TEST] Тестовый режим', detail: 'Изолированная memory-only сессия и сценарии', icon: FlaskConical, onClick: () => setSubscreen('developer') },
    { id: 'data', label: 'Данные и настройки', detail: 'Ачивки, магазин и экспертная правка', icon: Database, onClick: () => setSubscreen('data') },
    { id: 'system', label: 'Состояние системы', detail: 'Сервисы и техническая диагностика', icon: Activity, onClick: () => setSubscreen('system') },
    { id: 'theme', label: 'Оформление', detail: 'Тема и визуальный режим', icon: Palette, onClick: onOpenTheme },
  ];

  return (
    <div className="mx-auto w-full max-w-xl space-y-3.5 sm:space-y-4">
      <header className="px-1 pt-0.5">
        <h2 className="text-[21px] font-semibold text-white sm:text-2xl">Ещё</h2>
        <p className="mt-0.5 text-[11px] leading-4 text-white/35 sm:text-xs sm:leading-5">Служебные и общие инструменты. Игроки, их доступы и рейтинг теперь находятся в «Игроках».</p>
      </header>

      <section className="space-y-1.5">
        <div className="px-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Организация</div>
        <div className="rounded-[20px] border border-white/10 bg-white/[0.035] p-1.5 sm:rounded-[24px] sm:p-2">
          {workItems.map((item) => <MenuRow key={item.id} {...item} />)}
        </div>
      </section>

      {otherTools.length ? <section className="space-y-1.5">
        <div className="px-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Дополнительно</div>
        <div className="rounded-[20px] border border-white/10 bg-white/[0.035] p-1.5 sm:rounded-[24px] sm:p-2">
          {otherTools.map((item) => <MenuRow key={item.id} {...item} />)}
        </div>
      </section> : null}

      <section className="rounded-[20px] border border-white/10 bg-white/[0.035] p-1.5 sm:rounded-[24px] sm:p-2">
        <button
          type="button"
          aria-expanded={serviceOpen}
          onClick={() => setServiceOpen((value) => !value)}
          className="flex min-h-[52px] w-full items-center gap-3 rounded-[15px] px-2.5 text-left"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-white/[0.07] bg-white/[0.05] text-white/45"><Database className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-[13px] font-semibold text-white">Настройки и обслуживание</strong><span className="mt-0.5 block text-[10px] text-white/30">Редкие административные действия</span></span>
          {serviceOpen ? <ChevronUp className="h-5 w-5 text-white/25" /> : <ChevronDown className="h-5 w-5 text-white/25" />}
        </button>
        {serviceOpen ? <div data-testid="crm-more-service-tools" className="mt-1 border-t border-white/[0.07] pt-1">{serviceItems.map((item) => <MenuRow key={item.id} {...item} />)}</div> : null}
      </section>

      <button
        type="button"
        onClick={() => void onLogout()}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[16px] border border-rose-300/15 bg-rose-300/[0.06] px-4 text-[12px] font-semibold text-rose-100/70"
      >
        <LogOut className="h-[17px] w-[17px]" /> Выйти из CRM
      </button>
    </div>
  );
};

export default MoreCRM;
