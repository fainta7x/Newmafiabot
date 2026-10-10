import { useEffect, useMemo, useState, type ReactNode } from 'react';
import './broadcastLobbyScreen.css';

type PlayerIdentity = { nickname: string; player_id: string | null };
type Seat = PlayerIdentity & { seat: number };
type Standing = PlayerIdentity & { place: number; points: number };
type Lobby = {
  event: { kind: 'tournament' | 'evening'; title: string; starts_at: string | null } | null;
  next_game: { number: number; table: string | null; seats: Seat[] } | null;
  played_games: number;
  total_games: number | null;
  standings: Standing[];
};

const points = (value: number) => Number(value || 0).toLocaleString('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const eventDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(date);
};

const Avatar = ({ token, player, size = 'regular' }: { token: string; player: PlayerIdentity; size?: 'regular' | 'podium' | 'compact' }) => {
  const [failed, setFailed] = useState(false);
  const initial = player.nickname.trim().charAt(0).toLocaleUpperCase('ru-RU') || '?';

  useEffect(() => setFailed(false), [player.player_id]);

  return (
    <span className={`broadcast-avatar broadcast-avatar--${size}`} aria-hidden="true">
      {!failed && player.player_id ? (
        <img
          src={`/api/public/broadcast/${encodeURIComponent(token)}/avatar/${encodeURIComponent(player.player_id)}`}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="broadcast-avatar-fallback">{initial}</span>
      )}
    </span>
  );
};

function BrandMark() {
  return (
    <div className="broadcast-brand" aria-label="2LA Noire">
      <span className="broadcast-brand-mark">2LA</span>
      <span className="broadcast-brand-copy">
        <b>NOIRE</b>
        <small>SPORT MAFIA · TULA</small>
      </span>
    </div>
  );
}

function SceneFrame({
  lobby,
  view,
  children,
}: {
  lobby: Lobby | null;
  view: 'lobby' | 'standings';
  children: ReactNode;
}) {
  const progress = lobby?.total_games
    ? `${lobby.played_games} / ${lobby.total_games}`
    : lobby?.played_games
      ? String(lobby.played_games)
      : '0';
  const date = eventDate(lobby?.event?.starts_at);
  const eventKind = lobby?.event?.kind === 'tournament' ? 'ТУРНИР' : 'ИГРОВОЙ ВЕЧЕР';

  return (
    <main data-testid={`broadcast-${view}`} className={`broadcast-intermission broadcast-intermission--${view} flex flex-col`}>
      <div className="broadcast-scene-glow broadcast-scene-glow--one" />
      <div className="broadcast-scene-glow broadcast-scene-glow--two" />
      <div className="broadcast-scene-grid" />
      <div className="broadcast-scene-wordmark" aria-hidden="true">NOIRE</div>
      <div className="broadcast-scene-frame" />

      <header className="broadcast-scene-header">
        <BrandMark />
        <div className="broadcast-event-heading">
          <div className="broadcast-kicker"><span />{eventKind}</div>
          <h1>{view === 'lobby' ? 'Подготовка к игре' : 'Промежуточные результаты'}</h1>
          <p>{lobby?.event?.title || '2LA Noire'}</p>
        </div>
        <div className="broadcast-meta-card">
          <div>
            <small>{view === 'lobby' ? 'СЛЕДУЮЩАЯ ИГРА' : 'СЫГРАНО ИГР'}</small>
            <strong>{view === 'lobby' && lobby?.next_game ? `#${lobby.next_game.number}` : progress}</strong>
          </div>
          <span className="broadcast-meta-divider" />
          <div>
            <small>{lobby?.next_game?.table && view === 'lobby' ? 'СТОЛ' : 'ЭФИР'}</small>
            <strong className="broadcast-meta-secondary">{lobby?.next_game?.table && view === 'lobby' ? lobby.next_game.table : 'LIVE'}</strong>
          </div>
        </div>
      </header>

      <section className="broadcast-scene-content flex-1">{children}</section>

      <footer className="broadcast-scene-footer shrink-0">
        <span className="broadcast-live-dot" />
        <span>{view === 'lobby' ? 'Состав готовится к старту' : 'Таблица обновляется автоматически'}</span>
        <span className="broadcast-footer-line" />
        {date ? <span>{date} · МСК</span> : <span>2LA NOIRE · СПОРТИВНАЯ МАФИЯ</span>}
      </footer>
    </main>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="broadcast-empty">
      <span className="broadcast-empty-mark">2LA</span>
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  );
}

function LobbyScene({ token, lobby }: { token: string; lobby: Lobby | null }) {
  const seats = lobby?.next_game?.seats || [];
  if (!seats.length) {
    return (
      <EmptyState
        title="Формируем состав"
        text="Рассадка появится в эфире сразу после подготовки следующей игры."
      />
    );
  }

  return (
    <div className="broadcast-lineup-shell">
      <div className="broadcast-panel-heading">
        <div>
          <span>СОСТАВ СЛЕДУЮЩЕЙ ИГРЫ</span>
          <h2>{seats.length} игроков · места за столом</h2>
        </div>
        <div className="broadcast-ready-pill"><span /> СОСТАВ ГОТОВ</div>
      </div>
      <ol className="broadcast-lineup-grid">
        {seats.map((seat) => (
          <li key={`${seat.seat}-${seat.player_id || seat.nickname}`} className="broadcast-player-card">
            <span className="broadcast-seat-number">
              <small>МЕСТО</small>
              <b>{String(seat.seat).padStart(2, '0')}</b>
            </span>
            <Avatar token={token} player={seat} />
            <span className="broadcast-player-name">
              <small>ИГРОК</small>
              <b title={seat.nickname}>{seat.nickname}</b>
            </span>
            <span className="broadcast-card-accent" />
          </li>
        ))}
      </ol>
    </div>
  );
}

function StandingsScene({ token, lobby }: { token: string; lobby: Lobby | null }) {
  const standings = useMemo(() => (lobby?.standings || []).slice(0, 20), [lobby?.standings]);
  if (!standings.length) {
    return (
      <EmptyState
        title="Таблица появится после первой игры"
        text="Как только протокол будет завершён, результаты автоматически появятся здесь."
      />
    );
  }

  const podium = standings.slice(0, 3);
  const remaining = standings.slice(3);

  return (
    <div className="broadcast-standings-shell">
      <div className="broadcast-podium">
        {podium.map((row) => (
          <article key={`${row.place}-${row.player_id || row.nickname}`} className={`broadcast-podium-card broadcast-podium-card--${row.place}`}>
            <span className="broadcast-podium-place">{row.place}</span>
            <Avatar token={token} player={row} size="podium" />
            <div className="broadcast-podium-copy">
              <small>{row.place === 1 ? 'ЛИДЕР' : `${row.place} МЕСТО`}</small>
              <h2 title={row.nickname}>{row.nickname}</h2>
            </div>
            <div className="broadcast-podium-score">
              <strong>{points(row.points)}</strong>
              <span>ОЧКОВ</span>
            </div>
          </article>
        ))}
      </div>

      {remaining.length ? (
        <div className="broadcast-ranking-panel">
          <div className="broadcast-ranking-head">
            <span>МЕСТО</span><span>ИГРОК</span><span>ОЧКИ</span>
          </div>
          <ol className="broadcast-ranking-grid">
            {remaining.map((row) => (
              <li key={`${row.place}-${row.player_id || row.nickname}`} className="broadcast-ranking-row">
                <span className="broadcast-ranking-place">{String(row.place).padStart(2, '0')}</span>
                <Avatar token={token} player={row} size="compact" />
                <span className="broadcast-ranking-name" title={row.nickname}>{row.nickname}</span>
                <strong>{points(row.points)}</strong>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Full-frame OBS scenes, kept on the existing URLs so configured Browser Sources do not change:
 * `/broadcast/<secret>/lobby` — preparation / next-game lineup;
 * `/broadcast/<secret>/standings` — intermediate tournament standings.
 */
export default function BroadcastLobbyScreen({ token, view }: { token: string; view: 'lobby' | 'standings' }) {
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/public/broadcast/${encodeURIComponent(token)}/lobby`, { cache: 'no-store' });
        if (response.status === 404) {
          if (!stopped) setMissing(true);
          return;
        }
        if (response.ok && !stopped) {
          setLobby(await response.json());
          setMissing(false);
        }
      } catch { /* keep the last picture while the network is away */ }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [token]);

  if (missing) {
    return (
      <SceneFrame lobby={null} view={view}>
        <EmptyState
          title="Ссылка трансляции устарела"
          text="Секретную ссылку нужно обновить в панели OBS и трансляции."
        />
      </SceneFrame>
    );
  }

  return (
    <SceneFrame lobby={lobby} view={view}>
      {view === 'lobby'
        ? <LobbyScene token={token} lobby={lobby} />
        : <StandingsScene token={token} lobby={lobby} />}
    </SceneFrame>
  );
}
