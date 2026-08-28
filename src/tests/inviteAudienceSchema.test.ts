import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { ensureInviteAudienceSchema } from '../db/ensureInviteAudienceSchema.ts';
import { createDatabaseConnection } from '../db/index.ts';

describe('invite audience schema', () => {
  it('creates the CRM novice trigger with run() instead of exec() for Turso compatibility', async () => {
    const runSql: string[] = [];
    const execSql: string[] = [];
    const db: any = {
      all: async () => [{ name: 'game_level' }],
      get: async () => null,
      run: async (sql: string) => {
        runSql.push(sql);
        return { changes: 0 };
      },
      exec: async (sql: string) => {
        execSql.push(sql);
        if (sql.includes('CREATE TRIGGER')) throw new Error('Turso exec split trigger body');
      },
    };

    await expect(ensureInviteAudienceSchema(db)).resolves.toBeUndefined();
    expect(runSql.some((sql) => sql.includes('CREATE TRIGGER IF NOT EXISTS trg_players_crm_manual_default_novice'))).toBe(true);
    expect(execSql.some((sql) => sql.includes('CREATE TRIGGER'))).toBe(false);
  });

  it('adds missing organizer-critical columns to an existing Turso-like schema', async () => {
    const schema = new Map<string, Set<string>>([
      ['players', new Set(['id', 'source', 'lifecycle_status'])],
      ['organizer_tasks', new Set(['id'])],
      ['evening_participants', new Set(['id'])],
      ['game_evenings', new Set(['id'])],
    ]);
    const runSql: string[] = [];
    const db: any = {
      all: async (sql: string) => {
        const table = sql.match(/PRAGMA table_info\(([^)]+)\)/)?.[1] || '';
        return [...(schema.get(table) || new Set<string>())].map((name) => ({ name }));
      },
      get: async () => null,
      run: async (sql: string) => {
        runSql.push(sql);
        const alter = sql.match(/ALTER TABLE\s+(\S+)\s+ADD COLUMN\s+(\S+)/i);
        if (alter) schema.get(alter[1])?.add(alter[2]);
        return { changes: 0 };
      },
    };

    await expect(ensureInviteAudienceSchema(db)).resolves.toBeUndefined();
    expect(schema.get('players')?.has('game_level')).toBe(true);
    expect(schema.get('players')?.has('contact_status')).toBe(true);
    expect(schema.get('players')?.has('do_not_invite_until')).toBe(true);
    expect(schema.get('organizer_tasks')?.has('automation_key')).toBe(true);
    expect(schema.get('evening_participants')?.has('table_id')).toBe(true);
    expect(schema.get('evening_participants')?.has('response_status')).toBe(true);
    expect(schema.get('game_evenings')?.has('settled_at')).toBe(true);
    expect(runSql.some((sql) => sql.includes('UPDATE players SET contact_status = lifecycle_status'))).toBe(true);
    expect(runSql.some((sql) => sql.includes("UPDATE players SET game_level = 'club' WHERE game_level = 'novice'"))).toBe(true);
    expect(runSql.some((sql) => sql.includes("UPDATE players SET lifecycle_status = 'normal' WHERE lifecycle_status = 'newcomer'"))).toBe(true);
  });

  it('does not query the legacy games.status column from the CRM overview', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/server/routes/crmRoutes.ts'), 'utf8');
    expect(source).not.toContain("status='completed' OR winner_team IS NOT NULL");
    expect(source).toContain('SUM(CASE WHEN winner_team IS NOT NULL THEN 1 ELSE 0 END) AS completed');
  });

  it('moves legacy blocked/paused states into the canonical contact status once', async () => {
    const db = await createDatabaseConnection(':memory:');
    await ensureInviteAudienceSchema(db);
    await db.run("DELETE FROM app_data_migrations WHERE id = '2026-08-canonical-contact-status'");
    await db.run(
      `INSERT INTO players (id, nickname, lifecycle_status, contact_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['legacy-blocked', 'Legacy blocked', 'blocked', 'normal', new Date().toISOString(), new Date().toISOString()],
    );

    await ensureInviteAudienceSchema(db);
    expect((await db.get<{ contact_status: string }>('SELECT contact_status FROM players WHERE id = ?', ['legacy-blocked']))?.contact_status).toBe('blocked');

    await db.run("UPDATE players SET contact_status = 'normal' WHERE id = 'legacy-blocked'");
    await ensureInviteAudienceSchema(db);
    expect((await db.get<{ contact_status: string }>('SELECT contact_status FROM players WHERE id = ?', ['legacy-blocked']))?.contact_status).toBe('normal');
    db.sqlite.close();
  });
});
