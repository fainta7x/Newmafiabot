import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';

const stamp = '2026-10-10T10:00:00.000Z';

describe('player replay route', () => {
  let db: DatabaseWrapper;
  let app: any;
  const cookie = (id: string) => `player_token=${generatePlayerSessionToken(id)}`;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    await db.run(`INSERT INTO players (id,nickname,telegram_user_id,contact_status,lifecycle_status,game_level,club_role,elo,tokens,created_at,updated_at,profile_visibility_json)
      VALUES ('p1','Один','1','normal','normal','club','member',1000,0,?,?,'{}'),('p2','Два','2','normal','normal','club','member',1000,0,?,?,'{}'),('p3','Судья','3','normal','normal','club','member',1000,0,?,?,'{}'),('p4','Чужой','4','normal','normal','club','member',1000,0,?,?,'{}')`, [stamp, stamp, stamp, stamp, stamp, stamp, stamp, stamp]);
    await db.run(`INSERT INTO game_evenings(id,title,starts_at,status,format,created_at,updated_at) VALUES ('ev1','Вечер',?,'completed','CASUAL',?,?)`, [stamp, stamp, stamp]);
    // The protocol as the Live Game engine saves it: votes, shots, events; no «rounds».
    const payload = {
      kind: 'club_evening_protocol',
      player_results: [
        { role: 'citizen', seat_number: 1, player_id: 'p1', participant_id: 's1', display_name: 'Один' },
        { role: 'mafia', seat_number: 2, player_id: 'p2', participant_id: 's2', display_name: 'Два' },
      ],
      protocol: { status: 'completed', winner_team: 'red', completed_at: stamp, votes: [], shots: [], events: [
        { seq: 1, at: stamp, round: 1, phase: 'setup', kind: 'game_start' },
        { seq: 2, at: stamp, round: 2, phase: 'day_speeches', kind: 'reveal', seat: 2 },
        { seq: 3, at: stamp, round: 2, phase: 'day_speeches', kind: 'announced_check', seat: 2, target: 1, value: 'black' },
        { seq: 4, at: stamp, round: 2, phase: 'day_speeches', kind: 'nomination', seat: 2, by: 1 },
        { seq: 5, at: stamp, round: 2, phase: 'day_voting', kind: 'vote', seat: 1, target: 2, value: 1 },
        { seq: 6, at: stamp, round: 2, phase: 'day_voting', kind: 'vote_round_result', value: '1:single_eliminated' },
        { seq: 7, at: stamp, round: 2, phase: 'day_voting', kind: 'exit', seat: 2, value: 'voted_day' },
      ] },
    };
    await db.run(`INSERT INTO games(id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,judge_player_id,created_at) VALUES (1,'ev1',1,?,'red','Red',?,'[]','p3',?)`, [stamp, JSON.stringify(payload), stamp]);
  });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('opens for a player of the game and for its judge', async () => {
    for (const id of ['p1', 'p3']) {
      const response = await request(app).get('/api/player/games/club%3A1/replay').set('Cookie', cookie(id));
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.replay_available).toBe(true);
      expect(response.body.events.at(-1).type).toBe('finish');
      const texts = response.body.events.map((event: any) => `${event.title}: ${event.text}`);
      expect(texts).toContain('Вскрытие: Два вскрылся шерифом: Один — чёрный');
      expect(texts).toContain('Голосование: Два: 1 — выбывает один');
      expect(texts).toContain('Уход: Заголосован: Два');
    }
  });

  it('is refused for a stranger and without a session', async () => {
    expect((await request(app).get('/api/player/games/club%3A1/replay').set('Cookie', cookie('p4'))).status).toBe(403);
    expect((await request(app).get('/api/player/games/club%3A1/replay')).status).toBe(401);
  });
});
