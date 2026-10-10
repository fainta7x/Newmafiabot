import type { AnalyticsPlayerResult, AnalyticsTeam, CompletedGameSnapshot } from './clubGameAnalyticsService.ts';
import { winRatePercent } from '../../shared/stats.ts';

/** Personal teamwork view for one player («Моя команда»). Descriptive counts of completed games only. */
type Person = { player_id: string; nickname: string; avatar_url: string };
export type TeammateStat = Person & { games: number; wins: number; win_rate: number };
export type RolePartner = TeammateStat & { partner_role: string | null };
export type OpponentStat = Person & { games: number; wins: number; win_rate: number };
export type KnownStage = 'acquaintance' | 'teammates' | 'tandem';
export type StageProgress = Person & {
  stage: KnownStage;
  shared_games: number;
  same_team_games: number;
  /** Games still needed on the same team for the next step, or null for the top step. */
  games_to_next: number | null;
};
export type NeverPlayed = Person & { recent_games: number };

export type PersonalTeamwork = {
  my_team: { red: TeammateStat[]; black: TeammateStat[] };
  role_pairs: Array<{ my_role: 'don' | 'mafia' | 'sheriff'; games: number; partners: RolePartner[] }>;
  opponents: { hard: OpponentStat[]; easy: OpponentStat[] };
  stages: { counts: Record<KnownStage, number>; closest: StageProgress[] };
  never_played: NeverPlayed[];
};

export const TEAMMATE_STEP = 3; // same-team games to count as «напарники»
export const TANDEM_STEP = 6; // same-team games to count as «связка»
const RECENT_DAYS = 90;
const OPPONENT_MIN_GAMES = 3;

export function buildPersonalTeamwork(
  snapshots: CompletedGameSnapshot[],
  viewerId: string,
  canViewConnections: (playerId: string) => boolean,
  avatarUrl: (playerId: string) => string,
  nowMs = Date.now(),
): PersonalTeamwork {
  const me = String(viewerId);
  const person = (p: AnalyticsPlayerResult): Person => ({ player_id: p.player_id, nickname: p.nickname, avatar_url: avatarUrl(p.player_id) });

  const byTeam: Record<AnalyticsTeam, Map<string, TeammateStat>> = { red: new Map(), black: new Map() };
  const rolePartners = new Map<string, { games: number; partners: Map<string, RolePartner & { roles: Map<string, number> }> }>();
  const opponents = new Map<string, OpponentStat>();
  const shared = new Map<string, { person: Person; shared: number; same: number }>();
  const recentActive = new Map<string, { person: Person; games: number }>();
  const metIds = new Set<string>();
  const cutoff = nowMs - RECENT_DAYS * 24 * 60 * 60 * 1000;

  for (const game of snapshots) {
    const visible = game.players.filter((p) => canViewConnections(p.player_id));
    for (const p of visible) {
      if (p.player_id === me || game.dateMs < cutoff) continue;
      const entry = recentActive.get(p.player_id) || { person: person(p), games: 0 };
      entry.games += 1;
      recentActive.set(p.player_id, entry);
    }
    const mine = game.players.find((p) => p.player_id === me);
    if (!mine) continue;
    for (const other of visible) {
      if (other.player_id === me) continue;
      metIds.add(other.player_id);
      const link = shared.get(other.player_id) || { person: person(other), shared: 0, same: 0 };
      link.shared += 1;
      if (other.team === mine.team) link.same += 1;
      shared.set(other.player_id, link);

      if (other.team === mine.team) {
        const stat = byTeam[mine.team].get(other.player_id) || { ...person(other), games: 0, wins: 0, win_rate: 0 };
        stat.games += 1;
        if (mine.won) stat.wins += 1;
        byTeam[mine.team].set(other.player_id, stat);

        if (mine.role === 'don' || mine.role === 'mafia' || mine.role === 'sheriff') {
          const bucket = rolePartners.get(mine.role) || { games: 0, partners: new Map() };
          const partner = bucket.partners.get(other.player_id) || { ...person(other), games: 0, wins: 0, win_rate: 0, partner_role: null, roles: new Map<string, number>() };
          partner.games += 1;
          if (mine.won) partner.wins += 1;
          if (other.role) partner.roles.set(other.role, (partner.roles.get(other.role) || 0) + 1);
          bucket.partners.set(other.player_id, partner);
          rolePartners.set(mine.role, bucket);
        }
      } else {
        const stat = opponents.get(other.player_id) || { ...person(other), games: 0, wins: 0, win_rate: 0 };
        stat.games += 1;
        if (mine.won) stat.wins += 1;
        opponents.set(other.player_id, stat);
      }
    }
    if (mine.role === 'don' || mine.role === 'mafia' || mine.role === 'sheriff') {
      const bucket = rolePartners.get(mine.role) || { games: 0, partners: new Map() };
      bucket.games += 1;
      rolePartners.set(mine.role, bucket);
    }
  }

  const rate = (stat: { wins: number; games: number }) => winRatePercent(stat.wins, stat.games);
  const top = <T extends { games: number; wins: number; nickname: string }>(items: T[], limit: number) =>
    [...items]
      .sort((a, b) => b.games - a.games || b.wins - a.wins || a.nickname.localeCompare(b.nickname, 'ru'))
      .slice(0, limit);
  const withRate = <T extends { wins: number; games: number }>(stat: T): T & { win_rate: number } => ({ ...stat, win_rate: rate(stat) });

  const my_team = {
    red: top([...byTeam.red.values()], 3).map(withRate),
    black: top([...byTeam.black.values()], 3).map(withRate),
  };

  const role_pairs = (['don', 'mafia', 'sheriff'] as const)
    .map((role) => {
      const bucket = rolePartners.get(role);
      if (!bucket || !bucket.games) return null;
      const partners = top([...bucket.partners.values()], 3).map(({ roles, ...partner }) => {
        const common = [...roles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        return withRate({ ...partner, partner_role: common });
      });
      return { my_role: role, games: bucket.games, partners };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const seasoned = [...opponents.values()].filter((o) => o.games >= OPPONENT_MIN_GAMES).map(withRate);
  const hard = [...seasoned].sort((a, b) => a.win_rate - b.win_rate || b.games - a.games).filter((o) => o.win_rate < 50).slice(0, 3);
  const easy = [...seasoned].sort((a, b) => b.win_rate - a.win_rate || b.games - a.games).filter((o) => o.win_rate > 50).slice(0, 3);

  const stageOf = (same: number): KnownStage => (same >= TANDEM_STEP ? 'tandem' : same >= TEAMMATE_STEP ? 'teammates' : 'acquaintance');
  const counts: Record<KnownStage, number> = { acquaintance: 0, teammates: 0, tandem: 0 };
  const progress: StageProgress[] = [];
  for (const link of shared.values()) {
    const stage = stageOf(link.same);
    counts[stage] += 1;
    const next = stage === 'acquaintance' ? TEAMMATE_STEP : stage === 'teammates' ? TANDEM_STEP : null;
    progress.push({ ...link.person, stage, shared_games: link.shared, same_team_games: link.same, games_to_next: next == null ? null : next - link.same });
  }
  const closest = progress
    .filter((p) => p.games_to_next != null && p.same_team_games > 0)
    .sort((a, b) => (a.games_to_next as number) - (b.games_to_next as number) || b.same_team_games - a.same_team_games || a.nickname.localeCompare(b.nickname, 'ru'))
    .slice(0, 3);

  const never_played = [...recentActive.entries()]
    .filter(([id]) => !metIds.has(id))
    .map(([, entry]) => ({ ...entry.person, recent_games: entry.games }))
    .sort((a, b) => b.recent_games - a.recent_games || a.nickname.localeCompare(b.nickname, 'ru'))
    .slice(0, 6);

  return { my_team, role_pairs, opponents: { hard, easy }, stages: { counts, closest }, never_played };
}
