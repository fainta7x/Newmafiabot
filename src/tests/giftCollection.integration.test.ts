import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureVkIntegrationSchema } from '../db/ensureVkIntegrationSchema.ts';
import { ensureJudgeAuthoritySchema } from '../db/ensureJudgeAuthoritySchema.ts';
import {
  GiftCollectionError, loadGiftCollectionForOrganizer, loadPlayerGiftContributions, openGiftCollection, organizerSetContribution, previewGiftCollection, setPlayerGiftChoice,
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
});
