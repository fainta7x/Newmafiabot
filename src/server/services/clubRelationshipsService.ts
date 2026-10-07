import type { AnalyticsTeam, CompletedGameSnapshot } from './clubGameAnalyticsService.ts';
import { winRatePercent } from '../../shared/stats.ts';

type PersonStat = { player_id: string; nickname: string; games: number; wins: number };
type DuoStat = { a_id: string; a_name: string; b_id: string; b_name: string; team: AnalyticsTeam; games: number; wins: number };
const winRate = winRatePercent;
const avatarUrl = (id: string) => `/api/player/players/${encodeURIComponent(id)}/avatar`;

export function buildClubRelationships(
  snapshots: CompletedGameSnapshot[],
  viewerId: string,
  canViewConnections: (playerId: string) => boolean = () => true,
) {
  // Filter before ranking/slicing so hidden pairs cannot displace public pairs or leak counts.
  snapshots = snapshots.map(game => ({ ...game, players: game.players.filter(player => canViewConnections(player.player_id)) }));
  const opponents = new Map<string, PersonStat>();
  const teammates = new Map<string, PersonStat>();
  const duos = new Map<string, DuoStat>();

  const bumpPerson = (target: Map<string, PersonStat>, playerId: string, nickname: string, won: boolean) => {
    const stat = target.get(playerId) || { player_id: playerId, nickname, games: 0, wins: 0 };
    stat.games += 1;
    if (won) stat.wins += 1;
    target.set(playerId, stat);
  };

  for (const game of snapshots) {
    const viewer = game.players.find((player) => player.player_id === String(viewerId));
    if (viewer) {
      for (const other of game.players) {
        if (other.player_id === String(viewerId)) continue;
        if (other.team === viewer.team) bumpPerson(teammates, other.player_id, other.nickname, viewer.won);
        else bumpPerson(opponents, other.player_id, other.nickname, viewer.won);
      }
    }

    for (const team of ['red', 'black'] as const) {
      const members = game.players.filter((player) => player.team === team);
      for (let first = 0; first < members.length; first += 1) {
        for (let second = first + 1; second < members.length; second += 1) {
          const a = members[first];
          const b = members[second];
          const [left, right] = a.player_id.localeCompare(b.player_id) <= 0 ? [a, b] : [b, a];
          const key = `${team}:${left.player_id}:${right.player_id}`;
          const stat = duos.get(key) || {
            a_id: left.player_id,
            a_name: left.nickname,
            b_id: right.player_id,
            b_name: right.nickname,
            team,
            games: 0,
            wins: 0,
          };
          stat.games += 1;
          if (a.won) stat.wins += 1;
          duos.set(key, stat);
        }
      }
    }
  }

  const personPayload = (stat: PersonStat) => ({
    ...stat,
    win_rate: winRate(stat.wins, stat.games),
    avatar_url: avatarUrl(stat.player_id),
  });

  const rivals = [...opponents.values()]
    .sort((a, b) => b.games - a.games || Math.abs(winRate(a.wins, a.games) - 50) - Math.abs(winRate(b.wins, b.games) - 50) || a.nickname.localeCompare(b.nickname, 'ru'))
    .slice(0, 8)
    .map(personPayload);

  const personalDuos = [...teammates.values()]
    .sort((a, b) => b.games - a.games || winRate(b.wins, b.games) - winRate(a.wins, a.games) || a.nickname.localeCompare(b.nickname, 'ru'))
    .slice(0, 8)
    .map(personPayload);

  const allDuos = [...duos.values()];
  const duoPool = allDuos.filter((duo) => duo.games >= 2);
  const duoPayload = (duo: DuoStat) => ({ ...duo, win_rate: winRate(duo.wins, duo.games), a_avatar_url: avatarUrl(duo.a_id), b_avatar_url: avatarUrl(duo.b_id) });
  const rankDuos = (team: AnalyticsTeam) => duoPool
    .filter((duo) => duo.team === team)
    .sort((a, b) => {
      const aRate = winRate(a.wins, a.games);
      const bRate = winRate(b.wins, b.games);
      const aScore = aRate + Math.min(10, a.games) * 2;
      const bScore = bRate + Math.min(10, b.games) * 2;
      return bScore - aScore || b.games - a.games || bRate - aRate || a.a_id.localeCompare(b.a_id) || a.b_id.localeCompare(b.b_id);
    })
    .slice(0, 5)
    .map(duoPayload);

  const byGames = (a: DuoStat, b: DuoStat) => b.games - a.games || b.wins - a.wins || a.a_id.localeCompare(b.a_id) || a.b_id.localeCompare(b.b_id);
  const mostPlayed = (team: AnalyticsTeam) => duoPool.filter(duo => duo.team === team).sort(byGames).slice(0, 5).map(duoPayload);
  const firstGames = (team: AnalyticsTeam) => allDuos.filter(duo => duo.team === team && duo.games === 1).sort(byGames).slice(0, 5).map(duoPayload);
  const latest = snapshots.filter(game => game.players.some(player => player.player_id === String(viewerId)))
    .sort((a, b) => b.dateMs - a.dateMs || b.game_number - a.game_number || a.id.localeCompare(b.id))[0];
  const recentMates = new Map<string, PersonStat>();
  const recentRivals = new Map<string, PersonStat>();
  if (latest) {
    for (const game of snapshots.filter(game => game.source === latest.source && game.event_id === latest.event_id)) {
      const viewer = game.players.find(player => player.player_id === String(viewerId));
      if (!viewer) continue;
      for (const other of game.players) {
        if (other.player_id !== viewer.player_id) bumpPerson(other.team === viewer.team ? recentMates : recentRivals, other.player_id, other.nickname, viewer.won);
      }
    }
  }

  return {
    viewer_id: String(viewerId),
    rivals,
    teammates: personalDuos,
    club_duos: {
      red: rankDuos('red'),
      black: rankDuos('black'),
    },
    club_most_played: { red: mostPlayed('red'), black: mostPlayed('black') },
    club_first_games: { red: firstGames('red'), black: firstGames('black') },
    recent_event: latest ? { title: latest.title, date: latest.date, source: latest.source,
      teammates: [...recentMates.values()].sort((a, b) => b.games - a.games || a.player_id.localeCompare(b.player_id)).map(personPayload),
      rivals: [...recentRivals.values()].sort((a, b) => b.games - a.games || a.player_id.localeCompare(b.player_id)).map(personPayload),
    } : null,
    meta: {
      rivalry: 'Считаются только завершённые игры, где игроки были по разные стороны.',
      duo: 'Связки считаются по завершённым играм в одной команде. В клубный топ попадают пары минимум с двумя совместными играми.',
    },
  };
}
