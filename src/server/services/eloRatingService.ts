import type { DatabaseWrapper } from '../../db/index.ts';

export const DEFAULT_ELO = 1000;

export type EloTeam = 'red' | 'black';

export interface CanonicalEloGamePlayer {
  playerId: string;
  team: EloTeam;
  elo: number;
  canonicalPersonalGamePoints: number;
}

export interface CanonicalEloPlayerDelta {
  playerId: string;
  expectedTeamResult: number;
  resultDelta: number;
  carryModifier: number;
  modifiedResultDelta: number;
  personalDelta: number;
  totalDelta: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function calculateCanonicalEloGame(
  players: CanonicalEloGamePlayer[],
  winnerTeam: EloTeam,
): CanonicalEloPlayerDelta[] {
  const redPlayers = players.filter((player) => player.team === 'red');
  const blackPlayers = players.filter((player) => player.team === 'black');
  if (!redPlayers.length || !blackPlayers.length) {
    throw new Error('Canonical Elo requires both red and black teams.');
  }

  const redTeamAvg = average(redPlayers.map((player) => player.elo));
  const blackTeamAvg = average(blackPlayers.map((player) => player.elo));
  const redOdds = (0.30 / 0.70) * (10 ** ((redTeamAvg - blackTeamAvg) / 400));
  const pRed = redOdds / (1 + redOdds);
  const pBlack = 1 - pRed;

  return players.map((player) => {
    const teamPlayers = player.team === 'red' ? redPlayers : blackPlayers;
    const allies = teamPlayers.filter((ally) => ally.playerId !== player.playerId);
    const allyAvgExcludingSelf = allies.length ? average(allies.map((ally) => ally.elo)) : player.elo;
    const n = clamp((player.elo - allyAvgExcludingSelf) / 200, -1, 1);
    const won = player.team === winnerTeam;

    let carryModifier: number;
    if (won) carryModifier = n > 0 ? 1 + 0.30 * n : 1 - 0.20 * Math.abs(n);
    else carryModifier = n > 0 ? 1 - 0.40 * n : 1 + 0.20 * Math.abs(n);

    const expectedTeamResult = player.team === 'red' ? pRed : pBlack;
    const actualResult = won ? 1 : 0;
    const resultDelta = 10 * (actualResult - expectedTeamResult);
    const modifiedResultDelta = resultDelta * carryModifier;
    const personalDelta = player.canonicalPersonalGamePoints * 8;

    return {
      playerId: player.playerId,
      expectedTeamResult,
      resultDelta,
      carryModifier,
      modifiedResultDelta,
      personalDelta,
      totalDelta: modifiedResultDelta + personalDelta,
    };
  });
}

const teamFromRole = (role: unknown): EloTeam | null => {
  const value = String(role || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный', 'sheriff', 'шериф'].includes(value)) return 'red';
  if (['mafia', 'мафия', 'маф', 'black', 'черный', 'don', 'дон'].includes(value)) return 'black';
  return null;
};

const normalizeWinner = (value: unknown): EloTeam | null => {
  const normalized = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['red', 'красные', 'красная', 'город'].includes(normalized)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(normalized)) return 'black';
  return null;
};

export interface EloRebuildRow {
  player_id: string;
  nickname: string;
  elo: number;
  games: number;
}

export async function rebuildCanonicalEloRatings(db: DatabaseWrapper): Promise<EloRebuildRow[]> {
  // Tournament standings owns the canonical personal game score. Importing it lazily
  // avoids a startup module cycle with tournamentProtocolRoutes.
  const { internalGetStandings } = await import('../routes/tournamentsRoutesBase.ts');

  const players = await db.all<any>('SELECT id, nickname FROM players ORDER BY nickname COLLATE NOCASE, id');
  const ratings = new Map<string, number>(players.map((player) => [String(player.id), DEFAULT_ELO]));
  const gameCounts = new Map<string, number>();

  const tournaments = await db.all<any>(`
    SELECT DISTINCT t.id, t.date, t.created_at
      FROM tournaments t
      JOIN tournament_games g ON g.tournament_id = t.id
      JOIN tournament_game_protocols p ON p.game_id = g.id
     WHERE g.status = 'completed' AND p.status = 'completed'
     ORDER BY COALESCE(t.date, t.created_at) ASC, t.created_at ASC, t.id ASC
  `);

  for (const tournament of tournaments) {
    const standingsData = await internalGetStandings(db, String(tournament.id));
    const standings = Array.isArray(standingsData?.standings) ? standingsData.standings : [];
    const games = await db.all<any>(`
      SELECT g.id, g.game_number, COALESCE(p.winner_team, g.winner_team) AS winner_team,
             COALESCE(g.completed_at, t.date, t.created_at) AS sort_at
        FROM tournament_games g
        JOIN tournaments t ON t.id = g.tournament_id
        JOIN tournament_game_protocols p ON p.game_id = g.id
       WHERE g.tournament_id = ? AND g.status = 'completed' AND p.status = 'completed'
       ORDER BY COALESCE(g.completed_at, t.date, t.created_at) ASC, g.game_number ASC, g.id ASC
    `, [tournament.id]);

    for (const game of games) {
      const winner = normalizeWinner(game.winner_team);
      if (!winner) throw new Error(`Canonical Elo cannot rate tournament game ${game.id}: winner is missing.`);

      const gamePlayers: CanonicalEloGamePlayer[] = [];
      for (const participant of standings) {
        if (!participant.player_id) continue;
        const canonicalGame = Array.isArray(participant.games)
          ? participant.games.find((item: any) => Number(item.game_number) === Number(game.game_number))
          : null;
        if (!canonicalGame) continue;

        const team = teamFromRole(canonicalGame.role);
        if (!team) throw new Error(`Canonical Elo cannot rate tournament game ${game.id}: role is missing.`);
        const playerId = String(participant.player_id);
        const currentElo = ratings.get(playerId);
        if (currentElo === undefined) throw new Error(`Canonical Elo cannot find player ${playerId}.`);

        // game_total is the canonical tournament score for this game:
        // win_point + judge + protocol + best move + CI - game/disciplinary penalties.
        const canonicalPersonalGamePoints = Number(canonicalGame.game_total || 0) - Number(canonicalGame.win_point || 0);
        gamePlayers.push({ playerId, team, elo: currentElo, canonicalPersonalGamePoints });
      }

      if (gamePlayers.length !== 10 || new Set(gamePlayers.map((player) => player.playerId)).size !== 10) {
        throw new Error(`Canonical Elo cannot rate tournament game ${game.id}: expected 10 unique linked players.`);
      }

      const deltas = calculateCanonicalEloGame(gamePlayers, winner);
      // Simultaneous application: all deltas were calculated from one pre-game rating snapshot.
      for (const delta of deltas) {
        ratings.set(delta.playerId, (ratings.get(delta.playerId) ?? DEFAULT_ELO) + delta.totalDelta);
        gameCounts.set(delta.playerId, (gameCounts.get(delta.playerId) || 0) + 1);
      }
    }
  }

  await db.transaction(async (tx) => {
    await tx.run('UPDATE players SET elo = ?', [DEFAULT_ELO]);
    for (const [playerId, rating] of ratings) {
      if (!gameCounts.get(playerId)) continue;
      await tx.run('UPDATE players SET elo = ? WHERE id = ?', [Math.round(rating), playerId]);
    }
  });

  return players
    .filter((player) => (gameCounts.get(String(player.id)) || 0) > 0)
    .map((player) => ({
      player_id: String(player.id),
      nickname: String(player.nickname || 'Игрок'),
      elo: Math.round(ratings.get(String(player.id)) ?? DEFAULT_ELO),
      games: gameCounts.get(String(player.id)) || 0,
    }))
    .sort((a, b) => b.elo - a.elo || a.nickname.localeCompare(b.nickname, 'ru'));
}
