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

  it('keeps the production Telegram webhook stable across rolling deploys', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'main.py'), 'utf8');
    const startup = source.slice(source.indexOf('async def on_startup():'), source.indexOf('async def on_shutdown():'));
    const shutdown = source.slice(source.indexOf('async def on_shutdown():'), source.indexOf('async def handle_webhook'));

    expect(startup).toContain('await bot.set_webhook(webhook_url');
    expect(startup).not.toContain('delete_webhook');
    expect(shutdown).not.toContain('delete_webhook');
  });

  it('pins canonical Amvera product storage to persistent SQLite and keeps legacy bot backups disabled', () => {
    const webStart = fs.readFileSync(path.resolve(process.cwd(), 'deploy/start-web.sh'), 'utf8');
    const botMain = fs.readFileSync(path.resolve(process.cwd(), 'main.py'), 'utf8');
    const backupWorker = fs.readFileSync(path.resolve(process.cwd(), 'deploy/backup-sqlite.cjs'), 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(webStart).toContain('export DATABASE_PATH="/data/mafia_crm.sqlite"');
    expect(webStart).toContain('unset TURSO_DATABASE_URL TURSO_AUTH_TOKEN');
    expect(botMain).not.toContain('asyncio.create_task(daily_backup_task())');
    expect(backupWorker).toContain("db.pragma('integrity_check'");
    expect(packageJson.scripts['backup:verify']).toBe('node deploy/verify-sqlite-backup.cjs');
  });

  it('keeps only the canonical player creation and retired game creation contracts', () => {
    const playersBase = fs.readFileSync(path.resolve(process.cwd(), 'src/server/routes/playersRoutes.ts'), 'utf8');
    const gamesBase = fs.readFileSync(path.resolve(process.cwd(), 'src/server/routes/gamesRoutesBase.ts'), 'utf8');
    expect(playersBase).not.toContain('createPlayerSchema');
    expect(gamesBase).not.toContain('createGameSchema');
    expect(gamesBase).not.toContain('const redDelta = winner_team');
  });
});
