import crypto from 'crypto';
import type { DatabaseWrapper } from './index.ts';
import { reconcileClubGameTokenSettlement } from '../server/services/clubGameTokenSettlementService.ts';
import { rebuildCanonicalEloRatings } from '../server/services/eloRatingService.ts';
import { reconcileRegularEveningPayments } from '../server/services/eveningPaymentPricingService.ts';

const MIGRATION_KEY = '0015_fix_fandorin_aug28_game_identity_v1';
const TARGET_DATE = '2026-08-28';
const CHAGIN_ALIASES = new Set(['чагин', 'chagin']);
const FANDORIN_ALIASES = new Set(['фандорин', 'fandorin']);

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

const findUniquePlayer = async (db: DatabaseWrapper, aliases: Set<string>, label: string) => {
  const players = await db.all<any>('SELECT id, nickname FROM players ORDER BY created_at ASC, id ASC');
  const matches = players.filter((player) => aliases.has(normalizeNickname(player.nickname)));
  if (matches.length !== 1) {
    throw new Error(`[DATA] ${label}: expected exactly one player, found ${matches.length}`);
  }
  return matches[0];
};

const ensureFandorinParticipant = async (
  db: DatabaseWrapper,
  eveningId: string,
  fandorinId: string,
): Promise<string> => {
  const existing = await db.get<any>(
    'SELECT id FROM evening_participants WHERE evening_id=? AND player_id=? LIMIT 1',
    [eveningId, fandorinId],
  );
  if (existing?.id) {
    // The corrected game proves factual attendance only. Preserve whatever the player
    // actually answered before the evening (going/late/thinking/declined/unanswered).
    await db.run(
      `UPDATE evening_participants
          SET attendance_status='attended', checked_in_at=COALESCE(checked_in_at, ?), updated_at=?
        WHERE id=?`,
      [new Date().toISOString(), new Date().toISOString(), existing.id],
    );
    return String(existing.id);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO evening_participants (
      id, evening_id, player_id, table_id,
      registration_status, response_status, attendance_status, arrival_status,
      payment_status, amount_due, amount_paid,
      registered_at, checked_in_at, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, 'unanswered', 'unanswered', 'attended', 'unknown', 'unpaid', 0, 0, ?, ?, ?, ?)`,
    [id, eveningId, fandorinId, now, now, now, now],
  );
  return id;
};

interface InspectedGame {
  row: any;
  protocol: any;
  slots: any[];
  results: any[];
  chaginResults: any[];
  fandorinAlreadyInGame: boolean;
}

interface InspectedEvening {
  evening: any;
  games: InspectedGame[];
  relevant: boolean;
}

export interface FandorinAug28RepairResult {
  applied: boolean;
  gamesChanged: number[];
  eveningsTouched: string[];
}

export async function applyFandorinAug28GameIdentityMigration(db: DatabaseWrapper): Promise<FandorinAug28RepairResult> {
  const migrationTable = await db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='migration_history' LIMIT 1",
  );
  if (!migrationTable) return { applied: false, gamesChanged: [], eveningsTouched: [] };

  const completed = await db.get<any>(
    'SELECT status FROM migration_history WHERE migration_name=? LIMIT 1',
    [MIGRATION_KEY],
  );
  if (completed?.status === 'completed') return { applied: false, gamesChanged: [], eveningsTouched: [] };

  const chagin = await findUniquePlayer(db, CHAGIN_ALIASES, 'Chagin');
  const fandorin = await findUniquePlayer(db, FANDORIN_ALIASES, 'Fandorin');
  if (String(chagin.id) === String(fandorin.id)) throw new Error('[DATA] Chagin and Fandorin resolve to the same player');

  const dateEvenings = (await db.all<any>('SELECT id, starts_at FROM game_evenings ORDER BY starts_at ASC'))
    .filter((evening) => moscowDate(evening.starts_at) === TARGET_DATE);
  if (!dateEvenings.length) throw new Error(`[DATA] No game evening found for ${TARGET_DATE}`);

  // Discover the exact historical evening before writing anything. There may be copied,
  // test or duplicate evenings on the same calendar date; only an evening whose structured
  // game results contain Chagin/Fandorin is a repair candidate.
  const inspectedEvenings: InspectedEvening[] = [];
  for (const evening of dateEvenings) {
    const rows = await db.all<any>(
      'SELECT id, protocol_text, slots_json FROM games WHERE evening_id=? AND archived_at IS NULL ORDER BY global_game_number ASC, id ASC',
      [evening.id],
    );
    const games = rows.map((row): InspectedGame => {
      const protocol = safeJsonParse<any>(row.protocol_text, null);
      const slots = safeJsonParse<any[]>(row.slots_json, []);
      const results = Array.isArray(protocol?.player_results) ? protocol.player_results : [];
      const chaginResults = results.filter((result: any) => String(result?.player_id || '') === String(chagin.id));
      const fandorinAlreadyInGame = results.some((result: any) => String(result?.player_id || '') === String(fandorin.id));
      return { row, protocol, slots, results, chaginResults, fandorinAlreadyInGame };
    });
    inspectedEvenings.push({
      evening,
      games,
      relevant: games.some((game) => game.chaginResults.length > 0 || game.fandorinAlreadyInGame),
    });
  }

  const relevantEvenings = inspectedEvenings.filter((item) => item.relevant);
  if (relevantEvenings.length !== 1) {
    throw new Error(`[DATA] Expected exactly one relevant ${TARGET_DATE} evening containing Chagin/Fandorin games, found ${relevantEvenings.length}`);
  }

  const target = relevantEvenings[0];

  // Validate every affected game before the first mutation. If the historical shape is
  // ambiguous, leave the entire evening untouched rather than partially guessing.
  for (const game of target.games) {
    if (game.chaginResults.length && game.fandorinAlreadyInGame) {
      throw new Error(`[DATA] Game ${game.row.id} already contains both Chagin and Fandorin; automatic replacement aborted`);
    }
    if (game.chaginResults.length > 1) {
      throw new Error(`[DATA] Game ${game.row.id} contains Chagin ${game.chaginResults.length} times; automatic replacement aborted`);
    }
    if (game.chaginResults.length === 1 && !String(game.chaginResults[0]?.participant_id || '')) {
      throw new Error(`[DATA] Game ${game.row.id} Chagin result has no participant_id`);
    }
  }

  const gamesChanged: number[] = [];
  const eveningsTouched = new Set<string>();
  const gamesToReconcile = new Set<number>();
  const eveningId = String(target.evening.id);

  for (const game of target.games) {
    if (!game.chaginResults.length) {
      if (game.fandorinAlreadyInGame) {
        // A previous process may have updated the game but stopped before settlement/history.
        // Re-run all dependent reconciliation for that evening rather than treating it as finished.
        gamesToReconcile.add(Number(game.row.id));
        eveningsTouched.add(eveningId);
      }
      continue;
    }

    const oldParticipantId = String(game.chaginResults[0].participant_id);
    const fandorinParticipantId = await ensureFandorinParticipant(db, eveningId, String(fandorin.id));

    let nextProtocol = replaceExactStringDeep(game.protocol, oldParticipantId, fandorinParticipantId);
    nextProtocol = {
      ...nextProtocol,
      player_results: (nextProtocol.player_results || []).map((result: any) =>
        String(result?.player_id || '') === String(chagin.id)
          ? {
              ...result,
              participant_id: fandorinParticipantId,
              player_id: String(fandorin.id),
              display_name: String(fandorin.nickname),
            }
          : result,
      ),
    };

    const nextSlots = game.slots.map((slot: any) =>
      String(slot?.player_id || '') === String(chagin.id)
        ? {
            ...slot,
            participant_id: fandorinParticipantId,
            player_id: String(fandorin.id),
            nickname: String(fandorin.nickname),
          }
        : slot,
    );

    await db.run(
      'UPDATE games SET protocol_text=?, slots_json=? WHERE id=?',
      [JSON.stringify(nextProtocol), JSON.stringify(nextSlots), game.row.id],
    );
    gamesChanged.push(Number(game.row.id));
    gamesToReconcile.add(Number(game.row.id));
    eveningsTouched.add(eveningId);
  }

  if (!gamesChanged.length && !gamesToReconcile.size) {
    throw new Error(`[DATA] No ${TARGET_DATE} games contain Chagin or Fandorin; automatic replacement aborted`);
  }

  for (const gameId of [...gamesToReconcile]) {
    await reconcileClubGameTokenSettlement(db, gameId, { activateIfUntracked: false, context: 'correction' });
  }
  for (const touchedEveningId of [...eveningsTouched]) {
    await reconcileRegularEveningPayments(db, touchedEveningId);
  }
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
        chagin_player_id: chagin.id,
        fandorin_player_id: fandorin.id,
        target_evening_id: eveningId,
        games_changed: gamesChanged,
        evenings_touched: [...eveningsTouched],
      }),
      now,
    ],
  );

  console.log(`[DATA] Replaced Chagin with Fandorin in ${gamesChanged.length} game(s) from ${TARGET_DATE}.`);
  return { applied: gamesChanged.length > 0, gamesChanged, eveningsTouched: [...eveningsTouched] };
}
