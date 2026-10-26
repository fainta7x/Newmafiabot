import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { ensureSlotsForEvening } from '../server/services/eveningSlotPlanningService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.sqlite.close(); });
describe('Home personal participation projection', () => {
  it('keeps the original reservation and own game selection separate from the legacy response alias', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const stamp = new Date().toISOString();
    const future = new Date(Date.now() + 7 * 86400000).toISOString();
    for (const id of ['self', 'other']) await db.run('INSERT INTO players (id,nickname,game_level,created_at,updated_at) VALUES (?,?,?,?,?)', [id,id,'club',stamp,stamp]);
    for (const id of ['booked', 'invite']) await db.run('INSERT INTO game_evenings (id,title,starts_at,format,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [id,id,future,'CASUAL','published',stamp,stamp]);
    await ensureSlotsForEvening(db, 'booked');
    await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,created_at,updated_at) VALUES ('mine','booked','self','late','waitlist',?,?)", [stamp,stamp]);
    await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,created_at,updated_at) VALUES ('theirs','booked','other','going','confirmed',?,?)", [stamp,stamp]);
    // Explicit, different plans; never infer the viewer's games from another attendee.
    await db.run("DELETE FROM evening_slot_registrations WHERE participant_id IN ('mine','theirs')");
    const slots = await db.all<any>("SELECT id,slot_number FROM evening_game_slots WHERE evening_id='booked' ORDER BY slot_number");
    for (const [participant, numbers] of [['mine', [1,3]], ['theirs', [2]]] as const) for (const number of numbers) {
      await db.run('INSERT INTO evening_slot_registrations (id,slot_id,participant_id,created_at,updated_at) VALUES (?,?,?,?,?)', [`${participant}-${number}`, slots.find((s:any) => s.slot_number === number).id, participant, stamp, stamp]);
    }
    const before = await db.get<any>("SELECT COUNT(*) AS n FROM evening_slot_registrations");
    const result = await request(app).get('/api/player/evenings').set('Cookie', `player_token=${generatePlayerSessionToken('self')}`);
    expect(result.status).toBe(200);
    const booked = result.body.evenings.find((e:any) => e.id === 'booked');
    expect(booked.registration_status).toBe('late'); // existing API consumers retain their contract
    expect(booked.participation).toMatchObject({ response_status:'late', registration_status:'waitlist', slot_numbers:[1,3] });
    expect(result.body.evenings.find((e:any) => e.id === 'invite').participation).toBeNull();
    expect(await db.get("SELECT COUNT(*) AS n FROM evening_slot_registrations")).toEqual(before);
    expect((await request(app).get('/api/player/evenings')).status).toBe(401);
  });
});
