import type { LiveGameEvent } from '../shared/liveGameEvents.ts';
import { LIVE_BROADCAST_VERSION, type LiveBroadcastState, type LiveBroadcastPlayer } from './liveBroadcast.ts';

type ReplayPlayer = { seat_number: number; player_id: string | null; nickname: string; role: string | null };
/**
 * OBS state from recorded engine facts only. Missing timers, hidden votes and
 * omitted historical phases stay unavailable; nothing is reconstructed by guessing.
 */
export const buildReplayBroadcastState = (
  players: ReplayPlayer[], events: LiveGameEvent[], index: number, gameNumber: number,
): LiveBroadcastState => {
  const seen = [...events].sort((a, b) => a.seq - b.seq).slice(0, Math.max(0, index + 1));
  const removed = new Map<number, { label: string; kind: LiveBroadcastPlayer['statusKind'] }>();
  const nominations = new Map<number, { seat: number; order: number; nominatedBy: number | null }>();
  const ballot = new Map<number, number>();
  let voteRound = 1;
  let voteOutcome: string | null = null;
  let votePublished = false;
  let phase = 'Игра';
  let roundNumber = 1;
  let currentSpeakerSeat: number | null = null;
  let shotSeat: number | null = null;
  let donCheck: { seat: number; isSheriff: boolean | null } | null = null;
  let sheriffCheck: { seat: number; isBlack: boolean | null } | null = null;

  for (const e of seen) {
    roundNumber = Math.max(1, Number(e.round) || 1);
    if (e.phase) phase = e.phase.replaceAll('_', ' ');
    if (e.kind === 'speech_start') currentSpeakerSeat = e.seat || null;
    if (e.kind === 'nomination' && e.seat && !nominations.has(e.seat)) nominations.set(e.seat, { seat: e.seat, order: nominations.size + 1, nominatedBy: e.by || null });
    if (e.kind === 'nomination_removed' && e.seat && e.phase === 'day_speeches') nominations.delete(e.seat);
    if (e.kind === 'vote' && e.seat && e.target) {
      const nextRound = Number(e.value) || voteRound;
      if (nextRound !== voteRound) { ballot.clear(); voteOutcome = null; votePublished = false; voteRound = nextRound; }
      ballot.set(e.seat, e.target);
    }
    if (e.kind === 'vote_removed' && e.seat && !votePublished) ballot.delete(e.seat);
    if (e.kind === 'vote_round_result') {
      const [num, outcome] = String(e.value || '').split(':');
      voteRound = Number(num) || voteRound;
      voteOutcome = outcome || null;
      votePublished = true;
    }
    if (e.kind === 'shot_target') shotSeat = e.target || null;
    if (e.kind === 'don_check' && e.target) donCheck = { seat: e.target, isSheriff: e.value === 'sheriff' ? true : e.value === 'not_sheriff' ? false : null };
    if (e.kind === 'sheriff_check' && e.target) sheriffCheck = { seat: e.target, isBlack: e.value === 'black' ? true : e.value === 'red' ? false : null };
    if (e.kind === 'exit' && e.seat) {
      const reason = String(e.value || 'out');
      const kind: LiveBroadcastPlayer['statusKind'] = reason === 'killed' || reason === 'night_kill' ? 'killed' : reason.startsWith('voted') ? 'voted' : reason === 'ppk' ? 'ppk' : reason === 'removed' ? 'removed' : 'out';
      removed.set(e.seat, { label: reason, kind });
    }
    if (e.kind === 'restored' && e.seat) removed.delete(e.seat);
    if (e.kind === 'first_killed' && e.seat) removed.set(e.seat, { label: 'killed', kind: 'killed' });
  }

  const presentedPlayers: LiveBroadcastPlayer[] = players.map(player => {
    const status = removed.get(player.seat_number);
    const role = player.role || 'unknown';
    return {
      seat: player.seat_number, playerId: player.player_id, nickname: player.nickname,
      role, team: role === 'mafia' || role === 'don' ? 'Чёрные' : role === 'sheriff' || role === 'citizen' ? 'Красные' : '',
      alive: !status, status: status?.label || 'Жив', statusKind: status?.kind || 'alive',
      fouls: 0, minorTech: 0, majorTech: 0, ppk: status?.kind === 'ppk',
    };
  });
  const assignments = Object.fromEntries(ballot);
  const candidates = [...new Set([...nominations.keys(), ...ballot.values()])];
  const counts = Object.fromEntries(candidates.map(candidate => [candidate, [...ballot.values()].filter(target => target === candidate).length]));
  return {
    version: LIVE_BROADCAST_VERSION, gameId: 0, globalGameNumber: gameNumber, eveningGameNumber: null, tableName: 'Запись игры',
    phaseKey: roundNumber === 1 ? 'zero' : 'day', phaseTitle: roundNumber === 1 ? 'Нулевой круг' : `Круг ${roundNumber - 1}`,
    phaseDetail: phase, roundNumber, currentSpeakerSeat,
    timerSeconds: null, timerMaxSeconds: null, timerRunning: false, timerLabel: null,
    players: presentedPlayers,
    nominations: [...nominations.values()],
    vote: candidates.length ? { roundNumber: voteRound, isRevote: voteRound > 1, candidates,
      highlightedCandidates: [], published: votePublished, counts, assignments, outcome: voteOutcome } : null,
    night: { shotSeat, donCheck, sheriffCheck },
    timeline: [], dayVotes: [],
    updatedAt: seen.at(-1)?.at || '',
  };
};
