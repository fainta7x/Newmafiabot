import { describe, expect, it } from 'vitest';
import { createDatabaseConnection } from '../db/index';
import { loadPlayerEloHistory } from '../server/services/playerEloHistoryService';

const ROLES = ['Дон', 'Мафия', 'Мафия', 'Шериф', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный'];

/** A completed club game; `guestSeat` hands one seat to a guest without a profile (no player_id). */
const seedGame = async (db: ReturnType<typeof createDatabaseConnection>, number: number, guestSeat: boolean, prefix: string) => {
  const now = new Date().toISOString();
  const results: Array<Record<string, unknown>> = [];
  for (let index = 0; index < 10; index += 1) {
    const playerId = `${prefix}-p${index + 1}`;
    await db.run(
      `INSERT OR IGNORE INTO players (id, nickname, contact_status, lifecycle_status, source, elo, tokens, created_at, updated_at)
       VALUES (?, ?, 'normal', 'normal', 'test', 1000, 0, ?, ?)`,
      [playerId, `${prefix} ${index + 1}`, now, now],
    );
    const isGuest = guestSeat && index === 9;
    results.push({
      player_id: isGuest ? null : playerId,
      guest_placeholder_id: isGuest ? 'guest-1' : null,
      participant_id: `${prefix}-part-${index + 1}`,
      seat_number: index + 1,
      role: ROLES[index],
      judge_bonus: 0, protocol_bonus: 0, ci_points: 0, minor_technical_fouls: 0, major_technical_fouls: 0,
    });
  }
  const eveningId = `${prefix}-evening`;
  await db.run(
    `INSERT INTO game_evenings (id, title, starts_at, timezone, format, status, default_price, created_at, updated_at)
     VALUES (?, 'Вечер', ?, 'Europe/Moscow', 'STANDARD', 'active', 0, ?, ?)`,
    [eveningId, now, now, now],
  );
  const protocol = { version: 1, kind: 'club_evening_protocol', protocol: { game_id: String(number), status: 'completed', winner_team: 'red' }, player_results: results };
  await db.run(
    `INSERT INTO games (evening_id, global_game_number, game_date, winner_team, winner_label, protocol_text, slots_json, created_at)
     VALUES (?, ?, ?, 'Красные', 'Победа Красные', ?, '[]', ?)`,
    [eveningId, number, now, JSON.stringify(protocol), now],
  );
};

describe('player Elo history and a guest seat', () => {
  it('withholds a game with a guest seat from Elo instead of failing every profile', async () => {
    const db = createDatabaseConnection(':memory:');
    await seedGame(db, 4, true, 'guest');
    await seedGame(db, 5, false, 'full');
    const events = await loadPlayerEloHistory(db);
    expect(events.filter((event: any) => String(event.player_id || event.playerId || '').startsWith('guest-'))).toHaveLength(0);
    expect(events.length).toBeGreaterThan(0);
  });
});
