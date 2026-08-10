import dotenv from 'dotenv';
import path from 'path';
import { createApp } from './src/app.ts';
import { getDb } from './src/db/index.ts';

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

  const databasePath = process.env.DATABASE_PATH;
  if (!databasePath) {
    throw new Error('DATABASE_PATH must be set in production.');
  }
  if (!path.isAbsolute(databasePath)) {
    throw new Error('DATABASE_PATH must be an absolute path in production.');
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
