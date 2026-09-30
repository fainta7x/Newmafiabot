import { useEffect, useState } from 'react';

type Seat = { seat: number; nickname: string; player_id: string | null };
type Lobby = {
  event: { kind: 'tournament' | 'evening'; title: string; starts_at: string | null } | null;
  next_game: { number: number; table: string | null; seats: Seat[] } | null;
  played_games: number;
  total_games: number | null;
  standings: Array<{ place: number; nickname: string; points: number }>;
};

const points = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, ''));

const Avatar = ({ token, seat }: { token: string; seat: Seat }) => {
  const [failed, setFailed] = useState(false);
  const initial = seat.nickname.trim().charAt(0).toLocaleUpperCase('ru-RU') || '?';
  return (
    <span className="grid h-[5.2vw] w-[5.2vw] shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-[2.2vw] font-bold text-white/70">
      {!failed && seat.player_id
        ? <img src={`/api/public/broadcast/${encodeURIComponent(token)}/avatar/${encodeURIComponent(seat.player_id)}`} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
        : initial}
    </span>
  );
};

/**
 * Full-frame OBS scenes (owner, 2026-10-01), added as a 1920×1080 Browser Source:
 * `/broadcast/<secret>/lobby` — «Заставка»: «Готовимся к игре» and the next game's seating;
 * `/broadcast/<secret>/standings` — «Итоги»: the tournament table.
 */
export default function BroadcastLobbyScreen({ token, view }: { token: string; view: 'lobby' | 'standings' }) {
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/public/broadcast/${encodeURIComponent(token)}/lobby`, { cache: 'no-store' });
        if (response.status === 404) { if (!stopped) setMissing(true); return; }
        if (response.ok && !stopped) setLobby(await response.json());
      } catch { /* keep the last picture while the network is away */ }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [token]);

  const title = lobby?.event?.title || '2LA Noire';
  const progress = lobby?.total_games ? `Сыграно ${lobby.played_games} из ${lobby.total_games}` : lobby?.played_games ? `Сыграно игр: ${lobby.played_games}` : '';

  return (
    <main data-testid={`broadcast-${view}`} className="flex h-screen w-screen flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,#2a0f18_0%,#0b0b10_60%)] px-[4vw] py-[3vw] text-white">
      <header className="flex items-end justify-between gap-[2vw]">
        <div className="min-w-0">
          <div className="text-[1.3vw] font-semibold uppercase tracking-[0.3em] text-rose-300/70">2LA Noire · мафия</div>
          <h1 className="mt-[0.6vw] truncate text-[3.4vw] font-black leading-none">{view === 'lobby' ? 'Готовимся к игре' : 'Итоги турнира'}</h1>
          <div className="mt-[0.8vw] truncate text-[1.6vw] text-white/60">{title}{progress ? ` · ${progress}` : ''}</div>
        </div>
        {view === 'lobby' && lobby?.next_game ? (
          <div className="shrink-0 rounded-[1.2vw] border border-white/15 bg-white/5 px-[2vw] py-[1vw] text-right">
            <div className="text-[1.1vw] uppercase tracking-[0.2em] text-white/45">Следующая</div>
            <div className="text-[2.6vw] font-black">Игра {lobby.next_game.number}{lobby.next_game.table ? ` · ${lobby.next_game.table}` : ''}</div>
          </div>
        ) : null}
      </header>

      {missing ? <p className="m-auto text-[2vw] text-white/50">Ссылка трансляции устарела — возьмите новую в приложении.</p> : null}

      {!missing && view === 'lobby' ? (lobby?.next_game?.seats.length ? (
        <ol className="mt-[3vw] grid flex-1 grid-cols-2 content-start gap-x-[3vw] gap-y-[1.2vw]">
          {lobby.next_game.seats.map((seat) => (
            <li key={seat.seat} className="flex items-center gap-[1.4vw] rounded-[1.2vw] bg-white/[0.06] px-[1.4vw] py-[0.8vw]">
              <span className="w-[3.4vw] shrink-0 text-center text-[2.6vw] font-black text-rose-300">{seat.seat}</span>
              <Avatar token={token} seat={seat} />
              <span className="min-w-0 truncate text-[2.2vw] font-bold">{seat.nickname}</span>
            </li>
          ))}
        </ol>
      ) : <p className="m-auto text-center text-[2.2vw] leading-snug text-white/55">Рассадка появится здесь,<br />как только организатор создаст следующую игру.</p>) : null}

      {!missing && view === 'standings' ? (lobby?.standings.length ? (
        <ol className="mt-[2.4vw] grid flex-1 grid-flow-col grid-cols-2 grid-rows-[repeat(10,minmax(0,1fr))] gap-x-[3vw] gap-y-[0.6vw]">
          {lobby.standings.slice(0, 20).map((row) => (
            <li key={`${row.place}-${row.nickname}`} className={`flex items-center gap-[1.4vw] rounded-[1vw] px-[1.4vw] ${row.place <= 3 ? 'bg-amber-300/15' : 'bg-white/[0.05]'}`}>
              <span className="w-[3vw] shrink-0 text-center text-[2vw] font-black text-amber-200">{row.place}</span>
              <span className="min-w-0 flex-1 truncate text-[1.9vw] font-bold">{row.nickname}</span>
              <span className="shrink-0 text-[1.9vw] font-black tabular-nums">{points(row.points)}</span>
            </li>
          ))}
        </ol>
      ) : <p className="m-auto text-center text-[2.2vw] text-white/55">Таблица появится после первой сыгранной игры турнира.</p>) : null}
    </main>
  );
}
