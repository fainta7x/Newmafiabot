import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabaseConnection, type DatabaseWrapper } from '../src/db/index.ts';
import { createApp } from '../src/app.ts';
import { generateOrganizerToken } from '../src/server/auth.ts';
import {
  organizerAddTournamentPlayer,
  prepareTournamentEveningSeating,
  reviewTournamentPayment,
} from '../src/server/services/tournamentEveningService.ts';

describe('TOURNAMENT-ROSTER-REPLACEMENT', () => {
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

  const addPlayer = async (id: string, gameLevel = 'tournament', judgeLevel = 'none') => {
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO players (id,nickname,contact_status,lifecycle_status,elo,tokens,created_at,updated_at,game_level,judge_level)
       VALUES (?,?,'normal','normal',1000,0,?,?,?,?)`,
      [id, id, now, now, gameLevel, judgeLevel],
    );
  };

  const createPreparedTournament = async () => {
    await addPlayer('judge', 'tournament', 'judge');
    const response = await request(app)
      .post('/api/tournaments/evenings')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Турнир на замену',
        date: '2026-10-10T16:00:00.000Z',
        venue: 'Суп с котом',
        judge_player_id: 'judge',
        player_capacity: 10,
        entry_fee_rub: 500,
        prize_fund_rub: 3000,
        prize_allocations: [
          { place: '1', amount_rub: 1500 },
          { place: '2', amount_rub: 1000 },
          { place: '3', amount_rub: 500 },
        ],
      });
    expect(response.status).toBe(201);
    const tournamentId = String(response.body.id);

    for (let index = 1; index <= 12; index += 1) {
      await addPlayer(`p${index}`);
      await organizerAddTournamentPlayer(db, tournamentId, `p${index}`, 'test roster', 'organizer-test');
    }
    await prepareTournamentEveningSeating(db, tournamentId, 'organizer-test');
    await db.run("UPDATE tournaments SET status='active' WHERE id=?", [tournamentId]);
    return tournamentId;
  };

  it('replaces a confirmed player with a reserve after seating without changing prepared seats', async () => {
    const tournamentId = await createPreparedTournament();
    const outgoingRegistration = await db.get<any>(
      "SELECT * FROM tournament_registrations WHERE tournament_id=? AND player_id='p1'",
      [tournamentId],
    );
    const participantBefore = await db.get<any>(
      "SELECT * FROM tournament_participants WHERE tournament_id=? AND player_id='p1'",
      [tournamentId],
    );
    const seatsBefore = await db.all<any>(
      `SELECT tgs.game_id,tgs.seat_number FROM tournament_game_seats tgs
        WHERE tgs.participant_id=? ORDER BY tgs.game_id,tgs.seat_number`,
      [participantBefore.id],
    );
    const gameIdsBefore = (await db.all<any>(
      'SELECT id FROM tournament_games WHERE tournament_id=? ORDER BY game_number',
      [tournamentId],
    )).map((row) => row.id);

    await reviewTournamentPayment(db, tournamentId, 'p1', 'confirmed', 'organizer-test', 500, 'paid before decline');

    const detail = await request(app)
      .get(`/api/tournaments/evenings/${tournamentId}`)
      .set('Authorization', `Bearer ${organizerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.roster_edit_mode).toBe('replacement_only');

    const replaced = await request(app)
      .post(`/api/tournaments/evenings/${tournamentId}/players/p1/replace`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ replacement_player_id: 'p11', reason: 'p1 отказался играть' });

    expect(replaced.status).toBe(200);
    expect(replaced.body.roster_edit_mode).toBe('replacement_only');
    expect(replaced.body.confirmed).toHaveLength(10);
    expect(replaced.body.confirmed.some((row: any) => row.player_id === 'p1')).toBe(false);
    expect(replaced.body.confirmed.find((row: any) => row.player_id === 'p11')?.slot_number).toBe(outgoingRegistration.slot_number);

    const outgoingAfter = await db.get<any>(
      "SELECT status,response,slot_number FROM tournament_registrations WHERE tournament_id=? AND player_id='p1'",
      [tournamentId],
    );
    const replacementAfter = await db.get<any>(
      "SELECT status,response,slot_number,queue_order FROM tournament_registrations WHERE tournament_id=? AND player_id='p11'",
      [tournamentId],
    );
    expect(outgoingAfter).toMatchObject({ status: 'cancelled', response: 'declined', slot_number: null });
    expect(replacementAfter).toMatchObject({ status: 'confirmed', response: 'play', slot_number: outgoingRegistration.slot_number, queue_order: null });

    const participantAfter = await db.get<any>('SELECT * FROM tournament_participants WHERE id=?', [participantBefore.id]);
    expect(participantAfter.player_id).toBe('p11');
    expect(participantAfter.display_name).toBe('p11');

    const seatsAfter = await db.all<any>(
      `SELECT tgs.game_id,tgs.seat_number FROM tournament_game_seats tgs
        WHERE tgs.participant_id=? ORDER BY tgs.game_id,tgs.seat_number`,
      [participantBefore.id],
    );
    expect(seatsAfter).toEqual(seatsBefore);
    expect((await db.all<any>('SELECT id FROM tournament_games WHERE tournament_id=? ORDER BY game_number', [tournamentId])).map((row) => row.id)).toEqual(gameIdsBefore);

    const oldPayment = await db.get<any>(
      "SELECT state,confirmed_amount_rub FROM tournament_payment_claims WHERE tournament_id=? AND player_id='p1'",
      [tournamentId],
    );
    const replacementPayment = await db.get<any>(
      "SELECT state,confirmed_amount_rub FROM tournament_payment_claims WHERE tournament_id=? AND player_id='p11'",
      [tournamentId],
    );
    expect(oldPayment).toMatchObject({ state: 'confirmed', confirmed_amount_rub: 500 });
    expect(replacementPayment).toBeUndefined();

    const audit = await db.get<any>(
      "SELECT actor_type,actor_id,reason,payload_json FROM tournament_evening_audit WHERE tournament_id=? AND action='replace_player'",
      [tournamentId],
    );
    expect(audit.actor_type).toBe('organizer');
    expect(audit.actor_id).toBeTruthy();
    expect(audit.reason).toBe('p1 отказался играть');
    expect(JSON.parse(audit.payload_json)).toMatchObject({
      outgoing_player_id: 'p1',
      replacement_player_id: 'p11',
      slot_number: outgoingRegistration.slot_number,
      participant_id: participantBefore.id,
    });
  });

  it('can put a tournament-level player who was not in the queue into the confirmed slot', async () => {
    const tournamentId = await createPreparedTournament();
    await addPlayer('late-replacement');
    const before = await db.get<any>(
      "SELECT tp.id,tr.slot_number FROM tournament_participants tp JOIN tournament_registrations tr ON tr.tournament_id=tp.tournament_id AND tr.player_id=tp.player_id WHERE tp.tournament_id=? AND tp.player_id='p2'",
      [tournamentId],
    );

    const response = await request(app)
      .post(`/api/tournaments/evenings/${tournamentId}/players/p2/replace`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ replacement_player_id: 'late-replacement' });

    expect(response.status).toBe(200);
    const registration = await db.get<any>(
      "SELECT status,slot_number FROM tournament_registrations WHERE tournament_id=? AND player_id='late-replacement'",
      [tournamentId],
    );
    expect(registration).toMatchObject({ status: 'confirmed', slot_number: before.slot_number });
    expect((await db.get<any>('SELECT player_id FROM tournament_participants WHERE id=?', [before.id]))?.player_id).toBe('late-replacement');
  });

  it('locks replacements as soon as a game has started', async () => {
    const tournamentId = await createPreparedTournament();
    const firstGame = await db.get<any>('SELECT id FROM tournament_games WHERE tournament_id=? ORDER BY game_number LIMIT 1', [tournamentId]);
    await db.run("UPDATE tournament_games SET status='active' WHERE id=?", [firstGame.id]);

    const detail = await request(app)
      .get(`/api/tournaments/evenings/${tournamentId}`)
      .set('Authorization', `Bearer ${organizerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.roster_edit_mode).toBe('locked');

    const response = await request(app)
      .post(`/api/tournaments/evenings/${tournamentId}/players/p1/replace`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ replacement_player_id: 'p11', reason: 'too late' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ROSTER_LOCKED');
    expect((await db.get<any>("SELECT player_id FROM tournament_participants WHERE tournament_id=? AND player_id='p1'", [tournamentId]))?.player_id).toBe('p1');
  });
});
