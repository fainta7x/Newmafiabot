import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseWrapper } from '../db/index.ts';
import { getPlayerSessionId } from '../server/auth.ts';
import { setPlayerSessionCookie } from '../server/services/playerSessionCookie.ts';
import {
  completeVkPlayerOAuth,
  createVkPlayerOAuthStart,
  validateVkPlayerReturnPath,
} from '../server/services/vkPlayerAuthService.ts';

type StateRow = {
  state: string;
  verifier: string;
  redirect_uri: string;
  nickname: string;
  return_to: string;
  created_at: string;
  expires_at: string;
};

function makeDb(linkedPlayerId: string | null = null) {
  const states = new Map<string, StateRow>();
  const db = {
    exec: vi.fn(async () => {}),
    run: vi.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes('INSERT INTO vk_player_oauth_states')) {
        const [state, verifier, redirectUri, nickname, returnTo, createdAt, expiresAt] = params;
        states.set(String(state), {
          state: String(state), verifier: String(verifier), redirect_uri: String(redirectUri),
          nickname: String(nickname), return_to: String(returnTo), created_at: String(createdAt), expires_at: String(expiresAt),
        });
      } else if (sql.includes('DELETE FROM vk_player_oauth_states WHERE state=?')) {
        states.delete(String(params[0]));
      } else if (sql.includes('DELETE FROM vk_player_oauth_states WHERE expires_at')) {
        const now = String(params[0]);
        for (const [key, row] of states) if (row.expires_at <= now) states.delete(key);
      }
      return { lastID: null, changes: 1 };
    }),
    get: vi.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM vk_player_oauth_states')) return states.get(String(params[0])) || null;
      if (sql.includes('FROM player_external_identities')) {
        return linkedPlayerId ? { player_id: linkedPlayerId } : null;
      }
      return null;
    }),
    all: vi.fn(async () => []),
    transaction: vi.fn(),
    sqlite: {} as any,
    drizzle: {} as any,
    dbPath: ':memory:',
  } as unknown as DatabaseWrapper;
  return { db, states };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('VK canonical player authentication', () => {
  it('accepts only local player-cabinet return paths', () => {
    expect(validateVkPlayerReturnPath('/player')).toBe('/player');
    expect(validateVkPlayerReturnPath('/player/profile?tab=games#top')).toBe('/player/profile?tab=games#top');
    expect(validateVkPlayerReturnPath('//evil.example/player')).toBe('/player');
    expect(validateVkPlayerReturnPath('https://evil.example/player')).toBe('/player');
    expect(validateVkPlayerReturnPath('/admin')).toBe('/player');
  });

  it('resolves an existing VK identity to the canonical player and consumes OAuth state once', async () => {
    vi.stubEnv('VK_APP_ID', '123456');
    const { db, states } = makeDb('player-existing');
    const start = await createVkPlayerOAuthStart(db, {
      redirectUri: 'https://club.example/api/integrations/vk/oauth/callback',
      nickname: 'Dendi',
      returnTo: '/player/profile?tab=games',
    });
    const authorize = new URL(start.authorize_url);
    const state = authorize.searchParams.get('state') || '';
    expect(states.has(state)).toBe(true);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      access_token: 'secret-not-logged', user_id: 777, state,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const result = await completeVkPlayerOAuth(db, { code: 'code', deviceId: 'device', state });
    expect(result).toMatchObject({
      vkUserId: '777', playerId: 'player-existing', nickname: 'Dendi', returnTo: '/player/profile?tab=games',
    });
    expect(states.has(state)).toBe(false);
    await expect(completeVkPlayerOAuth(db, { code: 'code', deviceId: 'device', state }))
      .rejects.toMatchObject({ code: 'vk_state_expired' });
  });

  it('returns no canonical player for a new VK identity so the existing registration service can create it exactly once', async () => {
    vi.stubEnv('VK_APP_ID', '123456');
    const { db } = makeDb(null);
    const start = await createVkPlayerOAuthStart(db, {
      redirectUri: 'https://club.example/api/integrations/vk/oauth/callback', nickname: 'NewVkPlayer', returnTo: '/player',
    });
    const state = new URL(start.authorize_url).searchParams.get('state') || '';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ access_token: 'token', user_id: 888, state }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    await expect(completeVkPlayerOAuth(db, { code: 'code', deviceId: 'device', state })).resolves.toMatchObject({
      vkUserId: '888', playerId: null, nickname: 'NewVkPlayer', returnTo: '/player',
    });
  });

  it('issues the same canonical player_token understood by protected player authentication', () => {
    let cookieName = '';
    let cookieValue = '';
    let cookieOptions: any = null;
    const res = {
      cookie(name: string, value: string, options: any) {
        cookieName = name; cookieValue = value; cookieOptions = options;
      },
    } as any;
    setPlayerSessionCookie(res, 'canonical-player');
    expect(cookieName).toBe('player_token');
    expect(cookieOptions).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(getPlayerSessionId({ cookies: { player_token: cookieValue } } as any)).toBe('canonical-player');
  });
});
