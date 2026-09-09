import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseWrapper } from '../db/index.ts';
import {
  beginVerifiedPlayerOnboarding,
  consumeVerifiedPlayerOnboarding,
  loadVerifiedPlayerOnboarding,
  resolveVerifiedExternalIdentity,
  validatePlayerOnboardingReturnPath,
} from '../server/services/playerOnboardingService.ts';

const hashToken = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

function makeDb() {
  const sessions = new Map<string, any>();
  const identities = new Map<string, string>();
  const telegram = new Map<string, string>();

  const db = {
    exec: vi.fn(async () => {}),
    all: vi.fn(async () => []),
    get: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM players WHERE telegram_user_id')) {
        const id = telegram.get(String(params[0]));
        return id ? { id } : null;
      }
      if (sql.includes('FROM player_external_identities')) {
        const id = identities.get(`vk:${String(params[0])}`);
        return id ? { player_id: id } : null;
      }
      if (sql.includes('FROM player_onboarding_sessions')) {
        return sessions.get(String(params[0])) || null;
      }
      return null;
    }),
    run: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith('DELETE FROM player_onboarding_sessions')) {
        return { changes: 0, lastID: null };
      }
      if (sql.includes('INSERT INTO player_onboarding_sessions')) {
        const [tokenHash, platform, externalUserId, returnTo, identityJson, createdAt, expiresAt] = params.map(String);
        for (const [key, value] of sessions.entries()) {
          if (value.platform === platform && value.external_user_id === externalUserId) sessions.delete(key);
        }
        sessions.set(tokenHash, {
          token_hash: tokenHash,
          platform,
          external_user_id: externalUserId,
          return_to: returnTo,
          identity_json: identityJson,
          created_at: createdAt,
          expires_at: expiresAt,
          consumed_at: null,
        });
        return { changes: 1, lastID: null };
      }
      if (sql.includes('UPDATE player_onboarding_sessions')) {
        const [consumedAt, tokenHash] = params.map(String);
        const row = sessions.get(tokenHash);
        if (!row || row.consumed_at) return { changes: 0, lastID: null };
        row.consumed_at = consumedAt;
        return { changes: 1, lastID: null };
      }
      return { changes: 1, lastID: null };
    }),
  } as unknown as DatabaseWrapper;

  return { db, sessions, identities, telegram };
}

describe('VK-ACCESS-004 verified onboarding foundation', () => {
  it('keeps only safe /player return paths', () => {
    expect(validatePlayerOnboardingReturnPath('/player/rating?period=current#top')).toBe('/player/rating?period=current#top');
    expect(validatePlayerOnboardingReturnPath('https://evil.example/player')).toBe('/player');
    expect(validatePlayerOnboardingReturnPath('//evil.example/player')).toBe('/player');
    expect(validatePlayerOnboardingReturnPath('/admin')).toBe('/player');
  });

  it('resolves existing Telegram and VK identities without nickname matching', async () => {
    const { db, telegram, identities } = makeDb();
    telegram.set('101', 'player-tg');
    identities.set('vk:202', 'player-vk');

    await expect(resolveVerifiedExternalIdentity(db, { platform: 'telegram', externalUserId: '101' })).resolves.toBe('player-tg');
    await expect(resolveVerifiedExternalIdentity(db, { platform: 'vk', externalUserId: '202' })).resolves.toBe('player-vk');
  });

  it('returns direct linked-player resolution instead of creating onboarding state', async () => {
    const { db, telegram, sessions } = makeDb();
    telegram.set('101', 'player-existing');

    const result = await beginVerifiedPlayerOnboarding(db, {
      platform: 'telegram',
      externalUserId: '101',
      username: 'existing',
    }, '/player/games');

    expect(result).toEqual({ status: 'linked', playerId: 'player-existing', returnTo: '/player/games' });
    expect(sessions.size).toBe(0);
  });

  it('stores only a hash of the one-shot onboarding token', async () => {
    const { db, sessions } = makeDb();
    const result = await beginVerifiedPlayerOnboarding(db, {
      platform: 'vk',
      externalUserId: '202',
      displayName: 'VK User',
    }, '/player/profile');

    expect(result.status).toBe('onboarding');
    if (result.status !== 'onboarding') throw new Error('expected onboarding');
    expect(sessions.has(result.token)).toBe(false);
    expect(sessions.has(hashToken(result.token))).toBe(true);

    const loaded = await loadVerifiedPlayerOnboarding(db, result.token);
    expect(loaded).toMatchObject({ platform: 'vk', externalUserId: '202', returnTo: '/player/profile' });
  });

  it('rotates the pending token for repeated verified starts of the same identity', async () => {
    const { db, sessions } = makeDb();
    const first = await beginVerifiedPlayerOnboarding(db, { platform: 'vk', externalUserId: '202' }, '/player');
    const second = await beginVerifiedPlayerOnboarding(db, { platform: 'vk', externalUserId: '202' }, '/player/rating');
    if (first.status !== 'onboarding' || second.status !== 'onboarding') throw new Error('expected onboarding');

    expect(first.token).not.toBe(second.token);
    expect(sessions.size).toBe(1);
    await expect(loadVerifiedPlayerOnboarding(db, first.token)).resolves.toBeNull();
    await expect(loadVerifiedPlayerOnboarding(db, second.token)).resolves.toMatchObject({ returnTo: '/player/rating' });
  });

  it('consumes onboarding state exactly once', async () => {
    const { db } = makeDb();
    const started = await beginVerifiedPlayerOnboarding(db, { platform: 'telegram', externalUserId: '303' }, '/player');
    if (started.status !== 'onboarding') throw new Error('expected onboarding');

    await expect(consumeVerifiedPlayerOnboarding(db, started.token)).resolves.toBe(true);
    await expect(consumeVerifiedPlayerOnboarding(db, started.token)).resolves.toBe(false);
    await expect(loadVerifiedPlayerOnboarding(db, started.token)).resolves.toBeNull();
  });
});
