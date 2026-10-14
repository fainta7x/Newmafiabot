import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureInviteAudienceSchema } from '../db/ensureInviteAudienceSchema.ts';
import { ensureVkIntegrationSchema } from '../db/ensureVkIntegrationSchema.ts';
import { ensureNoviceSystemSchema } from '../db/ensureNoviceSystemSchema.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { runCrmAutomations } from '../server/services/crmAutomationService.ts';
import { listPlayersAwaitingFirstDecision, syncPlayersWithOrganizerLevel } from '../server/services/noviceService.ts';
import { isNoviceLevel } from '../lib/noviceRule.ts';

let db: DatabaseWrapper;
const stamp = '2026-10-01T12:00:00.000Z';

beforeEach(async () => {
  db = createDatabaseConnection(':memory:');
  await ensureInviteAudienceSchema(db);
  await ensureNoviceSystemSchema(db);
  await ensureVkIntegrationSchema(db);
  await db.run("INSERT INTO game_evenings (id,title,starts_at,status,created_at,updated_at) VALUES ('e1','Вечер','2026-10-02T18:00:00Z','completed',?,?)", [stamp, stamp]);
  for (const [id, level] of [['nov', 'novice'], ['club', 'club'], ['tour', 'tournament']]) {
    await db.run("INSERT INTO players (id,nickname,telegram_user_id,game_level,club_stage,tokens,created_at,updated_at) VALUES (?,?,?,?, 'NEW',0,?,?)", [id, `Ник ${id}`, `tg-${id}`, level, stamp, stamp]);
    await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,created_at,updated_at) VALUES (?,?,?,'going','going','attended',?,?)", [`ep-${id}`, 'e1', id, stamp, stamp]);
  }
});
afterEach(() => { try { db.sqlite.close(); } catch {} });

const openTasks = async (prefix: string) => (await db.all<any>("SELECT player_id FROM organizer_tasks WHERE automation_key LIKE ? AND status NOT IN ('done','cancelled') ORDER BY player_id", [`${prefix}%`])).map((row) => row.player_id);

describe('one rule for «новичок»: the organizer\'s level, not the number of visits', () => {
  it('asks only novices about their first game', async () => {
    await runCrmAutomations(db, new Date('2026-10-03T10:00:00Z'));
    expect(await openTasks('feedback-first-visit:')).toEqual(['nov']);
  });

  it('cancels a feedback task and closes the onboarding task of a player later set to club or tournament level', async () => {
    await db.run("UPDATE players SET game_level = 'novice' WHERE id IN ('club','tour')");
    await runCrmAutomations(db, new Date('2026-10-03T10:00:00Z'));
    for (const id of ['club', 'tour']) {
      await db.run("INSERT INTO organizer_tasks (id,title,type,status,priority,automation_key,player_id,created_at,updated_at) VALUES (?,?,'other','todo','medium',?,?,?,?)", [`ob-${id}`, 'Определить игровой уровень', `verified-onboarding:new-player:${id}`, id, stamp, stamp]);
    }
    expect((await openTasks('feedback-first-visit:')).sort()).toEqual(['club', 'nov', 'tour']);
    await db.run("UPDATE players SET game_level = 'club' WHERE id = 'club'");
    await db.run("UPDATE players SET game_level = 'tournament' WHERE id = 'tour'");
    await runCrmAutomations(db, new Date('2026-10-03T11:00:00Z'));
    expect(await openTasks('feedback-first-visit:')).toEqual(['nov']);
    expect(await openTasks('verified-onboarding:')).toEqual([]);
  });

  it('does not list a club or tournament player as «waiting for the first decision»', async () => {
    const waiting = (await listPlayersAwaitingFirstDecision(db)).map((row: any) => row.id);
    expect(waiting).toEqual(['nov']);
  });

  it('moves the stage to club player when the organizer sets the level', async () => {
    await db.run("UPDATE players SET game_level = 'club' WHERE id = 'nov'");
    await syncPlayersWithOrganizerLevel(db, ['nov', 'tour']);
    expect((await db.all<any>("SELECT id, club_stage FROM players WHERE id IN ('nov','tour') ORDER BY id")).map((row) => row.club_stage)).toEqual(['CLUB_PLAYER', 'CLUB_PLAYER']);
  });

  it('the «Новички» filter of the players list follows the level', async () => {
    const app = await createApp(db);
    const cookie = `organizer_token=${generateOrganizerToken()}`;
    const response = await request(app).get('/api/players').query({ novice_level: 'true' }).set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.map((player: any) => player.id)).toContain('nov');
    expect(response.body.map((player: any) => player.id)).not.toContain('club');
    expect(isNoviceLevel('unrated')).toBe(true);
    expect(isNoviceLevel('club')).toBe(false);
  });
});
