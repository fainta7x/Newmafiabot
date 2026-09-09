import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
describe('VK-ACCESS-004 shared onboarding UI routing', () => {
  it('moves new Telegram identities onto the shared verified onboarding flow', () => {
    const app = read('src/App.tsx'); const auth = read('src/server/routes/authRoutes.ts');
    expect(app).toContain('VerifiedPlayerOnboarding'); expect(app).toContain("fetch('/api/auth/telegram'");
    expect(app).toContain('return_to: currentPlayerReturnPath()'); expect(app).not.toContain("fetch('/api/auth/register'");
    expect(auth).toContain('beginVerifiedPlayerOnboarding'); expect(auth).toContain("platform: 'telegram'");
    expect(auth).toContain('setPlayerOnboardingCookie(res, onboarding.token)');
  });
  it('verifies VK before requesting any nickname', () => {
    const access = read('src/components/player/VkPlayerAccess.tsx'); const start = read('src/server/services/vkPlayerStartRouter.ts');
    const callback = read('src/server/services/vkJoinRegistrationCallbackRouter.ts');
    expect(access).toContain('Продолжить через VK'); expect(access).not.toContain('Игровой ник'); expect(access).not.toContain('nickname:');
    expect(start).toContain('VERIFIED_ONBOARDING_PLACEHOLDER'); expect(callback).toContain("platform: 'vk'");
    expect(callback).toContain('beginVerifiedPlayerOnboarding'); expect(callback).toContain('setPlayerOnboardingCookie(res, onboarding.token)');
  });
  it('keeps the raw onboarding token in an HttpOnly cookie and exposes only safe status to React', () => {
    const cookie = read('src/server/services/playerOnboardingCookie.ts'); const auth = read('src/server/routes/authRoutes.ts');
    const ui = read('src/components/player/VerifiedPlayerOnboarding.tsx');
    expect(cookie).toContain("export const PLAYER_ONBOARDING_COOKIE = 'player_onboarding'"); expect(cookie).toContain('httpOnly: true');
    expect(cookie).toContain("sameSite: 'lax'"); expect(auth).toContain("router.get('/onboarding'");
    expect(auth).not.toContain('external_user_id: pending'); expect(ui).toContain("fetch('/api/auth/onboarding'");
    expect(ui).not.toContain('externalUserId'); expect(ui).not.toContain('player_id');
  });
  it('uses one channel-neutral choice and completion API for both Telegram and VK', () => {
    const ui = read('src/components/player/VerifiedPlayerOnboarding.tsx'); const auth = read('src/server/routes/authRoutes.ts');
    expect(ui).toContain('Я уже играл в клубе'); expect(ui).toContain('Я новый игрок'); expect(ui).toContain('`/api/auth/onboarding/${kind}`');
    expect(auth).toContain("router.post('/onboarding/new'"); expect(auth).toContain("router.post('/onboarding/existing'");
    expect(auth).toContain('completeVerifiedNewPlayerOnboarding'); expect(auth).toContain('requestExistingPlayerOnboardingLink');
    expect(auth).toContain("pending?.platform === 'vk' ? resolveTrustedPublicAppOrigin(req) : undefined");
  });
  it('does not change the legacy public VK evening-registration branch', () => {
    const callback = read('src/server/services/vkJoinRegistrationCallbackRouter.ts');
    const boundary = callback.indexOf('// Existing public evening-registration VK flow remains unchanged.'); expect(boundary).toBeGreaterThan(0);
    const publicBranch = callback.slice(boundary); expect(publicBranch).toContain('peekVkJoinOAuthState');
    expect(publicBranch).toContain('registerVkPlayer'); expect(publicBranch).toContain('setVkSessionCookie');
    expect(publicBranch).toContain("res.cookie('vk_join_session'"); expect(publicBranch).toContain('resolveTrustedPublicAppOrigin(req)');
  });
});
