import { describe, expect, it } from 'vitest';
import { ensureInviteAudienceSchema } from '../db/ensureInviteAudienceSchema.ts';

describe('invite audience schema', () => {
  it('creates the CRM novice trigger with run() instead of exec() for Turso compatibility', async () => {
    const runSql: string[] = [];
    const execSql: string[] = [];
    const db: any = {
      all: async () => [{ name: 'game_level' }],
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
});
