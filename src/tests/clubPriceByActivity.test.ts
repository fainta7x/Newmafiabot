import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { reconcileRegularEveningPayments } from '../server/services/eveningPaymentPricingService';

describe('club evening price by «как ходит» (owner, 2026-11-11)', () => {
  let db: DatabaseWrapper;
  const now = '2026-11-12T20:00:00.000Z';
  beforeEach(async () => { db = createDatabaseConnection(':memory:'); await createApp(db); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  const evening = async (status: string, settled: string | null) => {
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
      VALUES ('e1','Вечер',?,'Europe/Moscow','CASUAL',?,20,100,?,?,?)`, [now, status, settled, now, now]);
  };
  const player = async (id: string, fields: string) => {
    await db.run(`INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at) VALUES (?,?, 'normal','test',1000,0,?,?)`, [id, id, now, now]);
    await db.run(`UPDATE players SET ${fields} WHERE id = ?`, [id]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES (?, 'e1', ?, 'going','going','attended','on_time','unpaid',0,0,?,?)`, ['p-' + id, id, now, now]);
  };
  const playGames = async (ids: string[], games: number) => {
    for (let n = 1; n <= games; n++) {
      const protocol = { version: 1, kind: 'club_evening_protocol', protocol: { game_id: String(n), status: 'completed', winner_team: 'red' }, player_results: ids.map((id, i) => ({ participant_id: 'p-' + id, player_id: id, seat_number: i + 1 })) };
      await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES ('e1',?,?,'red','Победа красных',?,?,?)`,
        [n, now, JSON.stringify(protocol), JSON.stringify(ids.map((id) => ({ participant_id: 'p-' + id, player_id: id }))), now]);
    }
  };
  const due = async (id: string) => Number((await db.get<any>('SELECT amount_due FROM evening_participants WHERE id = ?', ['p-' + id]))?.amount_due);

  it('charges each tier by its own price and cap', async () => {
    await evening('active', null);
    await player('reg', "club_role = 'member', attends_sometimes = 0, stopped_attending = 0");
    await player('some', "club_role = 'guest', attends_sometimes = 1, stopped_attending = 0");
    await player('gone', "club_role = 'guest', attends_sometimes = 1, stopped_attending = 1");
    await playGames(['reg', 'some', 'gone'], 6);
    await reconcileRegularEveningPayments(db, 'e1');
    expect(await due('reg')).toBe(400);
    expect(await due('some')).toBe(500);
    expect(await due('gone')).toBe(800);
  });

  it('does not reprice a closed evening when «как ходит» changes later', async () => {
    await evening('active', null);
    await player('reg', "club_role = 'member', attends_sometimes = 0, stopped_attending = 0");
    await playGames(['reg'], 6);
    await reconcileRegularEveningPayments(db, 'e1');
    expect(await due('reg')).toBe(400);
    await db.run("UPDATE game_evenings SET status = 'completed', settled_at = ? WHERE id = 'e1'", [now]);
    await db.run("UPDATE players SET stopped_attending = 1 WHERE id = 'reg'");
    await reconcileRegularEveningPayments(db, 'e1');
    expect(await due('reg')).toBe(400);
  });
});
