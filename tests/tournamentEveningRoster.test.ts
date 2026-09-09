import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabaseConnection, type DatabaseWrapper } from '../src/db/index.ts';
import { createApp } from '../src/app.ts';
import { generateOrganizerToken } from '../src/server/auth.ts';
import {
  cancelTournamentRegistration,
  organizerAddTournamentPlayer,
  prepareTournamentEveningSeating,
  registerTournamentPlayer,
} from '../src/server/services/tournamentEveningService.ts';

describe('TOURNAMENT-EVENING-001 canonical roster ownership', () => {
  let db: DatabaseWrapper;
  let app: Awaited<ReturnType<typeof createApp>>;
  let organizerToken: string;

  beforeEach(async () => {
    process.env.ORGANIZER_NOTIFICATION_IDS = '';
    process.env.ORGANIZER_CHAT_ID = '';
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    organizerToken = generateOrganizerToken();
  });

  afterEach(() => db.sqlite.close());

  const addPlayer = async (id: string, judge = false) => {
    const now = new Date().toISOString();
    await db.run(`INSERT INTO players
      (id,nickname,contact_status,lifecycle_status,elo,tokens,created_at,updated_at,game_level,judge_level)
      VALUES (?,?,'normal','normal',1000,0,?,?,'tournament',?)`, [id, id, now, now, judge ? 'judge' : 'none']);
  };

  const createManagedEvening = async () => {
    await addPlayer('judge', true);
    const response = await request(app)
      .post('/api/tournaments/evenings')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Canonical managed tournament',
        date: '2026-10-02T17:00:00.000Z',
        venue: 'Суп с котом',
        judge_player_id: 'judge',
        player_capacity: 10,
        entry_fee_rub: 500,
        prize_fund_rub: 1000,
        prize_allocations: [{ place: '1', amount_rub: 1000 }],
      });
    expect(response.status).toBe(201);
    expect(response.body.tournament_evening_flow).toBe(1);
    return String(response.body.id);
  };

  it('never rewrites participants of a legacy draft tournament', async () => {
    const now = new Date().toISOString();
    await addPlayer('legacy-player');
    await addPlayer('new-player');
    await db.run(`INSERT INTO tournaments
      (id,title,date,status,created_at,updated_at) VALUES ('legacy-draft','Legacy draft',?,'draft',?,?)`, [now, now, now]);
    await db.run(`INSERT INTO tournament_participants
      (id,tournament_id,player_id,display_name,participant_number)
      VALUES ('legacy-participant','legacy-draft','legacy-player','Legacy player',1)`);

    await expect(organizerAddTournamentPlayer(db, 'legacy-draft', 'new-player', 'must not touch legacy')).rejects.toThrow('NOT_TOURNAMENT_EVENING');

    const participants = await db.all<any>('SELECT id,player_id,display_name,participant_number FROM tournament_participants WHERE tournament_id=?', ['legacy-draft']);
    expect(participants).toEqual([{ id: 'legacy-participant', player_id: 'legacy-player', display_name: 'Legacy player', participant_number: 1 }]);
    expect((await db.get<any>("SELECT COUNT(*) AS count FROM tournament_registrations WHERE tournament_id='legacy-draft'"))?.count).toBe(0);
  });

  it('prepares the existing canonical tournament engine after exactly ten confirmed registrations', async () => {
    const id = await createManagedEvening();
    await db.run('UPDATE tournaments SET published_at=? WHERE id=?', [new Date().toISOString(), id]);
    for (let index = 1; index <= 10; index += 1) {
      await addPlayer(`p${index}`);
      await registerTournamentPlayer(db, id, `p${index}`);
    }

    const registrations = await db.all<any>("SELECT player_id FROM tournament_registrations WHERE tournament_id=? AND status='confirmed' ORDER BY slot_number", [id]);
    const canonicalBefore = await db.all<any>('SELECT player_id FROM tournament_participants WHERE tournament_id=? ORDER BY participant_number', [id]);
    expect(canonicalBefore.map((row) => row.player_id)).toEqual(registrations.map((row) => row.player_id));
    expect(canonicalBefore).toHaveLength(10);

    const prepared = await prepareTournamentEveningSeating(db, id, 'test-organizer');
    expect(prepared).toMatchObject({ ready: true, participants_count: 10, games_count: 10, seats_count: 100 });
    expect((await db.get<any>('SELECT COUNT(*) AS count FROM tournament_games WHERE tournament_id=?', [id]))?.count).toBe(10);
    expect((await db.get<any>(`SELECT COUNT(*) AS count FROM tournament_game_seats s
      JOIN tournament_games g ON g.id=s.game_id WHERE g.tournament_id=?`, [id]))?.count).toBe(100);

    const detail = await request(app).get(`/api/tournaments/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.start_readiness).toMatchObject({ ready: true, participants_count: 10, games_count: 10, seats_count: 100 });
  });

  it('blocks registration and legacy roster mutation after canonical games/seating exist', async () => {
    const id = await createManagedEvening();
    await db.run('UPDATE tournaments SET published_at=? WHERE id=?', [new Date().toISOString(), id]);
    for (let index = 1; index <= 11; index += 1) {
      await addPlayer(`p${index}`);
      await registerTournamentPlayer(db, id, `p${index}`);
    }
    await prepareTournamentEveningSeating(db, id, 'test-organizer');

    await expect(cancelTournamentRegistration(db, id, 'p1')).rejects.toThrow('ROSTER_ALREADY_SEATED');
    await expect(registerTournamentPlayer(db, id, 'p11')).rejects.toThrow('ROSTER_ALREADY_SEATED');

    const before = await db.all<any>('SELECT player_id FROM tournament_participants WHERE tournament_id=? ORDER BY participant_number', [id]);
    const legacyMutation = await request(app)
      .put(`/api/tournaments/${id}/participants`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ participants: before.map((row) => row.player_id).reverse() });
    expect(legacyMutation.status).toBe(409);
    const after = await db.all<any>('SELECT player_id FROM tournament_participants WHERE tournament_id=? ORDER BY participant_number', [id]);
    expect(after).toEqual(before);
  });
});
