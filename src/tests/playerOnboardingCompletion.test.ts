import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import {
  beginVerifiedPlayerOnboarding,
  completeVerifiedNewPlayerOnboarding,
  requestExistingPlayerOnboardingLink,
} from '../server/services/playerOnboardingService.ts';
import { registerNewPlayer } from '../server/services/playerRegistrationService.ts';

const opened: DatabaseWrapper[] = [];
const makeDb = () => {
  const db = createDatabaseConnection(':memory:');
  opened.push(db);
  return db;
};

afterEach(() => {
  vi.unstubAllGlobals();
  while (opened.length) {
    try { opened.pop()?.sqlite.close(); } catch {}
  }
});

describe('VK-ACCESS-004 onboarding completion', () => {
  it('creates one Telegram player only after verified identity and is idempotent on retry', async () => {
    const db = makeDb();
    const started = await beginVerifiedPlayerOnboarding(db, {
      platform: 'telegram', externalUserId: '101', username: 'new_tg', displayName: 'Новый игрок',
    }, '/player/rating');
    expect(started.status).toBe('onboarding');
    if (started.status !== 'onboarding') throw new Error('expected onboarding');

    const first = await completeVerifiedNewPlayerOnboarding(db, started.token, 'Новичок');
    const retry = await completeVerifiedNewPlayerOnboarding(db, started.token, 'Новичок');
    expect(first).toMatchObject({ status: 'created', created: true, returnTo: '/player/rating' });
    expect(retry).toMatchObject({ status: 'linked', created: false, playerId: first.playerId });

    const rows = await db.all<any>('SELECT id, telegram_user_id, nickname FROM players WHERE nickname=?', ['Новичок']);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].telegram_user_id)).toBe('101');
  });

  it('creates one VK-only canonical player and attaches the verified VK identity', async () => {
    const db = makeDb();
    const started = await beginVerifiedPlayerOnboarding(db, {
      platform: 'vk', externalUserId: '202', username: 'vk_user', displayName: 'VK User',
    }, '/player/profile');
    if (started.status !== 'onboarding') throw new Error('expected onboarding');

    const result = await completeVerifiedNewPlayerOnboarding(db, started.token, 'VK Новичок');
    expect(result.status).toBe('created');
    const player = await db.get<any>('SELECT telegram_user_id, nickname FROM players WHERE id=?', [result.playerId]);
    const identity = await db.get<any>(`SELECT player_id FROM player_external_identities WHERE platform='vk' AND external_user_id=?`, ['202']);
    expect(player?.telegram_user_id).toBeNull();
    expect(player?.nickname).toBe('VK Новичок');
    expect(identity?.player_id).toBe(result.playerId);
  });

  it('rejects a nickname collision without creating another player', async () => {
    const db = makeDb();
    await registerNewPlayer(db, { telegramUserId: '999', nickname: 'Чагин' });
    const started = await beginVerifiedPlayerOnboarding(db, { platform: 'telegram', externalUserId: '303' }, '/player');
    if (started.status !== 'onboarding') throw new Error('expected onboarding');

    await expect(completeVerifiedNewPlayerOnboarding(db, started.token, 'Чагин')).rejects.toMatchObject({ code: 'nickname_taken' });
    const rows = await db.all<any>('SELECT id FROM players WHERE nickname=?', ['Чагин']);
    expect(rows).toHaveLength(1);
  });

  it('creates one organizer-reviewable link request for an existing nickname and never auto-merges', async () => {
    const db = makeDb();
    const existing = await registerNewPlayer(db, { telegramUserId: '999', nickname: 'Старый игрок' });
    const started = await beginVerifiedPlayerOnboarding(db, { platform: 'telegram', externalUserId: '303' }, '/player/games');
    if (started.status !== 'onboarding') throw new Error('expected onboarding');

    const first = await requestExistingPlayerOnboardingLink(db, started.token, 'Старый игрок');
    const retry = await requestExistingPlayerOnboardingLink(db, started.token, 'Старый игрок');
    expect(first).toMatchObject({ status: 'pending_organizer', targetPlayerId: existing.player.id, returnTo: '/player/games' });
    expect(retry).toMatchObject({ status: 'pending_organizer', requestId: first.requestId });

    expect(await db.get<any>('SELECT id FROM players WHERE telegram_user_id=?', ['303'])).toBeNull();
    const requests = await db.all<any>(`SELECT * FROM player_onboarding_link_requests WHERE platform='telegram' AND external_user_id='303'`);
    expect(requests).toHaveLength(1);
    expect(requests[0].target_player_id).toBe(existing.player.id);
    expect(requests[0].status).toBe('pending');
  });

  it('uses the existing private Telegram confirmation for a VK identity when the old profile has Telegram', async () => {
    const db = makeDb();
    const existing = await registerNewPlayer(db, { telegramUserId: '999', nickname: 'Ветеран' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })) as any);
    const started = await beginVerifiedPlayerOnboarding(db, { platform: 'vk', externalUserId: '404' }, '/player/profile');
    if (started.status !== 'onboarding') throw new Error('expected onboarding');

    const result = await requestExistingPlayerOnboardingLink(db, started.token, 'Ветеран', { baseUrl: 'https://club.example' });
    expect(result).toMatchObject({ status: 'private_confirmation', playerId: existing.player.id, returnTo: '/player/profile' });
    expect(await db.get<any>(`SELECT player_id FROM player_external_identities WHERE platform='vk' AND external_user_id='404'`)).toBeNull();
    const claim = await db.get<any>('SELECT player_id FROM vk_player_identity_claims WHERE player_id=?', [existing.player.id]);
    expect(claim?.player_id).toBe(existing.player.id);
  });
});
