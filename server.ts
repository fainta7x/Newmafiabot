import dotenv from 'dotenv';
import path from 'path';
import { createApp } from './src/app.ts';
import { getDb } from './src/db/index.ts';
import developerReadRoutes from './src/server/routes/developerReadRoutes.ts';

dotenv.config();

const DEV_DEFAULTS = new Set([
  'admin',
  'adminpass',
  'super-secret-jwt-key-change-this-in-production',
  'dev-only-jwt-secret-key-for-local-testing',
]);

function requireProductionSecret(name: 'ORGANIZER_PASSWORD' | 'JWT_SECRET' | 'BOT_API_SECRET', minLength: number): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in production.`);
  }
  if (DEV_DEFAULTS.has(value)) {
    throw new Error(`${name} uses a known development default and must be changed in production.`);
  }
  if (value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters in production.`);
  }
  return value;
}

function validateProductionEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') return;

  if (process.env.TURSO_DATABASE_URL || process.env.TURSO_AUTH_TOKEN) {
    throw new Error('Turso is retired. Remove TURSO_DATABASE_URL and TURSO_AUTH_TOKEN; Amvera SQLite is the only supported runtime database.');
  }

  const databasePath = process.env.DATABASE_PATH;
  if (!databasePath) {
    throw new Error('DATABASE_PATH must be set in production.');
  }
  if (!path.isAbsolute(databasePath)) {
    throw new Error('DATABASE_PATH must be an absolute path in production.');
  }

  const testPassword = String(process.env.TEST_ACCESS_PASSWORD || '');
  if (testPassword && testPassword.length < 12) {
    throw new Error('TEST_ACCESS_PASSWORD must be at least 12 characters when the in-app sandbox is enabled.');
  }
  const testDatabasePath = String(process.env.TEST_DATABASE_PATH || '').trim();
  if (testDatabasePath && !path.isAbsolute(testDatabasePath)) {
    throw new Error('TEST_DATABASE_PATH must be absolute when configured.');
  }
  if (testDatabasePath && path.resolve(testDatabasePath) === path.resolve(databasePath)) {
    throw new Error('TEST_DATABASE_PATH must not equal the production DATABASE_PATH.');
  }

  requireProductionSecret('ORGANIZER_PASSWORD', 12);
  requireProductionSecret('JWT_SECRET', 32);
  requireProductionSecret('BOT_API_SECRET', 32);
}

async function startServer() {
  validateProductionEnvironment();

  const db = await getDb();
  console.log('[DATABASE] Database initialized.');
  const app = await createApp(db);

  // Read-only technical access for bounded diagnostics/export. This route is
  // intentionally mounted outside /api after createApp: production SPA/API
  // catchalls are already installed there. POST avoids the SPA GET catchall.
  app.use('/__developer-read', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  }, developerReadRoutes);

  const HOST = process.env.HOST || '0.0.0.0';
  const parsedPort = Number.parseInt(process.env.PORT || '3000', 10);
  const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

  app.listen(PORT, HOST, () => {
    console.log(`Mafia CRM Server listening on ${HOST}:${PORT}`);
  });
}

startServer().catch((e) => {
  console.error('Failed to start server:', e);
  process.exit(1);
});
