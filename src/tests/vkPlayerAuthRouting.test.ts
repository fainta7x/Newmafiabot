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
    expect(cabinetBranch).not.toContain("res.cookie('vk_join_session'");
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

  it('exposes VK login from the shared player application and preserves the requested player destination', () => {
    const app = read('src/App.tsx');
    const vkAccess = read('src/components/player/VkPlayerAccess.tsx');
    expect(app).toContain('VkPlayerAccess');
    expect(app).toContain('Войти в кабинет игрока');
    expect(app).not.toContain('Откройте через Telegram');
    expect(app).not.toContain('Проверяем вход через Telegram');
    expect(vkAccess).toContain("fetch('/api/integrations/player/vk/start'");
    expect(vkAccess).toContain('window.location.pathname');
    expect(vkAccess).toContain('window.location.search');
    expect(vkAccess).toContain('window.location.hash');
    expect(vkAccess).toContain('return_to: currentPlayerDestination()');
  });

  it('keeps organizer and judge authorization tied to canonical player_token player_id', () => {
    const auth = read('src/server/auth.ts');
    expect(auth).toContain("const token = req.cookies?.player_token");
    expect(auth).toContain("decoded.session === 'PLAYER'");
    expect(auth).toContain("SELECT judge_level FROM players WHERE id = ? LIMIT 1");
    expect(auth).toContain('[playerId]');
    expect(auth).not.toContain('telegram_user_id');
    expect(auth).not.toContain('external_user_id');
  });

  it('adds the shared player cabinet entry point to VK evening announcements', () => {
    const publishing = read('src/server/services/vkDirectJoinPublishingService.ts');
    expect(publishing).toContain("'👤 Открыть личный кабинет:'");
    expect(publishing).toContain("playerCabinetUrlForVk(baseUrl, '/player')");
    expect(publishing).toContain('cabinet_url:');
    expect(publishing).toContain('/join/${encodeURIComponent(eveningId)}?source=vk_entry');
  });
});