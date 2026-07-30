import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { seedDemoData } from '../db/seed.ts';

describe('Database Seeding & Stability Tests', () => {
  let db: DatabaseWrapper;
  const testDbFile = path.resolve(process.cwd(), 'test_seed_temp.sqlite');

  beforeEach(() => {
    // Delete temp file if exists
    if (fs.existsSync(testDbFile)) {
      try { fs.unlinkSync(testDbFile); } catch (_) {}
    }
    // Set env variables
    process.env.SEED_DEMO_DATA = 'true';
  });

  afterEach(() => {
    if (db) {
      try { db.sqlite.close(); } catch (_) {}
    }
    if (fs.existsSync(testDbFile)) {
      try { fs.unlinkSync(testDbFile); } catch (_) {}
      try { fs.unlinkSync(`${testDbFile}-wal`); } catch (_) {}
      try { fs.unlinkSync(`${testDbFile}-shm`); } catch (_) {}
    }
  });

  it('1. Seeding is triggered when database is empty and SEED_DEMO_DATA=true', async () => {
    db = createDatabaseConnection(testDbFile);
    await seedDemoData(db);

    const playersCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM players');
    const tournamentsCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tournaments');

    expect(playersCount?.count).toBe(10);
    expect(tournamentsCount?.count).toBe(1);
  });

  it('2. Running seed twice does not create duplicates', async () => {
    db = createDatabaseConnection(testDbFile);
    await seedDemoData(db);
    
    // Run second time
    await seedDemoData(db);

    const playersCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM players');
    const tournamentsCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tournaments');

    expect(playersCount?.count).toBe(10);
    expect(tournamentsCount?.count).toBe(1);
  });

  it('3. Re-initializing database preserves existing data', async () => {
    db = createDatabaseConnection(testDbFile);
    await seedDemoData(db);

    // Close and re-open connection
    db.sqlite.close();

    db = createDatabaseConnection(testDbFile);
    // Checking that data is still there and wasn't wiped by createDatabaseConnection / initializeDatabase
    const playersCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM players');
    const tournamentsCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tournaments');

    expect(playersCount?.count).toBe(10);
    expect(tournamentsCount?.count).toBe(1);
  });

  it('4. Seed does not run if SEED_DEMO_DATA is not true', async () => {
    process.env.SEED_DEMO_DATA = 'false';
    db = createDatabaseConnection(testDbFile);
    await seedDemoData(db);

    const playersCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM players');
    expect(playersCount?.count).toBe(0);
  });
});
