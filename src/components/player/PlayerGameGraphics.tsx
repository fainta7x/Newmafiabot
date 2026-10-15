import { Heart } from 'lucide-react';
import { PistolIcon } from '../LiveGameEngine/Icons';
export { GameRoleMark as RoleMark } from '../ui/GameRole.tsx';

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
