import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import {
  bindSantaEvening, cancelSantaEvent, createSantaEvent, drawSanta, joinSanta, leaveSanta, loadSantaForOrganizer, loadSantaForPlayer,
  queueSantaReminders, runSecretSanta,
} from '../server/services/secretSantaService.ts';
import { santaAnnouncementText, santaCircle, santaResultText, shmurdyakFor } from '../shared/secretSanta.ts';

// «Тайный Санта» (owner, 2026-11-17): gifts up to 1000 ₽; first only the registration in the app (the player confirms
// himself), then the organizer binds the exchange evening and starts the draw among those who joined; a «Новости» post at
// once and the result in a personal message; reminders on the result, every Monday and 24 hours before the evening.
// «Подарок шмурдяку»: each santa also gets one person with «Иду» on that evening who is not in Santa.
const t0 = new Date('2026-12-01T10:00:00Z'); // Tuesday 13:00 Moscow
const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const lcg = (seed: number) => { let x = seed + 1; return (n: number) => { x = (x * 48271) % 2147483647; return x % n; }; };
describe('secret santa', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    for (const id of names) await db.run("INSERT INTO players(id,nickname,tokens,telegram_user_id,created_at,updated_at) VALUES (?,?,0,?,'x','x')", [id, id.toUpperCase(), `tg-${id}`]);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('ev','Новогодний вечер','2026-12-20T16:00:00Z','Europe/Moscow','CASUAL','published',20,0,'x','x')`);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('old','Прошлый','2026-11-20T16:00:00Z','Europe/Moscow','CASUAL','completed',20,0,'x','x')`);
  });
  afterEach(() => { vi.unstubAllEnvs(); db.sqlite.close(); });
  const going = async (playerId: string, response = 'going') => db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,created_at,updated_at) VALUES (?,?,?,?,'x','x')`, [`ep-${playerId}`, 'ev', playerId, response]);
  const openWith = async (players: string[]) => {
    const { event } = await createSantaEvent(db, t0);
    for (const id of players) await joinSanta(db, id, { confirm: true }, t0);
    return event!.id;
  };

  it('one circle through everyone: nobody draws himself, no two draw each other, everyone gives and gets once', () => {
    for (let seed = 0; seed < 50; seed++) {
      const ids = names.slice(0, 3 + (seed % 5));
      const pairs = santaCircle(ids, lcg(seed));
      expect(pairs.map((p) => p.giver).sort()).toEqual([...ids].sort());
      expect(pairs.map((p) => p.receiver).sort()).toEqual([...ids].sort());
      for (const pair of pairs) {
        expect(pair.giver).not.toBe(pair.receiver);
        expect(pairs.some((other) => other.giver === pair.receiver && other.receiver === pair.giver)).toBe(false);
      }
    }
  });

  it('шмурдяки are handed out in turn: every santa gets one, nobody gets two more than another', () => {
    const map = shmurdyakFor(['a', 'b', 'c', 'd', 'e'], ['x', 'y'], lcg(3));
    expect([...map.keys()].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    const counts = [...map.values()].reduce((acc, id) => acc.set(id, (acc.get(id) || 0) + 1), new Map<string, number>());
    expect([...counts.values()].sort()).toEqual([2, 3]);
    expect(shmurdyakFor(['a'], [], lcg(1)).size).toBe(0);
  });

  it('opens without an evening; the evening is bound in the settings before the draw; only one at a time; cancel before the draw', async () => {
    const created = await createSantaEvent(db, t0);
    expect(created.event).toMatchObject({ status: 'open', gift_limit: 1000, evening: null, posted: false });
    expect((await loadSantaForPlayer(db, 'a', t0)).event).toMatchObject({ evening: null, status: 'open' });
    await expect(createSantaEvent(db, t0)).rejects.toThrow('уже идёт');
    await expect(bindSantaEvening(db, created.event!.id, { evening_id: 'old' }, t0)).rejects.toThrow('будущий вечер');
    const bound = await bindSantaEvening(db, created.event!.id, { evening_id: 'ev' }, t0);
    expect(bound.event?.evening).toMatchObject({ id: 'ev', title: 'Новогодний вечер' });
    await cancelSantaEvent(db, created.event!.id, t0);
    expect((await loadSantaForPlayer(db, 'a', t0)).event).toBeNull();
    await createSantaEvent(db, t0);
  });

  it('a player joins only with the promise ticked and may leave before the draw', async () => {
    await createSantaEvent(db, t0);
    await expect(joinSanta(db, 'a', {}, t0)).rejects.toThrow('Подтвердите');
    const joined = await joinSanta(db, 'a', { confirm: true }, t0);
    expect(joined.event).toMatchObject({ joined: true, participants: [{ id: 'a', nickname: 'A' }], recipient: null });
    expect((await leaveSanta(db, 'a', t0)).event).toMatchObject({ joined: false, participants: [] });
  });

  it('the draw: the evening first, at least 3, only those who joined, a шмурдяк from «Иду» outside Santa, a personal message', async () => {
    const id = await openWith(['a', 'b']);
    await going('e'); await going('f', 'late'); await going('g', 'declined'); await going('a');
    await expect(drawSanta(db, id, t0)).rejects.toThrow('привяжите вечер');
    await bindSantaEvening(db, id, { evening_id: 'ev' }, t0);
    await expect(drawSanta(db, id, t0)).rejects.toThrow('хотя бы 3');
    for (const player of ['c', 'd']) await joinSanta(db, player, { confirm: true }, t0);
    expect((await loadSantaForOrganizer(db, t0)).event?.shmurdyak_pool.map((p) => p.id)).toEqual(['e', 'f']);
    const drawn = await drawSanta(db, id, t0);
    expect(drawn.event?.status).toBe('drawn');
    expect(JSON.stringify(drawn)).not.toMatch(/receiver|recipient/);
    expect(drawn.event?.participants.map((p) => p.message)).toEqual(['queued', 'queued', 'queued', 'queued']);

    const seen = new Map<string, string>();
    for (const player of ['a', 'b', 'c', 'd']) {
      const state = (await loadSantaForPlayer(db, player, t0)).event!;
      expect(state.recipient!.id).not.toBe(player);
      expect(['a', 'b', 'c', 'd']).toContain(state.recipient!.id);
      expect(['e', 'f']).toContain(state.shmurdyak!.id);
      seen.set(player, state.recipient!.id);
    }
    expect(new Set(seen.values()).size).toBe(4);
    expect((await loadSantaForPlayer(db, 'e', t0)).event).toMatchObject({ joined: false, recipient: null, shmurdyak: null, status: 'drawn' });

    const messages = await db.all<{ player_id: string; text: string }>("SELECT player_id, text FROM personal_notification_deliveries WHERE event_type = 'secret_santa' ORDER BY player_id");
    expect(messages.map((m) => m.player_id)).toEqual(['a', 'b', 'c', 'd']);
    const forA = (await loadSantaForPlayer(db, 'a', t0)).event!;
    expect(messages[0].text).toBe(santaResultText(forA.recipient!.nickname, forA.shmurdyak!.nickname, forA.evening!));
    expect(messages[0].text).toContain('Подарок шмурдяку');

    await expect(joinSanta(db, 'e', { confirm: true }, t0)).rejects.toThrow('Запись закрыта');
    await expect(leaveSanta(db, 'a', t0)).rejects.toThrow('После жеребьёвки');
    await expect(bindSantaEvening(db, id, { evening_id: 'ev' }, t0)).rejects.toThrow('не меняется');
    await expect(drawSanta(db, id, t0)).rejects.toThrow('уже проведена');
    await expect(cancelSantaEvent(db, id, t0)).rejects.toThrow('отменить нельзя');
  });

  it('nobody with «Иду» outside Santa: no шмурдяк, the message has no such line', async () => {
    const id = await openWith(['a', 'b', 'c']);
    await bindSantaEvening(db, id, { evening_id: 'ev' }, t0);
    await drawSanta(db, id, t0);
    expect((await loadSantaForPlayer(db, 'a', t0)).event?.shmurdyak).toBeNull();
    const text = (await db.get<{ text: string }>("SELECT text FROM personal_notification_deliveries WHERE player_id = 'a'"))!.text;
    expect(text).not.toContain('шмурдяк');
  });

  it('reminders: every Monday from 12:00 Moscow (not on the day of the draw) and 24 hours before, each once', async () => {
    const id = await openWith(['a', 'b', 'c']);
    await going('e');
    await bindSantaEvening(db, id, { evening_id: 'ev' }, t0);
    await drawSanta(db, id, new Date('2026-12-07T08:00:00Z')); // Monday 11:00 Moscow
    const count = async (kind: string) => Number((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM personal_notification_deliveries WHERE notification_key LIKE ?`, [`santa:${id}:${kind}%`]))!.n);
    expect(await queueSantaReminders(db, new Date('2026-12-07T10:00:00Z'))).toBe(0); // the day of the draw
    expect(await queueSantaReminders(db, new Date('2026-12-14T08:59:00Z'))).toBe(0); // Monday 11:59
    expect(await queueSantaReminders(db, new Date('2026-12-14T09:00:00Z'))).toBe(3); // Monday 12:00
    expect(await queueSantaReminders(db, new Date('2026-12-14T15:00:00Z'))).toBe(0);
    expect(await count('monday:2026-12-14')).toBe(3);
    expect(await queueSantaReminders(db, new Date('2026-12-16T09:00:00Z'))).toBe(0); // Wednesday
    expect(await queueSantaReminders(db, new Date('2026-12-19T15:59:00Z'))).toBe(0);
    expect(await queueSantaReminders(db, new Date('2026-12-19T16:00:00Z'))).toBe(3); // 24 hours before
    expect(await queueSantaReminders(db, new Date('2026-12-20T10:00:00Z'))).toBe(0);
    const text = (await db.get<{ text: string }>(`SELECT text FROM personal_notification_deliveries WHERE notification_key = ?`, [`santa:${id}:day-before:a`]))!.text;
    expect(text).toContain('Завтра обмен подарками');
    expect(text).toContain('антиподарок для E');
    expect(await queueSantaReminders(db, new Date('2026-12-20T17:00:00Z'))).toBe(0); // after the start
  });

  it('the «Новости» post goes once at creation, with the «Участвовать» button', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('PUBLIC_APP_URL', 'https://club.example');
    await ensureTelegramPublishingSchema(db);
    await createSantaEvent(db, t0);
    const sent: any[] = [];
    const fetchImpl = (async (_url: string, init: any) => { sent.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 }); }) as unknown as typeof fetch;
    expect(await runSecretSanta(db, fetchImpl, t0)).toBe(1);
    expect(await runSecretSanta(db, fetchImpl, t0)).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe(santaAnnouncementText());
    expect(sent[0].text).toContain('до 1000 ₽');
    expect(JSON.stringify(sent[0].reply_markup)).toContain('Участвовать');
    expect(JSON.stringify(sent[0].reply_markup)).toContain('/player/santa');
    expect((await loadSantaForOrganizer(db, t0)).event?.posted).toBe(true);
  });

  it('API: the player and the organizer routes', async () => {
    const app = await createApp(db);
    const org = `organizer_token=${generateOrganizerToken()}`;
    expect((await request(app).get('/api/crm/santa')).status).toBe(401);
    const list = await request(app).get('/api/crm/santa').set('Cookie', org);
    expect(list.status).toBe(200);
    expect(list.body.event).toBeNull();
    expect(list.body.evenings.map((e: any) => e.id)).toContain('ev');
    const created = await request(app).post('/api/crm/santa').set('Cookie', org).send({});
    expect(created.status).toBe(200);
    const bound = await request(app).post(`/api/crm/santa/${created.body.event.id}/evening`).set('Cookie', org).send({ evening_id: 'ev' });
    expect(bound.body.event.evening.id).toBe('ev');
    expect((await request(app).get('/api/player/santa')).status).toBe(401);
  });
});
