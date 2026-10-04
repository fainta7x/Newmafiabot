import type { LiveGameEvent } from '../shared/liveGameEvents';

/**
 * «Разбор партии»: the live game chronology folded into one record per circle — nominations, every voting with who voted
 * for whom, shots and checks of the night, who left the game and how. Pure and read-only: it only reads the events the
 * engine wrote next to the protocol.
 */

export type AnalysisExit = { seat: number; reason: string; phase: string };
export type AnalysisVoting = {
  /** Round number as the engine counted it inside the day (1 = first voting, 2 = revote, ...). */
  number: number;
  /** Candidate seat -> seats that voted for him, in the order the votes were given. */
  votes: Array<{ candidate: number; voters: number[] }>;
  /** Seats that raised their hand for «оставить / поднять» in a table decision. */
  tableVoters: number[];
  outcome: string | null;
};
export type AnalysisFoul = { seat: number; kind: 'foul' | 'tech_minor' | 'tech_major'; value: number };
export type AnalysisCircle = {
  round: number;
  /** The first night and the zero circle share the engine round 1. */
  nominations: Array<{ seat: number; by: number | null }>;
  votings: AnalysisVoting[];
  shot: number | null;
  donCheck: { target: number; result: string | null } | null;
  sheriffCheck: { target: number; result: string | null } | null;
  exits: AnalysisExit[];
  fouls: AnalysisFoul[];
  bestMove: { seat: number | null; seats: number[] } | null;
  firstKilled: number | null;
  zeroRoundVoted: number | null;
  ppk: number[];
  deathProtocols: Array<{ seat: number; value: string }>;
};
export type GameAnalysis = {
  circles: AnalysisCircle[];
  winner: 'red' | 'black' | null;
  eventsCount: number;
  votesCast: number;
  firstKilled: number | null;
  bestMoveSeats: number[];
};

const emptyCircle = (round: number): AnalysisCircle => ({
  round, nominations: [], votings: [], shot: null, donCheck: null, sheriffCheck: null, exits: [], fouls: [],
  bestMove: null, firstKilled: null, zeroRoundVoted: null, ppk: [], deathProtocols: [],
});

export const buildGameAnalysis = (events: LiveGameEvent[]): GameAnalysis => {
  const circles = new Map<number, AnalysisCircle>();
  const circleOf = (round: number) => {
    let circle = circles.get(round);
    if (!circle) { circle = emptyCircle(round); circles.set(round, circle); }
    return circle;
  };
  // voter -> candidate for the voting being counted, keyed by `${round}:${number}`
  const ballots = new Map<string, Map<number, number>>();
  const tableVotes = new Map<string, Set<number>>();
  const outcomes = new Map<string, string>();
  const votingKeys: Array<{ round: number; number: number }> = [];
  const noteVoting = (round: number, number: number) => {
    const key = `${round}:${number}`;
    if (!ballots.has(key)) { ballots.set(key, new Map()); votingKeys.push({ round, number }); }
    return key;
  };
  let currentVotingNumber = 1;
  let winner: GameAnalysis['winner'] = null;
  let votesCast = 0;

  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    const circle = circleOf(Math.max(1, Number(event.round) || 1));
    const seat = event.seat ?? null;
    const target = event.target ?? null;
    switch (event.kind) {
      case 'nomination':
        if (seat && !circle.nominations.some((item) => item.seat === seat)) circle.nominations.push({ seat, by: event.by ?? null });
        break;
      case 'nomination_removed':
        circle.nominations = circle.nominations.filter((item) => item.seat !== seat);
        break;
      case 'vote': {
        if (!seat || !target) break;
        const number = typeof event.value === 'number' ? event.value : Number(event.value) || currentVotingNumber;
        currentVotingNumber = number;
        ballots.get(noteVoting(circle.round, number))!.set(seat, target);
        votesCast += 1;
        break;
      }
      case 'vote_removed': {
        if (!seat) break;
        for (const [key, map] of ballots) if (key.startsWith(`${circle.round}:`)) map.delete(seat);
        break;
      }
      case 'table_vote': {
        if (!seat) break;
        const key = noteVoting(circle.round, currentVotingNumber);
        if (!tableVotes.has(key)) tableVotes.set(key, new Set());
        tableVotes.get(key)!.add(seat);
        break;
      }
      case 'table_vote_removed': {
        if (!seat) break;
        tableVotes.get(`${circle.round}:${currentVotingNumber}`)?.delete(seat);
        break;
      }
      case 'vote_round_result': {
        const [numberText, outcome] = String(event.value || '').split(':');
        const number = Number(numberText) || currentVotingNumber;
        noteVoting(circle.round, number);
        outcomes.set(`${circle.round}:${number}`, outcome || '');
        break;
      }
      case 'shot_target': circle.shot = target; break;
      case 'don_check': if (target) circle.donCheck = { target, result: event.value === null || event.value === undefined ? null : String(event.value) }; break;
      case 'sheriff_check': if (target) circle.sheriffCheck = { target, result: event.value === null || event.value === undefined ? null : String(event.value) }; break;
      case 'exit': if (seat) circle.exits.push({ seat, reason: String(event.value || 'out'), phase: event.phase }); break;
      case 'restored': if (seat) circle.exits = circle.exits.filter((item) => item.seat !== seat); break;
      case 'foul': case 'tech_minor': case 'tech_major':
        if (seat) {
          circle.fouls = circle.fouls.filter((item) => !(item.seat === seat && item.kind === event.kind));
          circle.fouls.push({ seat, kind: event.kind, value: Number(event.value) || 0 });
        }
        break;
      case 'best_move': circle.bestMove = { seat, seats: String(event.value || '').split(',').map(Number).filter(Boolean) }; break;
      case 'first_killed': circle.firstKilled = seat; break;
      case 'zero_round_voted': circle.zeroRoundVoted = seat; break;
      case 'ppk': if (seat) circle.ppk.push(seat); break;
      case 'death_protocol': if (seat) circle.deathProtocols.push({ seat, value: String(event.value || '') }); break;
      case 'game_end': winner = event.value === 'red' ? 'red' : event.value === 'black' ? 'black' : winner; break;
      default: break;
    }
  }

  for (const { round, number } of votingKeys) {
    const key = `${round}:${number}`;
    const byCandidate = new Map<number, number[]>();
    for (const [voter, candidate] of ballots.get(key) || []) byCandidate.set(candidate, [...(byCandidate.get(candidate) || []), voter]);
    const votes = [...byCandidate.entries()].map(([candidate, voters]) => ({ candidate, voters: voters.sort((a, b) => a - b) })).sort((a, b) => b.voters.length - a.voters.length || a.candidate - b.candidate);
    circleOf(round).votings.push({ number, votes, tableVoters: [...(tableVotes.get(key) || [])].sort((a, b) => a - b), outcome: outcomes.get(key) || null });
  }

  const ordered = [...circles.values()].sort((a, b) => a.round - b.round);
  const firstKilled = ordered.find((circle) => circle.firstKilled)?.firstKilled ?? null;
  return {
    circles: ordered.filter((circle) => circle.nominations.length || circle.votings.length || circle.shot || circle.donCheck || circle.sheriffCheck || circle.exits.length || circle.bestMove || circle.ppk.length || circle.fouls.length || circle.deathProtocols.length),
    winner,
    eventsCount: events.length,
    votesCast,
    firstKilled,
    bestMoveSeats: ordered.find((circle) => circle.bestMove)?.bestMove?.seats || [],
  };
};
