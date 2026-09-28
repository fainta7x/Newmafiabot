import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureInviteAudienceSchema, playerLevelAllowsEveningFormat } from '../db/ensureInviteAudienceSchema.ts';

let db: DatabaseWrapper | null = null;

afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
});

describe('Telegram invite audience by player level', () => {
  it('treats the retired «unrated» value like a novice', () => {
    expect(playerLevelAllowsEveningFormat('unrated', 'NOVICE')).toBe(true);
    expect(playerLevelAllowsEveningFormat('unrated', 'CASUAL')).toBe(false);
    expect(playerLevelAllowsEveningFormat('unrated', 'RATING')).toBe(false);
    expect(playerLevelAllowsEveningFormat('unrated', 'TOURNAMENT')).toBe(false);
  });

  it('routes actual novices only to novice evenings', () => {
    expect(playerLevelAllowsEveningFormat('novice', 'NOVICE')).toBe(true);
    expect(playerLevelAllowsEveningFormat('novice', 'CASUAL')).toBe(false);
    expect(playerLevelAllowsEveningFormat('novice', 'RATING')).toBe(false);
    expect(playerLevelAllowsEveningFormat('novice', 'TOURNAMENT')).toBe(false);
  });

  it('keeps experienced regular players out of rating and tournament invitations', () => {
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

  it('starts organizer-created CRM players as novices', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureInviteAudienceSchema(db);
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO players (id, nickname, contact_status, lifecycle_status, source, elo, tokens, created_at, updated_at)
       VALUES (?, ?, 'normal', 'normal', 'crm_manual', 1000, 0, ?, ?)`,
      ['manual-unrated-test', 'Новый вручную', now, now],
    );
    const player = await db.get<{ game_level: string }>('SELECT game_level FROM players WHERE id = ?', ['manual-unrated-test']);
    expect(player?.game_level).toBe('novice');
  });

  it('retires «unrated» once: confirmed or club-evening players become club, the rest novices', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureInviteAudienceSchema(db);
    await db.run("DELETE FROM app_data_migrations WHERE id = '2026-09-retire-unrated-level'");
    const now = new Date().toISOString();
    for (const id of ['played-club', 'only-novice', 'never-came']) {
      await db.run(
        `INSERT INTO players (id, nickname, contact_status, lifecycle_status, source, game_level, elo, tokens, created_at, updated_at)
         VALUES (?, ?, 'normal', 'normal', 'telegram', 'unrated', 1000, 0, ?, ?)`,
        [id, id, now, now],
      );
    }
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,format,status,created_at,updated_at) VALUES ('club-e','Клуб',?,'CASUAL','completed',?,?),('nov-e','Новички',?,'NOVICE','completed',?,?)`, [now, now, now, now, now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,attendance_status,created_at,updated_at) VALUES ('a','club-e','played-club','attended',?,?),('b','nov-e','only-novice','attended',?,?)`, [now, now, now, now]);
    await ensureInviteAudienceSchema(db);
    const rows = await db.all<any>("SELECT id, game_level FROM players WHERE id IN ('played-club','only-novice','never-came') ORDER BY id");
    expect(rows).toEqual([
      { id: 'never-came', game_level: 'novice' },
      { id: 'only-novice', game_level: 'novice' },
      { id: 'played-club', game_level: 'club' },
    ]);
  });
});
