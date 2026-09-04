import { useEffect, useMemo, useState } from 'react';
import { Ban, Crown, Radio, ShieldCheck, Skull, UserRound, UserRoundX } from 'lucide-react';
import type { LiveBroadcastEnvelope, LiveBroadcastPlayer, LiveBroadcastState } from '../../lib/liveBroadcast';
import './liveBroadcastOverlay.css';

type LiveBroadcastOverlayProps = {
  token: string;
};

const rolePresentation = (role: string) => {
  if (role === 'Дон' || role === 'don') return { label: 'Дон', className: 'is-don', icon: Crown };
  if (role === 'Мафия' || role === 'mafia') return { label: 'Мафия', className: 'is-mafia', icon: Ban };
  if (role === 'Шериф' || role === 'sheriff') return { label: 'Шериф', className: 'is-sheriff', icon: ShieldCheck };
  return { label: 'Мирный', className: 'is-citizen', icon: UserRound };
};

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
              {requestFailed ? 'Ссылка недоступна или соединение потеряно' : 'Экран включится после запуска Live Game'}
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

  return (
    <main className={`live-broadcast-canvas phase-${state.phaseKey}`}>
      <header className="live-broadcast-header">
        <div className="live-broadcast-identity-block">
          <div className="live-broadcast-brand-mark">2LA</div>
          <div>
            <div className="live-broadcast-eyebrow">2LA Noire · спортивная мафия</div>
            <div className="live-broadcast-game-number">
              Игра вечера №{state.eveningGameNumber || '—'}
              <span>Общая №{state.globalGameNumber}</span>
            </div>
          </div>
        </div>

        <div className="live-broadcast-phase-block">
          <div className="live-broadcast-phase-title">{state.phaseTitle}</div>
          <div className="live-broadcast-phase-detail">{state.phaseDetail}</div>
        </div>

        <div className={`live-broadcast-timer ${state.timerRunning ? 'is-running' : ''}`}>
          <div className="live-broadcast-timer-label">{state.timerLabel || (state.currentSpeakerSeat ? `Речь #${state.currentSpeakerSeat}` : 'Таймер')}</div>
          <div className="live-broadcast-timer-value">{timerText(state)}</div>
        </div>
      </header>

      <section className="live-broadcast-info-row">
        <div className={`live-broadcast-panel live-broadcast-nominations ${state.nominations.length ? '' : 'is-empty'}`}>
          <div className="live-broadcast-panel-title">Порядок выставления</div>
          {state.nominations.length ? (
            <div className="live-broadcast-nomination-list">
              {state.nominations.map((nomination) => (
                <div key={nomination.seat} className="live-broadcast-nomination-chip">
                  <span>{nomination.order}</span>
                  Игрок #{nomination.seat}
                  {nomination.nominatedBy ? <small>от #{nomination.nominatedBy}</small> : null}
                </div>
              ))}
            </div>
          ) : <div className="live-broadcast-panel-empty">Кандидатов пока нет</div>}
        </div>

        {state.vote && (
          <div className={`live-broadcast-panel live-broadcast-vote ${state.vote.published ? 'is-published' : 'is-collecting'}`}>
            <div className="live-broadcast-panel-heading">
              <div className="live-broadcast-panel-title">
                {state.vote.isRevote ? `Переголосование · раунд ${state.vote.roundNumber}` : 'Голосование'}
              </div>
              <div className="live-broadcast-vote-state">
                {state.vote.published ? 'Зафиксировано' : 'Идёт голосование'}
              </div>
            </div>
            {state.vote.published ? (
              <div className="live-broadcast-vote-groups">
                {voteGroups.map((group) => (
                  <div key={group.candidate} className="live-broadcast-vote-group">
                    <div className="live-broadcast-vote-candidate">#{group.candidate}<strong>{group.count}</strong></div>
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
        )}
      </section>

      <section className="live-broadcast-players" aria-label="Игроки">
        {state.players.map((player) => {
          const role = rolePresentation(player.role);
          const RoleIcon = role.icon;
          const order = nominationOrder.get(player.seat);
          const isVoteCandidate = voteCandidates.has(player.seat);
          return (
            <article
              key={player.seat}
              className={`live-broadcast-player ${role.className} ${player.alive ? 'is-alive' : 'is-out'} ${state.currentSpeakerSeat === player.seat ? 'is-speaking' : ''} ${order ? 'is-nominated' : ''} ${isVoteCandidate ? 'is-vote-candidate' : ''}`}
              style={player.alive ? undefined : { opacity: 1, filter: 'none' }}
            >
              <div className="live-broadcast-seat-number">{player.seat}</div>
              {order ? <div className="live-broadcast-nomination-order">{order}</div> : null}
              <BroadcastAvatar token={token} player={player} />
              <div className="live-broadcast-player-name">{player.nickname}</div>
              <div className="live-broadcast-role">
                <RoleIcon aria-hidden="true" />
                {role.label}
              </div>
              {(player.fouls > 0 || player.minorTech > 0 || player.majorTech > 0) && (
                <div className="live-broadcast-discipline">
                  {player.fouls > 0 ? <span>Ф {player.fouls}</span> : null}
                  {player.minorTech > 0 ? <span>ТМ {player.minorTech}</span> : null}
                  {player.majorTech > 0 ? <span>ТБ {player.majorTech}</span> : null}
                </div>
              )}
              {!player.alive && (
                <div
                  className={`live-broadcast-player-status is-${player.statusKind}`}
                  style={{ background: 'rgba(7, 8, 11, .94)' }}
                >
                  <PlayerStatusIcon player={player} />
                  <span>{player.status}</span>
                </div>
              )}
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
