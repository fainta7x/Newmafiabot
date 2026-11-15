import { createPortal } from 'react-dom';
import { useState } from 'react';
import type { LiveReveal, RevealColor } from '../../lib/liveReveals.ts';
import { SeatBadge } from './SeatBadge.tsx';

/**
 * Owner, 2026-11-15: judges forget to record that a black player claimed to be the Sheriff and which checks he announced.
 * Before the game is closed the engine asks about every black player at once. The checks go in order — one a night — so
 * they read as «Круг 1», «Круг 2»…; what was already recorded during the game is shown and can be corrected.
 */
export function EndGameRevealsOverlay({ blacks, nicknameOf, roleLabelOf, seats, reveals, onReveal, onRemoveReveal, onSetCheck, onRemoveCheck, onDone }: {
  blacks: number[];
  nicknameOf: (seat: number) => string;
  roleLabelOf: (seat: number) => string;
  seats: number[];
  reveals: LiveReveal[];
  onReveal: (seat: number) => void;
  onRemoveReveal: (seat: number) => void;
  onSetCheck: (seat: number, target: number, color: RevealColor) => void;
  onRemoveCheck: (seat: number, target: number) => void;
  onDone: () => void;
}) {
  const [adding, setAdding] = useState<{ seat: number; color: RevealColor } | null>(null);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[125] flex items-center justify-center overflow-y-auto bg-black/82 p-4 backdrop-blur-md">
      <div data-testid="live-end-reveals" role="dialog" aria-label="Вскрытия чёрных" className="w-full max-w-md space-y-4 rounded-[24px] border border-white/10 bg-[#121318] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.58)]">
        <div className="space-y-1.5 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/62">Перед завершением игры</div>
          <h2 className="text-lg font-semibold text-white">Вскрывался ли кто-то из чёрных шерифом?</h2>
          <p className="text-xs text-white/45">Отметьте вскрытие и объявленные проверки по кругам. Не было — просто «Готово».</p>
        </div>
        <div className="space-y-3">
          {blacks.map((seat) => {
            const reveal = reveals.find((item) => item.seat === seat) || null;
            return (
              <div key={seat} data-testid={`live-end-reveal-${seat}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-center gap-2">
                  <SeatBadge seat={seat} />
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold text-white">{nicknameOf(seat) || `Игрок ${seat}`} <span className="text-xs font-normal text-rose-300">{roleLabelOf(seat)}</span></span>
                  <button type="button" data-testid={`live-end-reveal-toggle-${seat}`} aria-pressed={Boolean(reveal)} onClick={() => (reveal ? onRemoveReveal(seat) : onReveal(seat))}
                    className={`min-h-10 rounded-xl px-3 text-xs font-semibold ${reveal ? 'bg-amber-400 text-[#111]' : 'border border-white/15 text-white/75'}`}>{reveal ? 'Вскрылся' : 'Не вскрывался'}</button>
                </div>
                {reveal ? (
                  <div className="mt-3 space-y-2">
                    {reveal.checks.map((check, index) => (
                      <div key={check.target} className="flex min-h-10 items-center gap-2 rounded-xl bg-black/25 px-3 text-sm text-white">
                        <span className="w-14 text-xs text-white/50">Круг {index + 1}</span>
                        <SeatBadge seat={check.target} size="sm" />
                        <span className={`flex-1 text-xs font-semibold ${check.color === 'red' ? 'text-rose-300' : 'text-white'}`}>{check.color === 'red' ? 'красный' : 'чёрный'}</span>
                        <button type="button" aria-label={`Убрать проверку #${check.target}`} onClick={() => onRemoveCheck(seat, check.target)} className="h-8 w-8 rounded-lg text-white/50">✕</button>
                      </div>
                    ))}
                    {adding?.seat === seat ? (
                      <div className="space-y-2 rounded-xl border border-white/10 p-2">
                        <div className="text-xs text-white/55">Круг {reveal.checks.length + 1}: кого назвал {adding.color === 'red' ? 'красным' : 'чёрным'}?</div>
                        <div className="grid grid-cols-5 gap-1.5">
                          {seats.filter((target) => target !== seat && !reveal.checks.some((check) => check.target === target)).map((target) => (
                            <button key={target} type="button" data-testid={`live-end-reveal-target-${seat}-${target}`} onClick={() => { onSetCheck(seat, target, adding.color); setAdding(null); }} className="h-11 rounded-lg border border-white/15 bg-white/[0.06] font-mono text-sm font-bold text-white">{target}</button>
                          ))}
                        </div>
                        <button type="button" onClick={() => setAdding(null)} className="min-h-9 w-full text-xs text-white/55">Отмена</button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" data-testid={`live-end-reveal-add-red-${seat}`} onClick={() => setAdding({ seat, color: 'red' })} className="min-h-10 rounded-xl border border-rose-400/40 text-xs font-semibold text-rose-300">+ Назвал красным</button>
                        <button type="button" data-testid={`live-end-reveal-add-black-${seat}`} onClick={() => setAdding({ seat, color: 'black' })} className="min-h-10 rounded-xl border border-white/25 text-xs font-semibold text-white">+ Назвал чёрным</button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <button type="button" data-testid="live-end-reveals-done" onClick={onDone} className="min-h-12 w-full rounded-2xl bg-white px-4 text-sm font-semibold text-[#090a0d]">Готово — завершить игру</button>
      </div>
    </div>,
    document.body,
  );
}
