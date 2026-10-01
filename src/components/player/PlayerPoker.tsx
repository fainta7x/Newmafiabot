import { useEffect, useState, type CSSProperties } from 'react';

type Card = { rank: string; suit: string };
type Player = { id: string; nickname: string; seat: number; chips: number; committed?: number; folded?: boolean; all_in?: boolean; is_bot?: boolean; sitting_out?: boolean };
type Lobby = { id: string; title: string; status: string; players: Player[]; hand?: any };

/** Ranks as on an ordinary deck: A K Q J 10 … — «T» for ten reads as «туз» in Russian. */
const rankLabel = (rank: string) => (rank === 'T' ? '10' : rank);
const suitSymbol = (suit: string) => ({ hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit] || suit);
const cardColor = (suit: string) => suit === 'hearts' || suit === 'diamonds' ? 'text-[#d92f45]' : 'text-[#101116]';
/**
 * Seats sit on the chairs of the table picture (940×1672): one at the top, three on each side and
 * the viewer at the bottom. Index 0 is always the viewer; the rest go clockwise.
 */
const CHAIRS = {
  bottom: { x: 50, y: 88 }, lowerLeft: { x: 7, y: 71 }, left: { x: 6, y: 34 }, upperLeft: { x: 17, y: 16 },
  top: { x: 50, y: 11 }, upperRight: { x: 83, y: 16 }, right: { x: 94, y: 34 }, lowerRight: { x: 93, y: 71 },
} as const;
const LAYOUTS: Record<number, Array<keyof typeof CHAIRS>> = {
  1: ['bottom'],
  2: ['bottom', 'top'],
  3: ['bottom', 'upperLeft', 'upperRight'],
  4: ['bottom', 'left', 'top', 'right'],
  5: ['bottom', 'lowerLeft', 'upperLeft', 'upperRight', 'lowerRight'],
  6: ['bottom', 'lowerLeft', 'upperLeft', 'top', 'upperRight', 'lowerRight'],
  7: ['bottom', 'lowerLeft', 'left', 'upperLeft', 'upperRight', 'right', 'lowerRight'],
  8: ['bottom', 'lowerLeft', 'left', 'upperLeft', 'top', 'upperRight', 'right', 'lowerRight'],
};
const seatLayout = (count: number) => (LAYOUTS[Math.min(8, Math.max(1, count))] || LAYOUTS[8]).map((name) => CHAIRS[name]);
/** Viewer first, then the others clockwise by seat number starting after the viewer. */
const seatOrder = (players: Player[], viewerId: string | null) => {
  const sorted = [...players].sort((a, b) => a.seat - b.seat);
  const start = Math.max(0, sorted.findIndex((player) => player.id === viewerId));
  return [...sorted.slice(start), ...sorted.slice(0, start)];
};
/** Bets lie on the felt between the player and the pot. */
const betSpot = (spot: { x: number; y: number }) => {
  const side = Math.abs(spot.x - 50) > 25;
  if (side && spot.y > 30 && spot.y < 60) return { x: spot.x + (50 - spot.x) * 0.62, y: spot.y + 9.5 };
  if (spot.y > 80) return { x: 50, y: 70 };
  if (spot.y > 60) return { x: spot.x + (50 - spot.x) * (side ? 0.62 : 0.3), y: 64 };
  if (spot.x > 45 && spot.x < 55) return { x: 50, y: spot.y + 14 };
  return { x: spot.x + (spot.x < 50 ? 15 : -15), y: spot.y + 15 };
};
/** Time left for the current move: the base time first, then the reserve, like poker rooms. */
const turnTimer = (hand: any) => {
  const base = Number(hand?.turn_remaining?.base_seconds || 0);
  const reserve = Number(hand?.turn_remaining?.reserve_seconds || 0);
  const baseTotal = Number(hand?.base_turn_seconds || 20);
  const reserveTotal = Number(hand?.max_reserve_seconds || 60);
  return base > 0
    ? { reserve: false, seconds: base, share: Math.min(1, base / baseTotal) }
    : { reserve: true, seconds: reserve, share: Math.min(1, reserve / reserveTotal) };
};

function TimerBar({ timer, thin = false }: { timer: { reserve: boolean; seconds: number; share: number }; thin?: boolean }) {
  const colour = timer.reserve ? 'bg-orange-400' : timer.share < 0.3 ? 'bg-amber-300' : 'bg-emerald-400';
  if (thin) return <div className="-mx-1.5 -mt-1 mb-0.5 h-1 bg-white/10"><div className={`h-full ${colour} transition-[width] duration-700 ease-linear`} style={{ width: `${timer.share * 100}%` }} /></div>;
  return <div>
    <div className="mb-0.5 flex justify-between text-[10px] font-semibold"><span className={timer.reserve ? 'text-orange-300' : 'text-emerald-200'}>{timer.reserve ? 'Резервное время' : 'Ваш ход'}</span><span className="tabular-nums text-white/80">{timer.seconds} с</span></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${colour} transition-[width] duration-700 ease-linear`} style={{ width: `${timer.share * 100}%` }} /></div>
  </div>;
}

const streetName = (street: string) => ({ preflop: 'Префлоп', flop: 'Флоп', turn: 'Тёрн', river: 'Ривер', showdown: 'Вскрытие', finished: 'Вскрытие' }[street] || '');
const cardKey = (card: Card) => `${card.rank}${card.suit}`;
const winningKeys = (hand: any) => new Set<string>((hand?.winning_cards || []).map(cardKey));

/**
 * Quick bet sizes like in poker rooms. Before the flop: 2.5/3/4 big blinds when nobody raised,
 * otherwise 2.5×/3× the raise. After the flop: parts of the pot (a pot-size raise counts the call).
 * Every size is a «raise to» total, kept between the minimum raise and all-in.
 */
const betPresets = (hand: any, actions: any) => {
  const min = Number(actions.min_bet_total || 0);
  const max = Number(actions.max_bet_total || 0);
  const bb = Number(hand.big_blind || 20);
  const currentBet = Number(hand.current_bet || 0);
  const toCall = Number(actions.to_call || 0);
  const pot = Number(hand.pot || 0);
  const step = Math.max(1, Math.round(bb / 2));
  const fit = (value: number) => Math.min(max, Math.max(min, Math.round(value / step) * step));
  const options: Array<{ label: string; amount: number }> = [{ label: 'Мин', amount: min }];
  if (hand.street === 'preflop') {
    if (currentBet <= bb) options.push({ label: '2.5 ББ', amount: fit(bb * 2.5) }, { label: '3 ББ', amount: fit(bb * 3) }, { label: '4 ББ', amount: fit(bb * 4) });
    else options.push({ label: '×2.5', amount: fit(currentBet * 2.5) }, { label: '×3', amount: fit(currentBet * 3) }, { label: 'Банк', amount: fit(currentBet + pot + toCall) });
  } else {
    options.push({ label: '½ банка', amount: fit(currentBet + (pot + toCall) / 2) }, { label: '¾ банка', amount: fit(currentBet + (pot + toCall) * 0.75) }, { label: 'Банк', amount: fit(currentBet + pot + toCall) });
  }
  options.push({ label: 'Олл-ин', amount: max });
  return options;
};

function SeatMarkers({ dealer, small, big }: { dealer: boolean; small: boolean; big: boolean; inline?: boolean }) {
  // Flat, crisp position buttons read better on the dark felt than the 2.5D pictures.
  const markers = [
    dealer && { key: 'D', label: 'Дилер', className: 'bg-[radial-gradient(circle_at_35%_30%,#ffffff,#d9d4c7)] text-black' },
    small && { key: 'SB', label: 'Малый блайнд', className: 'bg-[radial-gradient(circle_at_35%_30%,#6aa8ff,#1f4fae)] text-white' },
    big && { key: 'BB', label: 'Большой блайнд', className: 'bg-[radial-gradient(circle_at_35%_30%,#ffe08a,#c58a1c)] text-black' },
  ].filter(Boolean) as Array<{ key: string; label: string; className: string }>;
  if (!markers.length) return null;
  return <span className="flex gap-1">{markers.map((marker) => <span key={marker.key} aria-label={marker.label} title={marker.label} className={`grid h-5 w-5 place-items-center rounded-full border border-white/85 text-[8px] font-black shadow-[0_3px_6px_rgba(0,0,0,.7)] ${marker.className}`}>{marker.key}</span>)}</span>;
}

const CHIP_DENOMINATIONS = [1000, 500, 100, 50, 25, 10, 5, 1] as const;

const chipBreakdown = (amount: number) => {
  let rest = Math.max(0, Math.floor(Number(amount) || 0));
  const chips: Array<{ denomination: number; count: number }> = [];
  for (const denomination of CHIP_DENOMINATIONS) {
    let count = 0;
    while (rest >= denomination) {
      count += 1;
      rest -= denomination;
    }
    if (count) chips.push({ denomination, count });
  }
  return chips;
};

const formatChipCount = (amount: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.max(0, Number(amount) || 0));

function SeatStack({ amount, hero = false }: { amount: number; hero?: boolean }) {
  return <span className={`poker-seat-stack ${hero ? 'poker-seat-stack--hero' : ''}`}><span aria-hidden="true" className="poker-seat-stack-chip" />{formatChipCount(amount)}</span>;
}


/** The move tag above a seat, coloured like poker rooms: fold red, call green, bet/raise gold, all-in crimson. */
const actionWord = (type: string) => ({ fold: 'Пас', check: 'Чек', call: 'Колл', bet: 'Бет', raise: 'Рейз', all_in: 'Олл-ин' }[type] || '');
const actionTag = (type: string) => ({
  fold: 'bg-[#7c1d2b] text-white',
  check: 'bg-slate-600 text-white',
  call: 'bg-[#0f8a61] text-white',
  bet: 'bg-[#e0b155] text-black',
  raise: 'bg-[#e0b155] text-black',
  all_in: 'bg-[#c1123a] text-white',
}[type] || 'bg-black text-white');

function PlayingCard({ card, small = false, tiny = false, board = false }: { card: Card; small?: boolean; tiny?: boolean; board?: boolean }) {
  const suit = suitSymbol(card.suit);
  if (tiny) return <span className={`relative grid h-10 w-7 shrink-0 place-items-center rounded-md bg-[#f7f3ea] text-[11px] font-black leading-none shadow-[0_4px_8px_rgba(0,0,0,.45)] ${cardColor(card.suit)}`}><span>{rankLabel(card.rank)}<br />{suit}</span></span>;
  return <span className={`poker-card-face relative shrink-0 overflow-hidden rounded-[7px] font-black ${cardColor(card.suit)} ${board ? 'h-[60px] w-[43px]' : small ? 'h-14 w-10' : 'h-[78px] w-[56px]'}`}>
    <span className={`absolute left-[17%] top-[13%] leading-[.8] ${small ? 'text-[11px]' : board ? 'text-[13px]' : 'text-base'}`}>{rankLabel(card.rank)}<small className="mt-0.5 block text-[.72em]">{suit}</small></span>
    <span className={`absolute inset-0 grid place-items-center ${small ? 'text-xl' : board ? 'text-2xl' : 'text-4xl'}`}>{suit}</span>
    <span className={`absolute bottom-[13%] right-[17%] rotate-180 leading-[.8] ${small ? 'text-[11px]' : board ? 'text-[13px]' : 'text-base'}`}>{rankLabel(card.rank)}<small className="mt-0.5 block text-[.72em]">{suit}</small></span>
  </span>;
}

/** A player's bet on the felt: one chip and the amount, so eight bets never pile up. */
function BetChip({ amount }: { amount: number }) {
  const top = CHIP_DENOMINATIONS.find((value) => amount >= value) || 1;
  return <span className="inline-flex items-center gap-0.5"><img src={`/assets/poker/chips/chip-${top}-v2.webp`} alt="" className="h-6 w-6 object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,.7)]" /><span className="text-[12px] font-black tabular-nums text-white [text-shadow:0_1px_3px_rgba(0,0,0,.95)]">{amount}</span></span>;
}

function ChipAmount({ amount, compact = false }: { amount: number; compact?: boolean }) {
  const stacks = chipBreakdown(amount);
  if (!stacks.length) return null;
  return <div className="inline-flex flex-col items-center">
    <div className={`flex items-end justify-center ${compact ? '-space-x-1.5' : '-space-x-2'}`}>
      {stacks.map(({ denomination, count }) => <span key={denomination} className={`relative block ${compact ? 'h-10 w-7' : 'h-16 w-10'}`}>
        {Array.from({ length: count }).map((_, index) => <img
          key={`${denomination}-${index}`}
          src={`/assets/poker/chips/chip-${denomination}-v2.webp`}
          alt={index === count - 1 ? `Фишки ${denomination}` : ''}
          className={`${compact ? 'h-7 w-7' : 'h-10 w-10'} absolute bottom-0 left-0 object-contain drop-shadow-[0_4px_3px_rgba(0,0,0,.7)]`}
          style={{ zIndex: index + 1, transform: `translateY(-${index * (compact ? 3 : 4)}px)` }}
        />)}
      </span>)}
    </div>
    <span className={`${compact ? '-mt-1 px-1.5 py-px text-[8px]' : '-mt-1 px-3 py-1 text-[11px]'} relative z-20 rounded-full border border-amber-200/20 bg-black/80 font-bold text-amber-100 shadow-lg`}>{amount}</span>
  </div>;
}

export default function PlayerPoker({ onExit }: { onExit?: () => void }) {
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [title, setTitle] = useState('Открытая покерная комната');
  const [error, setError] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState(100);

  const readBody = async (response: Response) => {
    // A restart or a proxy error answers with an HTML page, not JSON: say it plainly and keep polling.
    const body = await response.json().catch(() => null);
    if (!body) throw new Error(response.ok ? 'Сервер ответил непонятно, пробуем ещё раз…' : 'Нет связи с сервером, пробуем ещё раз…');
    if (!response.ok) throw new Error(body.error || 'Не удалось выполнить действие.');
    setError(null);
    return body;
  };
  const load = async () => setLobbies((await readBody(await fetch('/api/player/poker/lobbies', { credentials: 'include' }))).lobbies || []);
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, []);

  const create = async () => {
    try { setCurrent((await readBody(await fetch('/api/player/poker/lobbies', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }))).lobby); }
    catch (e: any) { setError(e.message); }
  };
  const lobbyAction = async (id: string, method: 'join' | 'start' | 'bot' | 'leave') => {
    try { setCurrent((await readBody(await fetch(`/api/player/poker/lobbies/${id}/${method}`, { method: 'POST', credentials: 'include' }))).lobby); }
    catch (e: any) { setError(e.message); }
  };
  /** Like getting up from a poker table: cards in a running hand are folded, the seat is freed. */
  const leaveTable = async () => {
    if (current?.id) { try { await fetch(`/api/player/poker/lobbies/${current.id}/leave`, { method: 'POST', credentials: 'include' }); } catch { /* the table forgets the player anyway when they never come back */ } }
    setCurrent(null);
    void load().catch(() => {});
  };
  const setAway = async (away: boolean) => {
    try { setCurrent((await readBody(await fetch(`/api/player/poker/lobbies/${current.id}/sit-out`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ away }) }))).lobby); }
    catch (e: any) { setError(e.message); }
  };
  const pokerAction = async (type: string, amount?: number) => {
    try { setCurrent((await readBody(await fetch(`/api/player/poker/lobbies/${current.id}/action`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, amount }) }))).lobby); }
    catch (e: any) { setError(e.message); }
  };

  useEffect(() => {
    if (!current?.id) return undefined;
    let cancelled = false;
    const poll = async () => {
      try { const body = await readBody(await fetch(`/api/player/poker/lobbies/${current.id}`, { credentials: 'include' })); if (!cancelled) setCurrent(body.lobby); }
      catch (e: any) { if (!cancelled) setError(e.message); }
    };
    const timer = window.setInterval(() => void poll(), 900);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [current?.id]);

  const viewerId: string | null = current?.hand?.viewer_id || null;
  const ownCards: Card[] = viewerId ? current.hand.hole_cards[viewerId] || [] : [];
  const turnPlayer = current?.players?.find((player: Player) => player.seat === current?.hand?.current_seat);
  const isMyTurn = Boolean(current?.hand?.is_viewer_turn);
  const seconds = Number(current?.hand?.turn_remaining?.base_seconds || 0) + Number(current?.hand?.turn_remaining?.reserve_seconds || 0);
  const orderedPlayers: Player[] = current?.players ? seatOrder(current.players, viewerId) : [];
  const layout = seatLayout(orderedPlayers.length);
  const actions = current?.hand?.available_actions;
  const smallBlindSeat = current?.hand?.small_blind_seat;
  const bigBlindSeat = current?.hand?.big_blind_seat;
  const winnerIndex = orderedPlayers.findIndex((player) => current?.hand?.winner_ids?.includes(player.id));
  const latestAction = current?.hand?.action_log?.at(-1);
  const latestActionIndex = orderedPlayers.findIndex((player) => player.id === latestAction?.player_id);
  const presets = actions ? betPresets(current.hand, actions) : [];
  const meAway = Boolean(current?.players?.find((player: Player) => player.id === viewerId)?.sitting_out);
  const bigBlind = Number(current?.hand?.big_blind || 20);
  const clampBet = (value: number) => Math.min(Number(actions?.max_bet_total || value), Math.max(Number(actions?.min_bet_total || 0), Math.round(value)));

  useEffect(() => {
    const minimum = Number(actions?.min_bet_total || 0);
    if (minimum > 0) setBetAmount(minimum);
  }, [actions?.min_bet_total, current?.hand?.current_seat, current?.hand?.street]);

  if (current?.hand) {
    const hand = current.hand;
    const finished = hand.street === 'finished';
    const heroIndex = orderedPlayers.findIndex((player) => player.id === viewerId);
    return (
    <main className="flex min-h-[var(--tg-viewport-stable-height,100dvh)] flex-col bg-[#050706] pt-14 text-white" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 158px)' }}>
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-2 border-b border-white/10 bg-[#090a0d]/95 px-3 backdrop-blur"><button type="button" onClick={() => { if (window.confirm('Встать из-за стола? Карты текущей раздачи будут сброшены.')) void leaveTable().then(() => onExit?.()); }} className="min-h-10 shrink-0 rounded-xl border border-white/10 px-3 text-sm text-white/70">← Выйти</button><div className="min-w-0 text-center"><div className="truncate text-sm font-semibold">{current.title}</div><div className="text-[9px] uppercase tracking-[.2em] text-amber-100/45">{streetName(hand.street)} · блайнды {hand.small_blind}/{hand.big_blind}</div></div><div className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${isMyTurn ? 'bg-emerald-400 text-[#06291c]' : 'bg-white/10 text-white/65'}`}>{isMyTurn ? `Ваш ход · ${seconds}с` : finished ? 'Вскрытие' : turnPlayer ? `Ходит ${turnPlayer.nickname}` : '…'}</div></header>
      {error ? <div className="mx-3 mt-2 rounded-xl bg-rose-400/15 px-3 py-2 text-xs text-rose-100">{error}</div> : null}

      <div className="flex flex-1 items-start justify-center px-2 pt-1">
        <section className="relative w-full max-w-[470px] overflow-hidden rounded-[1.75rem] bg-[url('/assets/poker/room-table-v1.webp')] bg-[length:100%_100%] bg-center shadow-[0_25px_65px_rgba(0,0,0,.75)]" style={{ height: 'min(calc(min(100vw - 16px, 470px) / 0.5622), calc(var(--tg-viewport-stable-height, 100dvh) - 222px))' }}>
          <div key={hand.pot} className="poker-chip-flight absolute left-1/2 top-[35.5%] z-[5] -translate-x-1/2 -translate-y-1/2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/35 bg-black/70 py-1 pl-1 pr-3 shadow-[0_6px_16px_rgba(0,0,0,.6)]"><img src="/assets/poker/chips/chip-1000-v2.webp" alt="" className="h-7 w-7 object-contain" /><span className="text-[11px] uppercase tracking-[.14em] text-amber-100/65">Банк</span><span className="text-base font-black tabular-nums text-amber-100">{Number(hand.pot) > 0 ? hand.pot : finished ? hand.last_pot_awarded || 0 : 0}</span></span>
          </div>
          <div className="absolute left-1/2 top-[51%] z-[5] flex -translate-x-1/2 -translate-y-1/2 gap-1">{(hand.board || []).map((card: Card, index: number) => <span key={`${card.rank}-${card.suit}-${index}`} className={`poker-board-card ${finished && winningKeys(hand).has(cardKey(card)) ? 'rounded-lg ring-2 ring-amber-300' : ''}`} style={{ animationDelay: `${index * 110}ms` }}><PlayingCard card={card} board /></span>)}{Array.from({ length: 5 - (hand.board || []).length }).map((_, index) => <span key={`empty-${index}`} className="h-[60px] w-[43px] rounded-lg border border-white/10 bg-black/15" />)}</div>

          {orderedPlayers.slice(0, 8).map((player: Player, index: number) => {
            if (index === heroIndex) return null;
            const spot = layout[index];
            const handPlayer = hand.players?.find((item: Player) => item.id === player.id);
            const active = player.seat === hand.current_seat;
            const winner = hand.winner_ids?.includes(player.id);
            const folded = Boolean(handPlayer?.folded);
            const shown: Card[] = hand.hole_cards?.[player.id] || [];
            const label = hand.showdown_labels?.[player.id];
            const lastAction = [...(hand.action_log || [])].reverse().find((item: any) => item.player_id === player.id && item.street === hand.street);
            // Side seats keep the avatar on the chair: left ones align to the left edge, right ones to the right.
            const edge = spot.x < 20 ? 'left' : spot.x > 80 ? 'right' : 'centre';
            const seatLeft = edge === 'left' ? `max(0px, calc(${spot.x}% - 24px))` : edge === 'right' ? `min(calc(100% - 84px), calc(${spot.x}% - 60px))` : `clamp(2px, calc(${spot.x}% - 42px), calc(100% - 86px))`;
            const timer = active ? turnTimer(hand) : null;
            return <div key={player.id} className={`absolute z-10 w-[84px] text-center ${folded || player.sitting_out ? 'poker-folded-seat' : ''}`} style={{ left: seatLeft, top: `calc(${spot.y}% - 24px)` }}>
              <div className={`relative h-12 w-12 ${edge === 'left' ? 'ml-0' : edge === 'right' ? 'ml-auto' : 'mx-auto'}`}>
                {timer ? <span className="pointer-events-none absolute -inset-[4px] rounded-full transition-[background] duration-700" style={{ background: `conic-gradient(${timer.reserve ? '#fb923c' : timer.share < 0.3 ? '#fcd34d' : '#34d399'} ${timer.share * 360}deg, rgba(255,255,255,.12) 0deg)` }} /> : null}
                {player.sitting_out ? <span className="absolute -top-3 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-1.5 py-px text-[9px] font-black uppercase tracking-wide text-white/70 ring-1 ring-white/20">Отошёл</span> : !winner && !label && lastAction && lastAction.type !== 'small_blind' && lastAction.type !== 'big_blind' ? <span key={lastAction.at} className={`poker-action-bubble absolute -top-3 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-px text-[9px] font-black uppercase tracking-wide shadow-[0_2px_6px_rgba(0,0,0,.6)] ${actionTag(lastAction.type)}`}>{actionWord(lastAction.type)}</span> : null}
                <div className={`poker-seat-frame relative grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_25%,#f5d28a,#8d5924)] text-sm font-bold text-black ${winner ? 'poker-winner-seat' : ''}`}>
                  <span>{player.nickname?.slice(0, 1).toUpperCase() || player.seat}</span>
                  {!player.is_bot ? <img src={`/api/player/players/${encodeURIComponent(player.id)}/avatar`} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="absolute inset-[3px] h-[42px] w-[42px] rounded-full object-cover" /> : null}
                  <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#8d7655]" />
                </div>
                {shown.length ? <div className="absolute left-[40px] top-1 z-30 flex -space-x-3">{shown.map((card, cardIndex) => <span key={cardIndex} className={winningKeys(hand).has(cardKey(card)) ? 'rounded-lg ring-2 ring-amber-300' : ''}><PlayingCard card={card} tiny /></span>)}</div> : !folded && !finished ? <img src="/assets/poker/opponent-hole-cards-noir-v1.webp" alt="Закрытые карты" className="absolute -right-5 top-2 -z-10 w-12 drop-shadow-[0_3px_4px_rgba(0,0,0,.6)]" /> : null}
              </div>
              <div className={`poker-seat-plaque relative z-10 -mt-3 overflow-hidden rounded-[10px] px-1.5 pb-1.5 pt-2 ${active ? 'poker-seat-plaque--active' : ''}`}><div className="poker-seat-name truncate">{player.nickname}</div><SeatStack amount={handPlayer?.chips ?? player.chips} /></div>
              {winner ? <div className="-mx-5 mt-0.5 rounded-lg bg-amber-300 px-1.5 py-0.5 text-[9px] font-black leading-tight text-black">{label || 'Победитель'}</div> : label ? <div className="-mx-5 mt-0.5 text-[9px] leading-tight text-white/75">{label}</div> : null}
            </div>;
          })}

          {orderedPlayers.slice(0, 8).map((player: Player, index: number) => {
            // The bet and the position buttons (D, SB, BB) lie together on the felt in front of the player.
            const handPlayer = hand.players?.find((item: Player) => item.id === player.id);
            const committed = Number(handPlayer?.committed || 0);
            const dealer = player.seat === hand.dealer_seat;
            const small = player.seat === smallBlindSeat;
            const big = player.seat === bigBlindSeat;
            if (!committed && !dealer && !small && !big) return null;
            const spot = betSpot(layout[index]);
            return <div key={`bet-${player.id}-${committed}`} className="poker-chip-flight absolute z-[8] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1" style={{ left: `${spot.x}%`, top: `${spot.y}%` }}><SeatMarkers dealer={dealer} small={small} big={big} />{committed ? <BetChip amount={committed} /> : null}</div>;
          })}
          {winnerIndex >= 0 && Number(hand.last_pot_awarded || 0) > 0 ? <div className="poker-pot-award pointer-events-none absolute left-1/2 top-[37%] z-40" style={{ '--award-x': `${(layout[winnerIndex].x - 50) * 3.7}px`, '--award-y': `${(layout[winnerIndex].y - 37) * 6.6}px` } as CSSProperties}><ChipAmount amount={Number(hand.last_pot_awarded)} compact /></div> : null}
          {latestActionIndex >= 0 && Number(latestAction?.amount || 0) > 0 && latestAction?.type !== 'small_blind' && latestAction?.type !== 'big_blind' ? <div key={latestAction.at} className="poker-bet-to-pot pointer-events-none absolute left-1/2 top-[37%] z-30" style={{ '--bet-from-x': `${(layout[latestActionIndex].x - 50) * 3.7}px`, '--bet-from-y': `${(layout[latestActionIndex].y - 37) * 6.6}px` } as CSSProperties}><ChipAmount amount={Number(latestAction.amount)} compact /></div> : null}

          {heroIndex >= 0 ? (() => {
            const hero = orderedPlayers[heroIndex];
            const handPlayer = hand.players?.find((item: Player) => item.id === hero.id);
            const winner = hand.winner_ids?.includes(hero.id);
            return <div className="absolute bottom-[2%] left-1/2 z-20 flex w-[92%] -translate-x-1/2 flex-col items-center">
              <div className="flex gap-1.5">{ownCards.map((card, index) => <span key={`${card.rank}-${card.suit}-${index}`} className={`poker-hole-card ${finished && winningKeys(hand).has(cardKey(card)) ? 'rounded-lg ring-2 ring-amber-300' : ''}`} style={{ animationDelay: `${index * 160}ms`, transform: `rotate(${index ? 4 : -4}deg)` }}><PlayingCard card={card} /></span>)}</div>
                            <div className={`poker-seat-plaque poker-hero-plaque relative mt-1.5 flex w-full max-w-[360px] items-center gap-2.5 overflow-hidden rounded-xl py-1.5 pl-1.5 pr-4 ${handPlayer?.folded ? 'opacity-50' : ''} ${winner ? 'ring-2 ring-amber-300' : isMyTurn ? 'ring-2 ring-emerald-400' : ''}`}>
                {isMyTurn ? <span className="absolute inset-x-0 top-0"><TimerBar timer={turnTimer(hand)} thin /></span> : null}
                <span className="poker-seat-frame relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_25%,#f5d28a,#8d5924)] text-sm font-bold text-black">{hero.nickname?.slice(0, 1).toUpperCase()}<img src={`/api/player/players/${encodeURIComponent(hero.id)}/avatar`} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="absolute inset-[3px] h-[34px] w-[34px] rounded-full object-cover" /></span>
                <span className="min-w-0 flex-1 text-left"><span className="flex items-center gap-2"><b className="poker-hero-name">Вы</b><SeatStack amount={handPlayer?.chips ?? hero.chips} hero />{handPlayer?.all_in ? <span className="rounded border border-rose-200/30 bg-[#721f24] px-1.5 py-0.5 text-[8px] font-black tracking-wide text-white shadow-inner">ALL-IN</span> : null}</span><span className="poker-hand-label block truncate"><span className="poker-hand-kicker">Рука</span>{winner ? `Победа · ${hand.showdown_labels?.[hero.id] || ''}` : hand.hand_label || ''}</span></span>
              </div>
            </div>;
          })() : null}
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#090a0d]/95 px-3 pt-2 backdrop-blur" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}><div className="mx-auto max-w-[470px]">{finished ? <div className="grid min-h-[136px] place-items-center text-center"><div><div className="text-sm font-semibold text-amber-200">{orderedPlayers.filter((player) => hand.winner_ids?.includes(player.id)).map((player) => player.id === viewerId ? 'Вы' : player.nickname).join(', ') || '—'} {hand.winner_ids?.length > 1 ? 'делят банк' : 'забирает банк'}</div><div className="mt-1 text-xs text-white/55">{meAway ? <button type="button" onClick={() => void setAway(false)} className="mt-2 min-h-10 rounded-xl bg-emerald-500 px-4 text-xs font-black text-[#04291b]">Вернуться за стол</button> : current.status === 'waiting' ? 'Ждём игроков: нужно минимум двое за столом.' : current.status === 'finished' ? 'Игра окончена: фишки остались у одного игрока.' : hand.next_hand_in !== null && hand.next_hand_in !== undefined ? `Следующая раздача через ${hand.next_hand_in} с` : ''}</div></div></div> : <>
        {meAway ? <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-white/[.06] px-3 py-2 text-xs text-white/75"><span>Вы отошли — карты не раздаются, место за вами</span><button type="button" onClick={() => void setAway(false)} className="min-h-9 shrink-0 rounded-xl bg-emerald-500 px-3 text-xs font-black text-[#04291b]">Вернуться за стол</button></div> : hand.waiting_for_next_hand ? <div className="mb-1.5 rounded-xl bg-emerald-400/10 py-1.5 text-center text-xs font-semibold text-emerald-200">Вы за столом — сыграете со следующей раздачи</div> : null}
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-white/45"><span className="w-12" /><span>{isMyTurn ? (actions?.to_call > 0 ? <span className="text-amber-200">Нужно уравнять {actions.to_call}</span> : <span className="text-emerald-300">Можно сделать чек</span>) : `Ходит ${turnPlayer?.nickname || '…'}`}</span>{!meAway ? <button type="button" onClick={() => void setAway(true)} className="w-12 text-right text-[11px] text-white/50 underline-offset-2 hover:underline">Отойти</button> : <span className="w-12" />}</div>
        <div className="mb-2 grid grid-cols-5 gap-1.5">{presets.map((preset) => <button key={preset.label} type="button" disabled={!actions?.can_bet} onClick={() => setBetAmount(preset.amount)} className={`min-h-9 rounded-xl text-[11px] font-semibold disabled:opacity-30 ${betAmount === preset.amount ? 'bg-amber-300 text-black' : 'bg-white/[.07] text-white/80'}`}>{preset.label}</button>)}</div>
        <div className="mb-2 flex items-center gap-2"><button type="button" disabled={!actions?.can_bet} onClick={() => setBetAmount(clampBet(betAmount - bigBlind))} className="h-9 w-9 shrink-0 rounded-xl bg-white/10 disabled:opacity-30">−</button><input type="range" aria-label="Размер ставки" disabled={!actions?.can_bet} min={actions?.min_bet_total || 0} max={actions?.max_bet_total || 0} step={Math.max(1, Math.round(bigBlind / 2))} value={betAmount} onChange={(event) => setBetAmount(clampBet(Number(event.target.value)))} className="h-9 min-w-0 flex-1 accent-amber-300 disabled:opacity-30" /><button type="button" disabled={!actions?.can_bet} onClick={() => setBetAmount(clampBet(betAmount + bigBlind))} className="h-9 w-9 shrink-0 rounded-xl bg-white/10 disabled:opacity-30">+</button></div>
        <div className="grid grid-cols-3 gap-2"><button type="button" disabled={!actions?.can_fold} onClick={() => void pokerAction('fold')} className="min-h-12 rounded-2xl bg-[#d91e4d] text-sm font-bold disabled:opacity-30">Пас</button>{actions?.to_call > 0 ? <button type="button" disabled={!actions?.can_call} onClick={() => void pokerAction('call')} className="min-h-12 rounded-2xl bg-[#0f9b6d] text-sm font-bold leading-tight disabled:opacity-30">Колл<br />{actions.call_amount ?? actions.to_call}</button> : <button type="button" disabled={!actions?.can_check} onClick={() => void pokerAction('check')} className="min-h-12 rounded-2xl bg-white/15 text-sm font-bold disabled:opacity-30">Чек</button>}<button type="button" disabled={!actions?.can_bet} onClick={() => void pokerAction(betAmount >= Number(actions?.max_bet_total || Infinity) ? 'all_in' : 'bet', betAmount)} className="min-h-12 rounded-2xl bg-[#d5a54b] text-sm font-bold leading-tight text-black disabled:opacity-30">{betAmount >= Number(actions?.max_bet_total || Infinity) ? 'Олл-ин' : hand.current_bet > 0 ? 'Рейз до' : 'Бет'}<br />{betAmount}</button></div>
      </>}</div></div>
    </main>
    );
  }

  return (
    <main className="poker-room-bg min-h-[var(--tg-viewport-stable-height,100dvh)] px-3 pb-12 pt-20 text-white">
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-[#090a0d]/95 px-3 backdrop-blur"><button type="button" onClick={onExit} className="min-h-10 rounded-xl border border-white/10 px-3 text-sm text-white/70">← В приложение</button><div className="text-center"><div className="text-sm font-semibold">2LA Poker</div><div className="text-[9px] uppercase tracking-[.2em] text-amber-100/45">Закрытый клуб</div></div><div className="w-[106px]" /></header>
      <div className="mx-auto max-w-lg space-y-4">
        <section className="relative h-44 overflow-hidden rounded-[1.75rem] border border-amber-100/15 bg-[url('/assets/poker/room-table-v1.webp')] bg-cover bg-[center_39%] shadow-[0_20px_50px_rgba(0,0,0,.6)]"><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,5,5,.93),rgba(2,5,5,.35),rgba(2,5,5,.66))]"/><div className="absolute inset-y-0 left-0 flex w-[70%] flex-col justify-center p-5"><div className="text-[9px] uppercase tracking-[.3em] text-[#caa96a]">Sport Mafia Club</div><h1 className="mt-1 text-4xl font-black tracking-tight">POKER</h1><p className="mt-1 text-xs leading-relaxed text-white/60">Техасский холдем в атмосфере 2LA Noire</p></div><img src="/assets/poker/deck-flat-noir-v2.webp" alt="Колода 2LA Noire" className="absolute -bottom-2 -right-5 w-40 drop-shadow-2xl" /></section>
        {error ? <div className="rounded-2xl bg-rose-400/15 p-3 text-sm text-rose-100">{error}</div> : null}
        {current ? <section className="space-y-3 rounded-3xl border border-amber-200/15 bg-[linear-gradient(145deg,rgba(39,32,24,.95),rgba(12,13,14,.98))] p-4 shadow-2xl"><div className="flex items-center justify-between"><div><div className="text-[9px] uppercase tracking-[.2em] text-amber-200/50">Ваш стол</div><h2 className="font-semibold">{current.title}</h2></div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">Ожидание</span></div><div className="grid grid-cols-2 gap-2">{current.players?.map((player: Player) => <div key={player.id} className="flex items-center gap-2 rounded-2xl border border-white/[.06] bg-black/30 px-2 py-2"><span className="poker-seat-frame grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-300 font-bold text-black">{player.nickname?.slice(0, 1)}</span><span className="min-w-0 flex-1"><b className="block truncate text-xs">{player.nickname}</b><small className="text-[9px] text-white/40">Место {player.seat}{player.is_bot ? ' · бот' : ''}</small></span></div>)}</div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void lobbyAction(current.id, 'start')} className="min-h-12 rounded-2xl bg-[linear-gradient(#e3c477,#b98637)] text-sm font-black text-[#1a1106] shadow-[inset_0_1px_rgba(255,255,255,.55)]">Начать игру</button><button type="button" onClick={() => void leaveTable()} className="min-h-12 rounded-2xl border border-white/10 bg-black/20 text-sm text-white/60">Встать из-за стола</button></div><button type="button" onClick={() => void lobbyAction(current.id, 'bot')} className="min-h-11 w-full rounded-2xl border border-amber-200/20 bg-amber-200/[.08] text-sm font-semibold text-amber-50">+ Добавить бота (до 8 за столом)</button></section> : <><section className="rounded-3xl border border-white/10 bg-black/35 p-4 shadow-xl backdrop-blur"><div className="text-[9px] uppercase tracking-[.22em] text-amber-200/45">Новая игра</div><h2 className="mt-1 font-semibold">Создать стол</h2><input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-3 min-h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none focus:border-amber-200/40" /><button type="button" onClick={() => void create()} className="mt-3 min-h-12 w-full rounded-2xl bg-[linear-gradient(#e3c477,#b98637)] text-sm font-black text-[#1a1106] shadow-[inset_0_1px_rgba(255,255,255,.55)]">+ Создать открытый стол</button></section><section className="space-y-2"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Открытые столы</h2><span className="rounded-full bg-white/[.06] px-2 py-1 text-[10px] text-white/45">{lobbies.length}</span></div>{lobbies.length ? lobbies.map((lobby) => <div key={lobby.id} className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#101514] p-3 shadow-xl"><div className="absolute inset-y-0 right-0 w-28 bg-[url('/assets/poker/room-table-v1.webp')] bg-cover bg-center opacity-20"/><div className="relative flex items-center gap-3"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{lobby.title}</strong><span className="text-[10px] text-white/40">{lobby.status === 'playing' ? 'Идёт игра' : 'Ждут игроков'} · {lobby.players.length}/8 мест</span><div className="mt-2 flex -space-x-2">{lobby.players.slice(0, 5).map((player) => <span key={player.id} className="grid h-6 w-6 place-items-center rounded-full border border-[#101514] bg-[#6b5737] text-[8px] font-bold">{player.nickname?.slice(0, 1)}</span>)}</div></div><button type="button" onClick={() => void lobbyAction(lobby.id, 'join')} className="min-h-10 rounded-xl bg-[linear-gradient(#dfbd6a,#ad7931)] px-4 text-xs font-black text-black">{lobby.status === 'playing' ? 'Сесть' : 'Войти'}</button></div></div>) : <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/35">Открытых столов пока нет</div>}</section></>}
      </div>
    </main>
  );
}
