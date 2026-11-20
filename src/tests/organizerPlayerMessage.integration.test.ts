import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { savePersonalNotificationPreference } from '../server/services/personalNotificationRouterService.ts';
import { BOT_BOTTOM_KEYBOARD, sendOrganizerPlayerMessage } from '../server/services/organizerPlayerMessageService.ts';

// Owner, 2026-11-20: «проклятье снято» to the novice-evening players, the new bottom keyboard to everyone.
const batch = ['curse', 'lifted', '1'].join('-');
describe('Organizer personal messages', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    for (const id of ['a', 'b']) await db.run("INSERT INTO players(id,nickname,tokens,telegram_user_id,created_at,updated_at) VALUES (?,?,0,?,'x','x')", [id, id.toUpperCase(), `tg-${id}`]);
    await db.run("INSERT INTO players(id,nickname,tokens,created_at,updated_at) VALUES ('n','N',0,'x','x')");
  });
  afterEach(() => { db.sqlite.close(); });

  it('queues once per key and player; the keyboard goes with the message; unlinked players are skipped', async () => {
    const first = await sendOrganizerPlayerMessage(db, { key: batch, text: 'Проклятье снято', player_ids: ['a', 'n', 'zzz'], keyboard: true });
    expect(first.queued).toBe(1);
    expect(first.skipped.map((row) => row.player_id).sort()).toEqual(['n', 'zzz']);
    const again = await sendOrganizerPlayerMessage(db, { key: batch, text: 'Проклятье снято', player_ids: ['a'], keyboard: true });
    expect(again).toMatchObject({ queued: 0, existing: 1 });
    const rows = await db.all<any>("SELECT * FROM telegram_message_outbox WHERE event_type = 'organizer_message'");
    expect(rows).toHaveLength(1);
    expect(String(rows[0].reply_markup_json || '')).toContain('Открыть 2LA Noire');
    expect(BOT_BOTTOM_KEYBOARD.keyboard[0].map((b) => b.text)).toEqual(['🎭 Открыть 2LA Noire', '📋 Меню']);
  });

  it('a keyboard is not sent through VK or to a player with personal messages off: reported as skipped', async () => {
    await savePersonalNotificationPreference(db, 'a', { preferredChannel: 'vk', personalEnabled: true });
    await db.run("INSERT INTO player_external_identities (platform, external_user_id, player_id, linked_at, updated_at) VALUES ('vk','vk-a','a','x','x')");
    await savePersonalNotificationPreference(db, 'b', { preferredChannel: 'auto', personalEnabled: false });
    const result = await sendOrganizerPlayerMessage(db, { key: batch, text: 'Привет', player_ids: ['a', 'b'], keyboard: true });
    expect(result.queued).toBe(0);
    expect(result.skipped).toEqual([{ player_id: 'a', reason: 'keyboard_needs_telegram' }, { player_id: 'b', reason: 'keyboard_needs_telegram' }]);
    expect(await db.all("SELECT 1 FROM telegram_message_outbox WHERE event_type = 'organizer_message'")).toHaveLength(0);
  });

  it('all_linked reaches every Telegram-linked player; the route needs the organizer and valid input', async () => {
    const app = await createApp(db);
    expect((await request(app).post('/api/crm/player-messages').send({ key: 'k-all-1', text: 'x', all_linked: true })).status).toBe(401);
    const token = generateOrganizerToken();
    const ok = await request(app).post('/api/crm/player-messages').set('Authorization', `Bearer ${token}`).send({ key: 'k-all-1', text: 'Привет', all_linked: true, keyboard: true });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.queued).toBe(2);
    const noKey = await request(app).post('/api/crm/player-messages').set('Authorization', `Bearer ${token}`).send({ text: 'Привет', all_linked: true });
    expect(noKey.status).toBe(400);
  });
});
