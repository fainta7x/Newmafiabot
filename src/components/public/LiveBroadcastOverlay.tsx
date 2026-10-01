import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Crosshair, Hand, Heart, Radio, Skull, Star, UserRoundX } from 'lucide-react';
import { DEFAULT_LIVE_BROADCAST_LAYOUT, type LiveBroadcastEnvelope, type LiveBroadcastPlayer, type LiveBroadcastState, type LiveBroadcastTimelineEntry } from '../../lib/liveBroadcast';
import { MafiaHatIcon, PistolIcon } from '../LiveGameEngine/Icons';
import './liveBroadcastOverlay.css';

type LiveBroadcastOverlayProps = {
  token: string;
};

type RoleKind = 'citizen' | 'mafia' | 'don' | 'sheriff';

const roleKind = (role: string | undefined): RoleKind => {
  if (role === 'Дон' || role === 'don') return 'don';
  if (role === 'Мафия' || role === 'mafia') return 'mafia';
  if (role === 'Шериф' || role === 'sheriff') return 'sheriff';
  return 'citizen';
};

const OUT_WORDS: Record<string, string> = { killed: 'Убит', voted: 'Заголосован', removed: 'Удалён', ppk: 'Удалён', out: 'Выбыл' };

const ROLE_LABELS: Record<RoleKind, string> = { citizen: 'Мирный', mafia: 'Мафия', don: 'Дон', sheriff: 'Шериф' };

/** The same role icons as the Live Game seats; colours follow the owner's palette (2026-10-01). */
const RoleIcon = ({ kind }: { kind: RoleKind }) => {
  if (kind === 'don') return <MafiaHatIcon className="live-broadcast-role-icon" />;
  if (kind === 'mafia') return <PistolIcon className="live-broadcast-role-icon" />;
  if (kind === 'sheriff') return <Star className="live-broadcast-role-icon" fill="currentColor" aria-hidden="true" />;
  return <Heart className="live-broadcast-role-icon" fill="currentColor" aria-hidden="true" />;
};


const DAY_NOTES: Record<string, string> = {
  voted: 'Ушёл',
  table: 'Решение стола',
  stay: 'Никто не ушёл',
  cancelled: 'Голосование отменено',
  single: 'Без голосования',
};

/** One fact line on a player card: a fixed-width label and the seats, so every card lines up. */
const FactRow = ({ label, seats, kinds, tone }: { label: string; seats: number[]; kinds: Map<number, RoleKind>; tone?: 'best' | 'red' | 'black' | 'sheriff' }) => (
  <div className={`live-broadcast-fact ${tone ? `is-${tone}` : ''}`}>
    <b>{label}</b>
    <div className="live-broadcast-fact-values">
      {seats.map((seat) => <SeatChip key={seat} seat={seat} kinds={kinds} />)}
    </div>
  </div>
);

/** Seat chip coloured by the seat's real team: viewers see roles anyway. */
const SeatChip = ({ seat, kinds }: { seat: number | null; kinds: Map<number, RoleKind> }) => (
  seat ? <span className={`live-broadcast-seat-chip is-${kinds.get(seat) || 'citizen'}`}>{seat}</span> : <span className="live-broadcast-seat-chip is-empty">—</span>
);

const PlayerStatusIcon = ({ player }: { player: LiveBroadcastPlayer }) => {
  if (player.statusKind === 'killed') return <Skull aria-hidden="true" />;
  if (player.statusKind === 'voted') return <UserRoundX aria-hidden="true" />;
  if (player.statusKind === 'ppk' || player.statusKind === 'removed') return <Ban aria-hidden="true" />;
  return <UserRoundX aria-hidden="true" />;
};

const BroadcastAvatar = ({ token, player }: { token: string; player: LiveBroadcastPlayer }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [player.playerId, token]);
  const initial = player.nickname.trim().charAt(0).toLocaleUpperCase('ru-RU') || '?';
  return (
    <span className="live-broadcast-avatar" aria-label={`Аватар: ${player.nickname}`}>
      {!failed && player.playerId ? (
        <img
          src={`/api/public/broadcast/${encodeURIComponent(token)}/avatar/${encodeURIComponent(player.playerId)}`}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : <span aria-hidden="true">{initial}</span>}
    </span>
  );
};

const timerText = (state: LiveBroadcastState) => {
  if (state.timerSeconds === null) return '—';
  const minutes = Math.floor(state.timerSeconds / 60);
  const seconds = state.timerSeconds % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : String(seconds).padStart(2, '0');
};

export default function LiveBroadcastOverlay({ token }: LiveBroadcastOverlayProps) {
  const [envelope, setEnvelope] = useState<LiveBroadcastEnvelope>({ connected: false, receivedAt: null, state: null });
  const [requestFailed, setRequestFailed] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('live-broadcast-document');
    document.body.classList.add('live-broadcast-document');
    return () => {
      document.documentElement.classList.remove('live-broadcast-document');
      document.body.classList.remove('live-broadcast-document');
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    const load = async () => {
      if (disposed || inFlight || !token) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/public/broadcast/${encodeURIComponent(token)}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!response.ok) throw new Error('broadcast-unavailable');
        const next = await response.json() as LiveBroadcastEnvelope;
        if (!disposed) {
          setEnvelope(next);
          setRequestFailed(false);
        }
      } catch {
        if (!disposed) setRequestFailed(true);
      } finally {
        inFlight = false;
      }
    };

    void load();
    const intervalId = window.setInterval(() => void load(), 650);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [token]);

  const state = envelope.state;
  const layout = envelope.layout || DEFAULT_LIVE_BROADCAST_LAYOUT;
  const nominationOrder = useMemo(() => new Map(
    (state?.nominations || []).map((nomination) => [nomination.seat, nomination.order]),
  ), [state?.nominations]);
  const voteCandidates = useMemo(
    () => new Set(state?.vote?.highlightedCandidates || state?.vote?.candidates || []),
    [state?.vote?.candidates, state?.vote?.highlightedCandidates],
  );

  if (!state) {
    return (
      <main className="live-broadcast-canvas is-waiting">
        <div className="live-broadcast-waiting-card">
          <div className="live-broadcast-brand-mark">2LA</div>
          <div>
            <div className="live-broadcast-eyebrow">2LA Noire · OBS</div>
            <div className="live-broadcast-waiting-title">Ожидание игры</div>
            <div className="live-broadcast-waiting-copy">
              {requestFailed ? 'Ссылка недоступна или соединение потеряно' : 'Экран включится, когда судья начнёт игру'}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const connectionLost = requestFailed || !envelope.connected;
  const voteGroups = state.vote?.published
    ? state.vote.candidates.map((candidate) => ({
        candidate,
        count: Number(state.vote?.counts[candidate] || 0),
        voters: Object.entries(state.vote?.assignments || {})
          .filter(([, target]) => Number(target) === candidate)
          .map(([voter]) => Number(voter))
          .sort((left, right) => left - right),
      }))
    : [];

  const timerShare = state.timerSeconds !== null && state.timerMaxSeconds
    ? Math.max(0, Math.min(1, state.timerSeconds / state.timerMaxSeconds))
    : null;
  const timerCaption = state.timerLabel || (state.currentSpeakerSeat ? `Речь игрока №${state.currentSpeakerSeat}` : 'Таймер');
  const kinds = new Map(state.players.map((player) => [player.seat, roleKind(player.role)]));
  const timeline = state.timeline || [];
  const protocolBySeat = new Map((state.protocols || []).map((protocol) => [protocol.seat, protocol]));
  const bestMove = state.bestMove;
  // Days before the first shooting night are only talk: the log starts with the first night (owner, 2026-10-01).
  const firstNight = timeline.findIndex((entry) => entry.kind === 'night');
  const visibleTimeline = firstNight < 0 ? timeline.filter((entry) => entry.kind === 'day' && entry.left.length) : timeline.slice(firstNight);
  const nights = visibleTimeline.filter((entry): entry is Extract<LiveBroadcastTimelineEntry, { kind: 'night' }> => entry.kind === 'night');
  const days = visibleTimeline.filter((entry): entry is Extract<LiveBroadcastTimelineEntry, { kind: 'day' }> => entry.kind === 'day');
  // By whose hands each day's leavers left: voters for that seat in the day's fixed vote.
  const handsFor = (round: number, seat: number) => {
    const vote = (state.dayVotes || []).find((item) => item.round === round);
    return vote ? Object.entries(vote.assignments).filter(([, target]) => Number(target) === seat).map(([voter]) => Number(voter)).sort((a, b) => a - b) : [];
  };
  const exitBySeat = new Map<number, { label: string; hands: number[] }>();
  for (const entry of timeline) {
    if (entry.kind === 'night' && entry.killed && entry.shotSeat) exitBySeat.set(entry.shotSeat, { label: `Убит · ночь ${entry.round}`, hands: [] });
    if (entry.kind === 'day') {
      // Only a ballot vote names the hands; a table decision has no per-seat ballots to show.
      for (const seat of entry.left) exitBySeat.set(seat, { label: `${entry.note === 'table' ? 'Решение стола' : 'Ушёл'} · день ${entry.round}`, hands: entry.note === 'voted' ? handsFor(entry.round, seat) : [] });
    }
  }
  const score = state.eveningScore || { red: 0, black: 0 };

  return (
    <main
      className={`live-broadcast-canvas phase-${state.phaseKey} ${visibleTimeline.length ? 'has-timeline' : ''} ${layout.showTop ? '' : 'hide-top'} ${layout.showTimeline ? '' : 'hide-timeline'} ${layout.showPlayers ? '' : 'hide-players'}`}
      style={{ '--s-top': layout.top / 100, '--s-timeline': layout.timeline / 100, '--s-players': layout.players / 100 } as React.CSSProperties}
    >
      <header className="live-broadcast-header">
        <div className="live-broadcast-brand-mark">2LA</div>
        <div className="live-broadcast-phase-block">
          <div className="live-broadcast-eyebrow">
            Игра вечера №{state.eveningGameNumber || '—'}
            <span>{state.tableName || 'Стол'} · общая №{state.globalGameNumber}</span>
          </div>
          <div className="live-broadcast-phase-title">{state.phaseTitle}</div>
          {state.phaseDetail ? <div className="live-broadcast-phase-detail">{state.phaseDetail}</div> : null}
        </div>
        {/* Nominations and the vote live in the top bar (owner, 2026-10-01): nothing covers the table. */}
        <section className="live-broadcast-info-row">
          {state.vote ? (
            <div className={`live-broadcast-vote ${state.vote.published ? 'is-published' : 'is-collecting'}`}>
              <div className="live-broadcast-info-title">
                {state.vote.isRevote ? `Переголосование · ${state.vote.roundNumber}` : 'Голосование'}
                <span className="live-broadcast-vote-state">{state.vote.published ? 'Зафиксировано' : 'Идёт голосование'}</span>
              </div>
              {state.vote.published ? (
                <div className="live-broadcast-vote-groups">
                  {voteGroups.map((group) => (
                    <div key={group.candidate} className="live-broadcast-vote-group">
                      <SeatChip seat={group.candidate} kinds={kinds} />
                      <strong>{group.count}</strong>
                      <div className="live-broadcast-voters">
                        {group.voters.length ? group.voters.map((voter) => <span key={voter}>{voter}</span>) : <em>—</em>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="live-broadcast-vote-groups">
                    {state.vote.candidates.map((seat) => <SeatChip key={seat} seat={seat} kinds={kinds} />)}
                  </div>
                  <div className="live-broadcast-vote-pending">Результат и голоса игроков появятся после фиксации ведущим</div>
                </>
              )}
            </div>
          ) : state.nominations.length ? (
            <div className="live-broadcast-nominations">
              <div className="live-broadcast-info-title">Выставлены</div>
              <div className="live-broadcast-nomination-list">
                {state.nominations.map((nomination) => (
                  <div key={nomination.seat} className="live-broadcast-nomination-chip">
                    <SeatChip seat={nomination.seat} kinds={kinds} />
                    {nomination.nominatedBy ? <small>от {nomination.nominatedBy}</small> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
        <div className="live-broadcast-score" aria-label="Победы за вечер">
          <div className="live-broadcast-score-caption">Счёт вечера</div>
          <div className="live-broadcast-score-row">
            <span className="is-red">Красные</span>
            <b className="is-red">{score.red}</b>
            <i>:</i>
            <b className="is-black">{score.black}</b>
            <span className="is-black">Чёрные</span>
          </div>
        </div>
        <div className={`live-broadcast-timer ${state.timerRunning ? 'is-running' : ''} ${timerShare !== null && timerShare <= 0.2 ? 'is-low' : ''}`}>
          <div className="live-broadcast-timer-label">{timerCaption}</div>
          <div className="live-broadcast-timer-value">{timerText(state)}</div>
          {timerShare !== null ? <div className="live-broadcast-timer-bar"><span style={{ width: `${timerShare * 100}%` }} /></div> : null}
        </div>
      </header>

      {visibleTimeline.length ? (
        <aside className="live-broadcast-timeline" aria-label="Ход игры">
          {/* Two blocks with their own columns (owner, 2026-10-01): nights and days never mix in one table. */}
          {nights.length ? (
            <div className="live-broadcast-tl-block">
              <div className="live-broadcast-tl-head">
                <span>Ночи</span>
                <span><Crosshair aria-hidden="true" />Выстрел</span>
                <span><MafiaHatIcon className="live-broadcast-role-icon" />Дон</span>
                <span><Star className="live-broadcast-role-icon" fill="currentColor" aria-hidden="true" />Шериф</span>
              </div>
              <div className="live-broadcast-timeline-list">
                {nights.map((entry) => (
                  <div key={`n${entry.round}`} className={`live-broadcast-tl is-night ${entry.current ? 'is-current' : ''}`}>
                    <div className="live-broadcast-tl-tag">Ночь {entry.round}</div>
                    <div className={`live-broadcast-tl-cell ${!entry.current && !entry.killed ? 'is-miss' : ''}`}>
                      {entry.shotSeat ? <SeatChip seat={entry.shotSeat} kinds={kinds} /> : <span className="live-broadcast-tl-dash">{entry.current ? '…' : 'промах'}</span>}
                    </div>
                    <div className="live-broadcast-tl-cell">
                      {entry.donCheck ? <SeatChip seat={entry.donCheck.seat} kinds={kinds} /> : <span className="live-broadcast-tl-dash">{entry.current ? '…' : '—'}</span>}
                    </div>
                    <div className="live-broadcast-tl-cell">
                      {entry.sheriffCheck ? <SeatChip seat={entry.sheriffCheck.seat} kinds={kinds} /> : <span className="live-broadcast-tl-dash">{entry.current ? '…' : '—'}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {days.length ? (
            <div className="live-broadcast-tl-block is-days">
              <div className="live-broadcast-tl-head">
                <span>Дни</span>
                <span><UserRoundX aria-hidden="true" />Ушёл</span>
                <span><Hand aria-hidden="true" />Руками</span>
              </div>
              <div className="live-broadcast-timeline-list">
                {days.map((entry) => {
                  const hands = entry.note === 'voted' && entry.left.length === 1 ? handsFor(entry.round, entry.left[0]) : [];
                  return (
                    <div key={`d${entry.round}`} className="live-broadcast-tl is-day">
                      <div className="live-broadcast-tl-tag">День {entry.round}</div>
                      {entry.left.length ? (
                        <>
                          <div className="live-broadcast-tl-cell">{entry.left.map((seat) => <SeatChip key={seat} seat={seat} kinds={kinds} />)}</div>
                          <div className="live-broadcast-tl-cell is-hands">
                            {hands.length ? hands.map((seat) => <SeatChip key={seat} seat={seat} kinds={kinds} />) : <span className="live-broadcast-tl-dash">{entry.note === 'table' ? 'решение стола' : '—'}</span>}
                          </div>
                        </>
                      ) : <div className="live-broadcast-tl-cell is-wide"><span className="live-broadcast-tl-dash">{DAY_NOTES[entry.note].toLowerCase()}</span></div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}


      <section className="live-broadcast-players" aria-label="Игроки">
        {state.players.map((player) => {
          const kind = roleKind(player.role);
          const exit = exitBySeat.get(player.seat);
          const protocol = player.alive ? undefined : protocolBySeat.get(player.seat);
          const hasDiscipline = player.fouls > 0 || player.minorTech > 0 || player.majorTech > 0;
          const order = nominationOrder.get(player.seat);
          const isVoteCandidate = voteCandidates.has(player.seat);
          const speaking = state.currentSpeakerSeat === player.seat;
          return (
            <article
              key={player.seat}
              className={`live-broadcast-player is-${kind} ${player.alive ? 'is-alive' : 'is-out'} ${speaking ? 'is-speaking' : ''} ${order ? 'is-nominated' : ''} ${isVoteCandidate ? 'is-vote-candidate' : ''}`}
            >
              {/* The face first (owner, 2026-10-01): a large portrait with a role emblem. */}
              <div className="live-broadcast-player-head">
                <div className="live-broadcast-portrait">
                  <BroadcastAvatar token={token} player={player} />
                  <div className="live-broadcast-seat-number">{player.seat}</div>
                  {/* Role emblem as on club streams (owner reference, 2026-10-01): the badge colour tells the role. */}
                  <div className={`live-broadcast-emblem is-${kind}`} title={ROLE_LABELS[kind]}><RoleIcon kind={kind} /></div>
                  {!player.alive ? <div className={`live-broadcast-out-ribbon is-${player.statusKind}`}><span>{OUT_WORDS[player.statusKind] || 'Выбыл'}</span></div> : null}
                </div>
                <div className="live-broadcast-player-text">
                  <div className="live-broadcast-player-tags">
                    {speaking ? <div className="live-broadcast-speaking-tag">говорит</div> : null}
                  </div>
                  <div className="live-broadcast-role">{ROLE_LABELS[kind]}</div>
                </div>
              </div>
              <div className="live-broadcast-player-name">{player.nickname}</div>
              <div className="live-broadcast-player-facts">
                {!player.alive ? (
                  <div className={`live-broadcast-player-status is-${player.statusKind}`}>
                    <PlayerStatusIcon player={player} />
                    <span>{exit?.label || player.status}</span>
                  </div>
                ) : null}
                {exit?.hands.length ? <FactRow label="Руками" seats={exit.hands} kinds={kinds} /> : null}
                {bestMove && bestMove.bySeat === player.seat ? <FactRow label="ЛХ" seats={bestMove.seats} kinds={kinds} tone="best" /> : null}
                {protocol?.red.length ? <FactRow label="Красные" seats={protocol.red} kinds={kinds} tone="red" /> : null}
                {protocol?.black.length ? <FactRow label="Чёрные" seats={protocol.black} kinds={kinds} tone="black" /> : null}
                {protocol?.sheriff.length ? <FactRow label="Шериф" seats={protocol.sheriff} kinds={kinds} tone="sheriff" /> : null}
              </div>
              {order && player.alive ? (
                <div className="live-broadcast-nominated-strip"><Hand aria-hidden="true" />Выставлен · {order}-м</div>
              ) : null}
              {hasDiscipline ? (
                <div className="live-broadcast-player-footer">
                  <div className="live-broadcast-discipline" aria-label="Фолы">
                    {[1, 2, 3, 4].map((index) => <i key={index} className={index <= player.fouls ? 'is-on' : ''} />)}
                    {player.minorTech > 0 ? <span>техфол{player.minorTech > 1 ? ` ×${player.minorTech}` : ''}</span> : null}
                    {player.majorTech > 0 ? <span className="is-major">большой техфол{player.majorTech > 1 ? ` ×${player.majorTech}` : ''}</span> : null}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      {connectionLost && (
        <div className="live-broadcast-connection-warning">
          <Radio aria-hidden="true" />
          Связь с телефоном прервана · показано последнее состояние
        </div>
      )}
    </main>
  );
}
