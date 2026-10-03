import type { LiveGameEvent } from '../shared/liveGameEvents';
import { MAX_LIVE_GAME_EVENTS } from '../shared/liveGameEvents';

/** The part of the engine's saved session the chronology is read from. Everything is optional: old snapshots exist. */
export type LiveEventSnapshot = {
  phase?: string;
  roundNumber?: number;
  nightSubPhase?: string;
  postNightStage?: string;
  votingStage?: string;
  nominations?: number[];
  nominationsMap?: Record<string, number>;
  activeSpeakerSlot?: number | null;
  votesByPlayer?: Record<string, number>;
  tableDecisionSelectedVoterSlots?: number[];
  votingRounds?: Array<{ round_number?: number; outcome?: string }>;
  activeVotingRoundIndex?: number;
  votingFarewellQueue?: number[];
  shotPlayerSlot?: number | null;
  donCheckSlot?: number | null;
  donCheckResult?: boolean | null;
  sheriffCheckSlot?: number | null;
  sheriffCheckResult?: string | null;
  protocolMarkers?: {
    firstKilledSlot?: number | null;
    zeroRoundVotedSlot?: number | null;
    bestMoveSourceSlot?: number | null;
    bestMoveSeats?: number[];
  };
  activePlayers?: Array<{
    slot_num?: number;
    alive?: boolean;
    fouls?: number;
    minor_tech_fouls?: number;
    major_tech_fouls?: number;
    ppk?: boolean;
    exit_reason?: string;
  }>;
};

const asNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const seatOrNull = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
};

const entries = (map: Record<string, number> | undefined): Array<[number, number]> =>
  Object.entries(map || {})
    .map(([key, value]) => [Number(key), Number(value)] as [number, number])
    .filter(([key, value]) => Number.isInteger(key) && Number.isInteger(value));

/**
 * Compares two consecutive saved sessions of the engine and describes what changed as events.
 * With no previous snapshot nothing is described (a reload in the middle of a game must not repeat old events).
 */
export const deriveLiveGameEvents = (
  previous: LiveEventSnapshot | null,
  current: LiveEventSnapshot,
  startSeq: number,
  at: string,
): LiveGameEvent[] => {
  if (!previous) return [];
  const round = asNumber(current.roundNumber);
  const phase = String(current.phase || '');
  const out: LiveGameEvent[] = [];
  const push = (event: Omit<LiveGameEvent, 'seq' | 'at' | 'round' | 'phase'>) => {
    out.push({ seq: startSeq + out.length, at, round, phase, ...event });
  };

  if (previous.phase !== current.phase && current.phase) push({ kind: 'phase', value: current.phase });
  if (current.phase === 'night' && current.nightSubPhase && previous.nightSubPhase !== current.nightSubPhase) {
    push({ kind: 'night_step', value: current.nightSubPhase });
  }
  if (current.phase === 'day_voting' && current.votingStage && previous.votingStage !== current.votingStage) {
    push({ kind: 'voting_stage', value: current.votingStage });
  }

  const previousNominations = new Set(previous.nominations || []);
  const currentNominations = new Set(current.nominations || []);
  for (const seat of currentNominations) {
    if (!previousNominations.has(seat)) push({ kind: 'nomination', seat, by: seatOrNull(current.nominationsMap?.[String(seat)]) });
  }
  for (const seat of previousNominations) {
    if (!currentNominations.has(seat)) push({ kind: 'nomination_removed', seat });
  }

  const speaker = seatOrNull(current.activeSpeakerSlot);
  if (speaker !== null && speaker !== seatOrNull(previous.activeSpeakerSlot)) {
    const kindOfSpeech = current.phase === 'night'
      ? (current.postNightStage === 'death_protocol' ? 'death_protocol' : 'farewell')
      : current.phase === 'day_voting'
        ? (current.votingStage === 'revote_speeches' ? 'revote' : 'farewell')
        : 'day';
    push({ kind: 'speech_start', seat: speaker, value: kindOfSpeech });
  }

  const votingRound = current.votingRounds?.[asNumber(current.activeVotingRoundIndex)];
  const previousVotes = new Map(entries(previous.votesByPlayer));
  const currentVotes = new Map(entries(current.votesByPlayer));
  for (const [voter, target] of currentVotes) {
    if (previousVotes.get(voter) !== target) push({ kind: 'vote', seat: voter, target, value: votingRound?.round_number ?? null });
  }
  for (const [voter, target] of previousVotes) {
    if (!currentVotes.has(voter)) push({ kind: 'vote_removed', seat: voter, target });
  }

  const previousTable = new Set(previous.tableDecisionSelectedVoterSlots || []);
  const currentTable = new Set(current.tableDecisionSelectedVoterSlots || []);
  for (const seat of currentTable) if (!previousTable.has(seat)) push({ kind: 'table_vote', seat });
  for (const seat of previousTable) if (!currentTable.has(seat)) push({ kind: 'table_vote_removed', seat });

  for (const round of current.votingRounds || []) {
    const before = previous.votingRounds?.find((item) => item.round_number === round.round_number);
    if (round.outcome && round.outcome !== 'pending' && before && before.outcome !== round.outcome) {
      push({ kind: 'vote_round_result', value: `${round.round_number}:${round.outcome}` });
    }
  }

  const shot = seatOrNull(current.shotPlayerSlot);
  if (shot !== seatOrNull(previous.shotPlayerSlot)) push({ kind: 'shot_target', target: shot });
  const don = seatOrNull(current.donCheckSlot);
  if (don !== null && don !== seatOrNull(previous.donCheckSlot)) {
    push({ kind: 'don_check', target: don, value: current.donCheckResult === null || current.donCheckResult === undefined ? null : current.donCheckResult ? 'sheriff' : 'not_sheriff' });
  }
  const sheriff = seatOrNull(current.sheriffCheckSlot);
  if (sheriff !== null && sheriff !== seatOrNull(previous.sheriffCheckSlot)) {
    push({ kind: 'sheriff_check', target: sheriff, value: current.sheriffCheckResult ?? null });
  }

  const markers = current.protocolMarkers;
  const previousMarkers = previous.protocolMarkers;
  const firstKilled = seatOrNull(markers?.firstKilledSlot);
  if (firstKilled !== null && firstKilled !== seatOrNull(previousMarkers?.firstKilledSlot)) push({ kind: 'first_killed', seat: firstKilled });
  const zeroVoted = seatOrNull(markers?.zeroRoundVotedSlot);
  if (zeroVoted !== null && zeroVoted !== seatOrNull(previousMarkers?.zeroRoundVotedSlot)) push({ kind: 'zero_round_voted', seat: zeroVoted });
  const bestMoveSeats = markers?.bestMoveSeats || [];
  if (bestMoveSeats.length && bestMoveSeats.join(',') !== (previousMarkers?.bestMoveSeats || []).join(',')) {
    push({ kind: 'best_move', seat: seatOrNull(markers?.bestMoveSourceSlot), value: bestMoveSeats.join(',') });
  }

  for (const player of current.activePlayers || []) {
    const seat = seatOrNull(player.slot_num);
    if (seat === null) continue;
    const before = previous.activePlayers?.find((item) => seatOrNull(item.slot_num) === seat);
    if (!before) continue;
    if (asNumber(player.fouls) !== asNumber(before.fouls)) push({ kind: 'foul', seat, value: asNumber(player.fouls) });
    if (asNumber(player.minor_tech_fouls) !== asNumber(before.minor_tech_fouls)) push({ kind: 'tech_minor', seat, value: asNumber(player.minor_tech_fouls) });
    if (asNumber(player.major_tech_fouls) !== asNumber(before.major_tech_fouls)) push({ kind: 'tech_major', seat, value: asNumber(player.major_tech_fouls) });
    if (before.alive !== false && player.alive === false) push({ kind: 'exit', seat, value: player.exit_reason || 'out' });
    if (before.alive === false && player.alive !== false) push({ kind: 'restored', seat });
    if (!before.ppk && player.ppk) push({ kind: 'ppk', seat });
  }

  return out;
};

/** Appends new events, keeps the log inside its size limit and renumbers nothing (seq is global). */
export const appendLiveGameEvents = (existing: LiveGameEvent[], added: LiveGameEvent[]): LiveGameEvent[] => {
  if (!added.length) return existing;
  const merged = [...existing, ...added];
  return merged.length > MAX_LIVE_GAME_EVENTS ? merged.slice(merged.length - MAX_LIVE_GAME_EVENTS) : merged;
};
