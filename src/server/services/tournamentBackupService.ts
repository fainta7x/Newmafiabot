import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeTournamentGameCount } from './tournamentDistanceService.ts';

// Tournament JSON backup: which tables a backup may write and how a backup file is validated before a restore.

// Helper for dynamic safe insertion using whitelist and PRAGMA table_info
const ALLOWED_BACKUP_TABLES = new Set([
  'players',
  'tournaments',
  'tournament_participants',
  'tournament_games',
  'tournament_game_seats',
  'tournament_game_protocols',
  'tournament_game_player_results',
  'tournament_game_best_moves',
  'tournament_final_resolutions',
  'tournament_protocol_imports',
]);

const cachedTableColumns = new Map<string, Set<string>>();

export async function insertRowSafe(
  tx: DatabaseWrapper,
  tableName: string,
  row: Record<string, any>,
  options: { upsertKey?: string; mode?: 'insert' | 'update' | 'upsert' } = {}
) {
  if (!ALLOWED_BACKUP_TABLES.has(tableName)) {
    throw new Error(`Таблица ${tableName} не входит в белый список разрешённых таблиц`);
  }

  let validColumns = cachedTableColumns.get(tableName);
  if (!validColumns) {
    const columnsInfo = await tx.all<any>(`PRAGMA table_info(${tableName})`);
    validColumns = new Set<string>(columnsInfo.map((c: any) => c.name));
    cachedTableColumns.set(tableName, validColumns);
  }

  const keysToInsert = Object.keys(row).filter((key) => validColumns!.has(key));
  if (keysToInsert.length === 0) return;

  const mode = options.mode || 'insert';
  const keyColumn = options.upsertKey || 'id';

  if (mode === 'update') {
    const setKeys = keysToInsert.filter((k) => k !== keyColumn);
    if (setKeys.length === 0) return;
    const setClause = setKeys.map((k) => `${k} = ?`).join(', ');
    const params = [...setKeys.map((k) => row[k] ?? null), row[keyColumn]];
    await tx.run(`UPDATE ${tableName} SET ${setClause} WHERE ${keyColumn} = ?`, params);
  } else if (mode === 'upsert') {
    const placeholders = keysToInsert.map(() => '?').join(', ');
    const updateKeys = keysToInsert.filter((k) => k !== keyColumn);
    if (updateKeys.length > 0) {
      const updateClause = updateKeys.map((k) => `${k} = excluded.${k}`).join(', ');
      const sql = `INSERT INTO ${tableName} (${keysToInsert.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${keyColumn}) DO UPDATE SET ${updateClause}`;
      const params = keysToInsert.map((k) => row[k] ?? null);
      await tx.run(sql, params);
    } else {
      const sql = `INSERT OR IGNORE INTO ${tableName} (${keysToInsert.join(', ')}) VALUES (${placeholders})`;
      const params = keysToInsert.map((k) => row[k] ?? null);
      await tx.run(sql, params);
    }
  } else {
    const placeholders = keysToInsert.map(() => '?').join(', ');
    const sql = `INSERT INTO ${tableName} (${keysToInsert.join(', ')}) VALUES (${placeholders})`;
    const params = keysToInsert.map((k) => row[k] ?? null);
    await tx.run(sql, params);
  }
}

// Helper for backup validation
export function validateTournamentBackupData(backupData: any, tournamentId: string) {
  if (!backupData || typeof backupData !== 'object') {
    return { valid: false, error: 'Файл не подходит: это не резервная копия турнира' };
  }

  if (backupData.schema_version !== 1) {
    return { valid: false, error: `Неподдерживаемая версия схемы: ${backupData.schema_version}` };
  }

  if (!backupData.checksum || typeof backupData.checksum !== 'string') {
    return { valid: false, error: 'Отсутствует контрольная сумма (checksum)' };
  }

  const { checksum, ...payload } = backupData;
  const computedChecksum = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if (checksum !== computedChecksum) {
    return { valid: false, error: 'Неправильная контрольная сумма (checksum). Файл повреждён или изменён.' };
  }

  if (payload.metadata?.tournament_id !== tournamentId || payload.tournament?.id !== tournamentId) {
    return { valid: false, error: 'Импортируемая резервная копия относится к другому турниру.' };
  }

  const participants = payload.tournament_participants || [];
  if (!Array.isArray(participants) || participants.length !== 10) {
    return { valid: false, error: `В копии должно быть ровно 10 участников, найдено: ${participants.length}` };
  }

  const games = payload.tournament_games || [];
  const expectedGames = normalizeTournamentGameCount(payload.tournament?.game_count);
  if (!Array.isArray(games) || games.length !== expectedGames) {
    return { valid: false, error: `В копии должно быть ровно ${expectedGames} игр, найдено: ${games.length}` };
  }

  const players = payload.players || [];
  if (!Array.isArray(players)) {
    return { valid: false, error: 'Список игроков имеет неверный формат' };
  }
  const playerIds = new Set(players.map((p: any) => p?.id).filter(Boolean));

  const participantIds = new Set<string>();
  const participantNumbers = new Set<number>();
  for (const participant of participants) {
    if (!participant?.id || participantIds.has(participant.id)) {
      return { valid: false, error: `Дублирующийся или пустой ID участника: ${participant?.id || 'пусто'}` };
    }
    if (participant.tournament_id !== tournamentId || !playerIds.has(participant.player_id)) {
      return { valid: false, error: `Участник ${participant.id} ссылается на неверный турнир или отсутствующего игрока` };
    }
    const number = Number(participant.participant_number);
    if (!Number.isInteger(number) || number < 1 || number > 10 || participantNumbers.has(number)) {
      return { valid: false, error: `Некорректный или повторяющийся номер участника: ${participant.participant_number}` };
    }
    participantIds.add(participant.id);
    participantNumbers.add(number);
  }

  const gameIds = new Set<string>();
  const gameNumbers = new Set<number>();
  for (const game of games) {
    const number = Number(game?.game_number);
    if (!game?.id || gameIds.has(game.id) || game.tournament_id !== tournamentId) {
      return { valid: false, error: `Игра содержит неверный турнир или повторяющийся ID: ${game?.id || 'пусто'}` };
    }
    if (!Number.isInteger(number) || number < 1 || number > 10 || gameNumbers.has(number)) {
      return { valid: false, error: `Некорректный или повторяющийся номер игры: ${game?.game_number}` };
    }
    gameIds.add(game.id);
    gameNumbers.add(number);
  }

  const seats = payload.tournament_game_seats || [];
  if (!Array.isArray(seats)) {
    return { valid: false, error: 'Список рассадки имеет неверный формат' };
  }
  const seatsByGame = new Map<string, number>();
  const seatNumbersByGame = new Map<string, Set<number>>();
  const seatedParticipantsByGame = new Map<string, Set<string>>();
  for (const s of seats) {
    if (!gameIds.has(s?.game_id) || !participantIds.has(s?.participant_id)) {
      return { valid: false, error: `Место ${s?.id || 'без ID'} ссылается на отсутствующую игру или участника` };
    }
    const seatNumber = Number(s.seat_number);
    const seatNumbers = seatNumbersByGame.get(s.game_id) || new Set<number>();
    const seatedParticipants = seatedParticipantsByGame.get(s.game_id) || new Set<string>();
    if (!Number.isInteger(seatNumber) || seatNumber < 1 || seatNumber > 10 || seatNumbers.has(seatNumber)) {
      return { valid: false, error: `В игре ${s.game_id} повторяется или некорректно место ${s.seat_number}` };
    }
    if (seatedParticipants.has(s.participant_id)) {
      return { valid: false, error: `В игре ${s.game_id} участник ${s.participant_id} посажен дважды` };
    }
    seatNumbers.add(seatNumber);
    seatedParticipants.add(s.participant_id);
    seatNumbersByGame.set(s.game_id, seatNumbers);
    seatedParticipantsByGame.set(s.game_id, seatedParticipants);
    seatsByGame.set(s.game_id, (seatsByGame.get(s.game_id) || 0) + 1);
  }
  for (const g of games) {
    const seatCount = seatsByGame.get(g.id) || 0;
    if (seatCount !== 10) {
      return { valid: false, error: `Игра №${g.game_number} имеет ${seatCount} мест вместо 10` };
    }
  }

  const protocols = payload.tournament_game_protocols || [];
  const results = payload.tournament_game_player_results || [];
  if (!Array.isArray(protocols) || !Array.isArray(results)) {
    return { valid: false, error: 'Протоколы или результаты игроков имеют неверный формат' };
  }
  const protocolGames = new Set<string>();
  for (const protocol of protocols) {
    if (!gameIds.has(protocol?.game_id) || protocolGames.has(protocol.game_id)) {
      return { valid: false, error: `Протокол ссылается на отсутствующую игру или дублирует игру ${protocol?.game_id}` };
    }
    protocolGames.add(protocol.game_id);
  }

  const resultsByGame = new Map<string, number>();
  const resultKeys = new Set<string>();
  for (const r of results) {
    const key = `${r?.game_id}:${r?.participant_id}`;
    if (
      !gameIds.has(r?.game_id) ||
      !participantIds.has(r?.participant_id) ||
      !seatedParticipantsByGame.get(r.game_id)?.has(r.participant_id) ||
      resultKeys.has(key)
    ) {
      return { valid: false, error: `Некорректный или повторяющийся результат ${key}` };
    }
    resultKeys.add(key);
    resultsByGame.set(r.game_id, (resultsByGame.get(r.game_id) || 0) + 1);
  }

  for (const [gameId, count] of resultsByGame) {
    if (!protocolGames.has(gameId) || count !== 10) {
      return { valid: false, error: `Игра ${gameId} содержит ${count} результатов без полного протокола` };
    }
  }

  for (const pr of protocols) {
    if (pr.status === 'completed') {
      const resCount = resultsByGame.get(pr.game_id) || 0;
      if (resCount !== 10) {
        return { valid: false, error: `Завершённый протокол содержит ${resCount} результатов вместо 10` };
      }
    }
  }

  const bestMoves = payload.tournament_game_best_moves || [];
  if (!Array.isArray(bestMoves)) {
    return { valid: false, error: 'Лучшие ходы имеют неверный формат' };
  }
  for (const bestMove of bestMoves) {
    if (!gameIds.has(bestMove?.game_id) || !participantIds.has(bestMove?.participant_id)) {
      return { valid: false, error: `Лучший ход ${bestMove?.id || 'без ID'} содержит неверную ссылку` };
    }
  }

  return { valid: true };
}
