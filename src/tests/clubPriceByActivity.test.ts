import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { reconcileRegularEveningPayments } from '../server/services/eveningPaymentPricingService';
import { loadEveningSlotPlan } from '../server/services/eveningSlotPlanningService';

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

  it('shows every player his own price and the reason in the evening plan', async () => {
    await evening('published', null);
    await player('reg', "club_role = 'member', attends_sometimes = 0, stopped_attending = 0");
    await player('gone', "club_role = 'guest', attends_sometimes = 1, stopped_attending = 1");
    const regular: any = await loadEveningSlotPlan(db, 'e1', 'reg');
    const stopped: any = await loadEveningSlotPlan(db, 'e1', 'gone');
    expect(regular.personal_price).toMatchObject({ tier: 'regular', game: 100, cap: 400, sometimes_cap: 500, stopped_game: 200, stopped_cap: 800 });
    expect(regular.event.max_evening_price).toBe(400);
    expect(stopped.personal_price).toMatchObject({ tier: 'stopped', game: 200, cap: 800 });
    expect(stopped.event.max_evening_price).toBe(800);
    expect(stopped.slots[0].price).toBe(200);
    expect(((await loadEveningSlotPlan(db, 'e1')) as any).personal_price).toBeNull();
  });
});

import { tierFromLastVisit } from '../server/services/clubPriceTierService';
describe('club evening price follows the last visit (owner, 2026-11-16: «дороже только после 3 недель пропуска»)', () => {
  let db: DatabaseWrapper;
  const start = '2026-11-13T17:00:00.000Z';
  beforeEach(async () => { db = createDatabaseConnection(':memory:'); await createApp(db); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });
  const evening = async (id: string, startsAt: string, status: string) => db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
      VALUES (?,'Вечер',?,'Europe/Moscow','CASUAL',?,20,100,NULL,?,?)`, [id, startsAt, status, startsAt, startsAt]);
  const join = async (eveningId: string, id: string, attended = true) => db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES (?, ?, ?, 'going','going',?,'on_time','unpaid',0,0,?,?)`, [`${eveningId}-${id}`, eveningId, id, attended ? 'attended' : 'pending', start, start]);
  const player = async (id: string) => db.run(`INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,club_role,attends_sometimes,created_at,updated_at) VALUES (?,?, 'normal','test',1000,0,'guest',1,?,?)`, [id, id, start, start]);
  const playGames = async (ids: string[], games: number) => {
    for (let n = 1; n <= games; n++) {
      const protocol = { version: 1, kind: 'club_evening_protocol', protocol: { game_id: String(n), status: 'completed', winner_team: 'red' }, player_results: ids.map((id, i) => ({ participant_id: `e13-${id}`, player_id: id, seat_number: i + 1, display_name: id })) };
      await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES ('e13',?,?,'red','Победа красных',?,?,?)`,
        [100 + n, start, JSON.stringify(protocol), JSON.stringify(ids.map((id) => ({ participant_id: `e13-${id}`, player_id: id }))), start]);
    }
  };
  const due = async (id: string) => Number((await db.get<any>('SELECT amount_due FROM evening_participants WHERE id = ?', [`e13-${id}`]))?.amount_due);

  it('the borders: 21 days regular, then «иногда», after 60 days «перестал»', () => {
    expect(tierFromLastVisit('2026-10-23T18:00:00.000Z', start)).toBe('regular');
    expect(tierFromLastVisit('2026-10-22T16:00:00.000Z', start)).toBe('sometimes');
    expect(tierFromLastVisit('2026-09-14T17:00:00.000Z', start)).toBe('sometimes');
    expect(tierFromLastVisit('2026-09-13T16:00:00.000Z', start)).toBe('stopped');
    expect(tierFromLastVisit(null, start)).toBeNull();
  });

  it('Знак (last 23.10) and Кавасаки (last 3.11) pay the regular price on 13.11, though their «как ходит» says «иногда»', async () => {
    await evening('e23', '2026-10-23T18:00:00.000Z', 'completed');
    await evening('e03', '2026-11-03T18:00:00.000Z', 'completed');
    await evening('e01', '2026-09-01T18:00:00.000Z', 'completed');
    await evening('e13', start, 'active');
    for (const id of ['znak', 'kawa', 'away', 'new']) await player(id);
    await join('e23', 'znak'); await join('e03', 'kawa'); await join('e01', 'away');
    for (const id of ['znak', 'kawa', 'away', 'new']) await join('e13', id);
    await playGames(['znak', 'kawa', 'away', 'new'], 5);
    await reconcileRegularEveningPayments(db, 'e13');
    expect(await due('znak')).toBe(400);
    expect(await due('kawa')).toBe(400);
    expect(await due('away')).toBe(800); // last visit 73 days before: «перестал», 200 × 5 capped at 800
    expect(await due('new')).toBe(500); // never came: priced by his «как ходит» as before
  });
});

import { REPRICE_EVENING_ID, repriceEvening20261113Once } from '../server/services/clubPriceTierService';
describe('the closed evening of 13.11 is repriced once (owner, 2026-11-16: «исправить на 400+27»)', () => {
  let db: DatabaseWrapper;
  const start = '2026-11-13T17:00:00.000Z';
  beforeEach(async () => { db = createDatabaseConnection(':memory:'); await createApp(db); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });
  it('moves «иногда» players who came in the last 3 weeks to the regular price, leaves the rest, and runs once', async () => {
    const ev = (id: string, at: string, status: string) => db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at) VALUES (?,'Вечер',?,'Europe/Moscow','CASUAL',?,20,100,?,?,?)`, [id, at, status, status === 'completed' ? at : null, at, at]);
    await ev('e23', '2026-10-23T18:00:00.000Z', 'completed');
    await ev(REPRICE_EVENING_ID, start, 'active');
    for (const id of ['znak', 'away']) await db.run(`INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,club_role,attends_sometimes,created_at,updated_at) VALUES (?,?, 'normal','test',1000,0,'guest',1,?,?)`, [id, id, start, start]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES ('old','e23','znak','going','going','attended','on_time','unpaid',0,0,?,?)`, [start, start]);
    for (const id of ['znak', 'away']) await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES (?,?,?,'going','going','attended','on_time','unpaid',0,0,?,?)`, [`p-${id}`, REPRICE_EVENING_ID, id, start, start]);
    for (let n = 1; n <= 5; n++) {
      const protocol = { version: 1, kind: 'club_evening_protocol', protocol: { game_id: String(n), status: 'completed', winner_team: 'red' }, player_results: ['znak', 'away'].map((id, i) => ({ participant_id: `p-${id}`, player_id: id, seat_number: i + 1, display_name: id })) };
      await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES (?,?,?,'red','Победа красных',?,?,?)`, [REPRICE_EVENING_ID, 200 + n, start, JSON.stringify(protocol), JSON.stringify(['znak', 'away'].map((id) => ({ participant_id: `p-${id}`, player_id: id }))), start]);
    }
    // As it was in production: priced «иногда» while open, then closed.
    await reconcileRegularEveningPayments(db, REPRICE_EVENING_ID);
    await db.run(`UPDATE evening_participants SET price_tier = 'sometimes' WHERE evening_id = ?`, [REPRICE_EVENING_ID]);
    await db.run(`UPDATE game_evenings SET status = 'completed', settled_at = ? WHERE id = ?`, [start, REPRICE_EVENING_ID]);
    await reconcileRegularEveningPayments(db, REPRICE_EVENING_ID);
    const due = async (id: string) => Number((await db.get<any>('SELECT amount_due FROM evening_participants WHERE id = ?', [`p-${id}`]))!.amount_due);
    expect(await due('znak')).toBe(500);
    await db.run(`DELETE FROM app_data_migrations WHERE id = '2026-11-16-reprice-evening-2026-11-13'`);
    expect(await repriceEvening20261113Once(db)).toBe(1);
    expect(await due('znak')).toBe(400);
    expect(await due('away')).toBe(500); // never came before: stays as it was
    expect(await repriceEvening20261113Once(db)).toBe(0);
  });
});
