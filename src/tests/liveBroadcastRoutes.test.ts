import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db';
import { buildLiveBroadcastState } from '../lib/liveBroadcast';
import { generateOrganizerToken } from '../server/auth';
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
});
