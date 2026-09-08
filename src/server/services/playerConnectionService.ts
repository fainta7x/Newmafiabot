import type { CompletedGameSnapshot } from './clubGameAnalyticsService.ts';

export type PlayerConnectionRow = {
  player_id: string;
  nickname: string;
  avatar_url: string;
  shared_games: number;
  same_team_games: number;
  same_team_wins: number;
  opponent_games: number;
  target_wins_vs_player: number;
  player_wins_vs_target: number;
};

const avatarUrl = (playerId: string) => `/api/player/players/${encodeURIComponent(playerId)}/avatar`;

export function buildPlayerConnectionSummary(games: CompletedGameSnapshot[], targetPlayerId: string) {
  const targetId = String(targetPlayerId);
  const rows = new Map<string, PlayerConnectionRow>();

  for (const game of games) {
    const target = game.players.find((player) => player.player_id === targetId);
    if (!target) continue;
    for (const player of game.players) {
      if (player.player_id === targetId) continue;
      const current = rows.get(player.player_id) || {
        player_id: player.player_id,
        nickname: player.nickname,
        avatar_url: avatarUrl(player.player_id),
        shared_games: 0,
        same_team_games: 0,
        same_team_wins: 0,
        opponent_games: 0,
        target_wins_vs_player: 0,
        player_wins_vs_target: 0,
      };
      current.nickname = player.nickname || current.nickname;
      current.shared_games += 1;
      if (player.team === target.team) {
        current.same_team_games += 1;
        if (target.won) current.same_team_wins += 1;
      } else {
        current.opponent_games += 1;
        if (target.won) current.target_wins_vs_player += 1;
        if (player.won) current.player_wins_vs_target += 1;
      }
      rows.set(player.player_id, current);
    }
  }

  const all = [...rows.values()];
  const teammates = all
    .filter((row) => row.same_team_games > 0)
    .sort((a, b) => b.same_team_games - a.same_team_games || b.same_team_wins - a.same_team_wins || a.nickname.localeCompare(b.nickname, 'ru'));
  const opponents = all
    .filter((row) => row.opponent_games > 0)
    .sort((a, b) => b.opponent_games - a.opponent_games || b.target_wins_vs_player - a.target_wins_vs_player || a.nickname.localeCompare(b.nickname, 'ru'));

  return {
    shared_players: all.length,
    teammates,
    opponents,
  };
}
