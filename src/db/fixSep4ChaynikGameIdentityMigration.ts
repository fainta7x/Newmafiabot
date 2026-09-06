import crypto from 'crypto';
import type { DatabaseWrapper } from './index.ts';
import { reconcileClubGameTokenSettlement } from '../server/services/clubGameTokenSettlementService.ts';
import { rebuildCanonicalEloRatings } from '../server/services/eloRatingService.ts';
import { reconcileRegularEveningPayments } from '../server/services/eveningPaymentPricingService.ts';

const MIGRATION_KEY = '0016_fix_sep4_chaynik_game_identity_v1';
const TARGET_DATE = '2026-09-04';
const CHAYNIK_ALIASES = new Set(['чайник', 'chaynik', 'chainik']);
const FANDORIN_ALIASES = new Set(['фандорин', 'fandorin']);
const GUEST_NICKNAME = 'Гость 04.09';

const normalizeNickname = (value: unknown) => String(value ?? '')
  .trim()
  .toLocaleLowerCase('ru-RU')
  .replace(/ё/g, 'е');

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const replaceExactStringDeep = (value: any, from: string, to: string): any => {
  if (value === from) return to;
  if (Array.isArray(value)) return value.map((item) => replaceExactStringDeep(item, from, to));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceExactStringDeep(item, from, to)]));
  }
  return value;
};

const moscowDate = (value: unknown): string | null => {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
};

const resultLooksLikeChaynik = (result: any, playerNicknameById: Map<string, string>) => {
  if (CHAYNIK_ALIASES.has(normalizeNickname(result?.display_name))) return true;
  const playerNickname = playerNicknameById.get(String(result?.player_id || ''));
  return CHAYNIK_ALIASES.has(normalizeNickname(playerNickname));
};

const findUniquePlayer = async (db: DatabaseWrapper, aliases: Set<string>, label: string) => {
  const players = await db.all<any>('SELECT id, nickname FROM players ORDER BY created_at ASC, id ASC');
  const matches = players.filter((player) => aliases.has(normalizeNickname(player.nickname)));
  if (matches.length !== 1) throw new Error(`[DATA] ${label}: expected exactly one player, found ${matches.length}`);
  return matches[0];
};

const ensureEveningParticipant = async (
  db: DatabaseWrapper,
  eveningId: string,
  playerId: string,
): Promise<string> => {
  const existing = await db.get<any>(
    'SELECT id FROM evening_participants WHERE evening_id=? AND player_id=? LIMIT 1',
    [eveningId, playerId],
  );
  const now = new Date().toISOString();
  if (existing?.id) {
    await db.run(
      `UPDATE evening_participants
          SET attendance_status='attended', checked_in_at=COALESCE(checked_in_at, ?), updated_at=?
        WHERE id=?`,
      [now, now, existing.id],
    );
    return String(existing.id);
  }

  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO evening_participants (
      id, evening_id, player_id, table_id,
      registration_status, response_status, attendance_status, arrival_status,
      payment_status, amount_due, amount_paid,
      registered_at, checked_in_at, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, 'unanswered', 'unanswered', 'attended', 'unknown', 'unpaid', 0, 0, ?, ?, ?, ?)`,
    [id, eveningId, playerId, now, now, now, now],
  );
  return id;
};

const ensureQuickGuest = async (db: DatabaseWrapper): Promise<any> => {
  const existing = await db.get<any>(
    `SELECT id, nickname FROM players
      WHERE source='quick_guest' AND nickname=?
      ORDER BY created_at ASC, id ASC LIMIT 1`,
    [GUEST_NICKNAME],
  );
  if (existing?.id) return existing;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO players (id,nickname,lifecycle_status,source,created_at,updated_at)
     VALUES (?,?,'normal','quick_guest',?,?)`,
    [id, GUEST_NICKNAME, now, now],
  );
  return { id, nickname: GUEST_NICKNAME };
};

const replaceSeatIdentity = (
  protocol: any,
  slots: any[],
  oldParticipantId: string,
  oldPlayerId: string,
  replacementParticipantId: string,
  replacementPlayerId: string,
  replacementNickname: string,
) => {
  let nextProtocol = replaceExactStringDeep(protocol, oldParticipantId, replacementParticipantId);
  nextProtocol = {
    ...nextProtocol,
    player_results: (nextProtocol.player_results || []).map((result: any) =>
      String(result?.player_id || '') === oldPlayerId && String(result?.participant_id || '') === replacementParticipantId
        ? {
            ...result,
            participant_id: replacementParticipantId,
            player_id: replacementPlayerId,
            display_name: replacementNickname,
          }
        : result,
    ),
  };

  const nextSlots = slots.map((slot: any) =>
    String(slot?.player_id || '') === oldPlayerId && String(slot?.participant_id || '') === oldParticipantId
      ? {
          ...slot,
          participant_id: replacementParticipantId,
          player_id: replacementPlayerId,
          nickname: replacementNickname,
        }
      : slot,
  );

  return { protocol: nextProtocol, slots: nextSlots };
};

export interface Sep4ChaynikRepairResult {
  applied: boolean;
  gamesChanged: number[];
  eveningId: string | null;
}

export async function applySep4ChaynikGameIdentityMigration(db: DatabaseWrapper): Promise<Sep4ChaynikRepairResult> {
  const migrationTable = await db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='migration_history' LIMIT 1",
  );
  if (!migrationTable) return { applied: false, gamesChanged: [], eveningId: null };

  const completed = await db.get<any>(
    'SELECT status FROM migration_history WHERE migration_name=? LIMIT 1',
    [MIGRATION_KEY],
  );
  if (completed?.status === 'completed') return { applied: false, gamesChanged: [], eveningId: null };

  const fandorin = await findUniquePlayer(db, FANDORIN_ALIASES, 'Fandorin');
  const players = await db.all<any>('SELECT id, nickname FROM players ORDER BY created_at ASC, id ASC');
  const playerNicknameById = new Map(players.map((player) => [String(player.id), String(player.nickname || '')]));

  const candidateEvenings = (await db.all<any>('SELECT id, starts_at FROM game_evenings ORDER BY starts_at ASC'))
    .filter((evening) => moscowDate(evening.starts_at) === TARGET_DATE);
  if (!candidateEvenings.length) throw new Error(`[DATA] No game evening found for ${TARGET_DATE}`);

  const inspected: Array<{ evening: any; games: any[] }> = [];
  for (const evening of candidateEvenings) {
    const rows = await db.all<any>(
      'SELECT id, protocol_text, slots_json FROM games WHERE evening_id=? AND archived_at IS NULL ORDER BY global_game_number ASC, id ASC',
      [evening.id],
    );
    const games = rows.map((row) => {
      const protocol = safeJsonParse<any>(row.protocol_text, null);
      const slots = safeJsonParse<any[]>(row.slots_json, []);
      const results = Array.isArray(protocol?.player_results) ? protocol.player_results : [];
      const chaynikResults = results.filter((result: any) => resultLooksLikeChaynik(result, playerNicknameById));
      return { row, protocol, slots, results, chaynikResults };
    });
    if (games.some((game) => game.chaynikResults.length)) inspected.push({ evening, games });
  }

  if (inspected.length !== 1) {
    throw new Error(`[DATA] Expected exactly one relevant ${TARGET_DATE} evening containing Chaynik games, found ${inspected.length}`);
  }

  const target = inspected[0];
  if (target.games.length < 2) throw new Error(`[DATA] ${TARGET_DATE} evening has fewer than two games`);
  const secondGame = target.games[1];
  if (secondGame.chaynikResults.length !== 1) {
    throw new Error(`[DATA] Expected exactly one Chaynik seat in the second ${TARGET_DATE} game, found ${secondGame.chaynikResults.length}`);
  }
  for (const game of target.games.slice(2)) {
    if (game.chaynikResults.length > 1) {
      throw new Error(`[DATA] Game ${game.row.id} contains Chaynik ${game.chaynikResults.length} times; automatic replacement aborted`);
    }
    if (game.chaynikResults.length === 1 && game.results.some((result: any) => String(result?.player_id || '') === String(fandorin.id))) {
      throw new Error(`[DATA] Game ${game.row.id} already contains both Chaynik and Fandorin; automatic replacement aborted`);
    }
  }

  const guest = await ensureQuickGuest(db);
  const eveningId = String(target.evening.id);
  const guestParticipantId = await ensureEveningParticipant(db, eveningId, String(guest.id));
  const fandorinParticipantId = await ensureEveningParticipant(db, eveningId, String(fandorin.id));
  const gamesChanged: number[] = [];

  const applyToGame = async (game: any, replacement: { participantId: string; playerId: string; nickname: string }) => {
    const oldResult = game.chaynikResults[0];
    if (!oldResult) return;
    const oldParticipantId = String(oldResult.participant_id || '');
    const oldPlayerId = String(oldResult.player_id || '');
    if (!oldParticipantId || !oldPlayerId) throw new Error(`[DATA] Game ${game.row.id} Chaynik result is missing identity`);
    const next = replaceSeatIdentity(
      game.protocol,
      game.slots,
      oldParticipantId,
      oldPlayerId,
      replacement.participantId,
      replacement.playerId,
      replacement.nickname,
    );
    await db.run(
      'UPDATE games SET protocol_text=?, slots_json=? WHERE id=?',
      [JSON.stringify(next.protocol), JSON.stringify(next.slots), game.row.id],
    );
    gamesChanged.push(Number(game.row.id));
  };

  await applyToGame(secondGame, {
    participantId: guestParticipantId,
    playerId: String(guest.id),
    nickname: String(guest.nickname),
  });
  for (const game of target.games.slice(2)) {
    await applyToGame(game, {
      participantId: fandorinParticipantId,
      playerId: String(fandorin.id),
      nickname: String(fandorin.nickname),
    });
  }

  if (!gamesChanged.length) throw new Error(`[DATA] No ${TARGET_DATE} game identities changed`);

  for (const gameId of gamesChanged) {
    await reconcileClubGameTokenSettlement(db, gameId, { activateIfUntracked: false, context: 'correction' });
  }
  await reconcileRegularEveningPayments(db, eveningId);
  await rebuildCanonicalEloRatings(db);

  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO migration_history (id, migration_name, status, details_json, executed_at)
     VALUES (?, ?, 'completed', ?, ?)`,
    [
      MIGRATION_KEY,
      MIGRATION_KEY,
      JSON.stringify({
        target_date: TARGET_DATE,
        target_evening_id: eveningId,
        second_game_guest_player_id: guest.id,
        fandorin_player_id: fandorin.id,
        games_changed: gamesChanged,
      }),
      now,
    ],
  );

  console.log(`[DATA] Corrected ${gamesChanged.length} Chaynik seat identity record(s) from ${TARGET_DATE}.`);
  return { applied: true, gamesChanged, eveningId };
}
