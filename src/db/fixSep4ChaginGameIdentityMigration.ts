import crypto from 'crypto';
import type { DatabaseWrapper } from './index.ts';
import { replaceClubGameSeatIdentity } from '../server/services/clubGameSeatIdentityRepair.ts';
import { reconcileClubGameTokenSettlement } from '../server/services/clubGameTokenSettlementService.ts';
import { runClubGamePostSaveTasks } from '../server/services/clubGamePostSaveService.ts';

const MIGRATION_KEY = '0016_fix_sep4_chagin_game_identity_v2_confirmed';
const TARGET_DATE = '2026-09-04';
const aliases = (value: unknown) => String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
const parse = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) as T; } catch { return fallback; } };
const moscowDate = (value: unknown) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(String(value || '')));

const uniquePlayer = async (db: DatabaseWrapper, names: string[], label: string) => {
  const matches = (await db.all<any>('SELECT id,nickname FROM players ORDER BY id'))
    .filter((player) => names.includes(aliases(player.nickname)));
  if (matches.length !== 1) throw new Error(`[DATA] ${label}: expected one player, found ${matches.length}`);
  return matches[0];
};

const ensureParticipant = async (db: DatabaseWrapper, eveningId: string, playerId: string) => {
  const existing = await db.get<any>('SELECT id FROM evening_participants WHERE evening_id=? AND player_id=? LIMIT 1', [eveningId, playerId]);
  if (existing?.id) return String(existing.id);
  const evening = await db.get<any>('SELECT default_price FROM game_evenings WHERE id=?', [eveningId]);
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const due = Number(evening?.default_price || 0);
  await db.run(
    `INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,registered_at,checked_in_at,created_at,updated_at)
     VALUES (?,?,?,'unanswered','unanswered','attended','unknown',?,?,0,?,?,?,?)`,
    [id, eveningId, playerId, due ? 'unpaid' : 'waived', due, now, now, now, now],
  );
  return id;
};

export async function applySep4ChaginGameIdentityMigration(db: DatabaseWrapper) {
  const history = await db.get<any>('SELECT status FROM migration_history WHERE migration_name=? LIMIT 1', [MIGRATION_KEY]);
  if (history?.status === 'completed') return { applied: false, gamesChanged: [] as number[] };

  const chagin = await uniquePlayer(db, ['чагин', 'chagin'], 'Chagin');
  const fandorin = await uniquePlayer(db, ['фандорин', 'fandorin'], 'Fandorin');
  const evenings = (await db.all<any>('SELECT id,starts_at FROM game_evenings ORDER BY starts_at'))
    .filter((evening) => moscowDate(evening.starts_at) === TARGET_DATE);
  const candidates: any[] = [];
  for (const evening of evenings) {
    const rows = await db.all<any>('SELECT id,global_game_number,protocol_text,slots_json FROM games WHERE evening_id=? AND archived_at IS NULL ORDER BY global_game_number,id', [evening.id]);
    const games = rows.map((row) => ({ ...row, envelope: parse<any>(row.protocol_text, null), slots: parse<any[]>(row.slots_json, []) }));
    const chaginSeats = (game: any) => (game.envelope?.player_results || []).filter((result: any) => String(result.player_id || '') === String(chagin.id));
    if (games.length >= 3 && chaginSeats(games[1]).length === 1 && games.slice(2).some((game) => chaginSeats(game).length === 1)) candidates.push({ evening, games, chaginSeats });
  }
  if (candidates.length !== 1) throw new Error(`[DATA] Expected one exact ${TARGET_DATE} evening shape, found ${candidates.length}`);
  const target = candidates[0];

  const affected = [target.games[1], ...target.games.slice(2).filter((game: any) => target.chaginSeats(game).length)];
  for (const game of affected) {
    const seats = target.chaginSeats(game);
    if (seats.length !== 1) throw new Error(`[DATA] Game ${game.id}: expected one Chagin seat`);
    if (game !== target.games[1] && (game.envelope.player_results || []).some((result: any) => String(result.player_id || '') === String(fandorin.id))) {
      throw new Error(`[DATA] Game ${game.id} already contains Fandorin`);
    }
  }

  const result = await db.transaction(async (tx) => {
    const now = new Date().toISOString();
    const guest = { id: crypto.randomUUID(), nickname: 'Гость' };
    await tx.run("INSERT INTO players (id,nickname,lifecycle_status,source,created_at,updated_at) VALUES (?,?,'normal','quick_guest',?,?)", [guest.id, guest.nickname, now, now]);
    const eveningId = String(target.evening.id);
    const guestParticipantId = await ensureParticipant(tx, eveningId, guest.id);
    const fandorinParticipantId = await ensureParticipant(tx, eveningId, String(fandorin.id));
    const changed: number[] = [];
    for (const game of affected) {
      const seat = Number(target.chaginSeats(game)[0].seat_number);
      const replacement = game === target.games[1]
        ? { participantId: guestParticipantId, playerId: guest.id, nickname: guest.nickname }
        : { participantId: fandorinParticipantId, playerId: String(fandorin.id), nickname: String(fandorin.nickname) };
      const repaired = replaceClubGameSeatIdentity(game.envelope, game.slots, seat, replacement);
      await tx.run('UPDATE games SET protocol_text=?,slots_json=? WHERE id=?', [JSON.stringify(repaired.envelope), JSON.stringify(repaired.slots), game.id]);
      await reconcileClubGameTokenSettlement(tx, Number(game.id), { activateIfUntracked: false, context: 'correction' });
      changed.push(Number(game.id));
    }
    await tx.run("INSERT INTO migration_history (id,migration_name,status,details_json,executed_at) VALUES (?,?,'completed',?,?)", [MIGRATION_KEY, MIGRATION_KEY, JSON.stringify({ evening_id: eveningId, games_changed: changed, second_game_guest_id: guest.id, fandorin_id: fandorin.id }), now]);
    return { changed, eveningId, guestId: guest.id };
  });

  await runClubGamePostSaveTasks(db, { gameId: result.changed[result.changed.length - 1], eveningId: result.eveningId, previousStatus: 'completed', status: 'completed', playerIds: [String(chagin.id), String(fandorin.id), result.guestId] });
  console.log(`[DATA] Corrected ${result.changed.length} game identities for ${TARGET_DATE}.`);
  return { applied: true, gamesChanged: result.changed };
}
