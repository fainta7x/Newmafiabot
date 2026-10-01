import { useEffect, useState, type CSSProperties } from 'react';

type Card = { rank: string; suit: string };
type Player = { id: string; nickname: string; seat: number; chips: number; committed?: number; folded?: boolean; all_in?: boolean; is_bot?: boolean };
type Lobby = { id: string; title: string; status: string; players: Player[]; hand?: any };

const suitSymbol = (suit: string) => ({ hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit] || suit);
const cardColor = (suit: string) => suit === 'hearts' || suit === 'diamonds' ? 'text-[#d92f45]' : 'text-[#101116]';
const seatPositions = [
  'bottom-[7%] left-1/2 -translate-x-1/2', 'top-[20%] left-1/2 -translate-x-1/2',
  'top-[34%] right-[2%]', 'bottom-[28%] right-[2%]', 'bottom-[28%] left-[2%]',
  'top-[34%] left-[2%]', 'top-[22%] right-[12%]', 'top-[22%] left-[12%]',
];
const seatVectors = [
  { x: 0, y: 250 }, { x: 0, y: -250 }, { x: 155, y: -130 }, { x: 155, y: 150 },
  { x: -155, y: 150 }, { x: -155, y: -130 }, { x: 105, y: -225 }, { x: -105, y: -225 },
];

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
  return '';
};

function PlayingCard({ card, small = false }: { card: Card; small?: boolean }) {
  const suit = suitSymbol(card.suit);
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
    const body = await response.json();
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

  const viewerId = current?.hand?.hole_cards ? Object.keys(current.hand.hole_cards)[0] : null;
  const ownCards: Card[] = viewerId ? current.hand.hole_cards[viewerId] || [] : [];
  const turnPlayer = current?.players?.find((player: Player) => player.seat === current?.hand?.current_seat);
  const isMyTurn = Boolean(current?.hand?.is_viewer_turn);
  const seconds = Number(current?.hand?.turn_remaining?.base_seconds || 0) + Number(current?.hand?.turn_remaining?.reserve_seconds || 0);
  const orderedPlayers: Player[] = current?.players ? [...current.players].sort((a: Player, b: Player) => a.id === viewerId ? -1 : b.id === viewerId ? 1 : a.seat - b.seat) : [];
  const currentStage = stageIndex(current?.hand?.street);
  const actions = current?.hand?.available_actions;
  const smallBlindSeat = current?.hand?.small_blind_seat;
  const bigBlindSeat = current?.hand?.big_blind_seat;
  const winnerIndex = orderedPlayers.findIndex((player) => current?.hand?.winner_ids?.includes(player.id));
  const latestAction = current?.hand?.action_log?.at(-1);
  const latestActionIndex = orderedPlayers.findIndex((player) => player.id === latestAction?.player_id);

  useEffect(() => {
    const minimum = Number(actions?.min_bet_total || 0);
    if (minimum > 0) setBetAmount((value) => Math.max(value, minimum));
  }, [actions?.min_bet_total, current?.hand?.current_seat, current?.hand?.street]);

  if (current?.hand) return (
    <main className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-[#050706] px-2 pb-40 pt-16 text-white">
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-[#090a0d]/95 px-3 backdrop-blur"><button type="button" onClick={onExit} className="min-h-10 rounded-xl border border-white/10 px-3 text-sm text-white/70">← В приложение</button><div className="text-center"><div className="text-sm font-semibold">2LA Poker</div><div className="text-[9px] uppercase tracking-[.2em] text-amber-100/45">Texas Hold’em</div></div><div className="w-[106px]" /></header>
      <div className="mx-auto max-w-[500px]">
        <div className="mb-2 flex items-center justify-between px-2"><div><div className="text-[10px] uppercase tracking-[.22em] text-amber-100/40">Texas Hold’em</div><h1 className="text-base font-semibold">{current.title}</h1></div><div className={`rounded-full px-3 py-1 text-xs font-semibold ${isMyTurn ? 'bg-emerald-400 text-[#06291c]' : 'bg-white/10 text-white/65'}`}>{isMyTurn ? 'Ваш ход' : turnPlayer ? `Ход: ${turnPlayer.nickname}` : 'Раздача завершена'}</div></div>
        {error ? <div className="mb-2 rounded-xl bg-rose-400/15 px-3 py-2 text-xs text-rose-100">{error}</div> : null}
        <div className="mb-2 flex min-h-7 items-center justify-center gap-2 overflow-hidden px-2">{(current.hand.action_log || []).slice(-3).map((action: any, index: number) => <span key={`${action.at}-${index}`} className="poker-action-toast whitespace-nowrap rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] text-white/70"><b className="text-white">{action.player_name}</b> · {actionText(action)}</span>)}</div>

        <div className="mb-3 flex items-center px-6">{['Префлоп', 'Флоп', 'Тёрн', 'Ривер'].map((label, index) => <div key={label} className="flex flex-1 items-center last:flex-none"><div className="text-center"><div className={`mx-auto h-3 w-3 rounded-full border-2 ${index <= currentStage ? 'border-emerald-300 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]' : 'border-white/25 bg-[#121417]'}`} /><div className={`mt-1 text-[9px] ${index <= currentStage ? 'text-emerald-300' : 'text-white/35'}`}>{label}</div></div>{index < 3 ? <div className={`mb-4 h-px flex-1 ${index < currentStage ? 'bg-emerald-400' : 'bg-white/15'}`} /> : null}</div>)}</div>

        <section className="relative mx-auto aspect-[940/1672] w-full max-w-[470px] overflow-hidden rounded-[2rem] bg-[url('/assets/poker/room-table-v1.webp')] bg-cover bg-center shadow-[0_25px_65px_rgba(0,0,0,.75)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.05),transparent_22%,transparent_74%,rgba(0,0,0,.36))]" />
          <div className="poker-deck-source absolute left-[9%] top-[42%] z-[5] w-[70px]">
            <img src="/assets/poker/deck-noir-v1.webp" alt="Колода 2LA Noire" className="w-full mix-blend-lighten drop-shadow-[0_10px_9px_rgba(0,0,0,.8)]" />
            <span className="-mt-1 block text-center text-[8px] font-bold uppercase tracking-[.18em] text-amber-100/45">{current.hand.deck_remaining} карт</span>
          </div>
          <div className="absolute left-1/2 top-[49%] w-full -translate-x-1/2 -translate-y-1/2 text-center">
            <div key={current.hand.pot} className="poker-chip-flight mb-1"><div className="mb-0.5 text-[9px] uppercase tracking-[.18em] text-amber-100/55">Банк</div><ChipAmount amount={Number(current.hand.pot || 0)} /></div>
            <div className="flex justify-center gap-1.5">{(current.hand.board || []).map((card: Card, index: number) => <span key={`${card.rank}-${card.suit}-${index}`} className="poker-board-card" style={{ animationDelay: `${index * 110}ms` }}><PlayingCard card={card} small /></span>)}{Array.from({ length: 5 - (current.hand.board || []).length }).map((_, index) => <span key={`empty-${index}`} className="h-14 w-10 rounded-lg border border-white/20 bg-black/10" />)}</div>
            <div className="mt-2 text-[10px] uppercase tracking-[.2em] text-emerald-100/50">{current.hand.street}</div>
          </div>

          {orderedPlayers.slice(0, 8).map((player: Player, index: number) => {
            const active = player.seat === current.hand.current_seat;
            const mine = player.id === viewerId;
            const handPlayer = current.hand.players?.find((item: Player) => item.id === player.id);
            const dealer = player.seat === current.hand.dealer_seat;
            const winner = current.hand.winner_ids?.includes(player.id);
            const folded = Boolean(handPlayer?.folded);
            const allIn = Boolean(handPlayer?.all_in);
            const lastAction = [...(current.hand.action_log || [])].reverse().find((item: any) => item.player_id === player.id);
            return <div key={player.id} className={`absolute z-10 w-[104px] ${seatPositions[index]} text-center transition-all duration-300 ${folded ? 'poker-folded-seat' : ''}`}>
              <div className={`poker-seat-frame relative mx-auto grid h-14 w-14 overflow-visible place-items-center rounded-full bg-[radial-gradient(circle_at_35%_25%,#f5d28a,#8d5924)] text-base font-bold text-black ${winner ? 'poker-winner-seat' : active ? 'poker-active-seat' : ''}`}>
                <span>{player.nickname?.slice(0, 1).toUpperCase() || player.seat}</span>
                {!player.is_bot ? <img src={`/api/player/players/${encodeURIComponent(player.id)}/avatar`} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="absolute inset-[5px] h-[46px] w-[46px] rounded-full object-cover" /> : null}
                <span className="pointer-events-none absolute inset-0 rounded-full border-[3px] border-[#8d7655] shadow-[inset_0_2px_2px_rgba(255,255,255,.45),inset_0_-4px_5px_rgba(0,0,0,.75),0_7px_14px_rgba(0,0,0,.75)]" />
                <span className="absolute -left-7 top-5 z-20 flex -space-x-2">
                  {dealer ? <img src="/assets/poker/markers/dealer-button-25d-v1.webp" alt="Баттон дилера" className="h-8 w-8 object-contain drop-shadow-[0_5px_4px_rgba(0,0,0,.8)]" /> : null}
                  {player.seat === smallBlindSeat ? <img src="/assets/poker/markers/small-blind-button-25d-v1.webp" alt="Малый блайнд" className="h-8 w-8 object-contain drop-shadow-[0_5px_4px_rgba(0,0,0,.8)]" /> : null}
                  {player.seat === bigBlindSeat ? <img src="/assets/poker/markers/big-blind-button-25d-v1.webp" alt="Большой блайнд" className="h-8 w-8 object-contain drop-shadow-[0_5px_4px_rgba(0,0,0,.8)]" /> : null}
                </span>
                {allIn ? <span className="poker-all-in absolute -right-8 top-1/2 z-20 -translate-y-1/2 rounded-md border border-amber-200/50 bg-[#721f24] px-1.5 py-1 text-[7px] font-black tracking-wide text-amber-50 shadow-lg">ALL-IN</span> : null}
              </div>
              <div className="poker-seat-plaque -mt-1 rounded-xl px-2 py-1.5"><div className="truncate text-[11px] font-semibold">{mine ? 'Вы' : player.nickname}</div><div className="text-[10px] font-semibold text-amber-200">{handPlayer?.chips ?? player.chips}</div>{winner ? <div className="text-[9px] font-black uppercase tracking-wide text-amber-300">Победитель</div> : active ? <div className="text-[9px] font-bold text-emerald-300">{seconds} сек</div> : null}</div>
              {handPlayer?.committed && handPlayer.committed > 0 ? <div key={handPlayer.committed} className="poker-chip-flight mt-0.5"><ChipAmount amount={Number(handPlayer.committed)} compact /></div> : null}
              {lastAction ? <div key={lastAction.at} className={`poker-action-bubble mt-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${folded ? 'bg-[#6e1c28] text-white' : 'bg-black/70 text-white/85'}`}>{actionText(lastAction)}</div> : null}
              {!mine && !folded ? <img src="/assets/poker/card-backs-2la-noir-v3.webp" alt="Закрытые карты 2LA Noire" className="mx-auto mt-1 w-14 drop-shadow-[0_5px_7px_rgba(0,0,0,.6)]"/> : null}
            </div>;
          })}
          {latestActionIndex >= 0 && Number(latestAction?.amount || 0) > 0 && latestAction?.type !== 'small_blind' && latestAction?.type !== 'big_blind' ? <div key={latestAction.at} className="poker-bet-to-pot pointer-events-none absolute left-1/2 top-1/2 z-30" style={{ '--bet-from-x': `${seatVectors[latestActionIndex]?.x || 0}px`, '--bet-from-y': `${seatVectors[latestActionIndex]?.y || 0}px` } as CSSProperties}><ChipAmount amount={Number(latestAction.amount)} compact /></div> : null}
          {winnerIndex >= 0 && Number(current.hand.last_pot_awarded || 0) > 0 ? <div className="poker-pot-award pointer-events-none absolute left-1/2 top-1/2 z-40" style={{ '--award-x': `${seatVectors[winnerIndex]?.x || 0}px`, '--award-y': `${seatVectors[winnerIndex]?.y || 0}px` } as CSSProperties}><ChipAmount amount={Number(current.hand.last_pot_awarded)} /></div> : null}
          <div className="absolute bottom-[17%] left-1/2 z-20 -translate-x-1/2"><div className="flex justify-center -space-x-1">{ownCards.map((card, index) => <span key={`${card.rank}-${card.suit}-${index}`} className="poker-hole-card" style={{ animationDelay: `${index * 160}ms`, transform: `rotate(${index ? 4 : -4}deg)` }}><PlayingCard card={card} /></span>)}</div><div className="mt-1 rounded-full border border-amber-100/15 bg-black/70 px-3 py-1 text-center text-[10px] font-semibold text-amber-100 backdrop-blur-sm">{current.hand.hand_label || 'Комбинация формируется'}</div></div>
        </section>

        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#090a0d]/95 px-3 py-2 backdrop-blur"><div className="mx-auto max-w-[560px]">{isMyTurn && actions?.to_call > 0 ? <div className="mb-2 text-center text-[11px] text-amber-200">Нужно уравнять {actions.to_call} · чек недоступен</div> : isMyTurn ? <div className="mb-2 text-center text-[11px] text-emerald-300">Можно сделать чек без ставки</div> : <div className="mb-2 text-center text-[11px] text-white/40">Ожидаем действие игрока {turnPlayer?.nickname || ''}</div>}<div className="grid grid-cols-4 gap-2"><button type="button" disabled={!actions?.can_fold} onClick={() => void pokerAction('fold')} className="min-h-12 rounded-2xl bg-[#d91e4d] text-sm font-bold disabled:opacity-30">Пас</button><button type="button" title={actions?.to_call > 0 ? `Сначала нужно уравнять ${actions.to_call}` : ''} disabled={!actions?.can_check} onClick={() => void pokerAction('check')} className="min-h-12 rounded-2xl bg-white/10 text-sm font-bold disabled:opacity-30">Чек</button><button type="button" disabled={!actions?.can_call} onClick={() => void pokerAction('call')} className="min-h-12 rounded-2xl bg-[#0f9b6d] text-sm font-bold disabled:opacity-30">Колл{actions?.to_call > 0 ? <><br/>{actions.to_call}</> : null}</button><button type="button" disabled={!actions?.can_bet || betAmount > actions.max_bet_total} onClick={() => void pokerAction('bet', betAmount)} className="min-h-12 rounded-2xl bg-[#d5a54b] text-sm font-bold text-black disabled:opacity-30">{current.hand.current_bet > 0 ? 'Рейз' : 'Ставка'}<br/>{betAmount}</button></div><div className="mt-2 grid grid-cols-[42px_1fr_42px_54px_54px_54px] gap-2"><button type="button" onClick={() => setBetAmount(Math.max(actions?.min_bet_total || 20, betAmount - 20))} className="rounded-xl bg-white/10">−</button><div className="grid place-items-center rounded-xl bg-white/[.06] text-sm font-semibold">{betAmount}</div><button type="button" onClick={() => setBetAmount(Math.min(actions?.max_bet_total || betAmount + 20, betAmount + 20))} className="rounded-xl bg-white/10">+</button><button type="button" onClick={() => setBetAmount(Math.max(actions?.min_bet_total || 20, Math.floor(current.hand.pot / 2)))} className="rounded-xl bg-white/[.06] text-xs">1/2</button><button type="button" onClick={() => setBetAmount(Math.max(actions?.min_bet_total || 20, Math.floor(current.hand.pot * .75)))} className="rounded-xl bg-white/[.06] text-xs">3/4</button><button type="button" onClick={() => setBetAmount(Math.min(actions?.max_bet_total || current.hand.pot, Math.max(actions?.min_bet_total || 20, current.hand.pot)))} className="rounded-xl bg-white/[.06] text-xs">Банк</button></div></div></div>
      </div>
    </main>
  );

  return (
    <main className="poker-room-bg min-h-[var(--tg-viewport-stable-height,100dvh)] px-3 pb-12 pt-20 text-white">
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-[#090a0d]/95 px-3 backdrop-blur"><button type="button" onClick={onExit} className="min-h-10 rounded-xl border border-white/10 px-3 text-sm text-white/70">← В приложение</button><div className="text-center"><div className="text-sm font-semibold">2LA Poker</div><div className="text-[9px] uppercase tracking-[.2em] text-amber-100/45">Закрытый клуб</div></div><div className="w-[106px]" /></header>
      <div className="mx-auto max-w-lg space-y-4">
        <section className="relative h-44 overflow-hidden rounded-[1.75rem] border border-amber-100/15 bg-[url('/assets/poker/room-table-v1.webp')] bg-cover bg-[center_39%] shadow-[0_20px_50px_rgba(0,0,0,.6)]"><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,5,5,.93),rgba(2,5,5,.35),rgba(2,5,5,.66))]"/><div className="absolute inset-y-0 left-0 flex w-[70%] flex-col justify-center p-5"><div className="text-[9px] uppercase tracking-[.3em] text-[#caa96a]">Sport Mafia Club</div><h1 className="mt-1 text-4xl font-black tracking-tight">POKER</h1><p className="mt-1 text-xs leading-relaxed text-white/60">Техасский холдем в атмосфере 2LA Noire</p></div><img src="/assets/poker/deck-noir-v1.webp" alt="Колода 2LA Noire" className="absolute -bottom-5 -right-10 w-48 rotate-[-8deg] mix-blend-lighten drop-shadow-2xl" /></section>
        {error ? <div className="rounded-2xl bg-rose-400/15 p-3 text-sm text-rose-100">{error}</div> : null}
        {current ? <section className="space-y-3 rounded-3xl border border-amber-200/15 bg-[linear-gradient(145deg,rgba(39,32,24,.95),rgba(12,13,14,.98))] p-4 shadow-2xl"><div className="flex items-center justify-between"><div><div className="text-[9px] uppercase tracking-[.2em] text-amber-200/50">Ваш стол</div><h2 className="font-semibold">{current.title}</h2></div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">Ожидание</span></div><div className="grid grid-cols-2 gap-2">{current.players?.map((player: Player) => <div key={player.id} className="flex items-center gap-2 rounded-2xl border border-white/[.06] bg-black/30 px-2 py-2"><span className="poker-seat-frame grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-300 font-bold text-black">{player.nickname?.slice(0, 1)}</span><span className="min-w-0 flex-1"><b className="block truncate text-xs">{player.nickname}</b><small className="text-[9px] text-white/40">Место {player.seat}{player.is_bot ? ' · бот' : ''}</small></span></div>)}</div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void lobbyAction(current.id, 'start')} className="min-h-12 rounded-2xl bg-[linear-gradient(#e3c477,#b98637)] text-sm font-black text-[#1a1106] shadow-[inset_0_1px_rgba(255,255,255,.55)]">Начать игру</button><button type="button" onClick={() => setCurrent(null)} className="min-h-12 rounded-2xl border border-white/10 bg-black/20 text-sm text-white/60">К списку</button></div><button type="button" onClick={() => void lobbyAction(current.id, 'bot')} className="min-h-11 w-full rounded-2xl border border-amber-200/20 bg-amber-200/[.08] text-sm font-semibold text-amber-50">+ Добавить тестового бота</button></section> : <><section className="rounded-3xl border border-white/10 bg-black/35 p-4 shadow-xl backdrop-blur"><div className="text-[9px] uppercase tracking-[.22em] text-amber-200/45">Новая игра</div><h2 className="mt-1 font-semibold">Создать стол</h2><input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-3 min-h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none focus:border-amber-200/40" /><button type="button" onClick={() => void create()} className="mt-3 min-h-12 w-full rounded-2xl bg-[linear-gradient(#e3c477,#b98637)] text-sm font-black text-[#1a1106] shadow-[inset_0_1px_rgba(255,255,255,.55)]">+ Создать открытый стол</button></section><section className="space-y-2"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Открытые столы</h2><span className="rounded-full bg-white/[.06] px-2 py-1 text-[10px] text-white/45">{lobbies.length}</span></div>{lobbies.length ? lobbies.map((lobby) => <div key={lobby.id} className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#101514] p-3 shadow-xl"><div className="absolute inset-y-0 right-0 w-28 bg-[url('/assets/poker/room-table-v1.webp')] bg-cover bg-center opacity-20"/><div className="relative flex items-center gap-3"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{lobby.title}</strong><span className="text-[10px] text-white/40">Texas Hold’em · {lobby.players.length}/8 игроков</span><div className="mt-2 flex -space-x-2">{lobby.players.slice(0, 5).map((player) => <span key={player.id} className="grid h-6 w-6 place-items-center rounded-full border border-[#101514] bg-[#6b5737] text-[8px] font-bold">{player.nickname?.slice(0, 1)}</span>)}</div></div><button type="button" onClick={() => void lobbyAction(lobby.id, 'join')} className="min-h-10 rounded-xl bg-[linear-gradient(#dfbd6a,#ad7931)] px-4 text-xs font-black text-black">Войти</button></div></div>) : <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/35">Открытых столов пока нет</div>}</section></>}
      </div>
    </main>
  );
}
