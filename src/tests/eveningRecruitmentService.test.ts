import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { loadEveningRecruitmentState } from '../server/services/eveningRecruitmentService';

describe('evening recruitment state', () => {
  let db: DatabaseWrapper;
  const now = '2026-08-28T10:00:00.000Z';

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('recruit-evening','Friday game','2026-08-28T20:00:00+03:00','Europe/Moscow','CASUAL','published',20,100,?,?)`,
      [now, now],
    );
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  const addPlayer = async (index: number, response: string) => {
    const playerId = `recruit-player-${index}`;
    const participantId = `recruit-participant-${index}`;
    await db.run(
      `INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at)
       VALUES (?,?, 'normal','test',1000,0,?,?)`,
      [playerId, `Player ${index}`, now, now],
    );
    await db.run(
      `INSERT INTO evening_participants
       (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
       VALUES (?, 'recruit-evening', ?, ?, ?, 'pending','unknown','unpaid',0,0,?,?)`,
      [participantId, playerId, response, response, now, now],
    );
  };

  it('counts going and late as confirmed and reports the missing player seats', async () => {
    for (let i = 1; i <= 5; i += 1) await addPlayer(i, 'going');
    for (let i = 6; i <= 7; i += 1) await addPlayer(i, 'late');
    await addPlayer(8, 'thinking');
    await addPlayer(9, 'declined');
    await addPlayer(10, 'unanswered');

    const state = await loadEveningRecruitmentState(db, 'recruit-evening');
    expect(state).toMatchObject({
      target_players: 10,
      confirmed_players: 7,
      needed_players: 3,
      thinking_players: 1,
      unanswered_players: 1,
      can_recruit: true,
    });
  });

  it('stops offering recruitment once ten players are confirmed', async () => {
    for (let i = 1; i <= 10; i += 1) await addPlayer(i, i === 10 ? 'late' : 'going');

    const state = await loadEveningRecruitmentState(db, 'recruit-evening');
    expect(state).toMatchObject({
      confirmed_players: 10,
      needed_players: 0,
      can_recruit: false,
    });
  });
});
