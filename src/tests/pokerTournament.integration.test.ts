import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { createPokerTournament, registerForPokerTournament, tickPokerTournaments } from '../server/services/pokerTournamentService.ts';

describe('poker tournament registration and start', () => {
  let db: DatabaseWrapper;
  let app: any;
  const stamp = '2026-10-10T10:00:00.000Z';
  const start = Date.parse('2026-10-20T18:00:00Z');
  const now = Date.parse('2026-10-20T10:00:00Z');

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    for (let index = 1; index <= 6; index += 1) {
      await db.run(
        `INSERT INTO players (id,nickname,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at)
         VALUES (?,?,'normal','normal','none',1000,1000,?,?)`,
        [`p${index}`, `Player ${index}`, stamp, stamp],
      );
    }
  });

  const make = (extra: Record<string, unknown> = {}) =>
    createPokerTournament(db, null, { title: 'Турбо', startAt: new Date(start).toISOString(), ...extra }, now);

  it('starts on time with enough players and puts them in play', async () => {
    const row = await make({ minPlayers: 4 });
    for (const id of ['p1', 'p2', 'p3', 'p4']) await registerForPokerTournament(db, row.id, id);
    expect((await tickPokerTournaments(db, start - 1000)).started).toEqual([]);
    expect((await tickPokerTournaments(db, start + 1000)).started).toEqual([row.id]);
    const after = await db.get<any>('SELECT status, started_at FROM poker_tournaments WHERE id = ?', [row.id]);
    expect(after.status).toBe('running');
    expect(await db.all("SELECT player_id FROM poker_tournament_entries WHERE tournament_id = ? AND status = 'playing'", [row.id])).toHaveLength(4);
    expect((await tickPokerTournaments(db, start + 2000)).started).toEqual([]);
  });

  it('cancels at the start time without the minimum and tells the registered players', async () => {
    const row = await make({ minPlayers: 4 });
    for (const id of ['p1', 'p2']) await registerForPokerTournament(db, row.id, id);
    expect((await tickPokerTournaments(db, start + 1000)).cancelled).toEqual([row.id]);
    const after = await db.get<any>('SELECT status, cancel_reason FROM poker_tournaments WHERE id = ?', [row.id]);
    expect(after.status).toBe('cancelled');
    expect(after.cancel_reason).toContain('2 из 4');
    const notices = await db.all<any>("SELECT player_id FROM personal_notification_deliveries WHERE notification_key LIKE ?", [`poker-tournament:cancelled:${row.id}:%`]);
    expect(notices.map((entry) => entry.player_id).sort()).toEqual(['p1', 'p2']);
  });

  it('keeps registration idempotent, honours the player limit and lets a player leave and come back', async () => {
    const row = await make({ minPlayers: 2, maxPlayers: 2 });
    await registerForPokerTournament(db, row.id, 'p1');
    await registerForPokerTournament(db, row.id, 'p1');
    await registerForPokerTournament(db, row.id, 'p2');
    await expect(registerForPokerTournament(db, row.id, 'p3')).rejects.toThrow('Все места');
    await db.run("UPDATE poker_tournament_entries SET status='cancelled' WHERE tournament_id=? AND player_id='p2'", [row.id]);
    await registerForPokerTournament(db, row.id, 'p3');
    await registerForPokerTournament(db, row.id, 'p2').catch(() => undefined);
    expect(await db.all("SELECT player_id FROM poker_tournament_entries WHERE tournament_id=? AND status!='cancelled'", [row.id])).toHaveLength(2);
  });

  it('is created by the organizer only and registered for over the player API', async () => {
    const organizer = `organizer_token=${generateOrganizerToken()}`;
    const player = `player_token=${generatePlayerSessionToken('p1')}`;
    const denied = await request(app).post('/api/player/poker/tournaments').set('Cookie', player)
      .send({ title: 'Турбо', startAt: new Date(Date.now() + 3_600_000).toISOString() });
    expect(denied.status).toBe(403);
    const created = await request(app).post('/api/player/poker/tournaments').set('Cookie', organizer)
      .send({ title: 'Турбо', startAt: new Date(Date.now() + 3_600_000).toISOString(), prizeTokens: [3000, 1000] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.tournament.id;
    expect(created.body.tournament.settings.prizeTokens).toEqual([3000, 1000]);

    const joined = await request(app).post(`/api/player/poker/tournaments/${id}/register`).set('Cookie', player).send({});
    expect(joined.status).toBe(200);
    expect(joined.body.tournament.my_entry).toMatchObject({ status: 'registered' });
    expect(joined.body.tournament.players).toBe(1);
    const listed = await request(app).get('/api/player/poker/tournaments').set('Cookie', player);
    expect(listed.body.tournaments).toHaveLength(1);
    const left = await request(app).delete(`/api/player/poker/tournaments/${id}/register`).set('Cookie', player);
    expect(left.body.tournament.my_entry).toBeNull();
    expect(left.body.tournament.players).toBe(0);
  });
});
