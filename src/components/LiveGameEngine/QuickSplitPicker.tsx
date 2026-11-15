import { SeatBadge } from './SeatBadge.tsx';
import { cancelQuickSplitPick, pickQuickSplitSeat } from './quickSplitPickStore.ts';

/**
 * «Между кем попил?» (owner, 2026-11-15): the candidates as large cards, like the list under the voting — badge, nickname —
 * chosen by a tap or by their digits on the keyboard. Two chosen: the votes follow the split scheme and the 30-second speeches start.
 */
export function QuickSplitPicker({ nominees, picked, nicknameOf, onSplit, compact = false }: {
  nominees: number[];
  picked: number[];
  nicknameOf: (seat: number) => string;
  onSplit: (pair: [number, number]) => void;
  compact?: boolean;
}) {
  return (
    <div data-testid="live-quick-split-picker" className="space-y-3">
      <div className="text-center">
        <div className={`${compact ? 'text-sm' : 'text-lg'} font-semibold text-white`}>Между кем попил?</div>
        <div className="mt-1 text-xs text-white/50">Нажмите двоих — или их цифры на клавиатуре</div>
      </div>
      <div className="grid gap-2">
        {nominees.map((seat) => {
          const chosen = picked.includes(seat);
          return (
            <button
              key={seat}
              type="button"
              data-testid={`live-quick-split-seat-${seat}`}
              aria-pressed={chosen}
              onClick={() => { const pair = pickQuickSplitSeat(seat); if (pair) onSplit(pair); }}
              className={`flex ${compact ? 'min-h-11' : 'min-h-14'} w-full items-center gap-3 rounded-2xl border px-3 text-left ${chosen ? 'border-amber-400 bg-amber-500/15' : 'border-white/12 bg-white/[0.05]'}`}
            >
              <SeatBadge seat={seat} />
              <span className="min-w-0 flex-1 break-words text-sm font-semibold text-white">{nicknameOf(seat) || `Игрок ${seat}`}</span>
              {chosen ? <span className="text-xs font-semibold text-amber-300">выбран</span> : null}
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-snug text-white/45">Голоса расставятся по схеме попила, и сразу начнутся речи по 30 секунд.</p>
      <button type="button" data-testid="live-quick-split-cancel" onClick={cancelQuickSplitPick} className="min-h-11 w-full rounded-2xl border border-white/12 bg-black/20 text-sm font-semibold text-white/80">Отмена</button>
    </div>
  );
}
