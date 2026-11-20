import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { loadBotBlockedPlayers } from '../server/services/botBlockedService';
import { telephonePlayers } from '../server/services/drawingTelephoneService';
import { ensureTelegramDirectMessageSchema } from '../db/ensureTelegramDirectMessageSchema';
import { ensureEveningAnnouncementTrackingSchema } from '../server/services/eveningAnnouncementTrackingService';

// «Бот заблокирован» (owner, 2026-11-16): who blocked the club bot, from Telegram's «bot was blocked by the user» answers.
describe('players who blocked the bot', () => {
  let db: DatabaseWrapper;
  afterEach(() => { try { db.sqlite.close(); } catch {} });
  it('counts a block until a later message reaches the player again; both delivery journals count', async () => {
    db = createDatabaseConnection(':memory:'); await createApp(db);
    await ensureTelegramDirectMessageSchema(db); await ensureEveningAnnouncementTrackingSchema(db);
    for (const id of ['a', 'b', 'c', 'd']) await db.run('INSERT INTO players (id,nickname,telegram_user_id,telegram_username,created_at,updated_at) VALUES (?,?,?,?,?,?)', [id, id.toUpperCase(), `tg-${id}`, `@user_${id}`, 'x', 'x']);
    const outbox = (key: string, player: string, status: string, error: string | null, at: string) => db.run(
      `INSERT INTO telegram_message_outbox (message_key, category, event_type, player_id, chat_id, text, status, last_error, last_attempt_at, sent_at, created_at, updated_at) VALUES (?,'personal','test',?,?,?,?,?,?,?,?,?)`,
      [key, player, `tg-${player}`, 'текст', status, error, at, status === 'sent' ? at : null, at, at]);
    const BLOCK = 'Telegram server says - Forbidden: bot was blocked by the user';
    await outbox('m1', 'a', 'failed', BLOCK, '2026-11-10T10:00:00Z');                 // a: blocked
    await outbox('m2', 'b', 'failed', BLOCK, '2026-11-10T10:00:00Z');
    await outbox('m3', 'b', 'sent', null, '2026-11-12T10:00:00Z');                    // b: unblocked later
    await outbox('m4', 'c', 'failed', 'Too Many Requests', '2026-11-10T10:00:00Z');   // c: another error
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES ('e','В','2026-11-20T18:00:00Z','Europe/Moscow','CASUAL','published',20,100,'x','x')`);
    await db.run(`INSERT INTO evening_announcement_dm_tracking (evening_id, player_id, telegram_user_id, delivery_status, last_attempt_at, last_error, reminder_count, created_at, updated_at) VALUES ('e','d','tg-d','failed','2026-11-15T10:00:00Z',?,0,'x','x')`, [BLOCK]); // d: from the invitation journal
    const blocked = await loadBotBlockedPlayers(db);
    expect([...blocked.keys()].sort()).toEqual(['a', 'd']);
    const list = await telephonePlayers(db);
    // Who blocked the bot is not in the «Испорченный телефон» lists (owner, 2026-11-18).
    expect(list.find((p) => p.id === 'a')).toBeUndefined();
    expect(list.find((p) => p.id === 'd')).toBeUndefined();
    expect(list.find((p) => p.id === 'b')).toMatchObject({ bot_blocked: false });
  });
});
