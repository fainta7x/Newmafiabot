import { useEffect, useState } from 'react';

type Lobby = { id: string; title: string; status: string; players: Array<{ id: string; nickname: string; seat: number }> };
type Card = { rank: string; suit: string };

const suitSymbol = (suit: string) => ({ hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit] || suit);
const cardColor = (suit: string) => suit === 'hearts' || suit === 'diamonds' ? 'text-red-600' : 'text-black';

export default function PlayerPoker() {
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [title, setTitle] = useState('Открытая покерная комната');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch('/api/player/poker/lobbies', { credentials: 'include' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setLobbies(body.lobbies || []);
  };

  useEffect(() => { void load().catch((e: any) => setError(e.message || 'Не удалось загрузить лобби.')); }, []);

  const create = async () => {
    const response = await fetch('/api/player/poker/lobbies', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    const body = await response.json();
    if (!response.ok) return setError(body.error);
    setCurrent(body.lobby);
  };

  const lobbyAction = async (id: string, method: 'join' | 'start') => {
    const response = await fetch(`/api/player/poker/lobbies/${id}/${method}`, { method: 'POST', credentials: 'include' });
    const body = await response.json();
    if (!response.ok) return setError(body.error);
    setCurrent(body.lobby);
  };

  const pokerAction = async (type: string, amount?: number) => {
    const response = await fetch(`/api/player/poker/lobbies/${current.id}/action`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, amount }) });
    const body = await response.json();
    if (!response.ok) return setError(body.error);
    setCurrent(body.lobby);
  };

  useEffect(() => {
    if (!current?.id) return undefined;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/player/poker/lobbies/${current.id}`, { credentials: 'include' });
      if (response.ok) setCurrent((await response.json()).lobby);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [current?.id]);

  const ownCards: Card[] = current?.hand?.hole_cards ? Object.values(current.hand.hole_cards)[0] as Card[] || [] : [];

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-6 text-white">
      <div className="mx-auto max-w-[430px] space-y-4">
        <header>
          <div className="text-xs uppercase tracking-[.2em] text-amber-100/40">Новая игровая зона</div>
          <h1 className="mt-1 text-2xl font-semibold">Poker</h1>
          <p className="mt-1 text-sm leading-5 text-white/45">Открытые комнаты Texas Hold’em · 2–8 игроков</p>
        </header>

        {error ? <div className="rounded-2xl bg-rose-400/10 p-3 text-xs text-rose-100">{error}</div> : null}

        {current ? (
          <section className="space-y-3 rounded-3xl border border-amber-200/15 bg-amber-200/[.05] p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">{current.title}</h2><span className="text-xs text-white/40">{current.status === 'waiting' ? 'Ожидание' : 'Игра идёт'}</span></div>
            {current.hand ? (
              <>
                <div className="relative min-h-[370px] overflow-hidden rounded-[2rem] border-[10px] border-[#4b2c19] bg-[radial-gradient(circle_at_center,#176044,#0b3929_70%)] p-4 text-center shadow-[inset_0_0_35px_rgba(0,0,0,.45),0_12px_30px_rgba(0,0,0,.35)]">
                  <div className="absolute left-4 right-4 top-3 flex items-center justify-between text-[10px] uppercase tracking-[.2em] text-emerald-100/60"><span>{current.hand.street}</span><span>{current.hand.turn_remaining ? `Ход · ${current.hand.turn_remaining.base_seconds + current.hand.turn_remaining.reserve_seconds}с` : ''}</span></div>
                  <div className="absolute left-1/2 top-1/2 w-full -translate-x-1/2 -translate-y-1/2"><div className="mb-2 text-xs uppercase tracking-[.18em] text-amber-100/70">Банк {current.hand.pot}</div><div className="flex justify-center gap-1.5">{(current.hand.board || []).map((card: Card, index: number) => <span key={index} className={`grid h-14 w-10 place-items-center rounded-md bg-white text-lg font-bold shadow-md ${cardColor(card.suit)}`}><span>{card.rank}</span><span className="-mt-1 text-sm">{suitSymbol(card.suit)}</span></span>)}{Array.from({ length: 5 - (current.hand.board || []).length }).map((_, index) => <span key={`empty-${index}`} className="h-14 w-10 rounded-md border border-white/20 bg-black/10" />)}</div></div>
                  {current.players.slice(0, 4).map((player: any, index: number) => <div key={player.id} className={`absolute ${['bottom-3 left-3', 'bottom-3 right-3', 'top-12 left-3', 'top-12 right-3'][index]} max-w-[125px] rounded-xl border border-white/10 bg-black/45 px-2 py-1.5 text-left text-[11px] shadow-lg`}><div className="truncate font-semibold text-white">{player.nickname || `Игрок ${player.seat}`}</div><div className="text-amber-100/70">{player.chips} фишек</div></div>)}
                </div>
                <div className="rounded-2xl border border-amber-200/15 bg-black/20 p-3">
                  <div className="text-xs uppercase tracking-[.16em] text-white/40">Ваши карты</div>
                  <div className="mt-2 flex gap-2">{ownCards.length ? ownCards.map((card, index) => <span key={index} className={`grid h-16 w-12 place-items-center rounded-lg bg-white text-lg font-bold ${cardColor(card.suit)}`}><span>{card.rank}</span><span className="-mt-1 text-sm">{suitSymbol(card.suit)}</span></span>) : <span className="text-sm text-white/40">Карты скрыты до начала раздачи</span>}</div>
                  <div className="mt-3 text-sm text-amber-100">Ваша комбинация: <strong>{current.hand.hand_label || 'Комбинация формируется'}</strong></div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-white/50">{current.players.length} игрока за столом · номинальные фишки · Texas Hold’em</div>
                <div className="grid grid-cols-4 gap-2"><button type="button" onClick={() => void pokerAction('fold')} className="min-h-11 rounded-xl bg-rose-500/80 text-xs font-semibold">Пас</button><button type="button" onClick={() => void pokerAction('check')} className="min-h-11 rounded-xl bg-white/10 text-xs font-semibold">Чек</button><button type="button" onClick={() => void pokerAction('call')} className="min-h-11 rounded-xl bg-emerald-500/70 text-xs font-semibold">Колл</button><button type="button" onClick={() => void pokerAction('bet', 100)} className="min-h-11 rounded-xl bg-amber-400 text-xs font-semibold text-black">Ставка</button></div>
              </>
            ) : (
              <><div className="space-y-2">{current.players?.map((player: any) => <div key={player.id} className="rounded-xl bg-black/20 px-3 py-2 text-sm">Место {player.seat} · {player.nickname}</div>)}</div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void lobbyAction(current.id, 'start')} className="min-h-11 rounded-xl bg-white text-xs font-semibold text-black">Начать игру</button><button type="button" onClick={() => setCurrent(null)} className="min-h-11 rounded-xl border border-white/10 text-xs text-white/60">К лобби</button></div></>
            )}
          </section>
        ) : (
          <>
            <section className="space-y-2 rounded-3xl border border-white/10 bg-white/[.03] p-4"><h2 className="font-semibold">Создать лобби</h2><input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm" /><button type="button" onClick={() => void create()} className="mt-2 min-h-11 w-full rounded-xl bg-white text-xs font-semibold text-black">Создать открытую комнату</button></section>
            <section className="space-y-2"><h2 className="text-sm font-semibold text-white/70">Открытые лобби</h2>{lobbies.length ? lobbies.map((lobby) => <div key={lobby.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{lobby.title}</strong><span className="text-xs text-white/40">{lobby.players.length}/8 игроков</span></div><button type="button" onClick={() => void lobbyAction(lobby.id, 'join')} className="min-h-10 rounded-xl bg-white px-3 text-xs font-semibold text-black">Войти</button></div>) : <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-white/35">Открытых лобби пока нет</div>}</section>
          </>
        )}
      </div>
    </main>
  );
}
