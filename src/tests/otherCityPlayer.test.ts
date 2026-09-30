import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { loadInitialAnnouncementRecipients } from '../server/services/eveningAnnouncementTrackingService.ts';
import { createNoviceApplication, updateNoviceApplicationStatus } from '../server/services/noviceService.ts';
import { ensureNoviceSystemSchema } from '../db/ensureNoviceSystemSchema.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const stamp = new Date().toISOString();
  const player = (id: string, extra: Record<string, unknown> = {}) => db.run(
    `INSERT INTO players (id,nickname,telegram_user_id,game_level,club_role,host_formats,organize_formats,from_other_city,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, `Игрок ${id}`, `tg-${id}`, extra.level ?? 'tournament', extra.role ?? 'member', extra.host ?? null, extra.organize ?? null, extra.otherCity ?? 0, stamp, stamp]);
  const evening = (id: string, format: string) => db.run(
    `INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
     VALUES (?,?,?,'Europe/Moscow',?,'published',20,100,?,?)`,
    [id, `Вечер ${id}`, new Date(Date.now() + 3 * 86_400_000).toISOString(), format, stamp, stamp]);
  return { db, app, player, evening };
}

describe('«Из другого города»', () => {
  it('keeps only the level and rating judging when a player is marked from another city', async () => {
    const { db, app, player } = await setup();
    await player('guest', { role: 'team', host: 'NOVICE,CASUAL,RATING', organize: 'CASUAL' });
    const response = await request(app).post('/api/players/access/bulk')
      .set('Cookie', `organizer_token=${generateOrganizerToken()}`)
      .send({ player_ids: ['guest'], activity: 'other_city' });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const row = await db.get<any>('SELECT club_role, host_formats, organize_formats, from_other_city FROM players WHERE id = ?', ['guest']);
    expect(row).toMatchObject({ club_role: 'guest', host_formats: 'RATING', organize_formats: null, from_other_city: 1 });

    const role = await request(app).post('/api/players/access/bulk')
      .set('Cookie', `organizer_token=${generateOrganizerToken()}`)
      .send({ player_ids: ['guest'], organization: 'team' });
    expect(role.body.warnings?.[0]).toContain('роль в клубе не ставится');
    expect((await db.get<any>('SELECT club_role FROM players WHERE id = ?', ['guest'])).club_role).toBe('guest');

    await request(app).post('/api/players/access/bulk')
      .set('Cookie', `organizer_token=${generateOrganizerToken()}`)
      .send({ player_ids: ['guest'], activity: 'regular' });
    expect((await db.get<any>('SELECT from_other_city FROM players WHERE id = ?', ['guest'])).from_other_city).toBe(0);
  });

  it('gets personal announcements only for rating evenings and tournaments', async () => {
    const { db, player, evening } = await setup();
    await player('guest', { otherCity: 1 });
    await player('local');
    await evening('club', 'CASUAL');
    await evening('rating', 'RATING');
    const ids = async (eveningId: string) => (await loadInitialAnnouncementRecipients(db, eveningId))!.recipients.map((item: any) => item.id).sort();
    expect(await ids('club')).toEqual(['local']);
    expect(await ids('rating')).toEqual(['guest', 'local']);
  });

  it('«Я гость из другого города» at registration marks the player once the organizer confirms', async () => {
    const { db, player } = await setup();
    await ensureNoviceSystemSchema(db);
    await player('newcomer', { level: 'novice' });
    const application = await createNoviceApplication(db, { playerId: 'newcomer', entryRoute: 'OTHER_CITY', notifyOrganizer: false });
    expect((await db.get<any>('SELECT from_other_city FROM players WHERE id = ?', ['newcomer'])).from_other_city).toBe(0);
    await updateNoviceApplicationStatus(db, application.id, 'CONFIRMED');
    const row = await db.get<any>('SELECT game_level, club_stage, from_other_city FROM players WHERE id = ?', ['newcomer']);
    expect(row).toMatchObject({ game_level: 'club', club_stage: 'CLUB_PLAYER', from_other_city: 1 });
  });
});
