import { requestJudgeGameMusicStart, requestJudgeGameMusicStop } from '../JudgeGameMusicController.tsx';
import { useEffect, useMemo, useState } from 'react';
import { GAME_ROLES, type GameRole } from '../../shared/gameRoles.ts';
import { isSupportedTableSize, tableRoleCounts } from '../../lib/tableComposition.ts';

type Seat = { seat_number: number; nickname: string };
type Drawn = { seat: number; cardId: number; role: GameRole };
type Props = {
  seats: Seat[];
  onCancel: () => void;
  onComplete: (assignments: Record<number, GameRole>) => void | Promise<void>;
  finishLabel?: string;
};
type Card = { id: number; role: GameRole };

function makeDeck(size: number): Card[] {
  if (!isSupportedTableSize(size)) return [];
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

export default function VirtualRoleDeal({ seats, onCancel, onComplete, finishLabel='Все роли выданы — начать игру' }: Props) {
  const orderedSeats = useMemo(() => [...seats].sort((a, b) => a.seat_number - b.seat_number), [seats]);
  const size = orderedSeats.length;
  // The component is only mounted once the confirmed roster has a supported size.
  const [deck, setDeck] = useState<Card[]>(() => makeDeck(size));
  const [history, setHistory] = useState<(Drawn & { previousDeck: Card[] })[]>([]);
  const [seat, setSeat] = useState<number>(() => orderedSeats[0]?.seat_number ?? 1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showRole, setShowRole] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [closeConfirm,setCloseConfirm]=useState(false);
  const [started,setStarted]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>()=>{requestJudgeGameMusicStop();},[]);
  const assigned = new Set(history.map((entry) => entry.seat));
  const nextSeat = orderedSeats.find((entry) => !assigned.has(entry.seat_number));
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
    const next = orderedSeats.find((entry) => !nextHistory.some((done) => done.seat === entry.seat_number));
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
  const close=()=>{requestJudgeGameMusicStop();onCancel();};
  const finish=async()=>{
    if(saving||!complete)return;setSaving(true);setError('');
    try{await onComplete(assignments);requestJudgeGameMusicStop();}catch(error:any){setError(error?.message||'Не удалось сохранить роли');}finally{setSaving(false);}
  };
  if (!isSupportedTableSize(size)) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Раздача виртуальных ролей" data-testid="virtual-role-deal" className="fixed inset-0 z-[160] bg-[#090a0d]/95 backdrop-blur-xl">
      <div className={`absolute inset-x-0 top-0 overflow-y-auto p-3 ${started ? 'bottom-[calc(88px+env(safe-area-inset-bottom))]' : 'bottom-0'}`}>
      <div className="mx-auto w-full max-w-lg space-y-3 rounded-3xl border border-white/10 bg-[#121318] p-4 text-white">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">Виртуальная колода</div>
            <h2 className="text-xl font-semibold">Раздача ролей</h2>
            <p className="text-xs text-white/50">Выдано {history.length} из {size}</p>
          </div>
          <button type="button" disabled={saving} onClick={()=>{if(history.length||showRole)setCloseConfirm(true);else close();}} aria-label="Закрыть раздачу" className="min-h-11 rounded-xl border border-white/20 px-4">Закрыть</button>
        </header>
        {!started ? <div className="space-y-3">
          <p className="text-sm leading-6">Карты уже перемешаны. Игрок выбирает карту, ведущий открывает и подтверждает роль.</p>
          <button type="button" onClick={()=>{requestJudgeGameMusicStart(undefined,{modal:true});setStarted(true);}} className="min-h-12 w-full rounded-xl bg-white px-3 py-3 text-sm font-semibold text-black">Включить музыку и начать раздачу</button>
        </div>:null}
        {started && !complete && (
          <>
            <div className="grid grid-cols-5 gap-1.5" aria-label="Очередность игроков">
              {orderedSeats.map((player) => (
                <button key={player.seat_number} type="button" disabled={assigned.has(player.seat_number) || showRole}
                  onClick={() => { setSeat(player.seat_number); setSelectedId(null); }}
                  aria-pressed={active === player.seat_number}
                  className={`min-h-12 min-w-0 rounded-lg border p-1 text-center text-xs disabled:opacity-30 ${active === player.seat_number ? 'border-white bg-white/15' : 'border-white/10 bg-black/20'}`}>
                  <div>№{player.seat_number}</div>
                  <div className="break-words text-[10px]">{player.nickname}</div>
                </button>
              ))}
            </div>
            <p className="text-sm font-semibold">Выбирает: №{current?.seat_number} {current?.nickname}</p>
            <div className="flex gap-2 overflow-x-auto py-2" data-testid="virtual-card-grid" aria-label="Закрытые карты — прокрутите ряд">
              {deck.map((card, index) => (
                <button key={card.id} type="button" disabled={showRole} onClick={() => setSelectedId(card.id)}
                  aria-label={`Карта №${index + 1}`} aria-pressed={selectedId === card.id}
                  className={`flex h-24 w-[68px] shrink-0 items-center justify-center rounded-xl border text-lg font-semibold ${selectedId === card.id ? 'border-white bg-white/20' : 'border-white/15 bg-black/30'}`}>
                  {index + 1}
                </button>
              ))}
            </div>
            {selected && showRole && <div className="rounded-xl border border-white/20 bg-white/10 p-4 text-center text-xl font-semibold" role="status">Роль: {GAME_ROLES[selected.role].label}</div>}
            {selected && !showRole && <button type="button" onClick={() => setShowRole(true)} className="min-h-12 w-full rounded-xl bg-white font-semibold text-black">Открыть карту №{deck.findIndex((entry) => entry.id === selectedId) + 1}</button>}
            {showRole && <button type="button" onClick={confirmCard} className="min-h-12 w-full rounded-xl bg-white font-semibold text-black">Подтвердить роль и продолжить</button>}
          </>
        )}
        {complete && <button type="button" disabled={saving} onClick={()=>void finish()} className="min-h-12 w-full rounded-xl bg-white px-3 py-3 text-sm font-semibold text-black disabled:opacity-50">{saving?'Сохраняем роли…':finishLabel}</button>}
        {error?<p role="alert" className="text-sm text-rose-300">{error}</p>:null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={!history.length || showRole || saving} onClick={undo} className="min-h-11 rounded-xl border border-white/20 text-xs disabled:opacity-30">Отменить последнюю карту</button>
          <button type="button" disabled={saving||!started} onClick={() => setResetConfirm(true)} className="min-h-11 rounded-xl border border-white/20 text-xs">Перераздать всё</button>
        </div>
        {closeConfirm && <div role="alertdialog" aria-label="Прервать раздачу" className="space-y-3 rounded-xl border border-amber-300/30 p-3">
          <p className="text-sm leading-6">Закрыть раздачу? Открытые и подтверждённые карты будут сброшены. При следующем открытии колода перемешается заново.</p>
          <button type="button" onClick={()=>setCloseConfirm(false)} className="min-h-11 w-full rounded-lg border border-white/20 px-3 py-2">Продолжить раздачу</button>
          <button type="button" onClick={close} className="min-h-11 w-full rounded-lg bg-white px-3 py-2 text-black">Подтвердить сброс и закрыть</button>
        </div>}
        {resetConfirm && <div role="alertdialog" aria-label="Подтвердить перераздачу" className="rounded-xl border border-amber-300/30 p-3">
          <p className="mb-3 text-sm">Удалить текущую раздачу и заново перемешать колоду?</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setResetConfirm(false)} className="min-h-11 rounded-lg border border-white/20">Нет</button>
            <button type="button" onClick={() => { setDeck(makeDeck(size)); setHistory([]); setSeat(orderedSeats[0].seat_number); setSelectedId(null); setShowRole(false); setResetConfirm(false); }} className="min-h-11 rounded-lg bg-white text-black">Да, перераздать</button>
          </div>
        </div>}
      </div>
      </div>
    </div>
  );
}
