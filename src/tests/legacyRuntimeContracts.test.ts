import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CANONICAL_PUBLIC_APP_URL,
  DEFAULT_INTERNAL_BOT_SERVICE_URL,
  getBotServiceBaseUrl,
  getPublicAppBaseUrl,
} from '../server/runtimeConfig.ts';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('canonical runtime contracts', () => {
  it('uses the internal bot service and the current public deployment by default', () => {
    delete process.env.BOT_SERVICE_URL;
    delete process.env.PUBLIC_APP_URL;
    delete process.env.WEBHOOK_URL;
    delete process.env.RENDER_EXTERNAL_URL;

    expect(getBotServiceBaseUrl()).toBe(DEFAULT_INTERNAL_BOT_SERVICE_URL);
    expect(getPublicAppBaseUrl()).toBe(CANONICAL_PUBLIC_APP_URL);
  });

  it('normalizes explicit runtime URL overrides', () => {
    process.env.BOT_SERVICE_URL = 'http://bot:8081///';
    process.env.PUBLIC_APP_URL = 'https://club.example///';
    expect(getBotServiceBaseUrl()).toBe('http://bot:8081');
    expect(getPublicAppBaseUrl()).toBe('https://club.example');
  });

  it('contains no retired Render deployment fallback in active runtime code', () => {
    const files = [
      'src/server/services/telegramRuntimeHealthService.ts',
      'src/server/services/botTelegramSyncService.ts',
      'src/server/services/weeklyEveningAutomationService.ts',
      'src/server/routes/systemStatusRoutes.ts',
      'config.py',
    ];
    for (const file of files) {
      expect(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')).not.toContain('onrender.com');
    }
  });

  it('keeps only the canonical player creation and retired game creation contracts', () => {
    const playersBase = fs.readFileSync(path.resolve(process.cwd(), 'src/server/routes/playersRoutes.ts'), 'utf8');
    const gamesBase = fs.readFileSync(path.resolve(process.cwd(), 'src/server/routes/gamesRoutesBase.ts'), 'utf8');
    expect(playersBase).not.toContain('createPlayerSchema');
    expect(gamesBase).not.toContain('createGameSchema');
    expect(gamesBase).not.toContain('const redDelta = winner_team');
  });
});
