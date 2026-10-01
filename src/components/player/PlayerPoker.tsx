import { useEffect, useState } from 'react';

type Card = { rank: string; suit: string };
type Player = { id: string; nickname: string; seat: number; chips: number; is_bot?: boolean };
type Lobby = { id: string; title: string; status: string; players: Player[]; hand?: any };

const suitSymbol = (suit: string) => ({ hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit] || suit);
const cardColor = (suit: string) => suit === 'hearts' || suit === 'diamonds' ? 'text-[#d92f45]' : 'text-[#101116]';
const seatPositions = [
  'bottom-[7%] left-1/2 -translate-x-1/2', 'top-[20%] left-1/2 -translate-x-1/2',
  'top-[34%] right-[2%]', 'bottom-[28%] right-[2%]', 'bottom-[28%] left-[2%]',
  'top-[34%] left-[2%]', 'top-[22%] right-[12%]', 'top-[22%] left-[12%]',
];

const CHIP_DENOMINATIONS = [1000, 500, 100, 50, 25, 10, 5, 1] as const;

const chipBreakdown = (amount: number) => {
  let rest = Math.max(0, Math.floor(Number(amount) || 0));
  const chips: number[] = [];
  for (const denomination of CHIP_DENOMINATIONS) {
    while (rest >= denomination) {
      chips.push(denomination);
      rest -= denomination;
    }
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
  const chips = chipBreakdown(amount);
  if (!chips.length) return null;
  return <div className="inline-flex flex-col items-center">
    <div className={`flex items-end justify-center ${compact ? '-space-x-2.5' : '-space-x-3.5'}`}>
      {chips.map((denomination, index) => <img
        key={`${denomination}-${index}`}
        src={`/assets/poker/chips/chip-${denomination}-v2.webp`}
        alt={`Фишка ${denomination}`}
        className={`${compact ? 'h-7 w-7' : 'h-10 w-10'} relative object-contain drop-shadow-[0_5px_5px_rgba(0,0,0,.65)]`}
        style={{ zIndex: index + 1, transform: `translateY(${Math.abs(index - (chips.length - 1) / 2) * 1.5}px)` }}
      />)}
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
            const lastAction = [...(current.hand.action_log || [])].reverse().find((item: any) => item.player_id === player.id);
            return <div key={player.id} className={`absolute z-10 w-[104px] ${seatPositions[index]} text-center transition-all duration-300`}><div className={`relative mx-auto grid h-12 w-12 overflow-visible place-items-center rounded-full border-2 bg-[radial-gradient(circle_at_35%_25%,#f5d28a,#8d5924)] text-base font-bold text-black shadow-[0_5px_16px_rgba(0,0,0,.65)] ${winner ? 'poker-winner-seat border-amber-200 ring-2 ring-amber-300/50' : active ? 'poker-active-seat border-emerald-300 ring-2 ring-emerald-300/40' : 'border-amber-100/60'}`}><span>{player.nickname?.slice(0, 1).toUpperCase() || player.seat}</span>{!player.is_bot ? <img src={`/api/player/players/${encodeURIComponent(player.id)}/avatar`} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="absolute inset-0 h-full w-full rounded-full object-cover" /> : null}{dealer ? <span className="absolute -right-2 -top-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-black text-black">D</span> : null}</div><div className="-mt-1 rounded-xl border border-amber-100/10 bg-black/80 px-2 py-1.5 shadow-lg backdrop-blur-sm"><div className="truncate text-[11px] font-semibold">{mine ? 'Вы' : player.nickname}</div><div className="text-[10px] font-semibold text-amber-200">{handPlayer?.chips ?? player.chips}</div>{winner ? <div className="text-[9px] font-black uppercase tracking-wide text-amber-300">Победитель</div> : active ? <div className="text-[9px] font-bold text-emerald-300">{seconds} сек</div> : null}</div>{handPlayer?.committed > 0 ? <div key={handPlayer.committed} className="poker-chip-flight mt-0.5"><ChipAmount amount={Number(handPlayer.committed)} compact /></div> : null}{lastAction ? <div key={lastAction.at} className="poker-action-bubble mt-1 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/80">{actionText(lastAction)}</div> : null}{!mine ? <img src="/assets/poker/card-backs-2la-noir-v3.webp" alt="Закрытые карты 2LA Noire" className="mx-auto mt-1 w-14 drop-shadow-[0_5px_7px_rgba(0,0,0,.6)]"/> : null}</div>;
          })}
          <div className="absolute bottom-[17%] left-1/2 z-20 -translate-x-1/2"><div className="flex justify-center -space-x-1">{ownCards.map((card, index) => <span key={`${card.rank}-${card.suit}-${index}`} className="poker-hole-card" style={{ animationDelay: `${index * 160}ms`, transform: `rotate(${index ? 4 : -4}deg)` }}><PlayingCard card={card} /></span>)}</div><div className="mt-1 rounded-full border border-amber-100/15 bg-black/70 px-3 py-1 text-center text-[10px] font-semibold text-amber-100 backdrop-blur-sm">{current.hand.hand_label || 'Комбинация формируется'}</div></div>
        </section>

        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#090a0d]/95 px-3 py-2 backdrop-blur"><div className="mx-auto max-w-[560px]">{isMyTurn && actions?.to_call > 0 ? <div className="mb-2 text-center text-[11px] text-amber-200">Нужно уравнять {actions.to_call} · чек недоступен</div> : isMyTurn ? <div className="mb-2 text-center text-[11px] text-emerald-300">Можно сделать чек без ставки</div> : <div className="mb-2 text-center text-[11px] text-white/40">Ожидаем действие игрока {turnPlayer?.nickname || ''}</div>}<div className="grid grid-cols-4 gap-2"><button type="button" disabled={!actions?.can_fold} onClick={() => void pokerAction('fold')} className="min-h-12 rounded-2xl bg-[#d91e4d] text-sm font-bold disabled:opacity-30">Пас</button><button type="button" title={actions?.to_call > 0 ? `Сначала нужно уравнять ${actions.to_call}` : ''} disabled={!actions?.can_check} onClick={() => void pokerAction('check')} className="min-h-12 rounded-2xl bg-white/10 text-sm font-bold disabled:opacity-30">Чек</button><button type="button" disabled={!actions?.can_call} onClick={() => void pokerAction('call')} className="min-h-12 rounded-2xl bg-[#0f9b6d] text-sm font-bold disabled:opacity-30">Колл{actions?.to_call > 0 ? <><br/>{actions.to_call}</> : null}</button><button type="button" disabled={!actions?.can_bet || betAmount > actions.max_bet_total} onClick={() => void pokerAction('bet', betAmount)} className="min-h-12 rounded-2xl bg-[#d5a54b] text-sm font-bold text-black disabled:opacity-30">{current.hand.current_bet > 0 ? 'Рейз' : 'Ставка'}<br/>{betAmount}</button></div><div className="mt-2 grid grid-cols-[42px_1fr_42px_54px_54px_54px] gap-2"><button type="button" onClick={() => setBetAmount(Math.max(actions?.min_bet_total || 20, betAmount - 20))} className="rounded-xl bg-white/10">−</button><div className="grid place-items-center rounded-xl bg-white/[.06] text-sm font-semibold">{betAmount}</div><button type="button" onClick={() => setBetAmount(Math.min(actions?.max_bet_total || betAmount + 20, betAmount + 20))} className="rounded-xl bg-white/10">+</button><button type="button" onClick={() => setBetAmount(Math.max(actions?.min_bet_total || 20, Math.floor(current.hand.pot / 2)))} className="rounded-xl bg-white/[.06] text-xs">1/2</button><button type="button" onClick={() => setBetAmount(Math.max(actions?.min_bet_total || 20, Math.floor(current.hand.pot * .75)))} className="rounded-xl bg-white/[.06] text-xs">3/4</button><button type="button" onClick={() => setBetAmount(Math.min(actions?.max_bet_total || current.hand.pot, Math.max(actions?.min_bet_total || 20, current.hand.pot)))} className="rounded-xl bg-white/[.06] text-xs">Банк</button></div></div></div>
      </div>
    </main>
  );

  return (
    <main className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-[#090a0d] px-3 pb-12 pt-20 text-white"><header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-[#090a0d]/95 px-3 backdrop-blur"><button type="button" onClick={onExit} className="min-h-10 rounded-xl border border-white/10 px-3 text-sm text-white/70">← В приложение</button><div className="text-center"><div className="text-sm font-semibold">2LA Poker</div><div className="text-[9px] uppercase tracking-[.2em] text-amber-100/45">Лобби</div></div><div className="w-[106px]" /></header><div className="mx-auto max-w-lg space-y-4"><header><div className="text-xs uppercase tracking-[.2em] text-amber-100/40">Игровая зона</div><h1 className="mt-1 text-3xl font-semibold">Poker</h1><p className="mt-1 text-sm text-white/45">Открытые столы Texas Hold’em · 2–8 игроков</p></header>{error ? <div className="rounded-2xl bg-rose-400/15 p-3 text-sm text-rose-100">{error}</div> : null}{current ? <section className="space-y-3 rounded-3xl border border-amber-200/15 bg-[#15130f] p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">{current.title}</h2><span className="text-xs text-white/40">Ожидание</span></div><div className="space-y-2">{current.players?.map((player: Player) => <div key={player.id} className="flex items-center gap-3 rounded-2xl bg-black/25 px-3 py-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-amber-300 font-bold text-black">{player.nickname?.slice(0, 1)}</span><span className="flex-1 text-sm">Место {player.seat} · {player.nickname}</span>{player.is_bot ? <span className="text-xs text-amber-100/50">бот</span> : null}</div>)}</div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void lobbyAction(current.id, 'start')} className="min-h-12 rounded-2xl bg-white text-sm font-semibold text-black">Начать игру</button><button type="button" onClick={() => setCurrent(null)} className="min-h-12 rounded-2xl border border-white/10 text-sm text-white/60">К списку</button></div><button type="button" onClick={() => void lobbyAction(current.id, 'bot')} className="min-h-11 w-full rounded-2xl border border-amber-200/20 bg-amber-200/[.08] text-sm font-semibold text-amber-50">Добавить тестового бота</button></section> : <><section className="rounded-3xl border border-white/10 bg-white/[.03] p-4"><h2 className="font-semibold">Создать стол</h2><input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-3 min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm" /><button type="button" onClick={() => void create()} className="mt-3 min-h-12 w-full rounded-2xl bg-white text-sm font-semibold text-black">Создать открытый стол</button></section><section className="space-y-2"><h2 className="text-sm font-semibold text-white/70">Открытые столы</h2>{lobbies.length ? lobbies.map((lobby) => <div key={lobby.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{lobby.title}</strong><span className="text-xs text-white/40">{lobby.players.length}/8 игроков</span></div><button type="button" onClick={() => void lobbyAction(lobby.id, 'join')} className="min-h-10 rounded-xl bg-white px-4 text-xs font-semibold text-black">Войти</button></div>) : <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/35">Открытых столов пока нет</div>}</section></>}</div></main>
  );
}
