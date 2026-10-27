import { createPortal } from "react-dom";
import { SEAT_COLORS } from "./seatColors.ts";

interface VoteByNumbersOverlayProps {
  /** The candidates of this voting, in the order they are counted. */
  nominees: number[];
  nomineeIndex: number;
  votesByPlayer: Record<number, number>;
  /** Players at the table who vote. */
  voterSeats: number[];
  tableSize: number;
  nicknameOf: (seat: number) => string;
  remaining: number;
  busy?: boolean;
  onToggle: (voterSlot: number) => void;
  onSelectNominee: (index: number) => void;
  onFinish: () => void;
  onClose: () => void;
}

/**
 * The second way to count a voting (owner, 2026-10-27): like the best-move («ЛХ») window, one candidate at a time with the
 * seat numbers; the judge taps who voted for this candidate. A player who already voted for another candidate is dimmed and
 * cannot be chosen; going back to that candidate frees the vote. The seat cards at the table keep working as before.
 */
export function VoteByNumbersOverlay({
  nominees, nomineeIndex, votesByPlayer, voterSeats, tableSize, nicknameOf, remaining, busy = false,
  onToggle, onSelectNominee, onFinish, onClose,
}: VoteByNumbersOverlayProps) {
  const nominee = nominees[nomineeIndex];
  if (nominee === undefined || typeof document === 'undefined') return null;
  const isLast = nomineeIndex >= nominees.length - 1;
  const voters = new Set(voterSeats);
  const forThis = voterSeats.filter((seat) => votesByPlayer[seat] === nominee).length;
  const nickname = nicknameOf(nominee);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/82 p-4 backdrop-blur-md">
      <div data-testid="live-vote-numbers-sheet" role="dialog" aria-label="Голоса цифрами" className="w-full max-w-md space-y-4 rounded-[24px] border border-white/10 bg-[#121318] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.58)]">
        <div className="space-y-1.5 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/62">Кандидат {nomineeIndex + 1} из {nominees.length}</div>
          <h2 className="text-lg font-semibold text-white">За #{nominee}{nickname ? ` ${nickname}` : ''} проголосовали</h2>
          <p className="text-xs text-white/45">Голосов: <b className="text-white/80">{forThis}</b> · осталось: <b className="text-white/80">{remaining}</b></p>
          {isLast && <p className="text-xs text-white/30">Остаток уйдёт к #{nominee} при подведении итога.</p>}
        </div>
        <div className="mx-auto grid max-w-sm grid-cols-5 gap-2">
          {Array.from({ length: tableSize }, (_, index) => index + 1).map((seat) => {
            const votesFor = votesByPlayer[seat];
            const atTable = voters.has(seat);
            const mine = atTable && votesFor === nominee;
            const elsewhere = atTable && votesFor !== undefined && votesFor !== nominee;
            return (
              <button
                key={seat}
                type="button"
                data-seat={seat}
                aria-label={`Голос #${seat}`}
                aria-pressed={mine}
                disabled={!atTable || elsewhere || busy}
                onClick={() => onToggle(seat)}
                // A chosen voter wears the candidate's seat colour, like the seat cards (owner, 2026-10-27).
                style={{
                  opacity: !atTable ? 0.15 : elsewhere ? 0.3 : 1,
                  ...(mine && SEAT_COLORS[nominee] ? { background: SEAT_COLORS[nominee].fill, borderColor: SEAT_COLORS[nominee].line, color: nominee === 3 ? '#111827' : '#fff' } : {}),
                }}
                className={`relative h-14 rounded-xl border font-mono text-lg font-bold ${mine
                  ? 'ring-2 ring-white/70'
                  : 'border-white/15 bg-white/[0.06] text-white/85'}`}
              >
                {seat}
                {elsewhere && <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-semibold text-white/35">→#{votesFor}</span>}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={nomineeIndex === 0 || busy} onClick={() => onSelectNominee(nomineeIndex - 1)} className="min-h-11 rounded-2xl border border-white/[0.10] bg-black/30 px-3 text-xs font-semibold text-white/72 disabled:opacity-35">← Назад</button>
          {isLast ? (
            <button type="button" data-testid="live-vote-numbers-finish" disabled={busy} onClick={onFinish} className="min-h-11 rounded-2xl bg-white px-3 text-xs font-semibold text-[#090a0d] disabled:opacity-35">Подвести итог</button>
          ) : (
            <button type="button" data-testid="live-vote-numbers-next" disabled={busy} onClick={() => onSelectNominee(nomineeIndex + 1)} className="min-h-11 rounded-2xl bg-white px-3 text-xs font-semibold text-[#090a0d] disabled:opacity-35">Далее →</button>
          )}
          <button type="button" onClick={onClose} className="col-span-2 min-h-10 rounded-2xl border border-white/[0.07] bg-black/20 px-3 text-xs font-semibold text-white/46">Карточками за столом</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
