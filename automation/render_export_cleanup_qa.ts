import fs from 'node:fs';
import { createDatabaseConnection, restoreCheckpointFromGzB64 } from './src/db/index.ts';
import { resolveRepositoryPlayerAvatarPath } from './src/lib/playerAvatarManifest.ts';
import {
  buildGameExportRows,
  buildOfficialTournamentResultsPresentation,
  generateGameResultsPages,
  generateOfficialTournamentResultsPages,
  generateStandingsPages,
  type ExportSvgPage,
} from './src/lib/tournamentResultsExport.ts';
import { buildSeatingMatrix, generateSeatingSvg } from './src/lib/seatingExport.ts';
import { internalGetStandings, internalGetNominations } from './src/server/routes/tournamentsRoutes.ts';
import { loadTournamentAwardSnapshot } from './src/server/services/tournamentAwardsService.ts';

const out = 'visual-qa/export-cleanup';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const dbPath = '/tmp/newmafia-export-cleanup.sqlite';
fs.rmSync(dbPath, { force: true });
if (!restoreCheckpointFromGzB64(dbPath)) throw new Error('Не удалось восстановить канонический checkpoint для QA');
const db = createDatabaseConnection(dbPath);

const writeAsset = (name: string, page: ExportSvgPage) => {
  fs.writeFileSync(`${out}/${name}.svg`, page.svg);
  return { name, width: page.width, height: page.height, section: page.section, label: page.label, suffix: page.file_suffix, blocks: page.block_ids };
};

try {
  const tournament = await db.get<any>('SELECT * FROM tournaments ORDER BY date DESC, created_at DESC LIMIT 1');
  if (!tournament) throw new Error('Текущий турнир не найден');
  const tournamentId = String(tournament.id);

  const participants = await db.all<any>(`
    SELECT tp.id, tp.tournament_id, tp.player_id, tp.display_name, tp.participant_number
    FROM tournament_participants tp
    WHERE tp.tournament_id = ?
    ORDER BY tp.participant_number ASC
  `, [tournamentId]);
  const games = await db.all<any>(`
    SELECT * FROM tournament_games
    WHERE tournament_id = ?
    ORDER BY game_number ASC
  `, [tournamentId]);
  for (const game of games) {
    game.seats = await db.all<any>(`
      SELECT tgs.*, tp.display_name, tp.player_id
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
      WHERE tgs.game_id = ?
      ORDER BY tgs.seat_number ASC
    `, [game.id]);
  }
  tournament.participants = participants;
  tournament.games = games;

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
    new Date('2026-08-09T12:00:00.000Z'),
    avatars,
    nominationsRes.nominations || [],
  );
  const official = generateOfficialTournamentResultsPages(presentation);
  if (official.length !== 3) throw new Error(`Финальный экспорт должен дать 3 изображения, получено ${official.length}`);
  const expectedSections = ['winners', 'ranking', 'awards'];
  if (official.some((page, index) => page.section !== expectedSections[index])) throw new Error('Неверный порядок трёх финальных изображений');

  const completedGames = Number(standingsRes.completed_games_count ?? tournament.completed_games_count ?? 0);
  const totalGames = Number(tournament.total_games_count || games.length || 10);
  const intermediate = generateStandingsPages(tournament, standings, completedGames, totalGames, avatars);
  if (intermediate.length !== 1) throw new Error(`Промежуточный экспорт должен быть одним изображением, получено ${intermediate.length}`);

  const completed = games.filter((game: any) => game.status === 'completed');
  if (!completed.length) throw new Error('Нет завершённой игры для QA');
  let selected = completed[0];
  let selectedSignals = -1;
  for (const candidate of completed) {
    const rows = await db.all<any>(`
      SELECT judge_bonus, protocol_bonus, penalty_points, disciplinary_penalty_points, ci_points
      FROM tournament_game_player_results WHERE game_id = ?
    `, [candidate.id]);
    const count = rows.reduce((sum: number, row: any) => sum + [
      'judge_bonus', 'protocol_bonus', 'penalty_points', 'disciplinary_penalty_points', 'ci_points',
    ].filter((key) => Math.abs(Number(row[key] || 0)) > 0.0001).length, 0);
    if (count > selectedSignals) {
      selectedSignals = count;
      selected = candidate;
    }
  }
  const rawResults = await db.all<any>(`
    SELECT r.*, tgs.seat_number, tgs.role, tp.display_name, tp.player_id
    FROM tournament_game_player_results r
    JOIN tournament_game_seats tgs ON tgs.game_id = r.game_id AND tgs.participant_id = r.participant_id
    JOIN tournament_participants tp ON tp.id = r.participant_id
    WHERE r.game_id = ?
    ORDER BY tgs.seat_number ASC
  `, [selected.id]);
  const gameRows = buildGameExportRows(rawResults as any, standings, Number(selected.game_number), avatars);
  const gameExport = generateGameResultsPages(tournament, selected, gameRows);
  if (gameExport.length !== 1) throw new Error(`Итог игры должен быть одним изображением, получено ${gameExport.length}`);
  if (gameRows.length !== 10) throw new Error(`В representative game ожидалось 10 игроков, получено ${gameRows.length}`);

  const seatingMatrix = buildSeatingMatrix(tournament);
  if (!seatingMatrix.valid) throw new Error(seatingMatrix.error || 'Не удалось построить матрицу рассадки');
  const seatingSvg = generateSeatingSvg(tournament, seatingMatrix.rows);
  fs.writeFileSync(`${out}/seating.svg`, seatingSvg);

  const assets = [
    writeAsset('official-01-winners', official[0]),
    writeAsset('official-02-final-rating', official[1]),
    writeAsset('official-03-awards', official[2]),
    writeAsset(`game-${String(selected.game_number).padStart(2, '0')}`, gameExport[0]),
    writeAsset('intermediate', intermediate[0]),
  ];

  const combined = assets.map((asset) => fs.readFileSync(`${out}/${asset.name}.svg`, 'utf8')).join('\n') + seatingSvg;
  const forbidden = ['NewMafia CRM', '#0F172A', '#1E293B', '#2563EB', 'ПРОДОЛЖЕНИЕ'];
  for (const token of forbidden) {
    if (combined.includes(token)) throw new Error(`В reachable QA SVG остался запрещённый legacy-токен: ${token}`);
  }

  const rankMatches = official[1].svg.match(/>0[1-9]<|>10</g) || [];
  if (rankMatches.length < 10) throw new Error(`В финальном рейтинге не удалось подтвердить 10 видимых рангов: ${rankMatches.length}`);
  for (const row of seatingMatrix.rows) {
    if (!seatingSvg.includes(row.displayName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))) {
      throw new Error(`В рассадке отсутствует игрок ${row.displayName}`);
    }
    if (row.gameSeats.length !== 10) throw new Error(`У ${row.displayName} не 10 мест в рассадке`);
  }

  const manifest = {
    tournament: tournament.title,
    tournamentStatus: tournament.status,
    participants: participants.length,
    standings: standings.length,
    avatars: Object.keys(avatars).length,
    completedGames,
    totalGames,
    selectedGame: selected.game_number,
    selectedGameSignals: selectedSignals,
    finalAssets: official.map((page) => ({ section: page.section, label: page.label, suffix: page.file_suffix, width: page.width, height: page.height, blocks: page.block_ids })),
    game: { width: gameExport[0].width, height: gameExport[0].height, players: gameRows.length },
    intermediate: { width: intermediate[0].width, height: intermediate[0].height, rows: standings.length },
    seating: { width: 1080, height: 1350, rows: seatingMatrix.rows.length, gamesPerPlayer: seatingMatrix.rows[0]?.gameSeats.length || 0 },
  };
  fs.writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  db.sqlite.close();
  fs.rmSync(dbPath, { force: true });
}
