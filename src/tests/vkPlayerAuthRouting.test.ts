import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('VK player authentication routing', () => {
  it('keeps public join session separate from canonical cabinet authentication', () => {
    const startRouter = read('src/server/services/vkJoinStartRouter.ts');
    const callback = read('src/server/services/vkJoinRegistrationCallbackRouter.ts');

    expect(startRouter).toContain("router.post('/player/vk/start'");
    expect(startRouter).toContain("router.post('/evenings/:id/vk/start'");
    expect(callback).toContain('peekVkPlayerOAuthState');
    expect(callback).toContain('setPlayerSessionCookie(res, playerId)');
    expect(callback).toContain("res.cookie('vk_join_session'");

    const cabinetBranch = callback.slice(
      callback.indexOf('// Full player-cabinet VK ID flow.'),
      callback.indexOf('// Existing public evening-registration VK flow remains unchanged.'),
    );
    expect(cabinetBranch).toContain('setPlayerSessionCookie(res, playerId)');
    expect(cabinetBranch).not.toContain('setVkSessionCookie');
    expect(cabinetBranch).not.toContain("vk_join_session");
  });

  it('does not trust browser player_id and uses the existing private confirmation path for nickname collisions', () => {
    const callback = read('src/server/services/vkJoinRegistrationCallbackRouter.ts');
    const service = read('src/server/services/vkPlayerAuthService.ts');
    expect(callback).not.toContain('req.body?.player_id');
    expect(callback).not.toContain('req.query?.player_id');
    expect(callback).toContain("error?.code !== 'nickname_taken'");
    expect(callback).toContain('createVkPlayerIdentityClaim');
    expect(service).toContain("platform='vk'");
    expect(service).toContain('sendTelegramClaimConfirmation');
    expect(service).not.toContain('console.log');
  });
});
