import React, { useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpen,
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
  ShieldCheck,
  Settings2,
  Sprout, GraduationCap, KanbanSquare } from 'lucide-react';
import { BettingAdminCRM } from './BettingAdminCRM.tsx';
import CommerceAdminCRM from './CommerceAdminCRM.tsx';
import { DataSettingsCRM } from './DataSettingsCRM.tsx';
import { DeveloperTestModeCRM } from './DeveloperTestModeCRM.tsx';
import { TelegramCRM } from './TelegramCRM.tsx';
import { SystemStatusCard } from './SystemStatusCard.tsx';
import { MusicLibraryCRM } from './MusicLibraryCRM.tsx';
import type { GameEvening } from '../../lib/api.ts';
import type { OrganizerMoreScreen } from './organizerRouting.ts';
import NoviceDevelopmentCRM from './NoviceDevelopmentCRM.tsx';
import LearningProgressCRM from './LearningProgressCRM.tsx';
import PlayerAccessBulkCRM from './PlayerAccessBulkCRM.tsx';
import ProjectBoardCRM from './ProjectBoardCRM.tsx';

interface MoreCRMProps {
  onOpenTasks: () => void;
  onOpenAnalytics: () => void;
  onOpenTheme: () => void;
  onOpenGameEngine?: () => void;
  evenings?: GameEvening[];
  onLogout: () => void | Promise<void>;
  onOpenPlayerMusic: () => void;
  onOpenPlayer?: (playerId: string) => void;
  activeScreen?: OrganizerMoreScreen | null;
  onScreenChange?: (screen: OrganizerMoreScreen | null) => void;
}

type Subscreen = OrganizerMoreScreen | null;
type MenuItem = { id: string; label: string; detail: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void; };

const subscreenTitles: Record<Exclude<Subscreen, null>, string> = {
  data: 'Данные и настройки', betting: 'Управление ставками', commerce: 'Оплата и поддержка', telegram: 'Публикации и каналы',
  system: 'Состояние системы', project: 'Проект', developer: '[TEST] Тестовый режим', music: 'Музыкальная база', tournaments: 'Турнирные вечера', development: 'Заявки новых игроков', learning: 'Обучение', access: 'Уровни и роли',
};

const menuTone = (id: string) => {
  if (id === 'tasks' || id === 'betting' || id === 'tournaments') return 'border-amber-200/10 bg-amber-200/[0.08] text-amber-100';
  if (id === 'analytics' || id === 'telegram') return 'border-sky-200/10 bg-sky-300/[0.08] text-sky-100';
  if (id === 'commerce' || id === 'system') return 'border-emerald-200/10 bg-emerald-300/[0.08] text-emerald-100';
  if (id === 'developer') return 'border-amber-300/15 bg-amber-300/[0.08] text-amber-100';
  if (id === 'theme') return 'border-violet-200/10 bg-violet-300/[0.08] text-violet-100';
  if (id === 'game') return 'border-[color-mix(in_srgb,var(--ds-accent)_18%,transparent)] bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]';
  return 'border-white/[0.07] bg-white/[0.06] text-white/60';
};

const MenuRow = ({ id, label, detail, icon: Icon, onClick }: MenuItem) => (
  <button data-testid={`crm-more-${id}`} type="button" onClick={onClick} className="flex min-h-[60px] w-full items-center gap-3 rounded-[16px] px-2.5 text-left active:bg-white/[0.055] sm:min-h-[64px] sm:px-3">
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border ${menuTone(id)}`}><Icon className="h-[18px] w-[18px]" /></span>
    <span className="min-w-0 flex-1"><strong className="block text-[14px] font-semibold text-white">{label}</strong><span className="mt-0.5 block line-clamp-1 text-[12px] leading-4 text-white/70">{detail}</span></span>
    <ChevronRight className="h-5 w-5 shrink-0 text-white/25" />
  </button>
);

export const MoreCRM: React.FC<MoreCRMProps> = ({ onOpenTasks, onOpenAnalytics, onOpenTheme, onOpenGameEngine, evenings = [], onLogout, onOpenPlayerMusic, onOpenPlayer, activeScreen, onScreenChange }) => {
  const [adminOpen, setAdminOpen] = useState(false);
  const [localSubscreen, setLocalSubscreen] = useState<Subscreen>(null);
  const subscreen = activeScreen === undefined ? localSubscreen : activeScreen;
  const setSubscreen = (screen: Subscreen) => { if (activeScreen === undefined) setLocalSubscreen(screen); onScreenChange?.(screen); };

  if (subscreen) {
    return <div className="mx-auto w-full max-w-3xl space-y-3">
      <div className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.04] p-3 sm:rounded-[24px]">
        <button type="button" onClick={() => setSubscreen(null)} aria-label="Назад в раздел Ещё" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-black/20 text-white/75 active:bg-white/[0.07] active:text-white"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0"><div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/65">Ещё</div><h2 className="mt-0.5 line-clamp-1 text-[18px] font-semibold text-white">{subscreenTitles[subscreen]}</h2></div>
      </div>
      {subscreen === 'data' ? <DataSettingsCRM /> : null}
      {subscreen === 'betting' ? <BettingAdminCRM /> : null}
      {subscreen === 'commerce' ? <CommerceAdminCRM /> : null}
      {subscreen === 'telegram' ? <TelegramCRM /> : null}
      {subscreen === 'system' ? <SystemStatusCard /> : null}
      {subscreen === 'developer' ? <DeveloperTestModeCRM /> : null}
      {subscreen === 'music' ? <MusicLibraryCRM evenings={evenings || []} onOpenLibrary={onOpenPlayerMusic} /> : null}
      {subscreen === 'tournaments' ? <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/60">Турнирные вечера теперь в «События → Турниры»: ответы игроков, очередь на место, взносы и публикация — в карточке турнира.</p> : null}
      {subscreen === 'development' ? <NoviceDevelopmentCRM onOpenPlayer={onOpenPlayer} /> : null}
      {subscreen === 'learning' ? <LearningProgressCRM onOpenPlayer={onOpenPlayer} /> : null}
      {subscreen === 'access' ? <PlayerAccessBulkCRM /> : null}
      {subscreen === 'project' ? <ProjectBoardCRM /> : null}
    </div>;
  }

  // Grouped by the organizer's task, plain names (owner walk-through, 2026-10-12).
  const dailyItems: MenuItem[] = [
    { id: 'tasks', label: 'Дела', detail: 'Что нужно сделать и кому написать — по срочности', icon: ClipboardList, onClick: onOpenTasks },
    { id: 'telegram', label: 'Публикации и каналы', detail: 'Объявления, сводки и каналы клуба', icon: Send, onClick: () => setSubscreen('telegram') },
    { id: 'music', label: 'Музыкальная база', detail: 'База ведущего и плейлист вечера', icon: Music2, onClick: () => setSubscreen('music') },
    ...(onOpenGameEngine ? [{ id: 'game', label: 'Игровой движок', detail: 'Проведение клубных игр', icon: Gamepad2, onClick: onOpenGameEngine }] : []),
  ];
  const peopleItems: MenuItem[] = [
    { id: 'development', label: 'Заявки новых игроков', detail: 'Первые заявки, новичковый этап и перевод в клуб', icon: Sprout, onClick: () => setSubscreen('development') },
    { id: 'learning', label: 'Обучение', detail: 'Кто какие экзамены тренажёра сдал', icon: GraduationCap, onClick: () => setSubscreen('learning') },
    { id: 'access', label: 'Уровни и роли', detail: 'Уровень, роль в клубе и ведение игр — сразу нескольким игрокам', icon: ShieldCheck, onClick: () => setSubscreen('access') },
  ];
  const moneyItems: MenuItem[] = [
    { id: 'analytics', label: 'Аналитика', detail: 'Посещения, игроки и финансы', icon: BarChart3, onClick: onOpenAnalytics },
    { id: 'commerce', label: 'Оплата и поддержка', detail: 'Жетоны и ручные операции', icon: Coins, onClick: () => setSubscreen('commerce') },
    { id: 'betting', label: 'Управление ставками', detail: 'Банки, выплаты и возвраты', icon: Dice5, onClick: () => setSubscreen('betting') },
  ];
  const adminItems: MenuItem[] = [
    { id: 'data', label: 'Данные и настройки', detail: 'Ачивки, магазин и экспертная правка', icon: Database, onClick: () => setSubscreen('data') },
    { id: 'project', label: 'Проект', detail: 'Что ждёт вас, дорожная карта и все PR', icon: KanbanSquare, onClick: () => setSubscreen('project') },
    { id: 'system', label: 'Состояние системы', detail: 'Сервисы и техническая диагностика', icon: Activity, onClick: () => setSubscreen('system') },
    { id: 'theme', label: 'Оформление', detail: 'Тема и визуальный режим', icon: Palette, onClick: onOpenTheme },
    // Public page (no sign-in) to send a novice before the first evening; «Ссылка другу» there copies it.
    { id: 'guide', label: 'Ссылка-памятка для новичка', detail: 'Открывает страницу с правилами; её можно отправить игроку', icon: BookOpen, onClick: () => { window.open('/guide', '_blank', 'noopener'); } },
    { id: 'developer', label: '[TEST] Тестовый режим', detail: 'Изолированные тестовые сценарии', icon: FlaskConical, onClick: () => setSubscreen('developer') },
  ];
  const group = (title: string, rows: MenuItem[], className: string) => <section className={`${className} space-y-1.5`}><div className="px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/65">{title}</div><div className="rounded-[20px] border border-white/10 bg-white/[0.035] p-1.5">{rows.map((item) => <MenuRow key={item.id} {...item} />)}</div></section>;

  return <div className="crm-more-menu mx-auto w-full max-w-xl space-y-4">
    <header className="px-1 pt-0.5"><h2 data-crm-duplicate-primary-title="true" className="text-[22px] font-semibold text-white">Ещё</h2><p className="mt-1 text-[13px] leading-5 text-white/70">Разделы по задачам. Редкие настройки и обслуживание скрыты в самом низу.</p></header>
    <div className="crm-more-daily space-y-4">{group('Каждый день', dailyItems, 'crm-more-everyday')}{group('Люди и обучение', peopleItems, 'crm-more-people')}</div>
    <div className="crm-more-secondary space-y-4">{group('Деньги и отчёты', moneyItems, 'crm-more-reports')}
    <section className="crm-more-admin rounded-[20px] border border-white/10 bg-white/[0.035] p-1.5"><button type="button" aria-expanded={adminOpen} onClick={() => setAdminOpen((value) => !value)} className="flex min-h-[56px] w-full items-center gap-3 rounded-[15px] px-2.5 text-left"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-white/[0.07] bg-white/[0.05] text-white/70"><Settings2 className="h-[18px] w-[18px]" /></span><span className="min-w-0 flex-1"><strong className="block text-[14px] font-semibold text-white">Служебное</strong><span className="mt-0.5 block text-[12px] text-white/65">Состояние системы, оформление, ачивки и магазин, дорожная карта проекта, тесты</span></span>{adminOpen ? <ChevronUp className="h-5 w-5 text-white/30" /> : <ChevronDown className="h-5 w-5 text-white/30" />}</button>{adminOpen ? <div data-testid="crm-more-service-tools" className="mt-1 border-t border-white/[0.07] pt-1">{adminItems.map((item) => <MenuRow key={item.id} {...item} />)}</div> : null}</section>
    </div>
    <button type="button" onClick={() => void onLogout()} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[16px] border border-rose-300/15 bg-rose-300/[0.06] px-4 text-[14px] font-semibold text-rose-100/75"><LogOut className="h-[17px] w-[17px]" /> Выйти из кабинета организатора</button>
  </div>;
};

export default MoreCRM;
