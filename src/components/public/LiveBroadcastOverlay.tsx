import { useEffect, useMemo, useState } from 'react';
import { Ban, Crosshair, Heart, Radio, Skull, Star, UserRoundX } from 'lucide-react';
import type { LiveBroadcastEnvelope, LiveBroadcastPlayer, LiveBroadcastState, LiveBroadcastTimelineEntry } from '../../lib/liveBroadcast';
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

const ROLE_LABELS: Record<RoleKind, string> = { citizen: 'Мирный', mafia: 'Мафия', don: 'Дон', sheriff: 'Шериф' };

/** The same role icons as the Live Game seats; colours follow the owner's palette (2026-10-01). */
const RoleIcon = ({ kind }: { kind: RoleKind }) => {
  if (kind === 'don') return <MafiaHatIcon className="live-broadcast-role-icon" />;
  if (kind === 'mafia') return <PistolIcon className="live-broadcast-role-icon" />;
  if (kind === 'sheriff') return <Star className="live-broadcast-role-icon" fill="currentColor" aria-hidden="true" />;
  return <Heart className="live-broadcast-role-icon" fill="currentColor" aria-hidden="true" />;
};

type PlayerCheck = { by: 'don' | 'sheriff'; round: number; result: 'red' | 'black' | 'sheriff' | 'not_sheriff' | null };

const checkTitle = (check: PlayerCheck) => {
  if (check.by === 'sheriff') return check.result === 'black' ? 'чёрный' : check.result === 'red' ? 'красный' : '…';
  return check.result === 'sheriff' ? 'шериф' : check.result === 'not_sheriff' ? 'не шериф' : '…';
};

/** Every Don and Sheriff check of the game, by checked seat. */
const checksBySeat = (timeline: LiveBroadcastTimelineEntry[]) => {
  const result = new Map<number, PlayerCheck[]>();
  const add = (seat: number, check: PlayerCheck) => result.set(seat, [...(result.get(seat) || []), check]);
  for (const entry of timeline) {
    if (entry.kind !== 'night') continue;
    if (entry.donCheck) add(entry.donCheck.seat, { by: 'don', round: entry.round, result: entry.donCheck.isSheriff === null ? null : entry.donCheck.isSheriff ? 'sheriff' : 'not_sheriff' });
    if (entry.sheriffCheck) add(entry.sheriffCheck.seat, { by: 'sheriff', round: entry.round, result: entry.sheriffCheck.isBlack === null ? null : entry.sheriffCheck.isBlack ? 'black' : 'red' });
  }
  return result;
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
  const checks = checksBySeat(timeline);
  const protocolBySeat = new Map((state.protocols || []).map((protocol) => [protocol.seat, protocol]));
  const bestMove = state.bestMove;
  // Days before the first shooting night are only talk: the log starts with the first night (owner, 2026-10-01).
  const firstNight = timeline.findIndex((entry) => entry.kind === 'night');
  const visibleTimeline = firstNight < 0 ? timeline.filter((entry) => entry.kind === 'day' && entry.left.length) : timeline.slice(firstNight);
  const showInfoRow = state.nominations.length > 0 || Boolean(state.vote);
  // By whose hands each day's leavers left: voters for that seat in the day's fixed vote.
  const handsFor = (round: number, seat: number) => {
    const vote = (state.dayVotes || []).find((item) => item.round === round);
    return vote ? Object.entries(vote.assignments).filter(([, target]) => Number(target) === seat).map(([voter]) => Number(voter)).sort((a, b) => a - b) : [];
  };
  const exitBySeat = new Map<number, { label: string; hands: number[] }>();
  for (const entry of timeline) {
    if (entry.kind === 'night' && entry.killed && entry.shotSeat) exitBySeat.set(entry.shotSeat, { label: `Убит · ночь ${entry.round}`, hands: [] });
    if (entry.kind === 'day') {
      for (const seat of entry.left) exitBySeat.set(seat, { label: `${entry.note === 'table' ? 'Решение стола' : 'Ушёл'} · день ${entry.round}`, hands: handsFor(entry.round, seat) });
    }
  }
  const score = state.eveningScore || { red: 0, black: 0 };

  return (
    <main className={`live-broadcast-canvas phase-${state.phaseKey} ${visibleTimeline.length ? 'has-timeline' : ''}`}>
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
          {/* One aligned row per night and day; the colour of a seat already tells its team, so no result words. */}
          <div className="live-broadcast-tl-head">
            <span>Ход игры</span>
            <span><Crosshair aria-hidden="true" />Выстрел</span>
            <span><MafiaHatIcon className="live-broadcast-role-icon" />Дон</span>
            <span><Star className="live-broadcast-role-icon" fill="currentColor" aria-hidden="true" />Шериф</span>
          </div>
          <div className="live-broadcast-timeline-list">
            {visibleTimeline.map((entry, index) => {
              if (entry.kind === 'day') {
                const hands = entry.left.length === 1 ? handsFor(entry.round, entry.left[0]) : [];
                return (
                  <div key={`d${entry.round}-${index}`} className="live-broadcast-tl is-day">
                    <div className="live-broadcast-tl-tag">День {entry.round}</div>
                    {entry.left.length ? (
                      <div className="live-broadcast-tl-day">
                        <span className="live-broadcast-tl-word">{entry.note === 'table' ? 'ушли' : 'ушёл'}</span>
                        {entry.left.map((seat) => <SeatChip key={seat} seat={seat} kinds={kinds} />)}
                        {hands.length ? <span className="live-broadcast-tl-word">руками</span> : null}
                        {hands.map((seat) => <SeatChip key={seat} seat={seat} kinds={kinds} />)}
                      </div>
                    ) : <div className="live-broadcast-tl-day is-quiet">{DAY_NOTES[entry.note].toLowerCase()}</div>}
                  </div>
                );
              }
              return (
                <div key={`n${entry.round}-${index}`} className={`live-broadcast-tl is-night ${entry.current ? 'is-current' : ''}`}>
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
              );
            })}
          </div>
        </aside>
      ) : null}

      {showInfoRow ? (
        <section className="live-broadcast-info-row">
          {state.nominations.length ? (
            <div className="live-broadcast-panel live-broadcast-nominations">
              <div className="live-broadcast-panel-title">Выставлены</div>
              <div className="live-broadcast-nomination-list">
                {state.nominations.map((nomination) => (
                  <div key={nomination.seat} className="live-broadcast-nomination-chip">
                    <b>№{nomination.seat}</b>
                    {nomination.nominatedBy ? <small>от №{nomination.nominatedBy}</small> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {state.vote ? (
            <div className={`live-broadcast-panel live-broadcast-vote ${state.vote.published ? 'is-published' : 'is-collecting'}`}>
              <div className="live-broadcast-panel-title">
                {state.vote.isRevote ? `Переголосование · раунд ${state.vote.roundNumber}` : 'Голосование'}
                <span className="live-broadcast-vote-state">{state.vote.published ? 'Зафиксировано' : 'Идёт голосование'}</span>
              </div>
              {state.vote.published ? (
                <div className="live-broadcast-vote-groups">
                  {voteGroups.map((group) => (
                    <div key={group.candidate} className="live-broadcast-vote-group">
                      <div className="live-broadcast-vote-candidate">№{group.candidate}<strong>{group.count}</strong></div>
                      <div className="live-broadcast-voters">
                        {group.voters.length ? group.voters.map((voter) => <span key={voter}>{voter}</span>) : <em>—</em>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="live-broadcast-vote-pending">
                  Результат и голоса игроков появятся после фиксации ведущим
                </div>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="live-broadcast-players" aria-label="Игроки">
        {state.players.map((player) => {
          const kind = roleKind(player.role);
          const playerChecks = checks.get(player.seat) || [];
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
              <div className="live-broadcast-player-head">
                <div className="live-broadcast-seat-number">{player.seat}</div>
                <BroadcastAvatar token={token} player={player} />
                {order || speaking ? (
                  <div className="live-broadcast-player-tags">
                    {order ? <div className="live-broadcast-nomination-order" title="Порядок выставления">выст. {order}</div> : null}
                    {speaking ? <div className="live-broadcast-speaking-tag">говорит</div> : null}
                  </div>
                ) : null}
              </div>
              <div className="live-broadcast-player-name">{player.nickname}</div>
              <div className="live-broadcast-role">
                <RoleIcon kind={kind} />
                {ROLE_LABELS[kind]}
              </div>
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
                {playerChecks.length ? (
                  <div className="live-broadcast-fact">
                    <b>Проверки</b>
                    <div className="live-broadcast-fact-values">
                      {playerChecks.map((check) => (
                        <span key={`${check.by}-${check.round}`} className={`live-broadcast-check is-${check.by}`} title={`${check.by === 'don' ? 'Дон' : 'Шериф'}, ночь ${check.round}: ${checkTitle(check)}`}>
                          {check.by === 'don' ? <MafiaHatIcon className="live-broadcast-role-icon" /> : <Star className="live-broadcast-role-icon" fill="currentColor" aria-hidden="true" />}
                          н{check.round}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              {hasDiscipline ? (
                <div className="live-broadcast-player-footer">
                  <div className="live-broadcast-discipline" aria-label="Фолы">
                    {[1, 2, 3, 4].map((index) => <i key={index} className={index <= player.fouls ? 'is-on' : ''} />)}
                    {player.minorTech > 0 ? <span>ТМ {player.minorTech}</span> : null}
                    {player.majorTech > 0 ? <span>ТБ {player.majorTech}</span> : null}
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
