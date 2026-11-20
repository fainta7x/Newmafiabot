import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { recordInitialAnnouncementAttempt } from '../server/services/eveningAnnouncementTrackingService.ts';
import { enqueueTelegramMessage } from '../server/services/telegramMessageOutboxService.ts';
import { stopBotBlockedPlayers, runAutoPlayerActivity } from '../server/services/playerActivityAutoService.ts';
import { eveningCurses, markIgnoredInvitations } from '../server/services/playerCurseService.ts';
import { STOPPED_REASON } from '../lib/playerAccess.ts';

// Owner, 2026-11-20: a player who blocked the bot is not cursed and is «Перестал ходить» («пусть идут своей дорогой»).
describe('Players who blocked the bot', () => {
  let db: DatabaseWrapper;
  const now = new Date('2026-11-20T08:00:00Z');
  const block = async (playerId: string) => {
    await enqueueTelegramMessage(db, { messageKey: `blk-${playerId}`, category: 'personal', eventType: 'test', playerId, chatId: `tg-${playerId}`, text: 'x' });
    await db.run("UPDATE telegram_message_outbox SET status = 'failed', last_error = 'Forbidden: bot was blocked by the user', last_attempt_at = ?, next_attempt_at = NULL WHERE message_key = ?", ['2099-01-01T00:00:00Z', `blk-${playerId}`]);
  };
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    for (const id of ['a', 'b', 'c', 'o']) await db.run("INSERT INTO players(id,nickname,tokens,telegram_user_id,created_at,updated_at) VALUES (?,?,0,?,'x','x')", [id, id.toUpperCase(), `tg-${id}`]);
    await db.run("UPDATE players SET from_other_city = 1 WHERE id = 'o'");
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES ('e1','Вечер','2026-11-20T16:00:00Z','Europe/Moscow','CASUAL','published',20,0,'x','x')`);
  });
  afterEach(() => { db.sqlite.close(); });

  it('«Перестал ходить» at once, not for «Из другого города», not twice', async () => {
    await block('c');
    await block('o');
    const changes = await stopBotBlockedPlayers(db, now, true);
    expect(changes.map((row) => row.id)).toEqual(['c']);
    const row = await db.get<any>("SELECT stopped_attending, contact_status, pause_reason FROM players WHERE id = 'c'");
    expect(row).toMatchObject({ stopped_attending: 1, contact_status: 'paused', pause_reason: STOPPED_REASON });
    expect((await db.get<any>("SELECT stopped_attending FROM players WHERE id = 'o'")).stopped_attending).toBe(0);
    expect(await stopBotBlockedPlayers(db, now, true)).toEqual([]);
    // The daily automatic status does not bring him back while the bot is blocked.
    await db.run("DELETE FROM app_data_migrations WHERE id LIKE 'player-activity-auto:%'").catch(() => null);
    await runAutoPlayerActivity(db, new Date('2026-11-21T08:00:00Z'));
    expect((await db.get<any>("SELECT stopped_attending FROM players WHERE id = 'c'")).stopped_attending).toBe(1);
  });

  it('is not cursed for a silent invitation', async () => {
    for (const id of ['a', 'c']) await recordInitialAnnouncementAttempt(db, { eveningId: 'e1', playerId: id, telegramUserId: `tg-${id}`, success: true, telegramMessageId: 1 });
    await block('c');
    expect(await markIgnoredInvitations(db, 'e1', now)).toEqual(['a']);
    expect((await eveningCurses(db, 'e1', now)).map((row) => row.player_id)).toEqual(['a']);
  });
});
