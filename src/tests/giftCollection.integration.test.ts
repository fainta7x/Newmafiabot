import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureVkIntegrationSchema } from '../db/ensureVkIntegrationSchema.ts';
import { ensureJudgeAuthoritySchema } from '../db/ensureJudgeAuthoritySchema.ts';
import { ensurePlayerProfileIntegritySchema } from '../db/ensurePlayerProfileIntegritySchema.ts';
import {
  GiftCollectionError, runGiftCollectionPrompts, loadGiftCollectionForOrganizer, loadPlayerGiftContributions, openGiftCollection, organizerSetContribution, previewGiftCollection, setPlayerGiftChoice,
} from '../server/services/giftCollectionService.ts';

describe('birthday gift collection', () => {
  let db: DatabaseWrapper;
  const tokens = async (id: string) => Number((await db.get<{ tokens: number }>('SELECT tokens FROM players WHERE id = ?', [id]))?.tokens);
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await ensureJudgeAuthoritySchema(db);
    await db.run(`INSERT INTO players(id,nickname,telegram_user_id,tokens,from_other_city,stopped_attending,created_at,updated_at) VALUES
      ('hon','Дина','1',0,0,0,'2026-10-01','2026-10-01'),
      ('tg','Аня','2',0,0,0,'2026-10-01','2026-10-01'),
      ('vk','Вова',NULL,0,0,0,'2026-10-01','2026-10-01'),
      ('none','Нина',NULL,0,0,0,'2026-10-01','2026-10-01'),
      ('far','Дальний','3',0,1,0,'2026-10-01','2026-10-01'),
      ('gone','Ушёл','4',0,0,1,'2026-10-01','2026-10-01')`);
    await ensureVkIntegrationSchema(db);
    await db.run("INSERT INTO player_external_identities(platform,external_user_id,player_id,linked_at,updated_at) VALUES ('vk','777','vk','2026-10-01','2026-10-01')");
  });
  afterEach(() => db.sqlite.close());

  it('invites everyone except the birthday person, other-city and stopped players; routes by channel', async () => {
    const preview = await previewGiftCollection(db, 'hon');
    expect(preview.recipients.map((r) => [r.id, r.channel]).sort()).toEqual([['none', 'none'], ['tg', 'telegram'], ['vk', 'vk_manual']]);
    const result = await openGiftCollection(db, { honoreeId: 'hon', organizerId: 'org' });
    expect(result).toMatchObject({ invited: 3, telegram: 1, vk_manual: 1, none: 1 });
    expect((await db.get<any>("SELECT COUNT(*) n FROM telegram_message_outbox WHERE event_type='gift_collection_invite'")).n).toBe(1);
    const tasks = await db.all<any>("SELECT title FROM organizer_tasks WHERE automation_key LIKE 'gift-collection:%' ORDER BY title");
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.title).join('|')).toContain('Нет канала связи');
    await expect(openGiftCollection(db, { honoreeId: 'hon', organizerId: 'org' })).rejects.toMatchObject({ code: 'already_open' });
  });

  it('lets a player pick, change and decline until paid; then only the organizer edits', async () => {
    const { id } = await openGiftCollection(db, { honoreeId: 'hon', organizerId: 'org' });
    await expect(setPlayerGiftChoice(db, id, 'tg', { amount: 99 })).rejects.toBeInstanceOf(GiftCollectionError);
    expect(await setPlayerGiftChoice(db, id, 'tg', { amount: 300 })).toMatchObject({ status: 'pledged', amount: 300 });
    expect((await loadPlayerGiftContributions(db, 'tg')).items[0]).toMatchObject({ owed: 300, honoree_nickname: 'Дина' });
    expect(await setPlayerGiftChoice(db, id, 'tg', { amount: 150 })).toMatchObject({ amount: 150 });
    await organizerSetContribution(db, id, 'tg', 'org', { status: 'paid' });
    await expect(setPlayerGiftChoice(db, id, 'tg', { amount: 500 })).rejects.toMatchObject({ code: 'already_paid' });
    await expect(setPlayerGiftChoice(db, id, 'tg', { decline: true })).rejects.toMatchObject({ code: 'already_paid' });
    expect((await loadPlayerGiftContributions(db, 'tg')).items[0].owed).toBe(0);
  });

  it('credits 1 token per ruble once, follows corrections and reverses on un-pay', async () => {
    const { id } = await openGiftCollection(db, { honoreeId: 'hon', organizerId: 'org' });
    await setPlayerGiftChoice(db, id, 'tg', { amount: 200 });
    await organizerSetContribution(db, id, 'tg', 'org', { status: 'paid' });
    await organizerSetContribution(db, id, 'tg', 'org', { status: 'paid' });
    expect(await tokens('tg')).toBe(200);
    await organizerSetContribution(db, id, 'tg', 'org', { status: 'paid', paid_amount: 500 });
    expect(await tokens('tg')).toBe(500);
    await organizerSetContribution(db, id, 'tg', 'org', { status: 'unpaid' });
    expect(await tokens('tg')).toBe(0);
    const view = await loadGiftCollectionForOrganizer(db, id);
    expect(view.totals).toEqual({ pledged: 200, paid: 0 });
  });

  it('organizer records a VK pledge by hand and closes the task when paid', async () => {
    const { id } = await openGiftCollection(db, { honoreeId: 'hon', organizerId: 'org' });
    await organizerSetContribution(db, id, 'vk', 'org', { pledged_amount: 400 });
    await organizerSetContribution(db, id, 'vk', 'org', { status: 'paid' });
    expect((await db.get<any>("SELECT status FROM organizer_tasks WHERE player_id='vk' AND automation_key LIKE 'gift-collection:%'")).status).toBe('done');
    expect(await tokens('vk')).toBe(400);
  });

  describe('start prompt and reminder for the organizer', () => {
    const now = Date.parse('2026-11-01T09:30:00+03:00');
    beforeEach(async () => {
      process.env.ORGANIZER_NOTIFICATION_IDS = '555';
      await ensurePlayerProfileIntegritySchema(db);
      await db.run("UPDATE players SET birth_day=3, birth_month=11, birthday_visibility='full' WHERE id='tg'");
      await db.run("UPDATE players SET birth_day=3, birth_month=11, birthday_visibility='private' WHERE id='vk'");
      await db.run("UPDATE players SET birth_day=3, birth_month=11, birthday_visibility='full' WHERE id='far'");
      await db.run("UPDATE players SET birth_day=20, birth_month=11, birthday_visibility='full' WHERE id='none'");
    });

    it('two days before a birthday: one task and one Telegram message, only for visible, in-scope players, never twice', async () => {
      expect(await runGiftCollectionPrompts(db, now)).toBe(1);
      expect(await runGiftCollectionPrompts(db, now + 3_600_000)).toBe(0);
      const tasks = await db.all<any>("SELECT title, automation_key FROM organizer_tasks WHERE automation_key LIKE 'gift-start:%'");
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toContain('Аня');
      expect((await db.get<any>("SELECT COUNT(*) n FROM telegram_message_outbox WHERE event_type='gift_collection_start'")).n).toBe(1);
    });

    it('does not prompt again when a collection for that player already exists', async () => {
      await openGiftCollection(db, { honoreeId: 'tg', organizerId: 'org' });
      await runGiftCollectionPrompts(db, now);
      expect((await db.get<any>("SELECT COUNT(*) n FROM organizer_tasks WHERE automation_key LIKE 'gift-start:%'")).n).toBe(0);
    });

    it('sends one reminder listing non-responders 48h after opening, and none to players', async () => {
      const { id } = await openGiftCollection(db, { honoreeId: 'hon', organizerId: 'org' });
      await db.run('UPDATE gift_collections SET created_at = ? WHERE id = ?', [new Date(now - 49 * 3_600_000).toISOString(), id]);
      await setPlayerGiftChoice(db, id, 'tg', { amount: 100 });
      const playerMessages = async () => (await db.get<any>("SELECT COUNT(*) n FROM telegram_message_outbox WHERE category='personal'")).n;
      const before = await playerMessages();
      await runGiftCollectionPrompts(db, now);
      await runGiftCollectionPrompts(db, now + 86_400_000);
      const reminders = await db.all<any>("SELECT text FROM telegram_message_outbox WHERE event_type='gift_collection_reminder'");
      expect(reminders).toHaveLength(1);
      expect(reminders[0].text).toContain('не ответили 2');
      expect(await playerMessages()).toBe(before);
      const view = await loadGiftCollectionForOrganizer(db, id);
      expect(view.contributions.find((c: any) => c.player_id === 'vk').contact_url).toBe('https://vk.com/id777');
    });
  });
});

