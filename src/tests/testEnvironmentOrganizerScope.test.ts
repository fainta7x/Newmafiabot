import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
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
    const secret = process.env.JWT_SECRET || 'dev-only-jwt-secret-key-for-local-testing';
    const decoded = jwt.decode(generateOrganizerToken()) as { organizerSessionVersion: number };
    const legacy = jwt.sign(
      { role: 'ORGANIZER', organizerSessionType: 'root_password', organizerSessionVersion: decoded.organizerSessionVersion - 1 },
      secret,
    );
    expect(await resolveRole({ organizer_token: legacy })).toBe('PLAYER');
  });
});
