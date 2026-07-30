import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { seedDemoData } from '../db/seed.ts';

describe('Database Seeding & Stability Tests', () => {
  let db: DatabaseWrapper;
  const testDbFile = path.resolve(process.cwd(), 'test_seed_temp.sqlite');
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    // Delete temp file if exists
    if (fs.existsSync(testDbFile)) {
      try { fs.unlinkSync(testDbFile); } catch (_) {}
    }
    // Set env variables
    process.env.SEED_DEMO_DATA = 'true';
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    if (db) {
      try { db.sqlite.close(); } catch (_) {}
    }
    process.env.NODE_ENV = originalNodeEnv;
    if (fs.existsSync(testDbFile)) {
      try { fs.unlinkSync(testDbFile); } catch (_) {}
      try { fs.unlinkSync(`${testDbFile}-wal`); } catch (_) {}
      try { fs.unlinkSync(`${testDbFile}-shm`); } catch (_) {}
    }
  });

  it('1. Seeding is triggered when database is empty, SEED_DEMO_DATA=true, and NODE_ENV=development', async () => {
    db = createDatabaseConnection(testDbFile);
    await seedDemoData(db);

    const playersCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM players');
    const tournamentsCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tournaments');

    expect(playersCount?.count).toBe(10);
    expect(tournamentsCount?.count).toBe(1);

    // Verify tournament is active
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', ['t-test-1']);
    expect(tournament).toBeDefined();
    expect(tournament.status).toBe('active');

    // Verify tournament is unpublished (public_token & results_published_at are NULL)
    expect(tournament.public_token).toBeNull();
    expect(tournament.results_published_at).toBeNull();

    // Verify games count and status: 1 completed, 9 planned
    const games = await db.all<any>('SELECT * FROM tournament_games WHERE tournament_id = ?', ['t-test-1']);
    expect(games.length).toBe(10);

    const completedGames = games.filter(g => g.status === 'completed');
    const plannedGames = games.filter(g => g.status === 'planned');

    expect(completedGames.length).toBe(1);
    expect(plannedGames.length).toBe(9);
  });

  it('2. Seed never runs when NODE_ENV=production, even if SEED_DEMO_DATA=true', async () => {
    process.env.NODE_ENV = 'production';
    db = createDatabaseConnection(testDbFile);
    await seedDemoData(db);

    const playersCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM players');
    expect(playersCount?.count).toBe(0);
  });

  it('3. Running seed twice does not create duplicates', async () => {
    db = createDatabaseConnection(testDbFile);
    await seedDemoData(db);
    
    // Run second time
    await seedDemoData(db);

    const playersCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM players');
    const tournamentsCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tournaments');

    expect(playersCount?.count).toBe(10);
    expect(tournamentsCount?.count).toBe(1);
  });

  it('4. Re-initializing database preserves existing data', async () => {
    db = createDatabaseConnection(testDbFile);
    await seedDemoData(db);

    // Close and re-open connection
    db.sqlite.close();

    db = createDatabaseConnection(testDbFile);
    // Checking that data is still there and wasn't wiped
    const playersCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM players');
    const tournamentsCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tournaments');

    expect(playersCount?.count).toBe(10);
    expect(tournamentsCount?.count).toBe(1);
  });

  it('5. Seed does not run if SEED_DEMO_DATA is not true', async () => {
    process.env.SEED_DEMO_DATA = 'false';
    db = createDatabaseConnection(testDbFile);
    await seedDemoData(db);

    const playersCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM players');
    expect(playersCount?.count).toBe(0);
  });
});
