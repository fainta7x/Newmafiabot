import type { PlayerResultData, TournamentGameProtocolData } from '../../../lib/api';
import type { LiveGameEvent } from '../../../shared/liveGameEvents';
import type { VotingRound } from '../../../shared/tournamentVoting';
import { determineVotingResult } from '../../../shared/tournamentVoting';
import type { ZeroRoundRule } from '../../../shared/zeroRoundRule';
import { validateBestMoves, validateFirstKilled, validatePlayerResults, validateShots } from '../../../lib/protocolConsistency';
import { validateProtocolVoting } from '../../../lib/protocolVotingValidation';
import { roleCountsMatchTable, tableRolesLabel, isSupportedTableSize, CLASSIC_TABLE_SIZE } from '../../../lib/tableComposition';
import { finalRevealsOfEvents } from '../../../lib/revealStats';
import { getPlayerGameRoleLabel } from '../../../lib/playerGameRoleLabels';
import { deriveExitTypes } from '../tournaments/protocol/protocolStateUtils';

/**
 * What the protocol window shows and checks, as plain functions of the saved protocol: the circles of the game, the
 * ballots, what still needs the judge's attention and what the judge changed since the window opened.
 */

export type ProtocolState = { protocol: TournamentGameProtocolData; results: PlayerResultData[] };

export const circleTitle = (index: number) => (index === 0 ? 'Нулевой круг' : `Круг ${index}`);

export const EXIT_LABEL: Record<string, string> = {
  alive: 'в игре', killed: 'убит', voted_zero_round: 'заголосован в нулевом', voted_day: 'заголосован', removed: 'удалён',
};
export const exitLabel = (value: unknown) => EXIT_LABEL[String(value || '')] || 'в игре';

export const roleName = (role: string | null | undefined) => getPlayerGameRoleLabel(role ?? null) ?? 'Роль не выбрана';
export const teamOfRole = (role: string | null | undefined): 'red' | 'black' | null => (role === 'citizen' || role === 'sheriff' ? 'red' : role === 'mafia' || role === 'don' ? 'black' : null);

const votesOf = (protocol: TournamentGameProtocolData): VotingRound[] => (Array.isArray(protocol.votes) ? (protocol.votes as unknown as VotingRound[]) : []);

export type CircleModel = {
  index: number;
  title: string;
  /** Indexes into `protocol.votes` of the circle's first votings (not revotes). */
  rootRounds: number[];
  /** Index into `protocol.shots` of the night that follows this circle's voting, or -1. */
  shotIndex: number;
  events: LiveGameEvent[];
};

/**
 * Circle k is the voting of day k and the night after it: «Нулевой круг» is the zero voting with the first night, which is
 * how the live game numbers it (engine round k + 1; night k + 1).
 */
export const buildCircles = (protocol: TournamentGameProtocolData): CircleModel[] => {
  const votes = votesOf(protocol);
  const shots = Array.isArray(protocol.shots) ? protocol.shots : [];
  const events = Array.isArray(protocol.events) ? protocol.events : [];
  let count = 1;
  for (const round of votes) count = Math.max(count, Number(round.day_number ?? 0) + 1);
  for (const shot of shots) count = Math.max(count, Number(shot.night_number));
  for (const event of events) if (event.round >= 1) count = Math.max(count, event.round);
  return Array.from({ length: count }, (_, index) => ({
    index,
    title: circleTitle(index),
    rootRounds: votes.map((round, i) => (!round.is_revote && Number(round.day_number ?? 0) === index ? i : -1)).filter((i) => i >= 0),
    shotIndex: shots.findIndex((shot) => Number(shot.night_number) === index + 1),
    events: events.filter((event) => event.round === index + 1),
  }));
};

/** The revote chain that follows a first voting: [round, its revote, the revote's revote …] as indexes into `protocol.votes`. */
export const roundChain = (protocol: TournamentGameProtocolData, rootIndex: number): number[] => {
  const votes = votesOf(protocol);
  const chain = [rootIndex];
  for (;;) {
    const parent = votes[chain[chain.length - 1]];
    const childIndex = votes.findIndex((round) => round.is_revote && round.parent_round_number === parent?.round_number && Number(round.day_number ?? 0) === Number(parent?.day_number ?? 0));
    if (childIndex < 0 || chain.includes(childIndex)) break;
    chain.push(childIndex);
  }
  return chain;
};

const tally = (ballots: Record<number, number>, seats: number[]) => {
  const counts: Record<number, number> = {};
  for (const seat of seats) counts[seat] = 0;
  for (const target of Object.values(ballots)) if (seats.includes(target)) counts[target] += 1;
  return counts;
};

/**
 * Who voted for whom in one round: the judge's corrected ballots when there are any, otherwise the chronology of the game
 * (the last state of that round). `null` when nothing was recorded or the recorded ballots do not add up to the saved
 * counts: wrong chips are worse than none.
 */
export const roundBallots = (protocol: TournamentGameProtocolData, round: VotingRound, circleIndex: number, positionInChain: number): Record<number, number> | null => {
  const nominated = (round.nominated_seats || []).map(Number);
  const counts = round.vote_counts || {};
  if (round.ballots && Object.keys(round.ballots).length) {
    const own = tally(round.ballots, nominated);
    return nominated.every((s) => own[s] === Number(counts[s] || 0)) ? { ...round.ballots } : null;
  }
  const events = (Array.isArray(protocol.events) ? protocol.events : []).filter((event) => event.round === circleIndex + 1 && (event.kind === 'vote' || event.kind === 'vote_removed') && Number(event.value) === positionInChain + 1);
  if (!events.length) return null;
  const ballots: Record<number, number> = {};
  for (const event of events) {
    if (!event.seat) continue;
    if (event.kind === 'vote' && event.target) ballots[event.seat] = event.target;
    else delete ballots[event.seat];
  }
  const derived = tally(ballots, nominated);
  if (!nominated.every((s) => derived[s] === Number(counts[s] || 0))) return null;
  return ballots;
};

/** Who put each candidate forward in a circle (the last nomination of that seat). */
export const nominatorsOf = (events: LiveGameEvent[]): Record<number, number> => {
  const by: Record<number, number> = {};
  for (const event of events) if (event.kind === 'nomination' && event.seat && event.by) by[event.seat] = event.by;
  return by;
};

/** Seats that voted «поднять» at the table in a circle (a withdrawn vote is gone). */
export const tableVotersOf = (events: LiveGameEvent[]): number[] => {
  const seats = new Set<number>();
  for (const event of events) {
    if (event.kind === 'table_vote' && event.seat) seats.add(event.seat);
    if (event.kind === 'table_vote_removed' && event.seat) seats.delete(event.seat);
  }
  return [...seats].sort((a, b) => a - b);
};

export type NightCheck = { target: number | null; result: string | null };
export const checksOf = (events: LiveGameEvent[]): { don: NightCheck | null; sheriff: NightCheck | null; donStep: boolean; sheriffStep: boolean } => {
  let don: NightCheck | null = null;
  let sheriff: NightCheck | null = null;
  for (const event of events) {
    if (event.kind === 'don_check') don = { target: event.target ?? null, result: event.value == null ? null : String(event.value) };
    if (event.kind === 'sheriff_check') sheriff = { target: event.target ?? null, result: event.value == null ? null : String(event.value) };
  }
  return {
    don, sheriff,
    donStep: events.some((event) => event.kind === 'night_step' && event.value === 'don'),
    sheriffStep: events.some((event) => event.kind === 'night_step' && event.value === 'sheriff'),
  };
};

/** Whether the Don / the Sheriff was still at the table during the night of this circle (by the chronology; true when unknown). */
export const roleAtTable = (protocol: TournamentGameProtocolData, results: PlayerResultData[], role: 'don' | 'sheriff', circleIndex: number): boolean => {
  const holder = results.find((player) => player.role === role);
  if (!holder) return false;
  const left = (Array.isArray(protocol.events) ? protocol.events : []).filter((event) => event.kind === 'exit' && event.seat === holder.seat_number).pop();
  return !left || left.round >= circleIndex + 1;
};

export const checkResultText = (kind: 'don' | 'sheriff', result: string | null): string => {
  if (!result) return 'без ответа';
  if (kind === 'don') return result === 'sheriff' ? 'Шериф' : result === 'not_sheriff' ? 'не Шериф' : result;
  const text = result.toLowerCase();
  return text.includes('чёрн') || text.includes('черн') || text === 'black' ? 'чёрный' : text.includes('красн') || text === 'red' ? 'красный' : result;
};

/** Players who left the game in this circle according to the chronology (a restored player is not counted). */
export const exitsOf = (events: LiveGameEvent[]): Array<{ seat: number; reason: string }> => {
  const out = new Map<number, string>();
  for (const event of events) {
    if (event.kind === 'exit' && event.seat) out.set(event.seat, String(event.value || 'out'));
    if (event.kind === 'restored' && event.seat) out.delete(event.seat);
  }
  return [...out.entries()].map(([seatNumber, reason]) => ({ seat: seatNumber, reason }));
};

/** Fouls and technical fouls of a circle, as «#9 · фол 2». */
export const foulsOf = (events: LiveGameEvent[]): Array<{ seat: number; text: string }> => {
  const last = new Map<string, { seat: number; text: string }>();
  for (const event of events) {
    if (!event.seat) continue;
    if (event.kind === 'foul') last.set(`f${event.seat}`, { seat: event.seat, text: `фол ${event.value}` });
    if (event.kind === 'tech_minor') last.set(`m${event.seat}`, { seat: event.seat, text: `малый техфол ${event.value}` });
    if (event.kind === 'tech_major') last.set(`b${event.seat}`, { seat: event.seat, text: `большой техфол ${event.value}` });
  }
  return [...last.values()];
};

export type Issue = {
  id: string;
  severity: 'error' | 'check';
  title: string;
  sub?: string;
  tab: 'game' | 'players' | 'result';
  circle?: number;
  seat?: number;
};


/**
 * Everything that needs the judge. `error` is what the shared protocol checks refuse (the game cannot be confirmed
 * with it); `check` is only something the game's chronology says may have been left out.
 */
/** Version = reveal: the Sheriff is version 1, each black who claimed to be the Sheriff is another. A black reveal needs its announced checks. */
export const revealIssues = (protocol: TournamentGameProtocolData, results: PlayerResultData[]): Issue[] => {
  const events = (Array.isArray(protocol.events) ? protocol.events : []) as LiveGameEvent[];
  const out: Issue[] = [];
  for (const record of finalRevealsOfEvents(events).values()) {
    const owner = results.find((player) => player.seat_number === record.seat);
    if (teamOfRole(owner?.role) !== 'black' || record.checks.size) continue;
    out.push({ id: `reveal-checks-${record.seat}`, severity: 'check', title: `#${record.seat} ${owner?.display_name || ''}: у вскрытия нет названных проверок`, sub: 'Кого чёрный назвал красным или чёрным при вскрытии', tab: 'result' });
  }
  return out;
};

export const computeIssues = (state: ProtocolState, zeroRoundRule: ZeroRoundRule = 'tournament'): Issue[] => {
  const { protocol, results } = state;
  const issues: Issue[] = [];
  const tableSize = isSupportedTableSize(results.length) ? results.length : CLASSIC_TABLE_SIZE;
  const roleCounts = results.reduce<Record<string, number>>((acc, player) => { if (player.role) acc[player.role] = (acc[player.role] || 0) + 1; return acc; }, {});
  if (!roleCountsMatchTable(roleCounts, results.length)) {
    issues.push({ id: 'roles', severity: 'error', title: 'Роли расставлены не полностью', sub: `Нужно: ${isSupportedTableSize(results.length) ? tableRolesLabel(results.length) : '6 мирных, Шериф, 2 мафии и Дон'}`, tab: 'players' });
  }
  if (!protocol.winner_team && protocol.end_reason !== 'ppk') issues.push({ id: 'winner', severity: 'error', title: 'Не указана победившая команда', tab: 'result' });

  const firstKilled = protocol.first_killed_participant_id ?? null;
  const playersMessage = validatePlayerResults(results as any[], results as any[], firstKilled, tableSize);
  if (playersMessage) issues.push({ id: 'players', severity: 'error', title: playersMessage, tab: 'players' });
  const shotsMessage = validateShots(protocol.shots, tableSize);
  if (shotsMessage) issues.push({ id: 'shots', severity: 'error', title: shotsMessage, tab: 'game', circle: 0 });
  const firstMessage = validateFirstKilled(firstKilled, results as any[], results as any[], protocol.shots as any[]);
  if (firstMessage) issues.push({ id: 'first-killed', severity: 'error', title: firstMessage, tab: 'game', circle: 0 });
  const participantIds = results.map((player) => player.participant_id);
  const movesMessage = validateBestMoves(protocol.best_moves || [], firstKilled, protocol.zero_round_voted_participant_id ?? null, participantIds, results as any[], tableSize);
  if (movesMessage) issues.push({ id: 'best-move', severity: 'error', title: movesMessage, tab: 'game', circle: 0 });
  if (votesOf(protocol).length) {
    const voting = validateProtocolVoting(protocol.votes as any, results as any[], protocol.zero_round_voted_participant_id ?? null, true, { tableSize, zeroRoundRule });
    if (voting.errorMsg) {
      const round = voting.roundIndexWithError == null ? null : votesOf(protocol)[voting.roundIndexWithError];
      const day = round ? Number(round.day_number ?? 0) : 0;
      // The check speaks of «этап #3, день 1»; the window speaks of circles.
      const title = voting.errorMsg.replace(/^Голосование \(этап #\d+, день \d+\):?\s*/, `${circleTitle(day)}: `).replace(/^Голосование:\s*/, `${circleTitle(day)}: `);
      issues.push({ id: 'voting', severity: 'error', title, tab: 'game', circle: day });
    }
  }

  const derivedExits = deriveExitTypes((protocol.votes || []) as any[], (protocol.shots || []) as any[], firstKilled, results);
  for (const player of results) {
    const derived = derivedExits.get(player.seat_number);
    if (derived && derived !== 'alive' && derived !== player.exit_type) {
      issues.push({ id: `exit-${player.seat_number}`, severity: 'check', title: `#${player.seat_number} ${player.display_name}: статус не совпадает с записью игры`, sub: 'По голосованиям и ночам игрок вышел иначе, чем указано в карточке', tab: 'players', seat: player.seat_number });
    }
  }

  issues.push(...revealIssues(protocol, results));

  // What the chronology says may have been left out. Only a game that has a chronology can say it.
  const events = Array.isArray(protocol.events) ? protocol.events : [];
  if (events.length) {
    const missing: Record<'don' | 'sheriff', number[]> = { don: [], sheriff: [] };
    for (const circle of buildCircles(protocol)) {
      const checks = checksOf(circle.events);
      if (circle.index >= 1 && checks.donStep && !checks.don && roleAtTable(protocol, results, 'don', circle.index)) missing.don.push(circle.index);
      if (circle.index >= 1 && checks.sheriffStep && !checks.sheriff && roleAtTable(protocol, results, 'sheriff', circle.index)) missing.sheriff.push(circle.index);
    }
    for (const kind of ['don', 'sheriff'] as const) {
      if (!missing[kind].length) continue;
      const who = kind === 'don' ? 'Дона' : 'Шерифа';
      issues.push({
        id: `${kind}-checks`, severity: 'check',
        title: missing[kind].length === 1 ? `Круг ${missing[kind][0]}: проверка ${who} не отмечена` : `Проверка ${who} не отмечена в кругах ${missing[kind].join(', ')}`,
        sub: `В игре ${kind === 'don' ? 'Дон' : 'Шериф'} проверку не указал`, tab: 'game', circle: missing[kind][0],
      });
    }
    for (const player of results) {
      if (player.exit_type === 'killed' && !(player.color_protocol || []).length && events.some((event) => event.kind === 'death_protocol')) {
        issues.push({ id: `death-${player.seat_number}`, severity: 'check', title: `#${player.seat_number} ${player.display_name}: нет протокола убитого`, sub: 'Кого игрок считал красными и чёрными', tab: 'players', seat: player.seat_number });
      }
    }
  }
  return issues;
};

export type Change = { key: string; label: string; was: string; now: string; revert: (state: ProtocolState) => ProtocolState };

const winnerText = (value: unknown) => (value === 'red' ? 'победа красных' : value === 'black' ? 'победа чёрных' : 'не указана');
const seatsText = (seats: number[]) => (seats.length ? seats.map((value) => `#${value}`).join(' ') : 'пусто');
const roundKey = (round: VotingRound) => `${Number(round.day_number ?? 0)}:${Number(round.round_number ?? 0)}`;
const roundText = (round: VotingRound | undefined) => {
  if (!round) return 'нет';
  const parts = (round.nominated_seats || []).map((value) => `#${value} — ${votesText(Number(round.vote_counts?.[value] ?? 0))}`);
  return `${parts.join(', ') || 'без кандидатов'}${round.outcome && round.outcome !== 'pending' ? '' : ' (результат не подтверждён)'}`;
};
const roundSignature = (round: VotingRound) => JSON.stringify([round.nominated_seats, round.vote_counts, round.outcome, round.eliminated_seats, round.eligible_voters, round.table_leave_votes, round.ballots || null]);

/** Compares the protocol with the one the window opened with and lists what the judge changed; each item can be undone. */
export const computeChanges = (base: ProtocolState, current: ProtocolState): Change[] => {
  const changes: Change[] = [];
  const baseBySeat = new Map(base.results.map((player) => [player.seat_number, player]));
  const nameOf = (seatNumber: number) => `#${seatNumber} ${baseBySeat.get(seatNumber)?.display_name || ''}`.trim();

  const resultField = <K extends keyof PlayerResultData>(field: K, label: string, show: (value: PlayerResultData[K]) => string) => {
    for (const player of current.results) {
      const before = baseBySeat.get(player.seat_number);
      if (!before) continue;
      if (JSON.stringify(before[field] ?? null) === JSON.stringify(player[field] ?? null)) continue;
      changes.push({
        key: `${String(field)}-${player.seat_number}`, label: `${label} · ${nameOf(player.seat_number)}`, was: show(before[field]), now: show(player[field]),
        revert: (state) => ({ ...state, results: state.results.map((item) => (item.seat_number === player.seat_number ? { ...item, [field]: before[field] } : item)) }),
      });
    }
  };
  resultField('role', 'Роль', (value) => roleName(value as string | null));
  resultField('exit_type', 'Как вышел', (value) => exitLabel(value));
  resultField('regular_fouls', 'Фолы', (value) => String(value ?? 0));
  resultField('minor_technical_fouls', 'Малые техфолы', (value) => String(value ?? 0));
  resultField('major_technical_fouls', 'Большие техфолы', (value) => String(value ?? 0));
  resultField('judge_bonus', 'Балл судьи', (value) => String(value ?? 0));
  resultField('protocol_bonus', 'Балл за протокол', (value) => String(value ?? 0));
  resultField('color_protocol', 'Протокол убитого', (value) => ((value as any[]) || []).map((mark) => `${mark.mark === 'red' ? 'красные' : mark.mark === 'black' ? 'чёрные' : 'шериф'} ${seatsText(mark.seat_numbers)}`).join('; ') || 'пусто');

  if ((base.protocol.winner_team ?? null) !== (current.protocol.winner_team ?? null)) {
    changes.push({ key: 'winner', label: 'Победитель', was: winnerText(base.protocol.winner_team), now: winnerText(current.protocol.winner_team), revert: (state) => ({ ...state, protocol: { ...state.protocol, winner_team: base.protocol.winner_team ?? null } }) });
  }
  if ((base.protocol.end_reason ?? 'normal') !== (current.protocol.end_reason ?? 'normal') || (base.protocol.ppk_culprit_participant_id ?? null) !== (current.protocol.ppk_culprit_participant_id ?? null)) {
    changes.push({
      key: 'ppk', label: 'ППК', was: base.protocol.end_reason === 'ppk' ? 'был' : 'не было', now: current.protocol.end_reason === 'ppk' ? 'есть' : 'нет',
      revert: (state) => ({ ...state, protocol: { ...state.protocol, end_reason: base.protocol.end_reason, ppk_culprit_participant_id: base.protocol.ppk_culprit_participant_id ?? null, winner_team: base.protocol.winner_team ?? null } }),
    });
  }
  const seatOf = (state: ProtocolState, id: string | null | undefined) => state.results.find((player) => player.participant_id === id)?.seat_number;
  const markerChange = (key: string, label: string, field: 'first_killed_participant_id' | 'zero_round_voted_participant_id') => {
    if ((base.protocol[field] ?? null) === (current.protocol[field] ?? null)) return;
    const before = seatOf(base, base.protocol[field]);
    const after = seatOf(current, current.protocol[field]);
    changes.push({
      key, label, was: before ? `#${before}` : 'не выбран', now: after ? `#${after}` : 'не выбран',
      revert: (state) => ({ ...state, protocol: { ...state.protocol, [field]: base.protocol[field] ?? null, best_moves: base.protocol.best_moves } }),
    });
  };
  markerChange('first-killed', 'Первый убитый', 'first_killed_participant_id');
  markerChange('zero-voted', 'Заголосован в нулевом круге', 'zero_round_voted_participant_id');

  for (const source of ['first_killed', 'zero_round_voted'] as const) {
    const before = (base.protocol.best_moves || []).find((move) => move.source === source)?.seat_numbers || [];
    const after = (current.protocol.best_moves || []).find((move) => move.source === source)?.seat_numbers || [];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes.push({
      key: `bm-${source}`, label: source === 'first_killed' ? 'Лучший ход первого убитого' : 'Лучший ход из нулевого круга', was: seatsText(before), now: seatsText(after),
      revert: (state) => ({
        ...state,
        protocol: { ...state.protocol, best_moves: [...(state.protocol.best_moves || []).filter((move) => move.source !== source), ...((base.protocol.best_moves || []).filter((move) => move.source === source))] },
      }),
    });
  }

  const shotNights = new Set<number>([...(base.protocol.shots || []), ...(current.protocol.shots || [])].map((shot) => Number(shot.night_number)));
  for (const night of [...shotNights].sort((a, b) => a - b)) {
    const before = (base.protocol.shots || []).find((shot) => Number(shot.night_number) === night);
    const after = (current.protocol.shots || []).find((shot) => Number(shot.night_number) === night);
    if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) continue;
    const text = (shot: typeof before) => (!shot ? 'нет' : shot.result === 'killed' ? `убит #${shot.target_seat}` : shot.target_seat ? `промах по #${shot.target_seat}` : 'промах');
    changes.push({
      key: `shot-${night}`, label: `Ночь ${night}: выстрел`, was: text(before), now: text(after),
      revert: (state) => {
        const rest = (state.protocol.shots || []).filter((shot) => Number(shot.night_number) !== night);
        return { ...state, protocol: { ...state.protocol, shots: (before ? [...rest, before] : rest).sort((a, b) => a.night_number - b.night_number) } };
      },
    });
  }

  const baseRounds = new Map(votesOf(base.protocol).map((round) => [roundKey(round), round]));
  const currentRounds = new Map(votesOf(current.protocol).map((round) => [roundKey(round), round]));
  for (const key of new Set([...baseRounds.keys(), ...currentRounds.keys()])) {
    const before = baseRounds.get(key);
    const after = currentRounds.get(key);
    if (before && after && roundSignature(before) === roundSignature(after)) continue;
    const day = Number((after ?? before)?.day_number ?? 0);
    changes.push({
      key: `round-${key}`, label: `${circleTitle(day)}: ${(after ?? before)?.is_revote ? 'переголосование' : 'голосование'}`, was: roundText(before), now: roundText(after),
      revert: (state) => {
        const rest = votesOf(state.protocol).filter((round) => roundKey(round) !== key);
        const next = (before ? [...rest, before] : rest).sort((a, b) => Number(a.day_number ?? 0) - Number(b.day_number ?? 0) || Number(a.round_number ?? 0) - Number(b.round_number ?? 0));
        return { ...state, protocol: { ...state.protocol, votes: next as any } };
      },
    });
  }
  return changes;
};

/** Counts the ballots into the round, and leaves its outcome to be confirmed again. */
export const withBallots = (round: VotingRound, ballots: Record<number, number>): VotingRound => {
  const nominated = (round.nominated_seats || []).map(Number);
  const counts = tally(ballots, nominated);
  return { ...round, ballots, vote_counts: counts, outcome: 'pending', eliminated_seats: [], table_leave_votes: undefined };
};

export const describeRound = (round: VotingRound): string => {
  const result = determineVotingResult(round);
  return result.description;
};

/** «1 голос, 2 голоса, 5 голосов». */
export const plural = (count: number, forms: [string, string, string]): string => {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  const form = n > 10 && n < 20 ? forms[2] : last > 1 && last < 5 ? forms[1] : last === 1 ? forms[0] : forms[2];
  return `${count} ${form}`;
};
export const votesText = (count: number) => plural(count, ['голос', 'голоса', 'голосов']);

/**
 * What a voting came to, in a sentence a judge can read at a glance. `nameOf` gives «#7 Дина» for a seat.
 * An unfinished count says what is missing instead.
 */
export const describeVoting = (round: VotingRound, eligible: number, clubBreak: boolean, nameOf: (seat: number) => string): string => {
  const nominated = (round.nominated_seats || []).map(Number);
  const counts = round.vote_counts || {};
  const sum = nominated.reduce((total, seat) => total + Number(counts[seat] || 0), 0);
  if (!nominated.length) return 'Кандидаты не выбраны.';
  if (sum !== eligible) return `Распределите все голоса: учтено ${sum} из ${eligible}.`;
  const list = (seats: number[]) => seats.map(nameOf).join(', ');
  const result = determineVotingResult(round);
  if (round.outcome && round.outcome !== 'pending') {
    const out = (round.eliminated_seats || []).map(Number);
    if (round.outcome === 'single_eliminated') return `Ушёл ${list(out)}.`;
    if (round.outcome === 'all_tied_eliminated') return `Ушли все спорные: ${list(out)}.`;
    if (round.outcome === 'tie_revote') return `Ничья между ${list(result.winners)}. Было переголосование.`;
    return 'Никто не ушёл.';
  }
  if (clubBreak) return `Ничья сломана в пользу ${nameOf(result.winners[0])}. По клубной настройке он остаётся за столом, получает ещё 30 секунд речи, лучшего хода не будет.`;
  if (result.outcome === 'single_eliminated') return `Больше всех голосов у ${nameOf(result.winners[0])} (${votesText(counts[result.winners[0]] || 0)}). Он уходит из игры.`;
  if (result.outcome === 'needs_revote') return `Ничья между ${list(result.winners)}. Нужно переголосование.`;
  if (result.outcome === 'requires_table_decision') {
    if (result.resolvedOutcome === 'all_tied_eliminated') return `Стол решил: уходят все спорные (${list(result.winners)}).`;
    if (result.resolvedOutcome === 'no_elimination') return 'Стол решил: никто не уходит.';
    return `Снова ничья между ${list(result.winners)}. Нужно решение стола: укажите, сколько голосов за уход всех (для ухода нужно ${Math.floor(eligible / 2) + 1}).`;
  }
  return 'Никто не уходит.';
};
