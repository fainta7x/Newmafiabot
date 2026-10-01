import { useEffect, useState } from 'react';

type Card = { rank: string; suit: string };
type Player = { id: string; nickname: string; seat: number; chips: number; is_bot?: boolean };
type Lobby = { id: string; title: string; status: string; players: Player[]; hand?: any };

const suitSymbol = (suit: string) => ({ hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit] || suit);
const cardColor = (suit: string) => suit === 'hearts' || suit === 'diamonds' ? 'text-[#d92f45]' : 'text-[#101116]';
const seatPositions = [
  'bottom-3 left-1/2 -translate-x-1/2', 'top-7 left-1/2 -translate-x-1/2',
  'top-[25%] right-0', 'bottom-[25%] right-0', 'bottom-[18%] left-0',
  'top-[25%] left-0', 'top-7 right-[14%]', 'top-7 left-[14%]',
];

const stageIndex = (street: string) => ({ preflop: 0, flop: 1, turn: 2, river: 3, showdown: 4, finished: 4 }[String(street || '').toLowerCase()] || 0);

function PlayingCard({ card, small = false }: { card: Card; small?: boolean }) {
  return <span className={`grid shrink-0 place-items-center rounded-lg border border-black/10 bg-[#fffdf7] font-bold shadow-[0_5px_12px_rgba(0,0,0,.28)] ${cardColor(card.suit)} ${small ? 'h-14 w-10 text-base' : 'h-[74px] w-[52px] text-xl'}`}><span>{card.rank}</span><span className="-mt-2 text-sm">{suitSymbol(card.suit)}</span></span>;
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

  if (current?.hand) return (
    <main className="poker-room-bg min-h-[var(--tg-viewport-stable-height,100dvh)] px-2 pb-40 pt-16 text-white">
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-[#090a0d]/95 px-3 backdrop-blur"><button type="button" onClick={onExit} className="min-h-10 rounded-xl border border-white/10 px-3 text-sm text-white/70">← В приложение</button><div className="text-center"><div className="text-sm font-semibold">2LA Poker</div><div className="text-[9px] uppercase tracking-[.2em] text-amber-100/45">Texas Hold’em</div></div><div className="w-[106px]" /></header>
      <div className="mx-auto max-w-[560px]">
        <div className="mb-2 flex items-center justify-between px-2"><div><div className="text-[10px] uppercase tracking-[.22em] text-amber-100/40">Texas Hold’em</div><h1 className="text-base font-semibold">{current.title}</h1></div><div className={`rounded-full px-3 py-1 text-xs font-semibold ${isMyTurn ? 'bg-emerald-400 text-[#06291c]' : 'bg-white/10 text-white/65'}`}>{isMyTurn ? 'Ваш ход' : turnPlayer ? `Ход: ${turnPlayer.nickname}` : 'Раздача завершена'}</div></div>
        {error ? <div className="mb-2 rounded-xl bg-rose-400/15 px-3 py-2 text-xs text-rose-100">{error}</div> : null}

        <div className="mb-3 flex items-center px-6">{['Префлоп', 'Флоп', 'Тёрн', 'Ривер'].map((label, index) => <div key={label} className="flex flex-1 items-center last:flex-none"><div className="text-center"><div className={`mx-auto h-3 w-3 rounded-full border-2 ${index <= currentStage ? 'border-emerald-300 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]' : 'border-white/25 bg-[#121417]'}`} /><div className={`mt-1 text-[9px] ${index <= currentStage ? 'text-emerald-300' : 'text-white/35'}`}>{label}</div></div>{index < 3 ? <div className={`mb-4 h-px flex-1 ${index < currentStage ? 'bg-emerald-400' : 'bg-white/15'}`} /> : null}</div>)}</div>

        <section className="relative mx-auto h-[min(67dvh,650px)] min-h-[520px] w-full max-w-[520px] overflow-hidden rounded-[46%] border-[14px] border-[#4b2c18] bg-[radial-gradient(ellipse_at_center,#0f6845_0%,#08432e_65%,#05281d_100%)] shadow-[inset_0_0_65px_rgba(0,0,0,.62),0_20px_48px_rgba(0,0,0,.65),0_0_0_4px_#18110d]">
          <div className="absolute inset-[8px] rounded-[46%] border border-amber-100/15" />
          <div className="absolute left-1/2 top-[44%] w-full -translate-x-1/2 -translate-y-1/2 text-center">
            <div key={current.hand.pot} className="poker-chip-flight mb-2 inline-flex items-center gap-2 rounded-xl border border-amber-200/15 bg-black/45 px-3 py-1.5 text-xs font-semibold text-amber-100"><span className="flex -space-x-2"><i className="h-5 w-5 rounded-full border-2 border-dashed border-white bg-[#d9274f]" /><i className="h-5 w-5 rounded-full border-2 border-dashed border-white bg-[#2869bd]" /><i className="h-5 w-5 rounded-full border-2 border-dashed border-white bg-[#299b69]" /></span><span>Банк<br/><b>{current.hand.pot}</b></span></div>
            <div className="flex justify-center gap-1.5">{(current.hand.board || []).map((card: Card, index: number) => <span key={`${card.rank}-${card.suit}-${index}`} className="poker-board-card" style={{ animationDelay: `${index * 110}ms` }}><PlayingCard card={card} small /></span>)}{Array.from({ length: 5 - (current.hand.board || []).length }).map((_, index) => <span key={`empty-${index}`} className="h-14 w-10 rounded-lg border border-white/20 bg-black/10" />)}</div>
            <div className="mt-2 text-[10px] uppercase tracking-[.2em] text-emerald-100/50">{current.hand.street}</div>
          </div>

          {orderedPlayers.slice(0, 8).map((player: Player, index: number) => {
            const active = player.seat === current.hand.current_seat;
            const mine = player.id === viewerId;
            const handPlayer = current.hand.players?.find((item: Player) => item.id === player.id);
            const dealer = player.seat === current.hand.dealer_seat;
            return <div key={player.id} className={`absolute z-10 w-[108px] ${seatPositions[index]} text-center transition-all duration-300`}><div className={`relative mx-auto grid h-12 w-12 place-items-center rounded-full border-2 bg-[radial-gradient(circle_at_35%_25%,#f5d28a,#8d5924)] text-base font-bold text-black shadow-lg ${active ? 'poker-active-seat border-emerald-300 ring-2 ring-emerald-300/40' : 'border-amber-100/60'}`}>{player.nickname?.slice(0, 1).toUpperCase() || player.seat}{dealer ? <span className="absolute -right-2 -top-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-black text-black">D</span> : null}</div><div className="-mt-1 rounded-xl border border-white/10 bg-black/75 px-2 py-1.5 shadow-lg"><div className="truncate text-[11px] font-semibold">{mine ? 'Вы' : player.nickname}</div><div className="text-[10px] font-semibold text-amber-200">{handPlayer?.chips ?? player.chips}</div>{active ? <div className="text-[9px] font-bold text-emerald-300">{seconds} сек</div> : null}</div>{!mine ? <div className="mt-1 flex justify-center -space-x-2"><span className="poker-card-back h-9 w-7 -rotate-6"/><span className="poker-card-back h-9 w-7 rotate-6"/></div> : null}</div>;
          })}
        </section>

        <section className="relative -mt-16 mx-auto w-[92%] rounded-3xl border border-amber-200/20 bg-[#111216]/95 p-3 shadow-2xl backdrop-blur">
          <div className="flex items-end justify-between gap-3"><div><div className="mb-2 text-[10px] uppercase tracking-[.18em] text-white/40">Ваши карты</div><div className="flex gap-2">{ownCards.map((card, index) => <span key={`${card.rank}-${card.suit}-${index}`} className="poker-hole-card" style={{ animationDelay: `${index * 160}ms` }}><PlayingCard card={card} /></span>)}</div></div><div className="pb-1 text-right"><div className="text-[10px] uppercase tracking-[.16em] text-white/35">Комбинация</div><div className="mt-1 max-w-[170px] text-sm font-semibold text-amber-100">{current.hand.hand_label || 'Формируется'}</div></div></div>
        </section>

        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#090a0d]/95 px-3 py-2 backdrop-blur"><div className="mx-auto max-w-[560px]"><div className="grid grid-cols-4 gap-2"><button type="button" disabled={!isMyTurn} onClick={() => void pokerAction('fold')} className="min-h-12 rounded-2xl bg-[#d91e4d] text-sm font-bold disabled:opacity-30">Пас</button><button type="button" disabled={!isMyTurn} onClick={() => void pokerAction('check')} className="min-h-12 rounded-2xl bg-white/10 text-sm font-bold disabled:opacity-30">Чек</button><button type="button" disabled={!isMyTurn} onClick={() => void pokerAction('call')} className="min-h-12 rounded-2xl bg-[#0f9b6d] text-sm font-bold disabled:opacity-30">Колл</button><button type="button" disabled={!isMyTurn} onClick={() => void pokerAction('bet', betAmount)} className="min-h-12 rounded-2xl bg-[#d5a54b] text-sm font-bold text-black disabled:opacity-30">Ставка<br/>{betAmount}</button></div><div className="mt-2 grid grid-cols-[42px_1fr_42px_54px_54px_54px] gap-2"><button type="button" onClick={() => setBetAmount(Math.max(20, betAmount - 20))} className="rounded-xl bg-white/10">−</button><div className="grid place-items-center rounded-xl bg-white/[.06] text-sm font-semibold">{betAmount}</div><button type="button" onClick={() => setBetAmount(betAmount + 20)} className="rounded-xl bg-white/10">+</button><button type="button" onClick={() => setBetAmount(Math.max(20, Math.floor(current.hand.pot / 2)))} className="rounded-xl bg-white/[.06] text-xs">1/2</button><button type="button" onClick={() => setBetAmount(Math.max(20, Math.floor(current.hand.pot * .75)))} className="rounded-xl bg-white/[.06] text-xs">3/4</button><button type="button" onClick={() => setBetAmount(Math.max(20, current.hand.pot))} className="rounded-xl bg-white/[.06] text-xs">Банк</button></div></div></div>
      </div>
    </main>
  );

  return (
    <main className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-[#090a0d] px-3 pb-12 pt-20 text-white"><header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-[#090a0d]/95 px-3 backdrop-blur"><button type="button" onClick={onExit} className="min-h-10 rounded-xl border border-white/10 px-3 text-sm text-white/70">← В приложение</button><div className="text-center"><div className="text-sm font-semibold">2LA Poker</div><div className="text-[9px] uppercase tracking-[.2em] text-amber-100/45">Лобби</div></div><div className="w-[106px]" /></header><div className="mx-auto max-w-lg space-y-4"><header><div className="text-xs uppercase tracking-[.2em] text-amber-100/40">Игровая зона</div><h1 className="mt-1 text-3xl font-semibold">Poker</h1><p className="mt-1 text-sm text-white/45">Открытые столы Texas Hold’em · 2–8 игроков</p></header>{error ? <div className="rounded-2xl bg-rose-400/15 p-3 text-sm text-rose-100">{error}</div> : null}{current ? <section className="space-y-3 rounded-3xl border border-amber-200/15 bg-[#15130f] p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">{current.title}</h2><span className="text-xs text-white/40">Ожидание</span></div><div className="space-y-2">{current.players?.map((player: Player) => <div key={player.id} className="flex items-center gap-3 rounded-2xl bg-black/25 px-3 py-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-amber-300 font-bold text-black">{player.nickname?.slice(0, 1)}</span><span className="flex-1 text-sm">Место {player.seat} · {player.nickname}</span>{player.is_bot ? <span className="text-xs text-amber-100/50">бот</span> : null}</div>)}</div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void lobbyAction(current.id, 'start')} className="min-h-12 rounded-2xl bg-white text-sm font-semibold text-black">Начать игру</button><button type="button" onClick={() => setCurrent(null)} className="min-h-12 rounded-2xl border border-white/10 text-sm text-white/60">К списку</button></div><button type="button" onClick={() => void lobbyAction(current.id, 'bot')} className="min-h-11 w-full rounded-2xl border border-amber-200/20 bg-amber-200/[.08] text-sm font-semibold text-amber-50">Добавить тестового бота</button></section> : <><section className="rounded-3xl border border-white/10 bg-white/[.03] p-4"><h2 className="font-semibold">Создать стол</h2><input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-3 min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm" /><button type="button" onClick={() => void create()} className="mt-3 min-h-12 w-full rounded-2xl bg-white text-sm font-semibold text-black">Создать открытый стол</button></section><section className="space-y-2"><h2 className="text-sm font-semibold text-white/70">Открытые столы</h2>{lobbies.length ? lobbies.map((lobby) => <div key={lobby.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{lobby.title}</strong><span className="text-xs text-white/40">{lobby.players.length}/8 игроков</span></div><button type="button" onClick={() => void lobbyAction(lobby.id, 'join')} className="min-h-10 rounded-xl bg-white px-4 text-xs font-semibold text-black">Войти</button></div>) : <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/35">Открытых столов пока нет</div>}</section></>}</div></main>
  );
}
