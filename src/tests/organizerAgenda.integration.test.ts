import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { loadAgenda } from '../server/services/organizerAgendaService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const stamp = new Date().toISOString();
  const player = (id: string, extra: Record<string, unknown> = {}) => db.run(
    `INSERT INTO players (id,nickname,telegram_user_id,telegram_username,full_name,birth_day,birth_month,game_level,club_role,attends_sometimes,stopped_attending,from_other_city,contact_status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,'club',?,?,?,?,?,?,?)`,
    [id, `Игрок ${id}`, `tg-${id}`, extra.username ?? `user_${id}`, extra.fullName ?? 'Имя Фамилия', 1, 1,
      extra.role ?? 'member', extra.sometimes ?? 0, extra.stopped ?? 0, extra.otherCity ?? 0, extra.contact ?? 'normal', stamp, stamp]);
  let evenings = 0;
  const attended = async (playerId: string, daysAgo: number) => {
    const id = `e${++evenings}`;
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
      VALUES (?,?,?,'Europe/Moscow','CASUAL','completed',20,100,?,?,?)`, [id, `Вечер ${id}`, ago(daysAgo), ago(daysAgo), stamp, stamp]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,attendance_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES (?,?,?,'going','attended','paid',0,0,?,?)`, [`${id}:${playerId}`, id, playerId, stamp, stamp]);
  };
  const people = async (itemId: string) => {
    const agenda = await loadAgenda(db);
    return (agenda.items.find((item) => item.id === itemId)?.people || []).map((person) => person.player_id).sort();
  };
  return { db, app, player, attended, people, cookie: `organizer_token=${generateOrganizerToken()}` };
}

describe('«Дела»', () => {
  it('lists who has been away by the owner thresholds', async () => {
    const { player, attended, people } = await setup();
    await player('regular'); await attended('regular', 20);
    await player('fresh'); await attended('fresh', 7);
    await player('sometimes-20', { sometimes: 1 }); await attended('sometimes-20', 20);
    await player('sometimes-35', { sometimes: 1 }); await attended('sometimes-35', 35);
    await player('helper-sometimes', { role: 'team', sometimes: 1 }); await attended('helper-sometimes', 35);
    await player('stopped', { stopped: 1, contact: 'paused' }); await attended('stopped', 100);
    await player('guest', { otherCity: 1 }); await attended('guest', 60);
    expect(await people('people:absent_regular')).toEqual(['regular']);
    expect(await people('people:absent_sometimes')).toEqual(['helper-sometimes', 'sometimes-35']);
    expect(await people('people:stopped')).toEqual(['stopped']);
  });

  it('counts a seat at a game table as a visit when nobody marked «пришёл» (owner, 2026-09-30)', async () => {
    const { db, app, player, people, cookie } = await setup();
    await player('seated'); await player('by-participant'); await player('never');
    const stamp = new Date().toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('old-open','Незакрытый вечер',?,'Europe/Moscow','CASUAL','active',20,100,?,?)`, [ago(20), stamp, stamp]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,attendance_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('ep-by','old-open','by-participant','going','pending','pending',0,0,?,?)`, [stamp, stamp]);
    await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,slots_json,created_at)
      VALUES ('old-open',1,?,'red','Победа красных','Судья',?,?)`,
      [ago(20), JSON.stringify([{ slot_num: 1, player_id: 'seated', participant_id: null }, { slot_num: 2, participant_id: 'ep-by' }]), stamp]);
    expect(await people('people:absent_regular')).toEqual(['by-participant', 'seated']);
    const list = await request(app).get('/api/players').set('Cookie', cookie);
    const seated = list.body.find((row: any) => row.id === 'seated');
    expect(seated.attendance_count).toBe(1);
    expect(seated.days_since_last_visit).toBe(20);
    expect(list.body.find((row: any) => row.id === 'never').attendance_count).toBe(0);
    await db.run("UPDATE players SET lifecycle_status = 'archived' WHERE id = 'by-participant'");
    const agenda = await loadAgenda(db);
    // Archived players are not checked, so their visits are not counted either.
    expect(agenda.checked?.players_with_visits).toBe(1);
    expect(agenda.errors).toEqual([]);
  });

  it('«Написал» takes the person off the list, and «Отложить» the whole item', async () => {
    const { app, player, attended, people, cookie } = await setup();
    await player('a'); await attended('a', 20);
    await player('b'); await attended('b', 25);
    expect(await people('people:absent_regular')).toEqual(['a', 'b']);
    const contacted = await request(app).post('/api/crm/agenda/contacted').set('Cookie', cookie).send({ player_id: 'a', reason: 'absent_regular' });
    expect(contacted.status, JSON.stringify(contacted.body)).toBe(200);
    expect(await people('people:absent_regular')).toEqual(['b']);
    const snoozed = await request(app).post('/api/crm/agenda/snooze').set('Cookie', cookie).send({ item_id: 'people:absent_regular', days: 7 });
    expect(snoozed.status, JSON.stringify(snoozed.body)).toBe(200);
    const agenda = await request(app).get('/api/crm/agenda').set('Cookie', cookie);
    expect(agenda.body.items.map((item: any) => item.id)).not.toContain('people:absent_regular');
    expect(agenda.body.snoozed).toBe(1);
  });

  it('groups profile gaps into one item and replaces the old per-field tasks', async () => {
    const { db, player, attended, people } = await setup();
    await player('empty', { fullName: '' }); await attended('empty', 3);
    await player('full'); await attended('full', 3);
    const stamp = new Date().toISOString();
    await db.run(`INSERT INTO organizer_tasks (id,title,type,status,priority,automation_key,player_id,created_at,updated_at)
      VALUES ('old','Профиль: фото — Игрок empty','reminder','todo','medium','profile-missing:empty:avatar','empty',?,?)`, [stamp, stamp]);
    const agenda = await loadAgenda(db);
    expect(await people('people:profile')).toContain('empty');
    expect(agenda.items.find((item) => item.id === 'people:profile')?.people?.find((person) => person.player_id === 'empty')?.detail).toContain('имя и фамилия');
    expect((await db.get<any>("SELECT status FROM organizer_tasks WHERE id = 'old'")).status).toBe('cancelled');
    expect(agenda.items.some((item) => item.id === 'task:old')).toBe(false);
  });

  it('puts a past unclosed evening under «Сейчас» once and hides far-away Fridays', async () => {
    const { db } = await setup();
    const stamp = new Date().toISOString();
    for (const [id, startsAt] of [['past', ago(1)], ['future', new Date(Date.now() + 20 * DAY).toISOString()]] as const) {
      await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
        VALUES (?,?,?,'Europe/Moscow','CASUAL','published',20,100,?,?)`, [id, `Вечер ${id}`, startsAt, stamp, stamp]);
    }
    const agenda = await loadAgenda(db);
    const evenings = agenda.items.filter((item) => item.id.includes('past') || item.id.includes('future'));
    expect(evenings.map((item) => [item.id, item.group])).toEqual([['check:unclosed:past', 'now']]);
    expect(agenda.items[0].group).toBe('now');
  });
});
