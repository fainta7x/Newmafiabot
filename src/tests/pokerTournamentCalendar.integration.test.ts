import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { createPokerTournament, registerForPokerTournament, cancelPokerTournament } from '../server/services/pokerTournamentService.ts';

describe('poker tournaments in the player calendar', () => {
  let db: DatabaseWrapper;
  let app: any;
  const stamp = '2026-10-10T10:00:00.000Z';

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    await db.run(`INSERT INTO players (id,nickname,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at) VALUES ('p1','Один','normal','normal','none',1000,1000,?,?),('p2','Два','normal','normal','none',1000,1000,?,?)`, [stamp, stamp, stamp, stamp]);
  });

  const month = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const calendar = (playerId: string, key: string) => request(app).get(`/api/player/calendar?month=${key}`).set('Cookie', `player_token=${generatePlayerSessionToken(playerId)}`);

  it('lists a tournament of the month with the player count and his own registration, and drops a cancelled one', async () => {
    const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60_000);
    const row = await createPokerTournament(db, null, { title: 'Турбо вечера', startAt: startsAt.toISOString(), minPlayers: 2, maxPlayers: 8 });
    await registerForPokerTournament(db, row.id, 'p1');

    const mine = await calendar('p1', month(startsAt));
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    const poker = mine.body.events.find((event: any) => event.event_type === 'poker');
    expect(poker).toMatchObject({ id: row.id, title: 'Турбо вечера', format: 'POKER', badge: 'Покер', participant_count: 1, participant_limit: 8, min_players: 2, registration_status: 'registered', remaining_places: 7, poker_status: 'registration' });

    const other = await calendar('p2', month(startsAt));
    expect(other.body.events.find((event: any) => event.event_type === 'poker')).toMatchObject({ registration_status: null, participant_count: 1 });

    const elsewhere = await calendar('p1', month(new Date(startsAt.getTime() + 62 * 24 * 60 * 60_000)));
    expect(elsewhere.body.events.some((event: any) => event.event_type === 'poker')).toBe(false);

    await cancelPokerTournament(db, row.id, 'тест');
    const afterCancel = await calendar('p1', month(startsAt));
    expect(afterCancel.body.events.some((event: any) => event.event_type === 'poker')).toBe(false);
  });
});
