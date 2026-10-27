import React, { useEffect } from 'react';
import { History, LayoutDashboard, Scale, X } from 'lucide-react';
import { Chip, cx, type Tone } from './ui';
import { FitText } from '../../ui/FitText.tsx';

export type ProtocolTab = 'overview' | 'game' | 'players' | 'result' | 'points';

export const TAB_META: Array<{ id: ProtocolTab; label: string; title: string; icon: React.ElementType }> = [
  // Owner, 2026-10-26: «Обзор», «Игроки» and «Итог» repeated each other — they are one place now; «Ход игры» stays.
  // The ids 'players' and 'result' remain as targets of «Что проверить» and lead to that one place.
  { id: 'overview', label: 'Протокол', title: 'Протокол', icon: LayoutDashboard },
  { id: 'game', label: 'Ход игры', title: 'Ход игры', icon: History },
  { id: 'points', label: 'Баллы', title: 'Баллы судьи', icon: Scale },
];

const SAVE_TEXT: Record<Tone, string> = {
  neutral: 'text-white/55', good: 'text-emerald-200/90', warn: 'text-amber-200', bad: 'text-rose-200', info: 'text-sky-200', night: 'text-violet-200',
};

type Props = {
  tab: ProtocolTab;
  onTab: (tab: ProtocolTab) => void;
  title: string;
  subtitle: string;
  confirmed: boolean;
  save: { label: string; tone: Tone };
  attention: number;
  onClose: () => void;
  rail?: React.ReactNode;
  /** Places beyond the four every game has (a tournament adds «Баллы» for the judge's points). */
  extraTabs?: ProtocolTab[];
  children: React.ReactNode;
};

/**
 * Frame of the protocol: one header with the only status that matters (saved or not), four places to go to, and the work
 * area. A phone gets the places at the bottom, under the thumb; a desktop gets them in a rail on the left.
 */
export const ProtocolWindow: React.FC<Props> = ({ tab, onTab, title, subtitle, confirmed, save, attention, onClose, rail, extraTabs = [], children }) => {
  const tabs = TAB_META.filter((item) => item.id !== 'points' || extraTabs.includes('points'));
  // Each place starts at its top, not where the previous one was scrolled to.
  useEffect(() => { const scroller = document.getElementById('protocol-scroll'); if (scroller) scroller.scrollTop = 0; }, [tab]);
  return (
  <div className="fixed inset-0 z-[90] flex flex-col bg-[#090a0d] text-white" data-testid="protocol-window">
    <header className="shrink-0 border-b border-white/8 bg-[rgba(11,12,16,0.92)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1120px] items-center gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FitText as="div" minPx={15} role="heading" aria-level={1} className="min-w-0 text-xl font-semibold leading-7">{title}</FitText>
            <Chip tone={confirmed ? 'good' : 'warn'}>{confirmed ? 'Подтверждена' : 'Черновик'}</Chip>
          </div>
          {/* The table and the judge take a second line on a phone rather than «…» under the save status (2026-10-27). */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-white/50">
            <span className="min-w-0 break-words">{subtitle}</span>
            <span className="shrink-0 text-white/25" aria-hidden="true">·</span>
            <span className={cx('flex shrink-0 items-center gap-1.5 font-medium', SAVE_TEXT[save.tone])} role="status"><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{save.label}</span>
          </div>
        </div>
        <button type="button" aria-label="Закрыть протокол" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-white/75 hover:bg-white/[0.1]"><X className="h-5 w-5" aria-hidden="true" /></button>
      </div>
    </header>

    <div className="mx-auto flex min-h-0 w-full max-w-[1120px] flex-1 lg:gap-6 lg:px-4">
      <aside className="hidden w-60 shrink-0 flex-col gap-4 overflow-y-auto py-5 lg:flex">
        <nav aria-label="Разделы протокола" className="flex flex-col gap-1">
          {tabs.map((item) => {
            const Icon = item.icon;
            const on = item.id === tab;
            return (
              <button key={item.id} type="button" aria-current={on ? 'page' : undefined} onClick={() => onTab(item.id)} className={cx('flex min-h-12 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-semibold transition-colors', on ? 'bg-white/[0.09] text-white' : 'text-white/55 hover:bg-white/[0.05] hover:text-white/80')}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.id === 'overview' && attention > 0 ? <Chip tone="warn" className="min-w-6 justify-center px-2">{attention}</Chip> : null}
              </button>
            );
          })}
        </nav>
        {rail}
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-8 pt-4 lg:px-0 lg:py-5" id="protocol-scroll">
        <div className="mx-auto w-full max-w-[720px]">{children}</div>
      </main>
    </div>

    <nav aria-label="Разделы протокола" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} className="grid shrink-0 gap-1 border-t border-white/8 bg-[rgba(11,12,16,0.95)] px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden">
      {tabs.map((item) => {
        const Icon = item.icon;
        const on = item.id === tab;
        return (
          <button key={item.id} type="button" aria-label={item.label} aria-current={on ? 'page' : undefined} onClick={() => onTab(item.id)} className={cx('relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold transition-colors', on ? 'bg-white/[0.09] text-white' : 'text-white/45')}>
            <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
            {item.label}
            {item.id === 'overview' && attention > 0 ? <span className="absolute right-4 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-300 px-1 text-[11px] font-bold text-[#1a1204]" aria-label={`${attention} к проверке`}>{attention}</span> : null}
          </button>
        );
      })}
    </nav>
  </div>
);
};
