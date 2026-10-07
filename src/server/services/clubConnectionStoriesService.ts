import type { AnalyticsPlayerResult, CompletedGameSnapshot } from './clubGameAnalyticsService.ts';
import type { ClubConnectionStories, ConnectionMember } from '../../shared/clubConnectionStories.ts';
import { winRatePercent } from '../../shared/stats.ts';

type Sample = { games: number; wins: number; events: Set<string> };
type Group = Sample & { members: ConnectionMember[] };
const newSample = (): Sample => ({ games: 0, wins: 0, events: new Set() });
const member = (player: AnalyticsPlayerResult): ConnectionMember => ({ player_id: player.player_id, nickname: player.nickname });
const payload = (sample: Sample) => ({ games: sample.games, wins: sample.wins, events: sample.events.size, win_rate: winRatePercent(sample.wins, sample.games) });
const idsKey = (members: ConnectionMember[]) => JSON.stringify(members.map(p => p.player_id));
const stable = (a: { members: ConnectionMember[] }, b: { members: ConnectionMember[] }) => idsKey(a.members).localeCompare(idsKey(b.members));
const bySample = (a: Sample, b: Sample) => b.games - a.games || b.events.size - a.events.size || b.wins - a.wins;
const bump = (sample: Sample, event: string, won: boolean) => { sample.games++; sample.events.add(event); if (won) sample.wins++; };

/** Descriptive club patterns; not estimates of individual skill, friendship or causal synergy. */
export function buildClubConnectionStories(
  snapshots: CompletedGameSnapshot[],
  canViewConnections: (id: string) => boolean,
): ClubConnectionStories {
  const trios = new Map<string, Group>();
  const donPairs = new Map<string, Group>();
  const sheriffPairs = new Map<string, Group>();
  const opposite = new Map<string, Group>();
  const bothColors = new Map<string, { members: ConnectionMember[]; red: Sample; black: Sample }>();
  const circles = new Map<string, Sample & ConnectionMember & { people: Set<string> }>();
  const seenGames = new Set<string>();
  const ordered = [...snapshots].sort((a, b) => b.dateMs - a.dateMs || a.id.localeCompare(b.id));
  const bumpGroup = (map: Map<string, Group>, members: ConnectionMember[], event: string, won: boolean) => {
    const key = idsKey(members);
    const group = map.get(key) ?? { ...newSample(), members };
    bump(group, event, won);
    map.set(key, group);
  };
  for (const game of ordered) {
    const gameKey = JSON.stringify([game.source, game.id]);
    if (seenGames.has(gameKey)) continue;
    seenGames.add(gameKey);
    if (game.players.some(p => !p.player_id) || new Set(game.players.map(p => p.player_id)).size !== game.players.length) continue;
    const event = JSON.stringify([game.source, game.event_id]);
    const visible = game.players.filter(p => canViewConnections(p.player_id)).sort((a, b) => a.player_id.localeCompare(b.player_id));
    // Check the full original black roster first. Hidden/missing/extra seats must not fabricate a trio.
    const blacks = game.players.filter(p => p.team === 'black');
    if (blacks.length === 3 && blacks.filter(p => p.role === 'don').length === 1 && blacks.filter(p => p.role === 'mafia').length === 2 && blacks.every(p => canViewConnections(p.player_id))) {
      const members = [...blacks].sort((a, b) => a.player_id.localeCompare(b.player_id)).map(member);
      bumpGroup(trios, members, event, game.winner_team === 'black');
    }
    for (const player of visible) {
      const circle = circles.get(player.player_id) ?? { ...newSample(), ...member(player), people: new Set<string>() };
      // Only encounters with another visible participant describe an open connection.
      if (visible.length > 1) {
        bump(circle, event, false);
        for (const other of visible) if (other.player_id !== player.player_id) circle.people.add(other.player_id);
        circles.set(player.player_id, circle);
      }
    }
    for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i], b = visible[j];
      const members = [member(a), member(b)];
      const key = idsKey(members);
      if (a.team !== b.team) {
        bumpGroup(opposite, members, event, game.winner_team === a.team);
        continue;
      }
      const colors = bothColors.get(key) ?? { members, red: newSample(), black: newSample() };
      bump(colors[a.team], event, game.winner_team === a.team);
      bothColors.set(key, colors);
      const leader = [a, b].find(p => p.role === (a.team === 'black' ? 'don' : 'sheriff'));
      const partner = leader === a ? b : a;
      if (leader && partner.role === (a.team === 'black' ? 'mafia' : 'citizen')) {
        bumpGroup(a.team === 'black' ? donPairs : sheriffPairs, [member(leader), member(partner)], event, game.winner_team === a.team);
      }
    }
  }
  const groups = (map: Map<string, Group>) => [...map.values()].filter(g => g.games >= 2)
    .sort((a, b) => bySample(a, b) || stable(a, b)).slice(0, 3)
    .map(g => ({ members: g.members, ...payload(g) }));
  return {
    black_trios: groups(trios),
    don_mafia: groups(donPairs),
    sheriff_citizen: groups(sheriffPairs),
    balanced_rivalries: [...opposite.values()].filter(g => g.games >= 4 && g.wins / g.games >= 0.35 && g.wins / g.games <= 0.65)
      .sort((a, b) => Math.abs(a.wins / a.games - 0.5) - Math.abs(b.wins / b.games - 0.5) || bySample(a, b) || stable(a, b)).slice(0, 3)
      .map(g => ({ members: g.members, games: g.games, events: g.events.size, a_wins: g.wins, b_wins: g.games - g.wins })),
    versatile_pairs: [...bothColors.values()].filter(g => g.red.games >= 2 && g.black.games >= 2)
      .sort((a, b) => Math.min(b.red.games, b.black.games) - Math.min(a.red.games, a.black.games) || (b.red.games + b.black.games) - (a.red.games + a.black.games) || stable(a, b)).slice(0, 3)
      .map(g => ({ members: g.members, red: payload(g.red), black: payload(g.black) })),
    table_circles: [...circles.values()].filter(g => g.games >= 2 && g.people.size > 0)
      .sort((a, b) => b.people.size - a.people.size || b.events.size - a.events.size || b.games - a.games || a.player_id.localeCompare(b.player_id)).slice(0, 3)
      .map(g => ({ player_id: g.player_id, nickname: g.nickname, games: g.games, events: g.events.size, people: g.people.size })),
  };
}
