import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
const organizerCookie = () => `organizer_token=${generateOrganizerToken()}`;
import { createGuestPlaceholder, updateGuestPlaceholder } from '../server/services/guestPlayerService.ts';
import { loadEveningSlotPlan } from '../server/services/eveningSlotPlanningService.ts';
import { loadEveningRecruitmentState } from '../server/services/eveningRecruitmentService.ts';
import { loadEveningRoute } from '../server/services/eveningRouteService.ts';
import { loadEveningShortfall } from '../server/services/eveningShortfallService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('owner evening tracker rows 3, 5 and 6', () => {
  it.each([['NOVICE', 9], ['CASUAL', 11]] as const)('counts people with guests once and gathers %s at %i including judge', async (format, minimum) => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('ev','Вечер','2099-10-16T18:00:00Z','Europe/Moscow',?,'published',20,100,?,?)`, [format, now, now]);
    for (let i = 0; i < minimum - 3; i++) {
      await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [`p${i}`, `Игрок ${i}`, now, now]);
      await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,created_at,updated_at)
        VALUES (?,'ev',?,'going','going',?,?)`, [`ep${i}`, `p${i}`, now, now]);
    }
    // Also covers the legacy whole-evening fallback: no exact registrations yet.
    const guest = await createGuestPlaceholder(db, { eveningId: 'ev', displayName: 'Гость', responseStatus: 'going', plusCount: 1 });
    const short = await loadEveningSlotPlan(db, 'ev');
    expect(short.event.required_players_per_slot).toBe(minimum);
    expect(short.event.assembled).toBe(false);
    expect(short.slots.every((slot) => slot.registered_count === minimum - 1 && slot.target_players === minimum)).toBe(true);

    await createGuestPlaceholder(db, { eveningId: 'ev', displayName: 'Ещё гость', responseStatus: 'going' });
    const full = await loadEveningSlotPlan(db, 'ev');
    expect(full.event.assembled).toBe(true);
    expect((await loadEveningRecruitmentState(db, 'ev'))).toMatchObject({ confirmed_players: minimum, all_slots_ready: true });
    expect(await loadEveningShortfall(db, 'ev')).toMatchObject({ minimum: minimum - 1, confirmed: minimum, short: false });

    const route = await loadEveningRoute(db, 'ev');
    const prepare = route.stages.find((stage) => stage.id === 'prepare')!;
    expect(prepare.steps.find((step) => step.id === 'timing')?.status).toBe('done');
    expect(route.stages.find((stage) => stage.id === 'gather')?.steps.find((step) => step.id === 'answers')?.detail).toContain(`Идут: ${minimum}`);
    const listed = await request(app).get('/api/evenings').set('Cookie', organizerCookie());
    expect(listed.status).toBe(200);
    expect(listed.body.find((evening: any) => evening.id === 'ev')).toMatchObject({ registered_count: minimum, guests_count: 3 });

    // The guest and companion stop occupying places when the host declines.
    await updateGuestPlaceholder(db, guest.id, { response_status: 'declined' });
    expect((await loadEveningRecruitmentState(db, 'ev'))?.confirmed_players).toBe(minimum - 2);
    expect((await loadEveningSlotPlan(db, 'ev')).slots.every((slot) => slot.registered_count === minimum - 2)).toBe(true);
    await db.run("UPDATE game_evenings SET starts_at='not-a-date' WHERE id='ev'");
    expect((await loadEveningRoute(db, 'ev')).stages.find((stage) => stage.id === 'prepare')?.steps.find((step) => step.id === 'timing')?.status).toBe('attention');
  });
});
