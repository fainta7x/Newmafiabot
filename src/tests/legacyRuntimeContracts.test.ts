import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CANONICAL_PUBLIC_APP_URL,
  DEFAULT_INTERNAL_BOT_SERVICE_URL,
  getBotServiceBaseUrl,
  getPublicAppBaseUrl,
} from '../server/runtimeConfig.ts';
import { STARTUP_MUTATION_REGISTRY } from '../server/startupMutationRegistry.ts';

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

  it('never restores a runtime database from a Telegram document', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'admin.py'), 'utf8');
    const backupSection = source.slice(source.indexOf('# ========== БЭКАП =========='), source.indexOf('@router.message(F.text == "🔙 Назад в админ-меню")'));

    expect(backupSection).not.toContain('shutil.copy2(temp_path, database.DB_NAME)');
    expect(backupSection).not.toContain('shutil.copy2(database.DB_NAME, backup_path)');
    expect(backupSection).toContain('Восстановление базы из Telegram отключено');
  });

  it('keeps the production env example aligned with persistent Amvera SQLite', () => {
    const envExample = fs.readFileSync(path.resolve(process.cwd(), '.env.production.example'), 'utf8');

    expect(envExample).toContain('DATABASE_PATH=/data/mafia_crm.sqlite');
    expect(envExample).toContain('USE_WEBHOOK=true');
    expect(envExample).toContain('BOT_SERVICE_URL=http://127.0.0.1:8081');
    expect(envExample).not.toContain('TURSO_DATABASE_URL=<set-in-render-secret>');
    expect(envExample).not.toContain('DATABASE_PATH=/tmp/2la-noire-web-staging');
  });

  it('routes /admin through the canonical WebApp CRM before legacy admin handlers', () => {
    const adminCrm = fs.readFileSync(path.resolve(process.cwd(), 'handlers/admin_crm.py'), 'utf8');
    const main = fs.readFileSync(path.resolve(process.cwd(), 'main.py'), 'utf8');

    expect(adminCrm).toContain('@router.message(Command("admin"), F.chat.type == "private")');
    expect(adminCrm).toContain('await _send_crm_entry(message)');
    expect(main.indexOf('admin_crm.router')).toBeGreaterThanOrEqual(0);
    expect(main.indexOf('admin.router')).toBeGreaterThan(main.indexOf('admin_crm.router'));
  });

  it('intercepts stale Telegram business actions before legacy DB-backed routers', () => {
    const main = fs.readFileSync(path.resolve(process.cwd(), 'main.py'), 'utf8');
    const guard = fs.readFileSync(path.resolve(process.cwd(), 'handlers/legacy_retired_actions.py'), 'utf8');

    const guardIndex = main.indexOf('legacy_retired_actions.router');
    expect(guardIndex).toBeGreaterThan(main.indexOf('admin_crm.router'));
    expect(guardIndex).toBeLessThan(main.indexOf('admin.router'));
    expect(guardIndex).toBeLessThan(main.indexOf('profile.router'));
    expect(guardIndex).toBeLessThan(main.indexOf('payment.router'));
    expect(guardIndex).toBeLessThan(main.indexOf('booking.router'));
    expect(guardIndex).toBeLessThan(main.indexOf('shop.router'));

    expect(guard).toContain('"book_"');
    expect(guard).toContain('"pay_now"');
    expect(guard).toContain('"shop_buy:"');
    expect(guard).toContain('"editgame_"');
    expect(guard).toContain('Эта старая кнопка отключена');
  });

  it('finalizes old Telegram evening posts instead of leaving active buttons behind', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'handlers/crm_telegram_publishing.py'), 'utf8');

    expect(source).toContain('closed_event_text(evening, cancelled=cancelled)');
    expect(source).toContain('"action": "finalized"');
    expect(source).toContain('None,');
  });

  it('keeps an observable ordered registry for startup schema/data mutations', () => {
    const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/app.ts'), 'utf8');
    const names = STARTUP_MUTATION_REGISTRY.map((entry) => entry.name);
    expect(names.length).toBeGreaterThan(20);
    expect(new Set(names).size).toBe(names.length);
    expect(STARTUP_MUTATION_REGISTRY.map((entry) => entry.order)).toEqual(
      [...STARTUP_MUTATION_REGISTRY].map((entry) => entry.order).sort((a, b) => a - b),
    );
    for (const name of names) {
      expect(appSource).toContain(name);
    }
    expect(appSource).toContain('logStartupMutationRegistry()');
  });

  it('uses the direct VK evening card in the active CRM announcement panel', () => {
    const panel = fs.readFileSync(path.resolve(process.cwd(), 'src/components/crm/EveningAnnouncementPanel.tsx'), 'utf8');
    expect(panel).toContain("import EveningVkCard from './EveningVkCard.vk-direct.tsx';");
    expect(panel).not.toContain("import EveningVkCard from './EveningVkCard.tsx';");
  });

  it('keeps only the canonical player creation and retired game creation contracts', () => {
    const playersBase = fs.readFileSync(path.resolve(process.cwd(), 'src/server/routes/playersRoutes.ts'), 'utf8');
    const gamesBase = fs.readFileSync(path.resolve(process.cwd(), 'src/server/routes/gamesRoutesBase.ts'), 'utf8');
    expect(playersBase).not.toContain('createPlayerSchema');
    expect(gamesBase).not.toContain('createGameSchema');
    expect(gamesBase).not.toContain('const redDelta = winner_team');
  });
});
