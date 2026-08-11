import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureInviteAudienceSchema, playerLevelAllowsEveningFormat } from '../db/ensureInviteAudienceSchema.ts';

let db: DatabaseWrapper | null = null;

afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
});

describe('Telegram invite audience by player level', () => {
  it('routes novices only to novice evenings', () => {
    expect(playerLevelAllowsEveningFormat('novice', 'NOVICE')).toBe(true);
    expect(playerLevelAllowsEveningFormat('novice', 'CASUAL')).toBe(false);
    expect(playerLevelAllowsEveningFormat('novice', 'RATING')).toBe(false);
    expect(playerLevelAllowsEveningFormat('novice', 'TOURNAMENT')).toBe(false);
  });

  it('keeps club players out of rating and tournament invitations', () => {
    expect(playerLevelAllowsEveningFormat('club', 'NOVICE')).toBe(true);
    expect(playerLevelAllowsEveningFormat('club', 'CASUAL')).toBe(true);
    expect(playerLevelAllowsEveningFormat('club', 'RATING')).toBe(false);
    expect(playerLevelAllowsEveningFormat('club', 'TOURNAMENT')).toBe(false);
  });

  it('allows approved tournament players into club, rating and tournament formats', () => {
    expect(playerLevelAllowsEveningFormat('tournament', 'NOVICE')).toBe(false);
    expect(playerLevelAllowsEveningFormat('tournament', 'CASUAL')).toBe(true);
    expect(playerLevelAllowsEveningFormat('tournament', 'RATING')).toBe(true);
    expect(playerLevelAllowsEveningFormat('tournament', 'TOURNAMENT')).toBe(true);
  });

  it('forces future organizer-created CRM players onto the novice path', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureInviteAudienceSchema(db);
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO players (id, nickname, contact_status, lifecycle_status, source, elo, tokens, created_at, updated_at)
       VALUES (?, ?, 'normal', 'normal', 'crm_manual', 1000, 0, ?, ?)`,
      ['manual-novice-test', 'Новый вручную', now, now],
    );
    const player = await db.get<{ game_level: string }>('SELECT game_level FROM players WHERE id = ?', ['manual-novice-test']);
    expect(player?.game_level).toBe('novice');
  });
});
