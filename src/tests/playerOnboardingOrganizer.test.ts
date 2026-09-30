import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import {
  beginVerifiedPlayerOnboarding,
  completeVerifiedNewPlayerOnboarding,
  requestExistingPlayerOnboardingLink,
} from '../server/services/playerOnboardingService.ts';
import {
  listPendingPlayerOnboardingLinks,
  resolvePendingPlayerOnboardingLink,
} from '../server/services/playerOnboardingOrganizerService.ts';
import { registerNewPlayer } from '../server/services/playerRegistrationService.ts';

const opened: DatabaseWrapper[] = [];
const makeDb = () => {
  const db = createDatabaseConnection(':memory:');
  opened.push(db);
  return db;
};

// A profile the organizer made has no Telegram or VK yet; only such a profile goes to the organizer for review.
const organizerMadeProfile = async (db: DatabaseWrapper, telegramUserId: string, nickname: string) => {
  const created = await registerNewPlayer(db, { telegramUserId, nickname });
  await db.run('UPDATE players SET telegram_user_id = NULL WHERE id = ?', [created.player.id]);
  return created;
};

afterEach(() => {
  while (opened.length) {
    try { opened.pop()?.sqlite.close(); } catch {}
  }
});

describe('VK-ACCESS-004 organizer visibility', () => {
  it('emits one factual organizer task to classify a genuinely new verified player', async () => {
    const db = makeDb();
    const started = await beginVerifiedPlayerOnboarding(db, {
      platform: 'telegram', externalUserId: '501', displayName: 'Новый участник',
    }, '/player');
    if (started.status !== 'onboarding') throw new Error('expected onboarding');

    const first = await completeVerifiedNewPlayerOnboarding(db, started.token, 'Организатор видит');
    const retry = await completeVerifiedNewPlayerOnboarding(db, started.token, 'Организатор видит');
    expect(retry.playerId).toBe(first.playerId);

    const tasks = await db.all<any>(
      `SELECT title, description, automation_key FROM organizer_tasks WHERE automation_key=?`,
      [`verified-onboarding:new-player:${first.playerId}`],
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Определить игровой уровень: Организатор видит');
    expect(tasks[0].description).toContain('Telegram');
    expect(tasks[0].description).not.toContain('501');
  });

  it('lists a pending link without exposing raw external identity and approves it idempotently', async () => {
    const db = makeDb();
    const existing = await organizerMadeProfile(db, '900', 'Старый профиль');
    const started = await beginVerifiedPlayerOnboarding(db, { platform: 'vk', externalUserId: '777' }, '/player/games');
    if (started.status !== 'onboarding') throw new Error('expected onboarding');

    const pending = await requestExistingPlayerOnboardingLink(db, started.token, 'Старый профиль');
    expect(pending.status).toBe('pending_organizer');
    if (pending.status !== 'pending_organizer') throw new Error('expected organizer review');

    const rows = await listPendingPlayerOnboardingLinks(db);
    expect(rows).toEqual([
      expect.objectContaining({
        id: pending.requestId,
        platform: 'vk',
        target_player_id: existing.player.id,
        nickname: 'Старый профиль',
      }),
    ]);
    expect(rows[0]).not.toHaveProperty('external_user_id');

    const approved = await resolvePendingPlayerOnboardingLink(db, pending.requestId, 'approve');
    const retry = await resolvePendingPlayerOnboardingLink(db, pending.requestId, 'approve');
    expect(approved).toMatchObject({ status: 'approved', playerId: existing.player.id, changed: true });
    expect(retry).toMatchObject({ status: 'approved', playerId: existing.player.id, changed: false });

    const linked = await db.get<any>(
      `SELECT player_id FROM player_external_identities WHERE platform='vk' AND external_user_id='777'`,
    );
    expect(linked?.player_id).toBe(existing.player.id);
    expect(await listPendingPlayerOnboardingLinks(db)).toHaveLength(0);
  });

  it('rejects organizer approval when the verified identity or target profile conflicts', async () => {
    const db = makeDb();
    const existing = await organizerMadeProfile(db, '901', 'Профиль с Telegram');
    const started = await beginVerifiedPlayerOnboarding(db, { platform: 'telegram', externalUserId: '902' }, '/player');
    if (started.status !== 'onboarding') throw new Error('expected onboarding');

    const pending = await requestExistingPlayerOnboardingLink(db, started.token, 'Профиль с Telegram');
    if (pending.status !== 'pending_organizer') throw new Error('expected organizer review');
    // Before the organizer decides, the profile gets its own Telegram.
    await db.run("UPDATE players SET telegram_user_id = '901' WHERE id = ?", [existing.player.id]);

    await expect(resolvePendingPlayerOnboardingLink(db, pending.requestId, 'approve')).rejects.toMatchObject({
      code: 'target_telegram_conflict',
      statusCode: 409,
    });
    const request = await db.get<any>('SELECT status FROM player_onboarding_link_requests WHERE id=?', [pending.requestId]);
    expect(request?.status).toBe('pending');
    expect(await db.get<any>('SELECT id FROM players WHERE telegram_user_id=?', ['902'])).toBeNull();
    expect((await db.get<any>('SELECT telegram_user_id FROM players WHERE id = ?', [existing.player.id])).telegram_user_id).toBe('901');
  });

  it('lets the organizer reject a pending link without linking the identity', async () => {
    const db = makeDb();
    const existing = await organizerMadeProfile(db, '903', 'Не связывать');
    const started = await beginVerifiedPlayerOnboarding(db, { platform: 'vk', externalUserId: '904' }, '/player/profile');
    if (started.status !== 'onboarding') throw new Error('expected onboarding');
    const pending = await requestExistingPlayerOnboardingLink(db, started.token, 'Не связывать');
    if (pending.status !== 'pending_organizer') throw new Error('expected organizer review');

    const rejected = await resolvePendingPlayerOnboardingLink(db, pending.requestId, 'reject');
    expect(rejected).toMatchObject({ status: 'rejected', playerId: existing.player.id, changed: true });
    expect(await db.get<any>(
      `SELECT player_id FROM player_external_identities WHERE platform='vk' AND external_user_id='904'`,
    )).toBeNull();
  });
});
