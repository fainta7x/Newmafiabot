import { useEffect, useState } from 'react';

type Card = { rank: string; suit: string };
type Player = { id: string; nickname: string; seat: number; chips: number; is_bot?: boolean };
type Lobby = { id: string; title: string; status: string; players: Player[]; hand?: any };

const suitSymbol = (suit: string) => ({ hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit] || suit);
const cardColor = (suit: string) => suit === 'hearts' || suit === 'diamonds' ? 'text-[#d92f45]' : 'text-[#101116]';
const seatPositions = [
  'bottom-3 left-1/2 -translate-x-1/2',
  'bottom-[22%] right-1',
  'top-[22%] right-1',
  'top-8 right-[22%]',
  'top-8 left-[22%]',
  'top-[22%] left-1',
  'bottom-[22%] left-1',
  'bottom-3 right-[17%]',
];

function PlayingCard({ card, small = false }: { card: Card; small?: boolean }) {
  return <span className={`grid shrink-0 place-items-center rounded-lg border border-black/10 bg-[#fffdf7] font-bold shadow-[0_5px_12px_rgba(0,0,0,.28)] ${cardColor(card.suit)} ${small ? 'h-14 w-10 text-base' : 'h-[74px] w-[52px] text-xl'}`}><span>{card.rank}</span><span className="-mt-2 text-sm">{suitSymbol(card.suit)}</span></span>;
}

export default function PlayerPoker() {
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [title, setTitle] = useState('Открытая покерная комната');
  const [error, setError] = useState<string | null>(null);

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

  if (current?.hand) return (
    <main className="min-h-[calc(100dvh-7rem)] bg-[radial-gradient(circle_at_50%_20%,#242019_0,#0a0b0e_55%)] px-2 pb-36 pt-3 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="mb-2 flex items-center justify-between px-2"><div><div className="text-[10px] uppercase tracking-[.22em] text-amber-100/40">Texas Hold’em</div><h1 className="text-base font-semibold">{current.title}</h1></div><div className={`rounded-full px-3 py-1 text-xs font-semibold ${isMyTurn ? 'bg-emerald-400 text-[#06291c]' : 'bg-white/10 text-white/65'}`}>{isMyTurn ? 'Ваш ход' : turnPlayer ? `Ход: ${turnPlayer.nickname}` : 'Раздача завершена'}</div></div>
        {error ? <div className="mb-2 rounded-xl bg-rose-400/15 px-3 py-2 text-xs text-rose-100">{error}</div> : null}

        <section className="relative min-h-[500px] overflow-hidden rounded-[46%] border-[12px] border-[#5a351d] bg-[radial-gradient(ellipse_at_center,#176747_0%,#0b3e2c_68%,#07281e_100%)] shadow-[inset_0_0_55px_rgba(0,0,0,.55),0_18px_38px_rgba(0,0,0,.5)]">
          <div className="absolute inset-[8px] rounded-[46%] border border-amber-100/15" />
          <div className="absolute left-1/2 top-[44%] w-full -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="mb-2 inline-flex rounded-full border border-amber-200/20 bg-black/25 px-3 py-1 text-[11px] font-semibold text-amber-100">Банк · {current.hand.pot}</div>
            <div className="flex justify-center gap-1.5">{(current.hand.board || []).map((card: Card, index: number) => <PlayingCard key={`${card.rank}-${card.suit}-${index}`} card={card} small />)}{Array.from({ length: 5 - (current.hand.board || []).length }).map((_, index) => <span key={`empty-${index}`} className="h-14 w-10 rounded-lg border border-white/20 bg-black/10" />)}</div>
            <div className="mt-2 text-[10px] uppercase tracking-[.2em] text-emerald-100/50">{current.hand.street}</div>
          </div>

          {current.players.slice(0, 8).map((player: Player, index: number) => {
            const active = player.seat === current.hand.current_seat;
            const mine = player.id === viewerId;
            return <div key={player.id} className={`absolute z-10 w-[112px] ${seatPositions[index]} rounded-2xl border px-2 py-2 text-center shadow-lg ${active ? 'border-amber-300 bg-[#17130d] ring-2 ring-amber-300/30' : 'border-white/10 bg-black/60'}`}><div className="mx-auto mb-1 grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-amber-200 to-amber-500 text-xs font-bold text-black">{player.nickname?.slice(0, 1).toUpperCase() || player.seat}</div><div className="truncate text-[11px] font-semibold">{mine ? 'Вы' : player.nickname}</div><div className="text-[10px] text-amber-100/65">{player.chips} фишек</div>{active ? <div className="mt-1 text-[9px] font-bold uppercase tracking-wide text-amber-300">{seconds} сек</div> : null}</div>;
          })}
        </section>

        <section className="relative -mt-16 mx-auto w-[92%] rounded-3xl border border-amber-200/20 bg-[#111216]/95 p-3 shadow-2xl backdrop-blur">
          <div className="flex items-end justify-between gap-3"><div><div className="mb-2 text-[10px] uppercase tracking-[.18em] text-white/40">Ваши карты</div><div className="flex gap-2">{ownCards.map((card, index) => <PlayingCard key={`${card.rank}-${card.suit}-${index}`} card={card} />)}</div></div><div className="pb-1 text-right"><div className="text-[10px] uppercase tracking-[.16em] text-white/35">Комбинация</div><div className="mt-1 max-w-[170px] text-sm font-semibold text-amber-100">{current.hand.hand_label || 'Формируется'}</div></div></div>
        </section>

        <div className="fixed bottom-[4.6rem] left-0 right-0 z-40 border-t border-white/10 bg-[#090a0d]/95 px-3 py-2 backdrop-blur"><div className="mx-auto grid max-w-2xl grid-cols-4 gap-2"><button type="button" disabled={!isMyTurn} onClick={() => void pokerAction('fold')} className="min-h-12 rounded-2xl bg-[#d91e4d] text-sm font-bold disabled:opacity-30">Пас</button><button type="button" disabled={!isMyTurn} onClick={() => void pokerAction('check')} className="min-h-12 rounded-2xl bg-white/10 text-sm font-bold disabled:opacity-30">Чек</button><button type="button" disabled={!isMyTurn} onClick={() => void pokerAction('call')} className="min-h-12 rounded-2xl bg-[#0f9b6d] text-sm font-bold disabled:opacity-30">Колл</button><button type="button" disabled={!isMyTurn} onClick={() => void pokerAction('bet', 100)} className="min-h-12 rounded-2xl bg-[#f5b51b] text-sm font-bold text-black disabled:opacity-30">Ставка</button></div></div>
      </div>
    </main>
  );

  return (
    <main className="min-h-[calc(100dvh-7rem)] bg-[#090a0d] px-3 pb-28 pt-4 text-white"><div className="mx-auto max-w-lg space-y-4"><header><div className="text-xs uppercase tracking-[.2em] text-amber-100/40">Игровая зона</div><h1 className="mt-1 text-3xl font-semibold">Poker</h1><p className="mt-1 text-sm text-white/45">Открытые столы Texas Hold’em · 2–8 игроков</p></header>{error ? <div className="rounded-2xl bg-rose-400/15 p-3 text-sm text-rose-100">{error}</div> : null}{current ? <section className="space-y-3 rounded-3xl border border-amber-200/15 bg-[#15130f] p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">{current.title}</h2><span className="text-xs text-white/40">Ожидание</span></div><div className="space-y-2">{current.players?.map((player: Player) => <div key={player.id} className="flex items-center gap-3 rounded-2xl bg-black/25 px-3 py-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-amber-300 font-bold text-black">{player.nickname?.slice(0, 1)}</span><span className="flex-1 text-sm">Место {player.seat} · {player.nickname}</span>{player.is_bot ? <span className="text-xs text-amber-100/50">бот</span> : null}</div>)}</div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void lobbyAction(current.id, 'start')} className="min-h-12 rounded-2xl bg-white text-sm font-semibold text-black">Начать игру</button><button type="button" onClick={() => setCurrent(null)} className="min-h-12 rounded-2xl border border-white/10 text-sm text-white/60">К списку</button></div><button type="button" onClick={() => void lobbyAction(current.id, 'bot')} className="min-h-11 w-full rounded-2xl border border-amber-200/20 bg-amber-200/[.08] text-sm font-semibold text-amber-50">Добавить тестового бота</button></section> : <><section className="rounded-3xl border border-white/10 bg-white/[.03] p-4"><h2 className="font-semibold">Создать стол</h2><input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-3 min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm" /><button type="button" onClick={() => void create()} className="mt-3 min-h-12 w-full rounded-2xl bg-white text-sm font-semibold text-black">Создать открытый стол</button></section><section className="space-y-2"><h2 className="text-sm font-semibold text-white/70">Открытые столы</h2>{lobbies.length ? lobbies.map((lobby) => <div key={lobby.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{lobby.title}</strong><span className="text-xs text-white/40">{lobby.players.length}/8 игроков</span></div><button type="button" onClick={() => void lobbyAction(lobby.id, 'join')} className="min-h-10 rounded-xl bg-white px-4 text-xs font-semibold text-black">Войти</button></div>) : <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/35">Открытых столов пока нет</div>}</section></>}</div></main>
  );
}
