import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { mapEngineResult } from '../components/player/TournamentLiveGameModal.tsx';
import { saveLiveGameCheckpoint, loadLiveGameCheckpoint } from '../server/services/liveGameCheckpointService.ts';

let app: any;
let db: DatabaseWrapper;
let cookie: string;
let tournamentId: string;
let gameId: string;

beforeEach(async () => {
  db = createDatabaseConnection(':memory:');
  app = await createApp(db);
  cookie = `organizer_token=${generateOrganizerToken()}`;
  const participants: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const pid = `live-save-player-${i}`;
    await db.run(
      `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at) VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`,
      [pid, `Player_${i}`, `+7900000001${i}`, new Date().toISOString(), new Date().toISOString()],
    );
    participants.push({ player_id: pid, display_name: `Игрок ${i}` });
  }
  const created = await request(app).post('/api/tournaments').set('Cookie', cookie).send({ title: 'Сохранение игры из движка', date: new Date().toISOString(), participants });
  tournamentId = created.body.id;
  const seating = await request(app).post(`/api/tournaments/${tournamentId}/generate-seating`).set('Cookie', cookie);
  gameId = seating.body.games[0].id;
  await request(app).post(`/api/tournaments/${tournamentId}/start`).set('Cookie', cookie);
  const roles = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'].map((role, index) => ({ seat_number: index + 1, role }));
  await request(app).patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`).set('Cookie', cookie).send({ roles });
  await request(app).post(`/api/tournaments/${tournamentId}/games/${gameId}/start`).set('Cookie', cookie);
});

describe('saving a finished live tournament game with votes from several days', () => {
  it('accepts the voting rounds the engine recorded (its round numbers restart every day)', async () => {
    const loaded = await request(app).get(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`).set('Cookie', cookie);
    expect(loaded.status).toBe(200);
    const engineVotes: any[] = [
      { round_number: 1, day_number: 1, is_revote: false, nominated_seats: [3, 4], vote_counts: { 3: 5, 4: 5 }, eligible_voters: 10, outcome: 'tie_revote', eliminated_seats: [], parent_round_number: null },
      { round_number: 2, day_number: 1, is_revote: true, nominated_seats: [3, 4], vote_counts: { 3: 7, 4: 3 }, eligible_voters: 10, outcome: 'single_eliminated', eliminated_seats: [3], parent_round_number: 1 },
      { round_number: 1, day_number: 2, is_revote: false, nominated_seats: [5], vote_counts: { 5: 9 }, eligible_voters: 9, outcome: 'single_eliminated', eliminated_seats: [5], parent_round_number: null },
    ];
    const next = mapEngineResult(loaded.body.protocol, loaded.body.player_results, { winning_team: 'Красные', slots: [], votes: engineVotes, shots: [] });
    const saved = await request(app).put(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`).set('Cookie', cookie).send(next);
    expect(saved.body.error).toBeUndefined();
    expect(saved.status).toBe(200);
    expect((saved.body.protocol.votes as any[]).map((round) => round.round_number)).toEqual([1, 2, 3]);
  });

  it('stores the chronology of the game with the protocol and keeps it when the protocol is edited by hand', async () => {
    const loaded = await request(app).get(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`).set('Cookie', cookie);
    const events = [
      { seq: 1, at: '2026-10-03T12:00:00.000Z', round: 1, phase: 'zero_night', kind: 'game_start', value: 'zero_night' },
      { seq: 2, at: '2026-10-03T12:05:00.000Z', round: 2, phase: 'day_speeches', kind: 'nomination', seat: 4, by: 1 },
      { seq: 3, at: '2026-10-03T12:09:00.000Z', round: 2, phase: 'day_voting', kind: 'vote', seat: 2, target: 4, value: 1 },
      { seq: 4, at: '2026-10-03T12:20:00.000Z', round: 2, phase: 'night', kind: 'shot_target', target: 6 },
    ];
    const first = mapEngineResult(loaded.body.protocol, loaded.body.player_results, { winning_team: 'Красные', slots: [], votes: [], shots: [], events });
    const saved = await request(app).put(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`).set('Cookie', cookie).send(first);
    expect(saved.status).toBe(200);
    expect(saved.body.protocol.events).toHaveLength(4);

    // The manual protocol screen sends the protocol it loaded; here without `events` at all.
    const manual = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`)
      .set('Cookie', cookie)
      .send({ protocol: { winner_team: 'red', judge_notes: 'правка вручную' }, player_results: saved.body.player_results });
    expect(manual.status).toBe(200);
    expect(manual.body.protocol.events).toHaveLength(4);

    const reread = await request(app).get(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`).set('Cookie', cookie);
    expect(reread.body.protocol.events.map((event: any) => event.kind)).toEqual(['game_start', 'nomination', 'vote', 'shot_target']);
    expect(reread.body.protocol.events[1]).toMatchObject({ seat: 4, by: 1 });
  });

  it('accepts a colour protocol of a killed player that the judge filled in during the game', async () => {
    const loaded = await request(app).get(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`).set('Cookie', cookie);
    const results = (loaded.body.player_results as any[]).map((player) => player.seat_number === 3
      ? { ...player, exit_type: 'killed', color_protocol: [{ mark: 'red', seat_numbers: [1, 2] }, { mark: 'black', seat_numbers: [8] }, { mark: 'sheriff', seat_numbers: [7] }] }
      : player);
    const saved = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`)
      .set('Cookie', cookie)
      .send({ protocol: { ...loaded.body.protocol, winner_team: 'red', first_killed_participant_id: results.find((player) => player.seat_number === 3).participant_id, votes: [], shots: [] }, player_results: results });
    if (saved.body.error) console.log('SERVER ERROR:', saved.body.error);
    expect(saved.status).toBe(200);
    const killed = (saved.body.player_results as any[]).find((player) => player.seat_number === 3);
    expect(killed.color_protocol).toHaveLength(3);
  });
});


describe('tournament Live Engine persistence audit: draft retries, finalization and checkpoint cleanup', () => {

  it('returns 409 if someone swaps CRM seats between the Live Engine GET and PUT, without touching the protocol', async () => {
    const url = `/api/tournaments/${tournamentId}/games/${gameId}/protocol`;
    const loaded = await request(app).get(url).set('Cookie', cookie).expect(200);
    const mapped = mapEngineResult(loaded.body.protocol, loaded.body.player_results, {
      winning_team: 'Красные', slots: [{ slot_num: 1, exit_reason: 'killed', alive: false }],
      protocol_markers: { firstKilledSlot: 1 }, votes: [], shots: [],
    });
    const initial = loaded.body.player_results.slice(0, 2);
    await db.run(`UPDATE tournament_game_seats SET participant_id = CASE
      WHEN seat_number = 1 THEN ?
      WHEN seat_number = 2 THEN ?
      ELSE participant_id END
      WHERE game_id = ?`, [initial[1].participant_id, initial[0].participant_id, gameId]);
    const rejected = await request(app).put(url).set('Cookie', cookie).send(mapped);
    expect(rejected.status).toBe(409);
    expect(rejected.body.error).toContain('Рассадка');
    const protocol = await db.get<any>('SELECT id FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    expect(protocol).toBeUndefined();
    const results = await db.get<any>('SELECT COUNT(*) AS count FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
    expect(results.count).toBe(0);
  });


  it('survives 30 sequential draft saves without losing seats, roles, events or duplicating player results', async () => {
    const url = `/api/tournaments/${tournamentId}/games/${gameId}/protocol`;
    const initial = await request(app).get(url).set('Cookie', cookie).expect(200);
    const events = [
      { seq: 1, at: '2026-11-06T10:00:00.000Z', round: 1, phase: 'zero_night', kind: 'game_start' },
      { seq: 2, at: '2026-11-06T10:01:00.000Z', round: 2, phase: 'day_speeches', kind: 'nomination', seat: 4, by: 1 },
      { seq: 3, at: '2026-11-06T10:02:00.000Z', round: 2, phase: 'day_voting', kind: 'vote', seat: 1, target: 4, value: 1 },
      { seq: 4, at: '2026-11-06T10:03:00.000Z', round: 2, phase: 'night', kind: 'shot_target', target: 6 },
    ];
    let saved = mapEngineResult(initial.body.protocol, initial.body.player_results, {
      winning_team: 'Красные', slots: [], votes: [], shots: [], events,
    });
    const participantIds = initial.body.player_results.map((row: any) => row.participant_id);
    for (let attempt = 0; attempt < 30; attempt++) {
      saved.protocol.judge_notes = `Автосохранение №${attempt}`;
      const response = await request(app).put(url).set('Cookie', cookie).send(saved);
      expect(response.status).toBe(200);
      saved = { protocol: response.body.protocol, player_results: response.body.player_results, live_seat_bindings: saved.live_seat_bindings };
      expect(saved.player_results).toHaveLength(10);
      expect(saved.player_results.map((row: any) => row.participant_id)).toEqual(participantIds);
      expect((saved.protocol.events || []).map((ev: any) => ev.kind)).toEqual(events.map((ev) => ev.kind));
    }
    const count = await db.get<any>('SELECT COUNT(*) AS n FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
    expect(count.n).toBe(10);
    const reread = await request(app).get(url).set('Cookie', cookie).expect(200);
    expect(reread.body.protocol.judge_notes).toBe('Автосохранение №29');
    expect(reread.body.protocol.events).toHaveLength(4);

    // A live checkpoint belongs to the running game and must disappear only after completion.
    const checkpoint = {
      session: JSON.stringify({ phase: 'day_voting', roundNumber: 2, activePlayers: [{ slot_num: 1 }] }),
      evidence: JSON.stringify({ votes: [], shots: [], events }),
    };
    expect(await saveLiveGameCheckpoint(db, `tournament:${gameId}`, checkpoint)).toBe('saved');
    expect(await loadLiveGameCheckpoint(db, `tournament:${gameId}`)).not.toBeNull();
    const completed = await request(app).post(`${url}/complete`).set('Cookie', cookie).send(saved);
    expect(completed.status).toBe(200);
    expect(completed.body.protocol.status).toBe('completed');
    expect(completed.body.game.status).toBe('completed');
    expect(await loadLiveGameCheckpoint(db, `tournament:${gameId}`)).toBeNull();

    // A stale judge tab cannot overwrite completed results with a late PUT.
    const lateSave = await request(app).put(url).set('Cookie', cookie).send({
      protocol: { ...saved.protocol, winner_team: 'black' }, player_results: saved.player_results,
    });
    expect(lateSave.status).toBe(400);
    const rereadCompleted = await request(app).get(url).set('Cookie', cookie).expect(200);
    expect(rereadCompleted.body.protocol.winner_team).toBe('red');
    expect((await db.get<any>('SELECT COUNT(*) AS n FROM tournament_game_player_results WHERE game_id = ?', [gameId])).n).toBe(10);
  }, 60_000);
});

describe('full tournament-distance Live Engine-to-protocol regression', () => {
  it('conducts 10 games, persists 100 seat results, rotates winning sides and never duplicates completed records', async () => {
    const games = await db.all<any>('SELECT id, game_number, status FROM tournament_games WHERE tournament_id = ? ORDER BY game_number', [tournamentId]);
    expect(games).toHaveLength(10);
    for (const [index, game] of games.entries()) {
      const roles = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don']
        .map((role, i) => ({ seat_number: i + 1, role }));
      if (index > 0) {
        const roleRes = await request(app).patch(`/api/tournaments/${tournamentId}/games/${game.id}/roles`)
          .set('Cookie', cookie).send({ roles });
        expect(roleRes.status).toBe(200);
        const start = await request(app).post(`/api/tournaments/${tournamentId}/games/${game.id}/start`).set('Cookie', cookie);
        expect(start.status).toBe(200);
      }
      const url = `/api/tournaments/${tournamentId}/games/${game.id}/protocol`;
      const loaded = await request(app).get(url).set('Cookie', cookie).expect(200);
      const winner = index % 2 === 0 ? 'Красные' : 'Чёрные';
      const winnerCode = index % 2 === 0 ? 'red' : 'black';
      const mapped = mapEngineResult(loaded.body.protocol, loaded.body.player_results, {
        winning_team: winner,
        slots: loaded.body.player_results.map((player: any) => ({
          slot_num: player.seat_number, role: player.role, alive: true, fouls: index % 3,
        })),
        votes: [], shots: [],
        events: [
          { seq: 1, at: '2026-11-06T10:00:00.000Z', round: 1, phase: 'zero_night', kind: 'game_start' },
          { seq: 2, at: '2026-11-06T11:00:00.000Z', round: 2, phase: 'day_speeches', kind: 'game_end', value: winnerCode },
        ],
      });
      expect((await request(app).put(url).set('Cookie', cookie).send(mapped)).status).toBe(200);
      const reloaded = await request(app).get(url).set('Cookie', cookie).expect(200);
      expect(reloaded.body.protocol.events).toHaveLength(2);
      expect(reloaded.body.player_results).toHaveLength(10);
      expect(reloaded.body.player_results.every((row: any) => row.regular_fouls === index % 3)).toBe(true);
      const completed = await request(app).post(`${url}/complete`).set('Cookie', cookie).send({
        protocol: reloaded.body.protocol,
        player_results: reloaded.body.player_results,
      });
      expect(completed.status).toBe(200);
      expect(completed.body.game.status).toBe('completed');
      expect(completed.body.protocol.winner_team).toBe(winnerCode);
    }
    const totals = await db.get<any>(`SELECT
      (SELECT COUNT(*) FROM tournament_games WHERE tournament_id = ? AND status = 'completed') AS games,
      (SELECT COUNT(*) FROM tournament_game_player_results WHERE game_id IN (SELECT id FROM tournament_games WHERE tournament_id = ?)) AS results,
      (SELECT COUNT(*) FROM tournament_game_protocols WHERE game_id IN (SELECT id FROM tournament_games WHERE tournament_id = ?) AND status = 'completed') AS protocols`,
      [tournamentId, tournamentId, tournamentId]);
    expect(totals).toMatchObject({ games: 10, results: 100, protocols: 10 });
    const check = await request(app).get(`/api/tournaments/${tournamentId}`).set('Cookie', cookie).expect(200);
    expect(check.body.games).toHaveLength(10);
    expect(check.body.games.every((game: any) => game.status === 'completed')).toBe(true);
  }, 120_000);
});
