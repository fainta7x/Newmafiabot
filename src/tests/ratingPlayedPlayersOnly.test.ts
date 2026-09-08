import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db';
import { generateOrganizerToken } from '../server/auth';

describe('club rating eligibility', () => {
  let db: DatabaseWrapper;
  let app: any;
  const now = '2026-09-08T12:00:00.000Z';

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    await db.run("INSERT INTO players (id,nickname,elo,created_at,updated_at) VALUES ('played','Сыграл',1100,?,?),('empty','Без игр',1500,?,?)", [now, now, now, now]);
    await db.run("INSERT INTO game_evenings (id,title,starts_at,format,status,created_at,updated_at) VALUES ('evening','Вечер',?,'CASUAL','completed',?,?)", [now, now, now]);
    await db.run("INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES ('evening',1,?,'red','Победа красных',?,'[]',?)", [now, JSON.stringify({ version: 1, kind: 'club_evening_protocol', protocol: { status: 'completed' }, player_results: [{ player_id: 'played', participant_id: 'participant', seat_number: 1 }] }), now]);
  });

  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('returns only players with at least one completed game', async () => {
    const response = await request(app).get('/api/rating').set('Cookie', `organizer_token=${generateOrganizerToken()}`);
    expect(response.status).toBe(200);
    expect(response.body.players).toHaveLength(1);
    expect(response.body.players[0]).toMatchObject({ player_id: 'played', nickname: 'Сыграл', games: 1, place: 1 });
  });
});
