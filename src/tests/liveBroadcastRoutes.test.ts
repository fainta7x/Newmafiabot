import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db';
import { buildLiveBroadcastState } from '../lib/liveBroadcast';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth';
import { resetLiveBroadcastForTests } from '../server/services/liveBroadcastService';

describe('live broadcast routes', () => {
  let app: any;
  let db: DatabaseWrapper;
  let cookie: string;
  let gameId: number;

  const now = '2026-09-04T18:00:00.000Z';
  const canonicalPlayers = Array.from({ length: 10 }, (_, index) => ({
    participant_id: `participant-${index + 1}`,
    player_id: `player-${index + 1}`,
    seat_number: index + 1,
    display_name: `Канон ${index + 1}`,
    role: null,
    exit_type: 'alive',
  }));

  beforeEach(async () => {
    resetLiveBroadcastForTests();
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    cookie = `organizer_token=${generateOrganizerToken()}`;

    for (const player of canonicalPlayers) {
      await db.run(
        `INSERT INTO players (id, nickname, contact_status, lifecycle_status, judge_level, elo, tokens, created_at, updated_at)
         VALUES (?, ?, 'normal', 'normal', 'none', 1000, 0, ?, ?)`,
        [player.player_id, player.display_name, now, now],
      );
    }
    await db.run(
      `INSERT INTO players (id, nickname, contact_status, lifecycle_status, judge_level, elo, tokens, created_at, updated_at)
       VALUES ('outside-broadcast', 'Не в эфире', 'normal', 'normal', 'none', 1000, 0, ?, ?)`,
      [now, now],
    );

    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('broadcast-evening','OBS evening',?,'Europe/Moscow','CASUAL','active',20,400,?,?)`,
      [now, now, now],
    );
    await db.run(
      `INSERT INTO games
       (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
       VALUES ('broadcast-evening',237,?,'Красные','Победа Красные',?, '[]',?)`,
      [now, JSON.stringify({ version: 1, kind: 'club_evening_protocol', protocol: { status: 'completed' }, player_results: canonicalPlayers }), now],
    );
    const created = await db.run(
      `INSERT INTO games
       (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
       VALUES ('broadcast-evening',238,?,'draft','Черновик',?, '[]',?)`,
      [now, JSON.stringify({ version: 1, kind: 'club_evening_protocol', protocol: { status: 'draft' }, player_results: canonicalPlayers }), now],
    );
    gameId = Number(created.lastID);
  });

  afterEach(() => {
    resetLiveBroadcastForTests();
    try { db.sqlite.close(); } catch {}
  });

  const audienceState = () => buildLiveBroadcastState({
    phase: 'day_speeches',
    roundNumber: 2,
    activePlayers: canonicalPlayers.map((player) => ({
      slot_num: player.seat_number,
      nickname: `Подмена ${player.seat_number}`,
      role: player.seat_number === 10 ? 'Дон' : player.seat_number >= 8 ? 'Мафия' : player.seat_number === 7 ? 'Шериф' : 'Мирный',
      team: player.seat_number >= 8 ? 'Чёрные' : 'Красные',
      alive: true,
      fouls: 0,
      exit_reason: 'alive',
    })),
    activeSpeakerSlot: 1,
    timeLeft: 51,
    timerMax: 60,
    isTimerRunning: true,
    nominations: [4, 7],
    nominationsMap: { 4: 1, 7: 2 },
    votingRounds: [],
    activeVotingRoundIndex: 0,
    votesByPlayer: {},
    votes: {},
    votingStage: 'setup',
    nightSubPhase: 'intro',
    postNightStage: 'none',
    protocolMarkers: {},
    discipline: { players: {} },
    nightLogs: [],
  }, {
    gameId,
    globalGameNumber: 999,
    tableName: 'Поддельный стол',
    players: canonicalPlayers.map((player) => ({
      seat: player.seat_number,
      playerId: `spoof-${player.seat_number}`,
      nickname: `Подмена ${player.seat_number}`,
    })),
  })!;

  it('returns one stable secret OBS URL only to an authorized host', async () => {
    const unauthorized = await request(app).get(`/api/games/${gameId}/broadcast-config`);
    expect(unauthorized.status).toBe(401);

    const first = await request(app).get(`/api/games/${gameId}/broadcast-config`).set('Cookie', cookie);
    const second = await request(app).get(`/api/games/${gameId}/broadcast-config`).set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ width: 1920, height: 1080, game_id: gameId });
    expect(first.body.overlay_path).toMatch(/^\/broadcast\/[A-Za-z0-9_-]+$/);
    expect(second.body.overlay_path).toBe(first.body.overlay_path);
  });

  it('rejects completed games even for an organizer', async () => {
    await request(app)
      .get('/api/games/1/broadcast-config')
      .set('Cookie', cookie)
      .expect(404);
    await request(app)
      .put('/api/games/1/broadcast-state')
      .set('Cookie', cookie)
      .send({ state: audienceState() })
      .expect(404);
  });

  it('publishes transient state and replaces identity and numbering from the database', async () => {
    const config = await request(app).get(`/api/games/${gameId}/broadcast-config`).set('Cookie', cookie);
    const token = String(config.body.overlay_path).split('/').pop()!;

    const unauthorized = await request(app)
      .put(`/api/games/${gameId}/broadcast-state`)
      .send({ state: audienceState() });
    expect(unauthorized.status).toBe(401);

    const publish = await request(app)
      .put(`/api/games/${gameId}/broadcast-state`)
      .set('Cookie', cookie)
      .send({ state: audienceState() });
    expect(publish.status).toBe(202);

    const publicState = await request(app).get(`/api/public/broadcast/${token}`);
    expect(publicState.status).toBe(200);
    expect(publicState.headers['cache-control']).toContain('no-store');
    expect(publicState.body.connected).toBe(true);
    expect(publicState.body.state).toMatchObject({
      gameId,
      globalGameNumber: 238,
      eveningGameNumber: 2,
      currentSpeakerSeat: 1,
    });
    expect(publicState.body.state.players[0]).toMatchObject({
      playerId: 'player-1',
      nickname: 'Канон 1',
      role: 'Мирный',
    });

    const invalidToken = await request(app).get('/api/public/broadcast/not-the-token');
    expect(invalidToken.status).toBe(404);
  });

  it('adds the evening score and keeps only well-formed night facts, game log and protocols', async () => {
    await db.run('UPDATE games SET protocol_text = ? WHERE global_game_number = 237', [
      JSON.stringify({ version: 1, kind: 'club_evening_protocol', protocol: { status: 'completed', winner_team: 'black' }, player_results: canonicalPlayers }),
    ]);
    const config = await request(app).get(`/api/games/${gameId}/broadcast-config`).set('Cookie', cookie);
    const token = String(config.body.overlay_path).split('/').pop()!;
    await request(app)
      .put(`/api/games/${gameId}/broadcast-state`)
      .set('Cookie', cookie)
      .send({
        state: {
          ...audienceState(),
          eveningScore: { red: 99, black: 99 },
          night: { shotSeat: 4, donCheck: { seat: 7, isSheriff: 'yes' }, sheriffCheck: { seat: 42, isBlack: true } },
          bestMove: { bySeat: 2, seats: [8, 9, 10, 1] },
          timeline: [
            { kind: 'night', round: 1, current: false, shotSeat: 2, killed: true, donCheck: { seat: 3, isSheriff: 'no' }, sheriffCheck: { seat: 8, isBlack: true } },
            { kind: 'day', round: 2, left: [5, 42], note: 'voted' },
            { kind: 'day', round: 3, left: [], note: '<script>' },
            { kind: 'speech', round: 3 },
          ],
          dayVotes: [{ round: 2, assignments: { 1: 5, 3: 5, 11: 5, 4: 99 } }, { round: 3, assignments: 'x' }],
          protocols: [
            { seat: 2, red: [1, 4, 4], black: [8, 1, 11], sheriff: [7, 6] },
            { seat: 5, red: [], black: [], sheriff: [] },
          ],
        },
      })
      .expect(202);

    const { body } = await request(app).get(`/api/public/broadcast/${token}`);
    expect(body.state.eveningScore).toEqual({ red: 0, black: 1 });
    expect(body.state.night).toEqual({ shotSeat: 4, donCheck: { seat: 7, isSheriff: null }, sheriffCheck: null });
    expect(body.state.bestMove).toEqual({ bySeat: 2, seats: [8, 9, 10] });
    expect(body.state.timeline).toEqual([
      { kind: 'night', round: 1, current: false, shotSeat: 2, killed: true, donCheck: { seat: 3, isSheriff: null }, sheriffCheck: { seat: 8, isBlack: true } },
      { kind: 'day', round: 2, left: [5], note: 'voted' },
    ]);
    expect(body.state.dayVotes).toEqual([{ round: 2, assignments: { 1: 5, 3: 5 } }]);
    expect(body.state.protocols).toEqual([{ seat: 2, red: [1, 4], black: [8], sheriff: [7] }]);
  });

  it('saves the overlay layout for the host and serves it with the public frame', async () => {
    const config = await request(app).get(`/api/games/${gameId}/broadcast-config`).set('Cookie', cookie);
    const token = String(config.body.overlay_path).split('/').pop()!;

    await request(app).put('/api/games/broadcast-overlay-layout').send({ layout: { players: 80 } }).expect(401);
    const saved = await request(app)
      .put('/api/games/broadcast-overlay-layout')
      .set('Cookie', cookie)
      .send({ layout: { top: 300, timeline: 'x', players: 82, showTimeline: false } })
      .expect(200);
    expect(saved.body.layout).toEqual({ top: 140, timeline: 100, players: 82, showTop: true, showTimeline: false, showPlayers: true });

    const frame = await request(app).get(`/api/public/broadcast/${token}`).expect(200);
    expect(frame.body.layout).toEqual(saved.body.layout);

    // Survives a restart: the in-memory copy is dropped and the database copy is read back.
    resetLiveBroadcastForTests();
    const reloaded = await request(app).get('/api/games/broadcast-overlay-layout').set('Cookie', cookie).expect(200);
    expect(reloaded.body.layout).toEqual(saved.body.layout);
  });

  it('allows the assigned qualified judge to configure and publish only their active game', async () => {
    await db.run("UPDATE players SET judge_level = 'host' WHERE id = 'player-1'");
    await db.run("UPDATE games SET judge_player_id = 'player-1' WHERE id = ?", [gameId]);
    const judgeCookie = `player_token=${generatePlayerSessionToken('player-1')}`;

    await request(app)
      .get(`/api/games/${gameId}/broadcast-config`)
      .set('Cookie', judgeCookie)
      .expect(200);
    await request(app)
      .put(`/api/games/${gameId}/broadcast-state`)
      .set('Cookie', judgeCookie)
      .send({ state: audienceState() })
      .expect(202);

    await request(app)
      .get(`/api/games/${gameId}/broadcast-config`)
      .set('Cookie', `player_token=${generatePlayerSessionToken('player-2')}`)
      .expect(401);
  });

  it('serves avatars only for players present in the current broadcast frame', async () => {
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    for (const playerId of ['player-1', 'outside-broadcast']) {
      await db.run(
        `INSERT INTO player_avatars (player_id, mime_type, image_data, byte_size, width, height, updated_at)
         VALUES (?, 'image/jpeg', ?, ?, 1, 1, ?)`,
        [playerId, image, image.length, now],
      );
    }

    const config = await request(app).get(`/api/games/${gameId}/broadcast-config`).set('Cookie', cookie);
    const token = String(config.body.overlay_path).split('/').pop()!;
    await request(app)
      .put(`/api/games/${gameId}/broadcast-state`)
      .set('Cookie', cookie)
      .send({ state: audienceState() })
      .expect(202);

    const currentPlayer = await request(app).get(`/api/public/broadcast/${token}/avatar/player-1`);
    expect(currentPlayer.status).toBe(200);
    expect(currentPlayer.headers['content-type']).toContain('image/jpeg');
    await request(app)
      .get(`/api/public/broadcast/${token}/avatar/outside-broadcast`)
      .expect(404);
  });

  it('shows the tournament score (wins of its other finished games) on the tournament broadcast', async () => {
    const created = await request(app)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({
        title: 'Турнир для эфира',
        date: now,
        chief_judge_name: 'Судья',
        participants: canonicalPlayers.map((player) => ({ player_id: player.player_id, display_name: player.display_name })),
      });
    const tournamentId = created.body.id;
    const games = created.body.games as Array<{ id: string }>;
    expect(games.length).toBeGreaterThanOrEqual(3);
    await db.run("UPDATE tournament_games SET status = 'completed', winner_team = 'red' WHERE id = ?", [games[0].id]);
    await db.run("UPDATE tournament_games SET status = 'completed', winner_team = 'black' WHERE id = ?", [games[1].id]);
    await db.run("UPDATE tournament_games SET status = 'active' WHERE id = ?", [games[2].id]);

    const config = await request(app).get(`/api/games/${gameId}/broadcast-config`).set('Cookie', cookie);
    const token = String(config.body.overlay_path).split('/').pop()!;
    await request(app)
      .put(`/api/games/tournament/${tournamentId}/${games[2].id}/broadcast-state`)
      .set('Cookie', cookie)
      .send({ state: { ...audienceState(), eveningScore: { red: 99, black: 99 } } })
      .expect(202);

    const { body } = await request(app).get(`/api/public/broadcast/${token}`);
    expect(body.state.tableName).toBe('Турнир');
    expect(body.state.eveningScore).toEqual({ red: 1, black: 1 });
  });

  it('gives the organizer the same overlay link for a tournament game', async () => {
    const created = await request(app)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({
        title: 'Турнир со ссылкой',
        date: now,
        chief_judge_name: 'Судья',
        participants: canonicalPlayers.map((player) => ({ player_id: player.player_id, display_name: player.display_name })),
      });
    const tournamentId = created.body.id;
    const tournamentGameId = created.body.games[0].id;
    const club = await request(app).get(`/api/games/${gameId}/broadcast-config`).set('Cookie', cookie);
    const config = await request(app).get(`/api/games/tournament/${tournamentId}/${tournamentGameId}/broadcast-config`).set('Cookie', cookie);
    expect(config.status).toBe(200);
    expect(config.body.overlay_path).toBe(club.body.overlay_path);
    expect(config.body).toMatchObject({ width: 1920, height: 1080 });

    expect((await request(app).get(`/api/games/tournament/${tournamentId}/${tournamentGameId}/broadcast-config`)).status).toBe(401);
    expect((await request(app).get(`/api/games/tournament/${tournamentId}/nope/broadcast-config`).set('Cookie', cookie)).status).toBe(404);
  });
});
