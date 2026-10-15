import { CircleHelp, Heart, Star } from 'lucide-react';
import { MafiaHatIcon, PistolIcon } from '../LiveGameEngine/Icons';

/** The actual role marks used by the game and broadcast, in a compact card silhouette. */
export function RoleMark({ role }: { role?: string | null }) {
  const kind = ({ 'Мирный': 'citizen', 'Мирный житель': 'citizen', 'Шериф': 'sheriff', 'Мафия': 'mafia', 'Дон': 'don' } as Record<string, string>)[role || ''] || role;
  const tone = kind === 'citizen' ? 'border-sky-200/25 bg-sky-200/[.07] text-sky-200' : kind === 'sheriff' ? 'border-amber-200/30 bg-amber-200/[.08] text-amber-200' : kind === 'don' ? 'border-violet-200/30 bg-violet-200/[.08] text-violet-200' : 'border-white/20 bg-white/[.06] text-slate-200';
  return <span aria-hidden="true" className={'relative grid h-12 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,.08)] ' + tone}>
    <span className="absolute inset-x-1 top-1 h-px bg-current opacity-15" />
    {kind === 'don' ? <MafiaHatIcon className="h-7 w-7" /> : kind === 'mafia' ? <PistolIcon className="h-7 w-7" /> : kind === 'sheriff' ? <Star className="h-6 w-6" fill="currentColor" /> : kind === 'citizen' ? <Heart className="h-6 w-6" fill="currentColor" /> : <CircleHelp className="h-5 w-5 opacity-50" />}
  </span>;
}

export function ResultTrack({ value, tone = 'amber' }: { value: number; tone?: 'amber' | 'violet' | 'rose' }) {
  const width = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-white/[.09]"><div className={'h-full rounded-full ' + ({ amber: 'bg-amber-200/75', violet: 'bg-violet-300/75', rose: 'bg-rose-300/75' }[tone])} style={{ width: `${width}%` }} /></div>;
}

/** A single factual team comparison within the existing evening report. */
export function TeamResultGraphic({ red, black }: { red: number; black: number }) {
  const total = Math.max(0, red) + Math.max(0, black);
  return <div className="my-4" aria-label="Счёт команд за вечер">
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      <div className="flex items-center gap-2 text-rose-200"><Heart aria-hidden="true" className="h-5 w-5 shrink-0" fill="currentColor" /><span className="text-sm">Красные</span></div>
      <strong className="text-3xl font-semibold tabular-nums"><span className="text-rose-200">{red}</span><span className="px-2 text-white/35">:</span><span className="text-violet-200">{black}</span></strong>
      <div className="flex items-center justify-end gap-2 text-violet-200"><span className="text-sm">Чёрные</span><PistolIcon className="h-5 w-5 shrink-0" /></div>
    </div>
    <div aria-hidden="true" className="mt-3 flex h-2 gap-1 overflow-hidden rounded-full bg-white/[.06]">
      {red > 0 && <span className="rounded-full bg-gradient-to-r from-rose-300/45 to-rose-300" style={{ width: `${red / total * 100}%` }} />}
      {black > 0 && <span className="rounded-full bg-gradient-to-r from-violet-300 to-violet-300/45" style={{ width: `${black / total * 100}%` }} />}
    </div>
  </div>;
}
