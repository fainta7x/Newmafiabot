import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generateOrganizerToken } from '../server/auth';

const opened: DatabaseWrapper[] = [];
const previousFlag = process.env.WEEKLY_EVENING_AUTOMATION_ENABLED;
afterEach(() => {
  while (opened.length) opened.pop()?.sqlite.close();
  if (previousFlag === undefined) delete process.env.WEEKLY_EVENING_AUTOMATION_ENABLED;
  else process.env.WEEKLY_EVENING_AUTOMATION_ENABLED = previousFlag;
});

async function overview() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Пятница','2026-10-02T16:00:00.000Z','Europe/Moscow','CASUAL','published',20,100,?,?)`, [now, now]);
  return request(app).get('/api/evenings/ev/announcement-overview').set({ Cookie: `organizer_token=${generateOrganizerToken()}` });
}

describe('evening publishing pause', () => {
  it('tells the organizer that invitations are held while publishing is paused', async () => {
    process.env.WEEKLY_EVENING_AUTOMATION_ENABLED = 'false';
    const paused = await overview();
    expect(paused.status).toBe(200);
    expect(paused.body.publishing_paused).toBe(true);

    process.env.WEEKLY_EVENING_AUTOMATION_ENABLED = 'true';
    const running = await overview();
    expect(running.body.publishing_paused).toBe(false);
  });
});
