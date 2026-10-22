import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensurePlayerBettingSchema } from '../db/ensurePlayerBettingSchema.ts';
import { queueBettingResults } from '../server/services/personalTelegramNotificationService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await ensurePlayerBettingSchema(db);
  const now = new Date().toISOString();
  await db.run("INSERT INTO players (id, nickname, telegram_user_id, created_at, updated_at) VALUES ('p1', 'Игрок', '777', ?, ?)", [now, now]);
  await db.run(
    `INSERT INTO betting_pools (id, game_id, game_number, status, opens_at, closes_at, role_snapshot_json, settlement_seq, created_at, updated_at)
     VALUES ('pool1', 11, 5, 'settled', ?, ?, '{}', 1, ?, ?)`,
    [now, now, now, now],
  );
  await db.run(
    `INSERT INTO betting_bets (id, pool_id, game_id, player_id, team, amount, request_id, status, payout_amount, final_coefficient, placed_at)
     VALUES ('bet1', 'pool1', 11, 'p1', 'red', 100, 'r1', 'won', 180, 1.8, ?)`,
    [now],
  );
  return db;
}

const outboxRow = (db: DatabaseWrapper) => db.get<any>("SELECT message_key, updated_at FROM telegram_message_outbox WHERE message_key = 'bet-result:pool1:bet1:settled:1'");

describe('the minute bet-result scan', () => {
  it('queues a settled bet once, leaves it alone afterwards and heals a lost outbox row', async () => {
    const db = await setup();
    expect(await queueBettingResults(db)).toBe(1);
    const first = await outboxRow(db);
    expect(first?.message_key).toBe('bet-result:pool1:bet1:settled:1');

    // Already routed and in the outbox: nothing to do and no write (the first call's outbox kick settles first).
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    const writesBefore = Number((db.sqlite.prepare('SELECT total_changes() AS n').get() as any).n);
    expect(await queueBettingResults(db)).toBe(0);
    expect(Number((db.sqlite.prepare('SELECT total_changes() AS n').get() as any).n)).toBe(writesBefore);

    // The outbox row was lost after the delivery was recorded: the scan puts it back.
    await db.run("DELETE FROM telegram_message_outbox WHERE message_key = 'bet-result:pool1:bet1:settled:1'");
    expect(await queueBettingResults(db)).toBe(1);
    expect((await outboxRow(db))?.message_key).toBe('bet-result:pool1:bet1:settled:1');

    // A new settlement of the same pool is a new note.
    await db.run("UPDATE betting_pools SET settlement_seq = 2 WHERE id = 'pool1'");
    expect(await queueBettingResults(db)).toBe(1);
  });
});
