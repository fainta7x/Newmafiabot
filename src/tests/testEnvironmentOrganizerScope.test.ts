import jwt from 'jsonwebtoken';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Per-run random signing secret, set before auth.ts reads JWT_SECRET at import time.
const { signingSecret, previousSecret } = vi.hoisted(() => {
  const previous = process.env.JWT_SECRET;
  const secret = `test-${Math.random().toString(36).slice(2)}${Date.now()}`;
  process.env.JWT_SECRET = secret;
  return { signingSecret: secret, previousSecret: previous };
});
afterAll(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});
import {
  generateOrganizerToken,
  generatePlayerSessionToken,
  parseUserSession,
  testEnvironmentPlayerId,
  type AuthenticatedRequest,
} from '../server/auth.ts';

const resolveRole = async (cookies: Record<string, string>) => {
  const req = { cookies, headers: {} } as unknown as AuthenticatedRequest;
  await parseUserSession(req, {} as any, () => {});
  return req.userRole;
};

describe('sandbox organizer session scope', () => {
  it('grants organizer access only together with the isolated sandbox player session', async () => {
    const sandboxOrganizer = generateOrganizerToken(undefined, { sandbox: true });
    const sandboxPlayer = generatePlayerSessionToken(testEnvironmentPlayerId('p-test-1'));

    expect(await resolveRole({ organizer_token: sandboxOrganizer, player_token: sandboxPlayer })).toBe('ORGANIZER');
    // Dropping the sandbox player cookie must not turn it into a production organizer.
    expect(await resolveRole({ organizer_token: sandboxOrganizer })).toBe('PLAYER');
    expect(await resolveRole({ organizer_token: sandboxOrganizer, player_token: generatePlayerSessionToken('real-player') })).toBe('PLAYER');
  });

  it('keeps the production organizer password session working', async () => {
    expect(await resolveRole({ organizer_token: generateOrganizerToken() })).toBe('ORGANIZER');
  });

  it('revokes organizer sessions minted before the sandbox scope fix', async () => {
    const decoded = jwt.decode(generateOrganizerToken()) as { organizerSessionVersion: number };
    const legacy = jwt.sign(
      { role: 'ORGANIZER', organizerSessionType: 'root_password', organizerSessionVersion: decoded.organizerSessionVersion - 1 },
      signingSecret,
    );
    expect(await resolveRole({ organizer_token: legacy })).toBe('PLAYER');
  });
});
