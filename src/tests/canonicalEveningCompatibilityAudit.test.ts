import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureCanonicalEveningParticipantState } from '../db/ensureCanonicalEveningParticipantState.ts';
import { getEveningResponse } from '../lib/eveningResponse.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';

describe('canonical evening compatibility audit', () => {
  let db: DatabaseWrapper;
  const now = '2026-08-28T12:00:00.000Z';

  beforeEach(() => { db = createDatabaseConnection(':memory:'); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('reads the meaningful legacy answer when a pre-cutover default masks it', () => {
    expect(getEveningResponse({ response_status: 'unanswered', registration_status: 'confirmed', arrival_status: 'unknown' })).toBe('going');
    expect(getEveningResponse({ response_status: 'unanswered', registration_status: 'waitlist', arrival_status: 'late' })).toBe('late');
    expect(getEveningResponse({ response_status: 'declined', registration_status: 'confirmed', arrival_status: 'unknown' })).toBe('declined');
  });

  it('backfills mismatched rows without changing already-canonical answers', async () => {
    await db.run(`INSERT INTO players (id,nickname,lifecycle_status,created_at,updated_at) VALUES ('p1','Один','normal',?,?),('p2','Два','normal',?,?)`, [now, now, now, now]);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,status,created_at,updated_at) VALUES ('e1','Вечер',?,'published',?,?)`, [now, now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES ('ep1','e1','p1','unanswered','confirmed','pending','unknown','unpaid',100,0,?,?),('ep2','e1','p2','declined','confirmed','pending','unknown','unpaid',100,0,?,?)`, [now, now, now, now]);

    await ensureCanonicalEveningParticipantState(db);

    expect(await db.get(`SELECT response_status,registration_status FROM evening_participants WHERE id='ep1'`)).toMatchObject({ response_status: 'going', registration_status: 'going' });
    expect(await db.get(`SELECT response_status,registration_status FROM evening_participants WHERE id='ep2'`)).toMatchObject({ response_status: 'declined', registration_status: 'confirmed' });
  });

  it('shows a legacy confirmed evening in the current player payment API', async () => {
    await db.run(`INSERT INTO players (id,nickname,lifecycle_status,created_at,updated_at) VALUES ('pay-player','Плательщик','normal',?,?)`, [now, now]);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,status,created_at,updated_at) VALUES ('pay-evening','Вечер оплаты',?,'published',?,?)`, [now, now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES ('pay-participant','pay-evening','pay-player','unanswered','confirmed','pending','unknown','unpaid',100,0,?,?)`, [now, now]);

    const app = await createApp(db);
    const response = await request(app)
      .get('/api/player/payments')
      .set('Cookie', `player_token=${generatePlayerSessionToken('pay-player')}`);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.current).toEqual(expect.arrayContaining([
      expect.objectContaining({ participant_id: 'pay-participant', payment_expected: true, outstanding: 100 }),
    ]));
  });

  it('keeps active RSVP consumers on the canonical adapter', () => {
    const guardedFiles = [
      'src/server/services/eveningRecruitmentService.ts',
      'src/server/services/eveningAnnouncementTrackingService.ts',
      'src/server/services/eveningCloseoutService.ts',
      'src/server/routes/playerPaymentRoutes.ts',
      'src/server/routes/playerJudgingRoutes.ts',
      'src/server/routes/playerSelfCoreRoutes.ts',
      'src/server/routes/playerEveningJourneyRoutes.ts',
      'src/server/routes/gamesRoutes.ts',
      'src/server/services/vkJoinStateGetRouter.ts',
      'src/server/services/vkJoinIdentityService.ts',
      'src/components/crm/EveningCloseoutPanel.tsx',
      'src/components/crm/EveningGameRegistrationDashboard.tsx',
      'src/components/crm/EveningPersonalInvites.tsx',
    ];
    for (const file of guardedFiles) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/response_status\s*\|\|\s*[^\n]*registration_status/);
      if (file.startsWith('src/server/')) {
        expect(source, file).not.toMatch(/(?:String\()?[^\n]*\.response_status\s*\|\|\s*['"]unanswered['"]/);
      }
    }
    expect(fs.readFileSync('src/lib/api.ts', 'utf8')).toContain('response_status: responseStatus');
  });
});
