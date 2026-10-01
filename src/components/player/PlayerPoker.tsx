import { useEffect, useState, type CSSProperties } from 'react';

type Card = { rank: string; suit: string };
type Player = { id: string; nickname: string; seat: number; chips: number; committed?: number; folded?: boolean; all_in?: boolean; is_bot?: boolean };
type Lobby = { id: string; title: string; status: string; players: Player[]; hand?: any };

const suitSymbol = (suit: string) => ({ hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit] || suit);
const cardColor = (suit: string) => suit === 'hearts' || suit === 'diamonds' ? 'text-[#d92f45]' : 'text-[#101116]';
/**
 * Seats sit on the chairs of the table picture (940×1672): one at the top, three on each side and
 * the viewer at the bottom. Index 0 is always the viewer; the rest go clockwise.
 */
const CHAIRS = {
  bottom: { x: 50, y: 88 }, lowerLeft: { x: 9, y: 70 }, left: { x: 8, y: 33 }, upperLeft: { x: 17, y: 19 },
  top: { x: 50, y: 12 }, upperRight: { x: 83, y: 19 }, right: { x: 92, y: 33 }, lowerRight: { x: 91, y: 70 },
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
const betSpot = (spot: { x: number; y: number }) => ({ x: spot.x + (50 - spot.x) * (Math.abs(spot.x - 50) > 25 ? 0.55 : 0.3), y: spot.y + (46 - spot.y) * (spot.y < 30 ? 0.45 : 0.3) });
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

function SeatMarkers({ dealer, small, big, inline = false }: { dealer: boolean; small: boolean; big: boolean; inline?: boolean }) {
  const markers = [dealer && ['dealer-button', 'Дилер'], small && ['small-blind-button', 'Малый блайнд'], big && ['big-blind-button', 'Большой блайнд']].filter(Boolean) as string[][];
  if (!markers.length) return null;
  return <span className={`${inline ? 'flex' : 'absolute -left-4 -top-1 flex'} z-20 -space-x-1.5`}>{markers.map(([file, label]) => <img key={file} src={`/assets/poker/markers/${file}-25d-v1.webp`} alt={label} className="h-6 w-6 object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,.8)]" />)}</span>;
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

const stageIndex = (street: string) => ({ preflop: 0, flop: 1, turn: 2, river: 3, showdown: 4, finished: 4 }[String(street || '').toLowerCase()] || 0);
const actionText = (action: any) => {
  if (!action) return '';
  if (action.type === 'small_blind') return `SB ${action.amount}`;
  if (action.type === 'big_blind') return `BB ${action.amount}`;
  if (action.type === 'fold') return 'Пас';
  if (action.type === 'check') return 'Чек';
  if (action.type === 'call') return `Колл ${action.amount}`;
  if (action.type === 'bet') return `Ставка ${action.amount}`;
  if (action.type === 'all_in') return `Олл-ин ${action.amount}`;
  return '';
};

function PlayingCard({ card, small = false, tiny = false }: { card: Card; small?: boolean; tiny?: boolean }) {
  const suit = suitSymbol(card.suit);
  if (tiny) return <span className={`relative grid h-10 w-7 shrink-0 place-items-center rounded-md bg-[#f7f3ea] text-[11px] font-black leading-none shadow-[0_4px_8px_rgba(0,0,0,.45)] ${cardColor(card.suit)}`}><span>{card.rank === 'T' ? '10' : card.rank}<br />{suit}</span></span>;
  return <span className={`relative shrink-0 overflow-hidden rounded-lg bg-[url('/assets/poker/card-face-v1.webp')] bg-cover bg-center font-black shadow-[0_7px_15px_rgba(0,0,0,.38)] ${cardColor(card.suit)} ${small ? 'h-14 w-10' : 'h-[74px] w-[52px]'}`}>
    <span className={`absolute left-[17%] top-[13%] leading-[.8] ${small ? 'text-[11px]' : 'text-sm'}`}>{card.rank}<small className="mt-0.5 block text-[.72em]">{suit}</small></span>
    <span className={`absolute inset-0 grid place-items-center ${small ? 'text-xl' : 'text-3xl'}`}>{suit}</span>
    <span className={`absolute bottom-[13%] right-[17%] rotate-180 leading-[.8] ${small ? 'text-[11px]' : 'text-sm'}`}>{card.rank}<small className="mt-0.5 block text-[.72em]">{suit}</small></span>
  </span>;
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
  const lobbyAction = async (id: string, method: 'join' | 'start' | 'bot') => {
    try { setCurrent((await readBody(await fetch(`/api/player/poker/lobbies/${id}/${method}`, { method: 'POST', credentials: 'include' }))).lobby); }
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
  const currentStage = stageIndex(current?.hand?.street);
  const actions = current?.hand?.available_actions;
  const smallBlindSeat = current?.hand?.small_blind_seat;
  const bigBlindSeat = current?.hand?.big_blind_seat;
  const winnerIndex = orderedPlayers.findIndex((player) => current?.hand?.winner_ids?.includes(player.id));
  const latestAction = current?.hand?.action_log?.at(-1);
  const latestActionIndex = orderedPlayers.findIndex((player) => player.id === latestAction?.player_id);
  const presets = actions ? betPresets(current.hand, actions) : [];
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
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-2 border-b border-white/10 bg-[#090a0d]/95 px-3 backdrop-blur"><button type="button" onClick={onExit} className="min-h-10 shrink-0 rounded-xl border border-white/10 px-3 text-sm text-white/70">← Выйти</button><div className="min-w-0 text-center"><div className="truncate text-sm font-semibold">{current.title}</div><div className="text-[9px] uppercase tracking-[.2em] text-amber-100/45">Холдем · блайнды {hand.small_blind}/{hand.big_blind}</div></div><div className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${isMyTurn ? 'bg-emerald-400 text-[#06291c]' : 'bg-white/10 text-white/65'}`}>{isMyTurn ? `Ваш ход · ${seconds}с` : finished ? 'Вскрытие' : turnPlayer ? `Ходит ${turnPlayer.nickname}` : '…'}</div></header>
      {error ? <div className="mx-3 mt-2 rounded-xl bg-rose-400/15 px-3 py-2 text-xs text-rose-100">{error}</div> : null}
      <div className="mx-auto mt-2 flex w-full max-w-[470px] items-center px-6">{['Префлоп', 'Флоп', 'Тёрн', 'Ривер'].map((label, index) => <div key={label} className="flex flex-1 items-center last:flex-none"><div className="text-center"><div className={`mx-auto h-2.5 w-2.5 rounded-full border-2 ${index <= currentStage ? 'border-emerald-300 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.8)]' : 'border-white/25'}`} /><div className={`mt-0.5 text-[9px] ${index <= currentStage ? 'text-emerald-200' : 'text-white/35'}`}>{label}</div></div>{index < 3 ? <div className={`mx-1 mb-3 h-px flex-1 ${index < currentStage ? 'bg-emerald-300/70' : 'bg-white/15'}`} /> : null}</div>)}</div>

      <div className="flex flex-1 items-start justify-center px-2 pt-1">
        <section className="relative aspect-[940/1672] overflow-hidden rounded-[1.75rem] bg-[url('/assets/poker/room-table-v1.webp')] bg-cover bg-center shadow-[0_25px_65px_rgba(0,0,0,.75)]" style={{ width: 'min(100%, 470px, calc((var(--tg-viewport-stable-height, 100dvh) - 270px) * 0.5622))' }}>
          {/* The deck lies flat on the free felt below the board. */}
          <div className="pointer-events-none absolute left-[44%] top-[61%] z-[4] w-[12%] [transform:perspective(500px)_rotateX(52deg)_rotateZ(-14deg)]">
            <img src="/assets/poker/deck-noir-v1.webp" alt="" className="w-full drop-shadow-[0_8px_6px_rgba(0,0,0,.75)]" />
          </div>
          <div className="absolute left-1/2 top-[34%] z-[5] -translate-x-1/2 text-center">
            <div className="text-[8px] uppercase tracking-[.2em] text-amber-100/55">Банк</div>
            <div key={hand.pot} className="poker-chip-flight min-h-[34px]">{Number(hand.pot) > 0 ? <ChipAmount amount={Number(hand.pot)} compact /> : <span className="text-[11px] font-bold text-amber-100/70">{finished && hand.last_pot_awarded ? hand.last_pot_awarded : 0}</span>}</div>
          </div>
          <div className="absolute left-1/2 top-[50%] z-[5] flex -translate-x-1/2 -translate-y-1/2 gap-1">{(hand.board || []).map((card: Card, index: number) => <span key={`${card.rank}-${card.suit}-${index}`} className={`poker-board-card ${finished && winningKeys(hand).has(cardKey(card)) ? 'rounded-lg ring-2 ring-amber-300' : ''}`} style={{ animationDelay: `${index * 110}ms` }}><PlayingCard card={card} small /></span>)}{Array.from({ length: 5 - (hand.board || []).length }).map((_, index) => <span key={`empty-${index}`} className="h-14 w-10 rounded-lg border border-white/10 bg-black/15" />)}</div>
          <div className="absolute left-1/2 top-[57%] z-[5] -translate-x-1/2 whitespace-nowrap text-[9px] uppercase tracking-[.2em] text-emerald-100/50">{streetName(hand.street)}</div>

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
            return <div key={player.id} className={`absolute z-10 w-[84px] text-center ${folded ? 'poker-folded-seat' : ''}`} style={{ left: `clamp(2px, calc(${spot.x}% - 42px), calc(100% - 86px))`, top: `calc(${spot.y}% - 24px)` }}>
              <div className="relative mx-auto h-12 w-12">
                <div className={`poker-seat-frame relative grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_25%,#f5d28a,#8d5924)] text-sm font-bold text-black ${winner ? 'poker-winner-seat' : active ? 'poker-active-seat' : ''}`}>
                  <span>{player.nickname?.slice(0, 1).toUpperCase() || player.seat}</span>
                  {!player.is_bot ? <img src={`/api/player/players/${encodeURIComponent(player.id)}/avatar`} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="absolute inset-[3px] h-[42px] w-[42px] rounded-full object-cover" /> : null}
                  <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#8d7655]" />
                </div>
                <SeatMarkers dealer={player.seat === hand.dealer_seat} small={player.seat === smallBlindSeat} big={player.seat === bigBlindSeat} />
                {shown.length ? <div className="absolute left-[40px] top-1 z-30 flex -space-x-3">{shown.map((card, cardIndex) => <span key={cardIndex} className={winningKeys(hand).has(cardKey(card)) ? 'rounded-lg ring-2 ring-amber-300' : ''}><PlayingCard card={card} tiny /></span>)}</div> : !folded && !finished ? <img src="/assets/poker/card-backs-2la-noir-v3.webp" alt="" className="absolute -right-5 top-2 w-9 drop-shadow-[0_4px_5px_rgba(0,0,0,.6)]" /> : null}
              </div>
              <div className="poker-seat-plaque -mt-1.5 rounded-lg px-1.5 py-1"><div className="truncate text-[10px] font-semibold leading-tight">{player.nickname}</div><div className="text-[10px] font-bold leading-tight text-amber-200">{handPlayer?.chips ?? player.chips}{handPlayer?.all_in ? <span className="ml-1 rounded bg-[#721f24] px-1 text-[8px] text-amber-50">ALL-IN</span> : null}</div></div>
              {winner ? <div className="-mx-5 mt-0.5 rounded-lg bg-amber-300 px-1.5 py-0.5 text-[9px] font-black leading-tight text-black">{label || 'Победитель'}</div> : label ? <div className="-mx-5 mt-0.5 text-[9px] leading-tight text-white/75">{label}</div> : lastAction && lastAction.type !== 'small_blind' && lastAction.type !== 'big_blind' ? <div key={lastAction.at} className={`poker-action-bubble mx-auto mt-0.5 w-fit rounded-full px-2 text-[9px] font-bold uppercase ${folded ? 'bg-[#6e1c28]' : 'bg-black/70 text-white/85'}`}>{actionText(lastAction)}</div> : null}
            </div>;
          })}

          {orderedPlayers.slice(0, 8).map((player: Player, index: number) => {
            const handPlayer = hand.players?.find((item: Player) => item.id === player.id);
            if (!handPlayer?.committed) return null;
            const spot = betSpot(layout[index]);
            return <div key={`bet-${player.id}-${handPlayer.committed}`} className="poker-chip-flight absolute z-[8] -translate-x-1/2 -translate-y-1/2" style={{ left: `${spot.x}%`, top: `${spot.y}%` }}><ChipAmount amount={Number(handPlayer.committed)} compact /></div>;
          })}
          {winnerIndex >= 0 && Number(hand.last_pot_awarded || 0) > 0 ? <div className="poker-pot-award pointer-events-none absolute left-1/2 top-[37%] z-40" style={{ '--award-x': `${(layout[winnerIndex].x - 50) * 3.7}px`, '--award-y': `${(layout[winnerIndex].y - 37) * 6.6}px` } as CSSProperties}><ChipAmount amount={Number(hand.last_pot_awarded)} compact /></div> : null}
          {latestActionIndex >= 0 && Number(latestAction?.amount || 0) > 0 && latestAction?.type !== 'small_blind' && latestAction?.type !== 'big_blind' ? <div key={latestAction.at} className="poker-bet-to-pot pointer-events-none absolute left-1/2 top-[37%] z-30" style={{ '--bet-from-x': `${(layout[latestActionIndex].x - 50) * 3.7}px`, '--bet-from-y': `${(layout[latestActionIndex].y - 37) * 6.6}px` } as CSSProperties}><ChipAmount amount={Number(latestAction.amount)} compact /></div> : null}

          {heroIndex >= 0 ? (() => {
            const hero = orderedPlayers[heroIndex];
            const handPlayer = hand.players?.find((item: Player) => item.id === hero.id);
            const winner = hand.winner_ids?.includes(hero.id);
            return <div className="absolute bottom-[2%] left-1/2 z-20 flex w-[92%] -translate-x-1/2 flex-col items-center">
              <div className="flex -space-x-2">{ownCards.map((card, index) => <span key={`${card.rank}-${card.suit}-${index}`} className={`poker-hole-card ${finished && winningKeys(hand).has(cardKey(card)) ? 'rounded-lg ring-2 ring-amber-300' : ''}`} style={{ animationDelay: `${index * 160}ms`, transform: `rotate(${index ? 5 : -5}deg)` }}><PlayingCard card={card} /></span>)}</div>
              <div className={`poker-seat-plaque relative mt-1 flex items-center gap-2 rounded-xl py-1 pl-1 pr-3 ${handPlayer?.folded ? 'opacity-50' : ''} ${winner ? 'ring-2 ring-amber-300' : isMyTurn ? 'ring-2 ring-emerald-400' : ''}`}>
                <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_25%,#f5d28a,#8d5924)] text-sm font-bold text-black">{hero.nickname?.slice(0, 1).toUpperCase()}<img src={`/api/player/players/${encodeURIComponent(hero.id)}/avatar`} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="absolute inset-0 h-9 w-9 rounded-full object-cover" /></span>
                <span className="min-w-0 text-left"><b className="block text-[11px] leading-tight">Вы · <span className="text-amber-200">{handPlayer?.chips ?? hero.chips}</span>{handPlayer?.all_in ? <span className="ml-1 rounded bg-[#721f24] px-1 text-[8px]">ALL-IN</span> : null}</b><span className="block truncate text-[10px] leading-tight text-white/65">{winner ? `Победа · ${hand.showdown_labels?.[hero.id] || ''}` : hand.hand_label || ''}</span></span>
                <span className="absolute -left-4 -top-2"><SeatMarkers dealer={hero.seat === hand.dealer_seat} small={hero.seat === smallBlindSeat} big={hero.seat === bigBlindSeat} inline /></span>
              </div>
            </div>;
          })() : null}
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#090a0d]/95 px-3 pt-2 backdrop-blur" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}><div className="mx-auto max-w-[470px]">{finished ? <div className="grid min-h-[136px] place-items-center text-center"><div><div className="text-sm font-semibold text-amber-200">{orderedPlayers.filter((player) => hand.winner_ids?.includes(player.id)).map((player) => player.id === viewerId ? 'Вы' : player.nickname).join(', ') || '—'} {hand.winner_ids?.length > 1 ? 'делят банк' : 'забирает банк'}</div><div className="mt-1 text-xs text-white/55">{current.status === 'finished' ? 'Игра окончена: фишки остались у одного игрока.' : hand.next_hand_in !== null && hand.next_hand_in !== undefined ? `Следующая раздача через ${hand.next_hand_in} с` : ''}</div></div></div> : <>
        <div className="mb-1.5 text-center text-[11px] text-white/45">{isMyTurn ? (actions?.to_call > 0 ? <span className="text-amber-200">Нужно уравнять {actions.to_call}</span> : <span className="text-emerald-300">Можно сделать чек</span>) : `Ходит ${turnPlayer?.nickname || '…'}`}</div>
        <div className="mb-2 grid grid-cols-5 gap-1.5">{presets.map((preset) => <button key={preset.label} type="button" disabled={!actions?.can_bet} onClick={() => setBetAmount(preset.amount)} className={`min-h-9 rounded-xl text-[11px] font-semibold disabled:opacity-30 ${betAmount === preset.amount ? 'bg-amber-300 text-black' : 'bg-white/[.07] text-white/80'}`}>{preset.label}</button>)}</div>
        <div className="mb-2 flex items-center gap-2"><button type="button" disabled={!actions?.can_bet} onClick={() => setBetAmount(clampBet(betAmount - bigBlind))} className="h-9 w-9 shrink-0 rounded-xl bg-white/10 disabled:opacity-30">−</button><input type="range" aria-label="Размер ставки" disabled={!actions?.can_bet} min={actions?.min_bet_total || 0} max={actions?.max_bet_total || 0} step={Math.max(1, Math.round(bigBlind / 2))} value={betAmount} onChange={(event) => setBetAmount(clampBet(Number(event.target.value)))} className="h-9 min-w-0 flex-1 accent-amber-300 disabled:opacity-30" /><button type="button" disabled={!actions?.can_bet} onClick={() => setBetAmount(clampBet(betAmount + bigBlind))} className="h-9 w-9 shrink-0 rounded-xl bg-white/10 disabled:opacity-30">+</button></div>
        <div className="grid grid-cols-3 gap-2"><button type="button" disabled={!actions?.can_fold} onClick={() => void pokerAction('fold')} className="min-h-12 rounded-2xl bg-[#d91e4d] text-sm font-bold disabled:opacity-30">Пас</button>{actions?.to_call > 0 ? <button type="button" disabled={!actions?.can_call} onClick={() => void pokerAction('call')} className="min-h-12 rounded-2xl bg-[#0f9b6d] text-sm font-bold leading-tight disabled:opacity-30">Колл<br />{actions.call_amount ?? actions.to_call}</button> : <button type="button" disabled={!actions?.can_check} onClick={() => void pokerAction('check')} className="min-h-12 rounded-2xl bg-white/15 text-sm font-bold disabled:opacity-30">Чек</button>}<button type="button" disabled={!actions?.can_bet} onClick={() => void pokerAction(betAmount >= Number(actions?.max_bet_total || Infinity) ? 'all_in' : 'bet', betAmount)} className="min-h-12 rounded-2xl bg-[#d5a54b] text-sm font-bold leading-tight text-black disabled:opacity-30">{betAmount >= Number(actions?.max_bet_total || Infinity) ? 'Олл-ин' : hand.current_bet > 0 ? 'Рейз до' : 'Ставка'}<br />{betAmount}</button></div>
      </>}</div></div>
    </main>
    );
  }

  return (
    <main className="poker-room-bg min-h-[var(--tg-viewport-stable-height,100dvh)] px-3 pb-12 pt-20 text-white">
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-[#090a0d]/95 px-3 backdrop-blur"><button type="button" onClick={onExit} className="min-h-10 rounded-xl border border-white/10 px-3 text-sm text-white/70">← В приложение</button><div className="text-center"><div className="text-sm font-semibold">2LA Poker</div><div className="text-[9px] uppercase tracking-[.2em] text-amber-100/45">Закрытый клуб</div></div><div className="w-[106px]" /></header>
      <div className="mx-auto max-w-lg space-y-4">
        <section className="relative h-44 overflow-hidden rounded-[1.75rem] border border-amber-100/15 bg-[url('/assets/poker/room-table-v1.webp')] bg-cover bg-[center_39%] shadow-[0_20px_50px_rgba(0,0,0,.6)]"><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,5,5,.93),rgba(2,5,5,.35),rgba(2,5,5,.66))]"/><div className="absolute inset-y-0 left-0 flex w-[70%] flex-col justify-center p-5"><div className="text-[9px] uppercase tracking-[.3em] text-[#caa96a]">Sport Mafia Club</div><h1 className="mt-1 text-4xl font-black tracking-tight">POKER</h1><p className="mt-1 text-xs leading-relaxed text-white/60">Техасский холдем в атмосфере 2LA Noire</p></div><img src="/assets/poker/deck-noir-v1.webp" alt="Колода 2LA Noire" className="absolute -bottom-5 -right-10 w-48 rotate-[-8deg] mix-blend-lighten drop-shadow-2xl" /></section>
        {error ? <div className="rounded-2xl bg-rose-400/15 p-3 text-sm text-rose-100">{error}</div> : null}
        {current ? <section className="space-y-3 rounded-3xl border border-amber-200/15 bg-[linear-gradient(145deg,rgba(39,32,24,.95),rgba(12,13,14,.98))] p-4 shadow-2xl"><div className="flex items-center justify-between"><div><div className="text-[9px] uppercase tracking-[.2em] text-amber-200/50">Ваш стол</div><h2 className="font-semibold">{current.title}</h2></div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">Ожидание</span></div><div className="grid grid-cols-2 gap-2">{current.players?.map((player: Player) => <div key={player.id} className="flex items-center gap-2 rounded-2xl border border-white/[.06] bg-black/30 px-2 py-2"><span className="poker-seat-frame grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-300 font-bold text-black">{player.nickname?.slice(0, 1)}</span><span className="min-w-0 flex-1"><b className="block truncate text-xs">{player.nickname}</b><small className="text-[9px] text-white/40">Место {player.seat}{player.is_bot ? ' · бот' : ''}</small></span></div>)}</div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void lobbyAction(current.id, 'start')} className="min-h-12 rounded-2xl bg-[linear-gradient(#e3c477,#b98637)] text-sm font-black text-[#1a1106] shadow-[inset_0_1px_rgba(255,255,255,.55)]">Начать игру</button><button type="button" onClick={() => setCurrent(null)} className="min-h-12 rounded-2xl border border-white/10 bg-black/20 text-sm text-white/60">К списку</button></div><button type="button" onClick={() => void lobbyAction(current.id, 'bot')} className="min-h-11 w-full rounded-2xl border border-amber-200/20 bg-amber-200/[.08] text-sm font-semibold text-amber-50">+ Добавить бота (до 8 за столом)</button></section> : <><section className="rounded-3xl border border-white/10 bg-black/35 p-4 shadow-xl backdrop-blur"><div className="text-[9px] uppercase tracking-[.22em] text-amber-200/45">Новая игра</div><h2 className="mt-1 font-semibold">Создать стол</h2><input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-3 min-h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none focus:border-amber-200/40" /><button type="button" onClick={() => void create()} className="mt-3 min-h-12 w-full rounded-2xl bg-[linear-gradient(#e3c477,#b98637)] text-sm font-black text-[#1a1106] shadow-[inset_0_1px_rgba(255,255,255,.55)]">+ Создать открытый стол</button></section><section className="space-y-2"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Открытые столы</h2><span className="rounded-full bg-white/[.06] px-2 py-1 text-[10px] text-white/45">{lobbies.length}</span></div>{lobbies.length ? lobbies.map((lobby) => <div key={lobby.id} className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#101514] p-3 shadow-xl"><div className="absolute inset-y-0 right-0 w-28 bg-[url('/assets/poker/room-table-v1.webp')] bg-cover bg-center opacity-20"/><div className="relative flex items-center gap-3"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{lobby.title}</strong><span className="text-[10px] text-white/40">Texas Hold’em · {lobby.players.length}/8 игроков</span><div className="mt-2 flex -space-x-2">{lobby.players.slice(0, 5).map((player) => <span key={player.id} className="grid h-6 w-6 place-items-center rounded-full border border-[#101514] bg-[#6b5737] text-[8px] font-bold">{player.nickname?.slice(0, 1)}</span>)}</div></div><button type="button" onClick={() => void lobbyAction(lobby.id, 'join')} className="min-h-10 rounded-xl bg-[linear-gradient(#dfbd6a,#ad7931)] px-4 text-xs font-black text-black">Войти</button></div></div>) : <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/35">Открытых столов пока нет</div>}</section></>}
      </div>
    </main>
  );
}
