import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { JudgeAssignmentError, resolveJudgeAssignment } from '../server/services/judgeAssignmentService.ts';
import { canHostEveningFormat, hostFormatsOf, legacyJudgeLevelFor } from '../lib/hostFormats.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('«Может вести» marks', () => {
  it('keeps what existing players could do when no marks are stored', () => {
    expect(hostFormatsOf({ judge_level: 'trainee' })).toEqual(['NOVICE']);
    expect(hostFormatsOf({ judge_level: 'host' })).toEqual(['NOVICE', 'CASUAL']);
    expect(hostFormatsOf({ judge_level: 'judge' })).toEqual(['NOVICE', 'CASUAL', 'RATING']);
    expect(hostFormatsOf({ judge_level: 'none' })).toEqual([]);
  });

  it('uses stored marks as independent permissions, not a ladder', () => {
    const casualOnly = { judge_level: 'host', host_formats: 'CASUAL' };
    expect(canHostEveningFormat(casualOnly, 'CASUAL')).toBe(true);
    expect(canHostEveningFormat(casualOnly, 'NOVICE')).toBe(false);
    const noviceAndRating = { judge_level: 'judge', host_formats: 'NOVICE,RATING' };
    expect(canHostEveningFormat(noviceAndRating, 'TOURNAMENT')).toBe(true);
    expect(canHostEveningFormat(noviceAndRating, 'CASUAL')).toBe(false);
    expect(hostFormatsOf({ judge_level: 'judge', host_formats: '' })).toEqual([]);
  });

  it('writes the judge level summary other rules rely on', () => {
    expect(legacyJudgeLevelFor(['NOVICE'])).toBe('trainee');
    expect(legacyJudgeLevelFor(['CASUAL'])).toBe('host');
    expect(legacyJudgeLevelFor(['NOVICE', 'RATING'])).toBe('judge');
    expect(legacyJudgeLevelFor([])).toBe('none');
  });

  it('saves the marks from the player card and checks them when a judge is assigned', async () => {
    const db = createDatabaseConnection(':memory:');
    opened.push(db);
    const app = await createApp(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO players (id,nickname,telegram_user_id,lifecycle_status,source,game_level,club_role,judge_level,created_at,updated_at)
      VALUES ('host-1','Ведущая','h1-tg','normal','crm_manual','club','member','none',?,?)`, [now, now]);
    const cookie = `organizer_token=${generateOrganizerToken()}`;

    const saved = await request(app).patch('/api/players/host-1').set('Cookie', cookie).send({ host_formats: ['NOVICE'] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(await db.get<any>("SELECT host_formats, judge_level FROM players WHERE id='host-1'")).toEqual({ host_formats: 'NOVICE', judge_level: 'trainee' });

    await expect(resolveJudgeAssignment(db, { judge_player_id: 'host-1', required_format: 'NOVICE' })).resolves.toMatchObject({ judge_player_id: 'host-1' });
    await expect(resolveJudgeAssignment(db, { judge_player_id: 'host-1', required_format: 'CASUAL' })).rejects.toBeInstanceOf(JudgeAssignmentError);

    const bulk = await request(app).post('/api/players/access/bulk').set('Cookie', cookie)
      .send({ player_ids: ['host-1'], host_formats_add: ['CASUAL'], host_formats_remove: ['NOVICE'] });
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(200);
    expect(await db.get<any>("SELECT host_formats, judge_level FROM players WHERE id='host-1'")).toEqual({ host_formats: 'CASUAL', judge_level: 'host' });
    await expect(resolveJudgeAssignment(db, { judge_player_id: 'host-1', required_format: 'NOVICE' })).rejects.toBeInstanceOf(JudgeAssignmentError);

    const legacy = await request(app).patch('/api/players/host-1').set('Cookie', cookie).send({ judge_level: 'judge' });
    expect(legacy.status).toBe(200);
    expect(await db.get<any>("SELECT host_formats, judge_level FROM players WHERE id='host-1'")).toEqual({ host_formats: null, judge_level: 'judge' });
  });
});
