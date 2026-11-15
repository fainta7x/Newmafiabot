import { createPortal } from 'react-dom';
import { SeatBadge } from './SeatBadge.tsx';
import { toggleTableDecisionVoter } from './tableDecisionSelectionStore.ts';

/**
 * «Поднять / оставить» in the same window as the rest of the voting (owner, 2026-11-15): seat numbers, a tap or a digit marks
 * the player voting «поднять», the counter shows the majority needed. The board stays reachable with «Свернуть».
 */
export function RaiseDecisionOverlay({ winners, tableSize, aliveSeats, selected, entered, eligible, majority, onConfirm, onCollapse }: {
  winners: number[];
  tableSize: number;
  aliveSeats: number[];
  selected: number[];
  entered: number;
  eligible: number;
  majority: number;
  onConfirm: () => void;
  onCollapse: () => void;
}) {
  if (typeof document === 'undefined') return null;
  const alive = new Set(aliveSeats);
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/82 p-4 backdrop-blur-md">
      <div data-testid="live-raise-sheet" role="dialog" aria-label="Поднять или оставить" className="w-full max-w-md space-y-4 rounded-[24px] border border-white/10 bg-[#121318] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.58)]">
        <div className="space-y-1.5 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/62">Переголосование · поднять / оставить</div>
          <h2 className="flex flex-wrap items-center justify-center gap-1.5 text-lg font-semibold text-white">Поднять {winners.map((seat, index) => <span key={seat} className="inline-flex items-center gap-1.5">{index > 0 ? (index === winners.length - 1 ? 'и' : ',') : null}<SeatBadge seat={seat} /></span>)}?</h2>
          <p className="text-xs text-white/45">Нажмите тех, кто за «поднять» — или их цифры на клавиатуре</p>
        </div>
        <div className="mx-auto grid max-w-sm grid-cols-5 gap-2">
          {Array.from({ length: tableSize }, (_, index) => index + 1).map((seat) => {
            const atTable = alive.has(seat);
            const on = selected.includes(seat);
            return (
              <button
                key={seat}
                type="button"
                data-seat={seat}
                aria-label={`За поднять #${seat}`}
                aria-pressed={on}
                disabled={!atTable}
                onClick={() => toggleTableDecisionVoter(seat)}
                className={`h-14 rounded-xl border font-mono text-lg font-bold ${on ? 'border-amber-400 bg-amber-400 text-[#111]' : 'border-white/15 bg-white/[0.06] text-white/85'} disabled:opacity-15`}
              >{seat}</button>
            );
          })}
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3">
          <span className="text-sm text-white/75">За «поднять»</span>
          <strong data-testid="live-raise-count" className="font-mono text-lg text-white">{entered} / {eligible} <small className="text-xs font-semibold text-white/45">нужно {majority}</small></strong>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" data-testid="live-raise-collapse" onClick={onCollapse} className="min-h-11 rounded-2xl border border-white/[0.10] bg-black/30 px-3 text-xs font-semibold text-white/72">Свернуть</button>
          <button type="button" data-testid="live-raise-confirm" onClick={onConfirm} className="min-h-11 rounded-2xl bg-white px-3 text-xs font-semibold text-[#090a0d]">Зафиксировать решение</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
