import React, { useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpen,
  ChevronRight,
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
  Users,
  Award,
  Crown,
  Wallet,
  Settings2,
  Sprout, ShoppingBag, GraduationCap, KanbanSquare, Sparkles, MessageCircleQuestion, Globe, CalendarDays } from 'lucide-react';
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
import WhatsNewCRM from './WhatsNewCRM.tsx';
import BotFaqCRM from './BotFaqCRM.tsx';
import GiftCollectionCRM from './GiftCollectionCRM.tsx';
import AchievementsCRM from './AchievementsCRM.tsx';
import VipCRM from './VipCRM.tsx';
import TokensCRM from './TokensCRM.tsx';
import ShopCRM from './ShopCRM.tsx';
import SiteCRM from './SiteCRM.tsx';
import GameScheduleCRM from './GameScheduleCRM.tsx';
import { EveningPriceSettingsCard } from './EveningPriceSettingsCard.tsx';

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
  data: 'Данные и настройки', achievements: 'Достижения', vip: 'VIP', tokens: 'Жетоны', shop: 'Магазин', site: 'Сайт клуба', schedule: 'Расписание игр', prices: 'Стоимость вечеров', betting: 'Управление ставками', commerce: 'Оплата и поддержка', telegram: 'Публикации и каналы',
  system: 'Состояние системы', project: 'Проект', developer: '[TEST] Тестовый режим', music: 'Музыкальная база', tournaments: 'Турнирные вечера', development: 'Заявки новых игроков', learning: 'Обучение', access: 'Уровни и роли', whatsnew: 'Что нового', botfaq: 'Ответы бота', gifts: 'Сбор на подарок',
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
  <button data-testid={`crm-more-${id}`} type="button" onClick={onClick} className="flex min-h-[64px] w-full items-center gap-3 rounded-[16px] px-2.5 text-left active:bg-white/[0.055] sm:min-h-[64px] sm:px-3">
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border ${menuTone(id)}`}><Icon className="h-[18px] w-[18px]" /></span>
    <span className="min-w-0 flex-1"><strong className="block text-[14px] font-semibold text-white">{label}</strong><span className="mt-0.5 block line-clamp-2 text-[12px] leading-4 text-white/70">{detail}</span></span>
    <ChevronRight className="h-5 w-5 shrink-0 text-white/25" />
  </button>
);

export const MoreCRM: React.FC<MoreCRMProps> = ({ onOpenTasks, onOpenAnalytics, onOpenTheme, onOpenGameEngine, evenings = [], onLogout, onOpenPlayerMusic, onOpenPlayer, activeScreen, onScreenChange }) => {
  const [localSubscreen, setLocalSubscreen] = useState<Subscreen>(null);
  const subscreen = activeScreen === undefined ? localSubscreen : activeScreen;
  // The category stays open while one of its screens is open and closed again, so Back lands in the same list.
  const SCREEN_CATEGORY: Record<string, string> = { tasks: 'run', game: 'run', music: 'run', analytics: 'run', development: 'people', access: 'people', learning: 'people', gifts: 'people', achievements: 'game', vip: 'game', tokens: 'game', shop: 'game', betting: 'game', telegram: 'messages', whatsnew: 'messages', botfaq: 'messages', site: 'messages', schedule: 'run', commerce: 'money', prices: 'money', data: 'system', project: 'system', system: 'system', developer: 'system' };
  const [category, setCategory] = useState<string | null>(() => (activeScreen && SCREEN_CATEGORY[activeScreen]) || null);
  const chooseCategory = (id: string | null) => setCategory(id);
  const setSubscreen = (screen: Subscreen) => { if (activeScreen === undefined) setLocalSubscreen(screen); onScreenChange?.(screen); };

  if (subscreen) {
    return <div className="mx-auto w-full max-w-3xl space-y-3">
      <div className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.04] p-3 sm:rounded-[24px]">
        <button type="button" onClick={() => setSubscreen(null)} aria-label="Назад в раздел Ещё" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-black/20 text-white/75 active:bg-white/[0.07] active:text-white"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0"><div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/65">Ещё</div><h2 className="mt-0.5 line-clamp-1 text-[18px] font-semibold text-white">{subscreenTitles[subscreen]}</h2></div>
      </div>
      {subscreen === 'data' ? <DataSettingsCRM /> : null}
      {subscreen === 'achievements' ? <AchievementsCRM /> : null}
      {subscreen === 'vip' ? <VipCRM /> : null}
      {subscreen === 'tokens' ? <TokensCRM /> : null}
      {subscreen === 'shop' ? <ShopCRM /> : null}
      {subscreen === 'site' ? <SiteCRM /> : null}
      {subscreen === 'schedule' ? <GameScheduleCRM /> : null}
      {subscreen === 'prices' ? <div className="mx-auto w-full max-w-2xl"><EveningPriceSettingsCard /></div> : null}
      {subscreen === 'betting' ? <BettingAdminCRM /> : null}
      {subscreen === 'commerce' ? <CommerceAdminCRM /> : null}
      {subscreen === 'telegram' ? <TelegramCRM /> : null}
      {subscreen === 'system' ? <SystemStatusCard /> : null}
      {subscreen === 'developer' ? <DeveloperTestModeCRM /> : null}
      {subscreen === 'music' ? <MusicLibraryCRM evenings={evenings || []} onOpenLibrary={onOpenPlayerMusic} /> : null}
      {subscreen === 'tournaments' ? <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/60">Турнирные вечера теперь в «События → Турниры»: ответы игроков, очередь на место, взносы и публикация — в карточке турнира.</p> : null}
      {subscreen === 'development' ? <NoviceDevelopmentCRM onOpenPlayer={onOpenPlayer} /> : null}
      {subscreen === 'learning' ? <>
        <button type="button" data-testid="crm-more-guide" onClick={() => { window.open('/guide', '_blank', 'noopener'); }} className="flex min-h-[56px] w-full items-center gap-3 rounded-[16px] border border-white/10 bg-white/[0.04] px-3 text-left"><BookOpen className="h-[18px] w-[18px] shrink-0 text-white/70" /><span className="min-w-0"><strong className="block text-[14px] font-semibold text-white">Памятка для новичка</strong><span className="mt-0.5 block text-[12px] text-white/70">Открыть правила, чтобы отправить ссылку игроку</span></span></button>
        <LearningProgressCRM onOpenPlayer={onOpenPlayer} />
      </> : null}
      {subscreen === 'access' ? <PlayerAccessBulkCRM /> : null}
      {subscreen === 'project' ? <ProjectBoardCRM /> : null}
      {subscreen === 'whatsnew' ? <WhatsNewCRM /> : null}
      {subscreen === 'botfaq' ? <BotFaqCRM /> : null}
      {subscreen === 'gifts' ? <GiftCollectionCRM /> : null}
    </div>;
  }

  // Grouped by what the organizer is doing; names agreed with the owner (2026-11-10).
  const dailyItems: MenuItem[] = [
    { id: 'tasks', label: 'Дела', detail: 'Что нужно сделать и кому написать — по срочности', icon: ClipboardList, onClick: onOpenTasks },
    ...(onOpenGameEngine ? [{ id: 'game', label: 'Игровой движок', detail: 'Проведение клубных игр', icon: Gamepad2, onClick: onOpenGameEngine }] : []),
    { id: 'schedule', label: 'Расписание игр', detail: 'День недели и время игр', icon: CalendarDays, onClick: () => setSubscreen('schedule') },
    { id: 'music', label: 'Музыкальная база', detail: 'Музыка для ведущего и плейлист вечера', icon: Music2, onClick: () => setSubscreen('music') },
    { id: 'analytics', label: 'Аналитика', detail: 'Посещения, игроки и финансы', icon: BarChart3, onClick: onOpenAnalytics },
  ];
  const peopleItems: MenuItem[] = [
    { id: 'development', label: 'Заявки новых игроков', detail: 'Первые заявки, новичковый этап и перевод в клуб', icon: Sprout, onClick: () => setSubscreen('development') },
    { id: 'access', label: 'Уровни и роли', detail: 'Уровень, роль в клубе и ведение игр — сразу нескольким игрокам', icon: ShieldCheck, onClick: () => setSubscreen('access') },
    { id: 'learning', label: 'Обучение', detail: 'Кто какие экзамены тренажёра сдал и памятка для новичка', icon: GraduationCap, onClick: () => setSubscreen('learning') },
    { id: 'gifts', label: 'Сбор на подарок', detail: 'Опрос игроков ко дню рождения и кто сколько внёс', icon: Coins, onClick: () => setSubscreen('gifts') },
  ];
  const gameItems: MenuItem[] = [
    { id: 'achievements', label: 'Достижения', detail: 'Каталог, выдача вручную и награды игроков', icon: Award, onClick: () => setSubscreen('achievements') },
    { id: 'vip', label: 'VIP', detail: 'Подкрутка карт: у кого какие условия', icon: Crown, onClick: () => setSubscreen('vip') },
    { id: 'tokens', label: 'Жетоны', detail: 'Балансы игроков, журнал и ручные операции', icon: Wallet, onClick: () => setSubscreen('tokens') },
    { id: 'shop', label: 'Магазин', detail: 'Товары за жетоны и кто что купил', icon: ShoppingBag, onClick: () => setSubscreen('shop') },
    { id: 'betting', label: 'Управление ставками', detail: 'Банки, выплаты и возвраты', icon: Dice5, onClick: () => setSubscreen('betting') },
  ];
  const publicationItems: MenuItem[] = [
    { id: 'telegram', label: 'Публикации и каналы', detail: 'Объявления, сводки и каналы клуба', icon: Send, onClick: () => setSubscreen('telegram') },
    { id: 'whatsnew', label: 'Что нового', detail: 'Записи на главной странице игроков', icon: Sparkles, onClick: () => setSubscreen('whatsnew') },
    { id: 'site', label: 'Сайт клуба', detail: 'Тексты и ссылки сайта, фото', icon: Globe, onClick: () => setSubscreen('site') },
    { id: 'botfaq', label: 'Ответы бота', detail: 'Вопросы игроков и тексты ответов в Telegram', icon: MessageCircleQuestion, onClick: () => setSubscreen('botfaq') },
  ];
  const moneyItems: MenuItem[] = [
    { id: 'commerce', label: 'Оплата и поддержка', detail: 'Платежи деньгами, пакеты жетонов и целевые сборы', icon: Coins, onClick: () => setSubscreen('commerce') },
    { id: 'prices', label: 'Стоимость вечеров', detail: 'Сколько стоит вечер для игроков', icon: Coins, onClick: () => setSubscreen('prices') },
  ];
  const adminItems: MenuItem[] = [
    { id: 'data', label: 'Данные и настройки', detail: 'Экспертная правка записей и журнал изменений', icon: Database, onClick: () => setSubscreen('data') },
    { id: 'project', label: 'Проект', detail: 'Что ждёт вас, дорожная карта и все PR', icon: KanbanSquare, onClick: () => setSubscreen('project') },
    { id: 'system', label: 'Состояние системы', detail: 'Сервисы и техническая диагностика', icon: Activity, onClick: () => setSubscreen('system') },
    { id: 'developer', label: '[TEST] Тестовый режим', detail: 'Изолированные тестовые сценарии', icon: FlaskConical, onClick: () => setSubscreen('developer') },
  ];
  // «Ещё» is a short list of categories that fits one screen; a tap goes one level down to that category's items (owner, 2026-11-10).
  const categories: Array<{ id: string; title: string; detail: string; icon: React.ComponentType<{ className?: string }>; items: MenuItem[] }> = [
    { id: 'run', title: 'Ведение игр', detail: 'Дела, движок, музыка, аналитика', icon: ClipboardList, items: dailyItems },
    { id: 'people', title: 'Игроки', detail: 'Заявки, уровни, обучение, подарки', icon: Users, items: peopleItems },
    { id: 'game', title: 'Игровая часть', detail: 'Достижения, VIP, жетоны, магазин, ставки', icon: Award, items: gameItems },
    { id: 'messages', title: 'Сообщения', detail: 'Публикации, новости, ответы бота', icon: Send, items: publicationItems },
    { id: 'money', title: 'Деньги', detail: 'Оплата и стоимость вечеров', icon: Coins, items: moneyItems },
    { id: 'system', title: 'Система', detail: 'Данные, проект, состояние, тесты', icon: Settings2, items: adminItems },
  ];
  const openCategory = categories.find((item) => item.id === category) || null;

  if (openCategory) {
    return <div data-testid="crm-more-category" className="crm-more-menu mx-auto w-full max-w-xl space-y-3">
      <div className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.04] p-3">
        <button type="button" onClick={() => chooseCategory(null)} aria-label="Назад к разделам «Ещё»" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-black/20 text-white/75"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0"><div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/65">Ещё</div><h2 data-crm-duplicate-primary-title="true" className="mt-0.5 line-clamp-1 text-[18px] font-semibold text-white">{openCategory.title}</h2></div>
      </div>
      <div className={`crm-more-${openCategory.id} rounded-[20px] border border-white/10 bg-white/[0.035] p-1.5`}>{openCategory.items.map((item) => <MenuRow key={item.id} {...item} />)}</div>
    </div>;
  }

  return <div className="crm-more-menu mx-auto w-full max-w-xl space-y-4">
    <header className="flex items-start justify-between gap-3 px-1 pt-0.5"><div className="min-w-0"><h2 data-crm-duplicate-primary-title="true" className="text-[22px] font-semibold text-white">Ещё</h2><p className="mt-1 text-[13px] leading-5 text-white/70">Выберите раздел.</p></div><button type="button" data-testid="crm-more-theme" onClick={onOpenTheme} aria-label="Оформление: тема и визуальный режим" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.05] text-white/75"><Palette className="h-[18px] w-[18px]" /></button></header>
    <div className="grid grid-cols-2 gap-2.5">{categories.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" data-testid={`crm-more-cat-${item.id}`} onClick={() => chooseCategory(item.id)} className="flex min-h-[116px] flex-col items-start justify-between rounded-[20px] border border-white/10 bg-white/[0.035] p-3.5 text-left active:bg-white/[0.07]">
      <span className="grid h-10 w-10 place-items-center rounded-[14px] border border-white/[0.07] bg-white/[0.06] text-white/75"><Icon className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0"><strong className="block text-[15px] font-semibold text-white">{item.title}</strong><span className="mt-0.5 block text-[11px] leading-4 text-white/65">{item.detail}</span></span>
    </button>; })}</div>
    <button type="button" onClick={() => void onLogout()} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[16px] border border-rose-300/15 bg-rose-300/[0.06] px-4 text-[14px] font-semibold text-rose-100/75"><LogOut className="h-[17px] w-[17px]" /> Выйти из кабинета организатора</button>
  </div>;
};

export default MoreCRM;
