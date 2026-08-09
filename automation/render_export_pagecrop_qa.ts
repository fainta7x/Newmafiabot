import fs from 'fs';
import { createDatabaseConnection, restoreCheckpointFromGzB64 } from './src/db/index.ts';
import { resolveRepositoryPlayerAvatarPath } from './src/lib/playerAvatarManifest.ts';
import { internalGetStandings, internalGetNominations } from './src/server/routes/tournamentsRoutes.ts';
import { loadTournamentAwardSnapshot } from './src/server/services/tournamentAwardsService.ts';
import {
  buildGameExportRows,
  buildOfficialTournamentResultsPresentation,
  generateGameResultsPages,
  generateOfficialTournamentResultsPages,
  generateStandingsPages,
  type ExportSvgPage,
} from './src/lib/tournamentResultsExport.ts';

const out = 'visual-qa/pagecrop';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const dbPath = '/tmp/newmafia-pagecrop.sqlite';
fs.rmSync(dbPath, { force: true });
if (!restoreCheckpointFromGzB64(dbPath)) throw new Error('canonical checkpoint unavailable');
const db = createDatabaseConnection(dbPath);

const writePages = (prefix: string, pages: ExportSvgPage[]) => {
  pages.forEach((page, index) => fs.writeFileSync(`${out}/${prefix}-${String(index + 1).padStart(2, '0')}.svg`, page.svg));
  return pages.map((page) => ({ section: page.section, blocks: page.block_ids }));
};

try {
  const tournament = await db.get<any>('SELECT * FROM tournaments ORDER BY date DESC, created_at DESC LIMIT 1');
  if (!tournament) throw new Error('tournament missing');
  const tournamentId = String(tournament.id);
  const standingsRes = await internalGetStandings(db, tournamentId);
  const nominationsRes = await internalGetNominations(db, tournamentId);
  const awards = await loadTournamentAwardSnapshot(db, tournamentId);
  const standings = standingsRes.standings || [];

  const avatarRows = await db.all<any>(`
    SELECT tp.id AS participant_id, tp.player_id, pa.mime_type, pa.image_data
    FROM tournament_participants tp
    LEFT JOIN player_avatars pa ON pa.player_id = tp.player_id
    WHERE tp.tournament_id = ?
  `, [tournamentId]);
  const avatars: Record<string, string> = {};
  for (const row of avatarRows) {
    let bytes: Buffer | null = null;
    let mime = row.mime_type || 'image/jpeg';
    if (row.image_data) {
      bytes = Buffer.isBuffer(row.image_data) ? row.image_data : Buffer.from(row.image_data);
    } else {
      const repoPath = resolveRepositoryPlayerAvatarPath(String(row.player_id), process.cwd());
      if (repoPath) {
        bytes = fs.readFileSync(repoPath);
        mime = repoPath.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      }
    }
    if (bytes) avatars[String(row.participant_id)] = `data:${mime};base64,${bytes.toString('base64')}`;
  }

  const presentation = buildOfficialTournamentResultsPresentation(
    tournament,
    standings,
    awards.slots || [],
    new Date('2026-08-09T08:00:00.000Z'),
    avatars,
    nominationsRes.nominations || [],
  );
  const official = generateOfficialTournamentResultsPages(presentation);

  const totalGames = Number(tournament.total_games_count || 10);
  const completed = Number(standingsRes.completed_games_count || tournament.completed_games_count || 0);
  const intermediate = generateStandingsPages(
    tournament,
    standings,
    Math.max(1, Math.min(completed, totalGames - 1 || completed)),
    totalGames,
    avatars,
  );

  const games = await db.all<any>(
    "SELECT * FROM tournament_games WHERE tournament_id = ? AND status = 'completed' ORDER BY game_number ASC",
    [tournamentId],
  );
  if (!games.length) throw new Error('completed game missing');
  let selected = games[games.length - 1];
  let bestCount = -1;
  for (const game of games) {
    const rows = await db.all<any>(
      'SELECT judge_bonus, protocol_bonus, penalty_points, disciplinary_penalty_points, ci_points FROM tournament_game_player_results WHERE game_id = ?',
      [game.id],
    );
    const count = rows.reduce((sum: number, row: any) => sum + [
      'judge_bonus',
      'protocol_bonus',
      'penalty_points',
      'disciplinary_penalty_points',
      'ci_points',
    ].filter((key) => Math.abs(Number(row[key] || 0)) > 0.0001).length, 0);
    if (count > bestCount) {
      bestCount = count;
      selected = game;
    }
  }

  const raw = await db.all<any>(`
    SELECT r.*, tgs.seat_number, tgs.role, tp.display_name
    FROM tournament_game_player_results r
    JOIN tournament_game_seats tgs ON tgs.game_id = r.game_id AND tgs.participant_id = r.participant_id
    JOIN tournament_participants tp ON tp.id = r.participant_id
    WHERE r.game_id = ?
    ORDER BY tgs.seat_number ASC
  `, [selected.id]);
  const gameRows = buildGameExportRows(raw as any, standings, selected.game_number, avatars);
  const game = generateGameResultsPages(tournament, selected, gameRows);

  const manifest = {
    tournament: tournament.title,
    tournamentStatus: tournament.status,
    standings: standings.length,
    avatars: Object.keys(avatars).length,
    selectedGame: selected.game_number,
    selectedGameNonZeroSignals: bestCount,
    official: writePages('official', official),
    intermediate: writePages('intermediate', intermediate),
    game: writePages('game', game),
  };
  fs.writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  db.sqlite.close();
  fs.rmSync(dbPath, { force: true });
}
