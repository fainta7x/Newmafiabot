import { useMemo, useState } from 'react';
import { GAME_ROLES, type GameRole } from '../../shared/gameRoles.ts';
import { isSupportedTableSize, tableRoleCounts } from '../../lib/tableComposition.ts';

type Seat = { seat_number: number; nickname: string };
type Drawn = { seat: number; cardId: number; role: GameRole };
type Props = {
  seats: Seat[];
  onCancel: () => void;
  onComplete: (assignments: Record<number, GameRole>) => void;
};
type Card = { id: number; role: GameRole };

function makeDeck(size: number): Card[] {
  const counts = tableRoleCounts(size);
  const roles = (Object.keys(counts) as GameRole[]).flatMap((role) =>
    Array.from({ length: counts[role] }, () => role),
  );
  const deck = roles.map((role, id) => ({ id, role }));
  // Fisher–Yates with unbiased secure integer sampling, not Math.random.
  const randomInt = (max: number): number => {
    const array = new Uint32Array(1);
    const limit = Math.floor(4294967296 / max) * max;
    let value: number;
    do {
      crypto.getRandomValues(array);
      value = array[0];
    } while (value >= limit);
    return value % max;
  };
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export default function VirtualRoleDeal({ seats, onCancel, onComplete }: Props) {
  const orderedSeats = useMemo(() => [...seats].sort((a, b) => a.seat_number - b.seat_number), [seats]);
  const size = orderedSeats.length;
  // The component is only mounted once the confirmed roster has a supported size.
  const [deck, setDeck] = useState<Card[]>(() => makeDeck(size));
  const [history, setHistory] = useState<(Drawn & { previousDeck: Card[] })[]>([]);
  const [seat, setSeat] = useState<number>(() => orderedSeats[0]?.seat_number ?? 1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showRole, setShowRole] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const assigned = new Set(history.map((entry) => entry.seat));
  const nextSeat = orderedSeats.find((entry) => !assigned.has(entry.seat));
  const active = assigned.has(seat) ? nextSeat?.seat_number : seat;
  const current = orderedSeats.find((entry) => entry.seat_number === active);
  const selected = deck.find((entry) => entry.id === selectedId);
  const assignments = Object.fromEntries(history.map((entry) => [entry.seat, entry.role])) as Record<number, GameRole>;
  const complete = history.length === size && deck.length === 0;
  const confirmCard = () => {
    if (!showRole || !selected || active === undefined || assigned.has(active)) return;
    const nextHistory = [...history, { seat: active, cardId: selected.id, role: selected.role, previousDeck: deck }];
    setHistory(nextHistory);
    setDeck((old) => old.filter((card) => card.id !== selected.id));
    setSelectedId(null);
    setShowRole(false);
    const next = orderedSeats.find((entry) => !nextHistory.some((done) => done.seat === entry.seat));
    if (next) setSeat(next.seat_number);
  };
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setDeck(last.previousDeck);
    setHistory(history.slice(0, -1));
    setSeat(last.seat);
    setSelectedId(null);
    setShowRole(false);
  };
  if (!isSupportedTableSize(size)) return null;
  return (
    <div data-testid="virtual-role-deal" className="fixed inset-0 z-[160] overflow-y-auto bg-[#090a0d]/95 p-3 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-lg space-y-3 rounded-3xl border border-white/10 bg-[#121318] p-4 text-white">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">Виртуальная колода</div>
            <h2 className="text-xl font-semibold">Раздача ролей</h2>
            <p className="text-xs text-white/50">Выдано {history.length} из {size}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Закрыть раздачу" className="min-h-11 rounded-xl border border-white/20 px-4">Закрыть</button>
        </header>
        {!complete && (
          <>
            <div className="grid grid-cols-5 gap-1.5" aria-label="Очередность игроков">
              {orderedSeats.map((player) => (
                <button key={player.seat_number} type="button" disabled={assigned.has(player.seat_number) || showRole}
                  onClick={() => { setSeat(player.seat_number); setSelectedId(null); }}
                  aria-pressed={active === player.seat_number}
                  className={`min-h-12 min-w-0 rounded-lg border p-1 text-center text-xs disabled:opacity-30 ${active === player.seat_number ? 'border-white bg-white/15' : 'border-white/10 bg-black/20'}`}>
                  <div>№{player.seat_number}</div>
                  <div className="truncate text-[10px]">{player.nickname}</div>
                </button>
              ))}
            </div>
            <p className="text-sm font-semibold">Выбирает: №{current?.seat_number} {current?.nickname}</p>
            <div className="grid grid-cols-5 gap-2" data-testid="virtual-card-grid">
              {deck.map((card, index) => (
                <button key={card.id} type="button" disabled={showRole} onClick={() => setSelectedId(card.id)}
                  aria-label={`Карта №${index + 1}`} aria-pressed={selectedId === card.id}
                  className={`flex aspect-[0.72] min-w-0 items-center justify-center rounded-xl border text-lg font-semibold ${selectedId === card.id ? 'border-white bg-white/20' : 'border-white/15 bg-black/30'}`}>
                  {selectedId === card.id && showRole ? GAME_ROLES[card.role].label : index + 1}
                </button>
              ))}
            </div>
            {selected && showRole && <div className="rounded-xl border border-white/20 bg-white/10 p-4 text-center text-xl font-semibold" role="status">Роль: {GAME_ROLES[selected.role].label}</div>}
            {selected && !showRole && <button type="button" onClick={() => setShowRole(true)} className="min-h-12 w-full rounded-xl bg-white font-semibold text-black">Открыть карту №{deck.findIndex((entry) => entry.id === selectedId) + 1}</button>}
            {showRole && <button type="button" onClick={confirmCard} className="min-h-12 w-full rounded-xl bg-white font-semibold text-black">Подтвердить роль и продолжить</button>}
          </>
        )}
        {complete && <button type="button" onClick={() => onComplete(assignments)} className="min-h-12 w-full rounded-xl bg-white font-semibold text-black">Все роли выданы — начать игру</button>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={!history.length || showRole} onClick={undo} className="min-h-11 rounded-xl border border-white/20 text-xs disabled:opacity-30">Отменить последнюю карту</button>
          <button type="button" onClick={() => setResetConfirm(true)} className="min-h-11 rounded-xl border border-white/20 text-xs">Перераздать всё</button>
        </div>
        {resetConfirm && <div role="alertdialog" aria-label="Подтвердить перераздачу" className="rounded-xl border border-amber-300/30 p-3">
          <p className="mb-3 text-sm">Удалить текущую раздачу и заново перемешать колоду?</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setResetConfirm(false)} className="min-h-11 rounded-lg border border-white/20">Нет</button>
            <button type="button" onClick={() => { setDeck(makeDeck(size)); setHistory([]); setSeat(orderedSeats[0].seat_number); setSelectedId(null); setShowRole(false); setResetConfirm(false); }} className="min-h-11 rounded-lg bg-white text-black">Да, перераздать</button>
          </div>
        </div>}
      </div>
    </div>
  );
}
