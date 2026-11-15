import { setClosedEveningParticipantPaid } from '../server/services/closedEveningPaymentService.ts';
import { afterEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { loadEveningSlotPlan } from '../server/services/eveningSlotPlanningService.ts';
import { reconcileOtherFormatExtensions, reconcileRegularEveningPayments } from '../server/services/eveningPaymentPricingService.ts';
import * as elo from '../server/services/eloRatingService.ts';

const databases: DatabaseWrapper[] = [];
afterEach(() => { vi.restoreAllMocks(); databases.splice(0).forEach(db => db.sqlite.close()); });
async function seed() {
  const db = createDatabaseConnection(':memory:'); databases.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run("INSERT INTO game_evenings (id,title,starts_at,format,status,default_price,created_at,updated_at) VALUES ('e','Audit',?,'CASUAL','active',100,?,?)", [now,now,now]);
  await db.run("INSERT INTO evening_tables (id,evening_id,name,capacity,created_at,updated_at) VALUES ('t','e','Table',10,?,?)", [now,now]);
  const seats = [];
  for (let i=1;i<=10;i++) {
    await db.run("INSERT INTO players (id,nickname,game_level,club_stage,created_at,updated_at) VALUES (?,?,'club','CLUB_PLAYER',?,?)", [`p${i}`,`Audit ${i}`,now,now]);
    await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES (?,'e',?,'going','going','pending','unknown','waived',0,0,?,?)", [`ep${i}`,`p${i}`,now,now]);
    seats.push({ participant_id:`ep${i}`,seat_number:i });
  }
  const cookie = `organizer_token=${generateOrganizerToken()}`;
  const body = { evening_table_id:'t',judge_guest:true,judge_name:'Audit judge',seats };
  const create = (extra: Record<string, unknown> = {}) => request(app).post('/api/games/evening/e').set('Cookie',cookie).send({...body,...extra});
  return {db,app,cookie,create};
}

it('retries creation from a planned slot without duplicating the game or started seats', async () => {
  const {db,create} = await seed();
  const plan = await loadEveningSlotPlan(db,'e');
  const first = await create({planned_slot_id:plan.slots[0].id});
  expect(first.status,JSON.stringify(first.body)).toBe(201);
  const retry = await create({planned_slot_id:plan.slots[0].id});
  expect(retry.status,JSON.stringify(retry.body)).toBe(200);
  expect(retry.body.id).toBe(first.body.id);
  expect((await db.all("SELECT id FROM games WHERE evening_id='e'"))).toHaveLength(1);
  expect((await db.all("SELECT id FROM evening_seat_plans WHERE evening_id='e' AND started=1"))).toHaveLength(10);
  const game = await db.get<any>('SELECT protocol_text FROM games WHERE id=?',[first.body.id]);
  const protocol = JSON.parse(game.protocol_text); protocol.protocol.status='completed';
  await db.run('UPDATE games SET protocol_text=? WHERE id=?',[JSON.stringify(protocol),first.body.id]);
  const duplicateAfterCompletion = await create({planned_slot_id:plan.slots[0].id});
  expect(duplicateAfterCompletion.status).toBe(409);
  expect(await db.all("SELECT id FROM games WHERE evening_id='e'")).toHaveLength(1);
});

it('rechecks cancellation before creating a game and marking attendance', async () => {
  const {db,create} = await seed();
  const original = db.transaction.bind(db);
  let cancel = true;
  vi.spyOn(db,'transaction').mockImplementation(async callback => {
    if(cancel) { cancel=false; await db.run("UPDATE game_evenings SET status='cancelled' WHERE id='e'"); }
    return original(callback);
  });
  const response = await create();
  expect(response.status,JSON.stringify(response.body)).toBe(409);
  expect(await db.all("SELECT id FROM games WHERE evening_id='e'")).toEqual([]);
  expect((await db.get<any>("SELECT COUNT(*) AS n FROM evening_participants WHERE attendance_status='attended'"))?.n).toBe(0);
});

async function completed() {
  const fixture = await seed();
  const created = await fixture.create();
  expect(created.status).toBe(201);
  const game = await fixture.db.get<any>('SELECT protocol_text FROM games WHERE id=?',[created.body.id]);
  const protocol = JSON.parse(game.protocol_text);
  protocol.protocol.status='completed'; protocol.protocol.winner_team='red';
  await fixture.db.run("UPDATE games SET winner_team='Красные',protocol_text=? WHERE id=?",[JSON.stringify(protocol),created.body.id]);
  await reconcileRegularEveningPayments(fixture.db,'e');
  return {...fixture,gameId:created.body.id};
}

it('archive and restore immediately reconcile the played-game fee', async () => {
  const {db,app,cookie,gameId} = await completed();
  expect((await db.get<any>("SELECT amount_due FROM evening_participants WHERE id='ep1'"))?.amount_due).toBe(100);
  const archived = await request(app).post(`/api/games/${gameId}/archive`).set('Cookie',cookie).send({});
  expect(archived.status,JSON.stringify(archived.body)).toBe(200);
  expect((await db.get<any>("SELECT amount_due FROM evening_participants WHERE id='ep1'"))?.amount_due).toBe(0);
  const restored = await request(app).post(`/api/games/${gameId}/archive/restore`).set('Cookie',cookie).send({});
  expect(restored.status,JSON.stringify(restored.body)).toBe(200);
  expect((await db.get<any>("SELECT amount_due FROM evening_participants WHERE id='ep1'"))?.amount_due).toBe(100);
});

it('a failed Elo projection does not report a committed archive as refused', async () => {
  const {db,app,cookie,gameId} = await completed();
  vi.spyOn(elo,'rebuildCanonicalEloRatings').mockRejectedValue(new Error('injected Elo outage'));
  const archived = await request(app).post(`/api/games/${gameId}/archive`).set('Cookie',cookie).send({});
  expect(archived.status,JSON.stringify(archived.body)).toBe(200);
  expect((await db.get<any>('SELECT archived_at FROM games WHERE id=?',[gameId]))?.archived_at).toBeTruthy();
});


it.each(['NOVICE','RATING'])('archive and restore reconcile extension charges on %s evenings', async format => {
  const {db,app,cookie,gameId} = await completed();
  await db.run("UPDATE game_evenings SET format=? WHERE id='e'", [format]);
  await db.run("UPDATE evening_participants SET amount_due=200,payment_status='unpaid',extension_due=0,extension_total_due=0 WHERE evening_id='e'");
  await db.run("INSERT INTO evening_extensions (id,evening_id,games_count,amount,created_at,games_total_at_entry) VALUES ('ext','e',1,1000,?,1)", [new Date().toISOString()]);
  await reconcileOtherFormatExtensions(db,'e');
  expect((await db.get<any>("SELECT amount_due FROM evening_participants WHERE id='ep1'"))?.amount_due).toBe(300);
  expect((await request(app).post(`/api/games/${gameId}/archive`).set('Cookie',cookie).send({})).status).toBe(200);
  expect((await db.get<any>("SELECT amount_due FROM evening_participants WHERE id='ep1'"))?.amount_due).toBe(200);
  expect((await request(app).post(`/api/games/${gameId}/archive/restore`).set('Cookie',cookie).send({})).status).toBe(200);
  expect((await db.get<any>("SELECT amount_due FROM evening_participants WHERE id='ep1'"))?.amount_due).toBe(300);
});


it.each(['CASUAL','NOVICE','RATING'])('repricing racing a payment keeps %s status consistent with received money', async format => {
  const {db} = await completed();
  const now = new Date().toISOString();
  await db.run("UPDATE game_evenings SET status='completed',settled_at=? WHERE id='e'", [now]);
  await db.run("UPDATE evening_participants SET amount_due=50,payment_status='unpaid' WHERE id='ep1'");
  if (format !== 'CASUAL') {
    await db.run("UPDATE game_evenings SET format=? WHERE id='e'", [format]);
    await db.run("INSERT INTO evening_extensions (id,evening_id,games_count,amount,created_at,games_total_at_entry) VALUES ('race-ext','e',1,1000,?,1)", [now]);
  }
  let read!: () => void;
  let release!: () => void;
  const readReady = new Promise<void>(resolve => { read=resolve; });
  const released = new Promise<void>(resolve => { release=resolve; });
  const original = db.all.bind(db);
  let held = false;
  vi.spyOn(db,'all').mockImplementation(async (sql: any, params?: any) => {
    const rows = await original(sql,params);
    if (!held && String(sql).includes('SELECT ep.*') && String(sql).includes('FROM evening_participants ep')) {
      held=true; read(); await released;
    }
    return rows;
  });
  const pricing = format === 'CASUAL' ? reconcileRegularEveningPayments(db,'e') : reconcileOtherFormatExtensions(db,'e');
  await readReady;
  const payment = setClosedEveningParticipantPaid(db,'ep1',true);
  await new Promise<void>(resolve => { setImmediate(resolve); });
  release();
  await Promise.all([pricing,payment]);
  const row = await db.get<any>("SELECT amount_due,amount_paid,payment_status FROM evening_participants WHERE id='ep1'");
  expect(row.amount_due).toBe(format === 'CASUAL' ? 100 : 150);
  expect(row.amount_paid).toBeGreaterThan(0);
  expect(row.payment_status).toBe(row.amount_paid >= row.amount_due ? 'paid' : 'partial');
});


it('repeated archive/restore of a paid closed evening preserves received money', async () => {
  const {db,app,cookie,gameId} = await completed();
  await db.run("UPDATE game_evenings SET status='completed',settled_at=? WHERE id='e'", [new Date().toISOString()]);
  await setClosedEveningParticipantPaid(db,'ep1',true);
  for (let i=0;i<2;i++) {
    for (const action of ['archive','archive/restore']) {
      const response = await request(app).post(`/api/games/${gameId}/${action}`).set('Cookie',cookie).send({});
      expect(response.status,JSON.stringify(response.body)).toBe(200);
      const row = await db.get<any>("SELECT amount_paid,payment_status FROM evening_participants WHERE id='ep1'");
      expect(row).toEqual({amount_paid:100,payment_status:'paid'});
      const ledger = await db.get<any>("SELECT COALESCE(SUM(amount),0) AS received FROM financial_transactions WHERE source_id='ep1' AND type IN ('income','debt_paid')");
      expect(ledger.received).toBe(100);
    }
  }
});


it('revoking a judge by blocking the profile also revokes protocol writes', async () => {
  const {db,app,create} = await seed();
  const created = await create();
  const now = new Date().toISOString();
  await db.run("INSERT INTO players (id,nickname,judge_level,host_formats,contact_status,created_at,updated_at) VALUES ('j','Audit judge','host','CASUAL','normal',?,?)", [now,now]);
  await db.run("UPDATE games SET judge_player_id='j' WHERE id=?", [created.body.id]);
  const cookie = `player_token=${generatePlayerSessionToken('j')}`;
  const save = () => request(app).put(`/api/games/${created.body.id}/evening-protocol`).set('Cookie',cookie)
    .send({protocol:created.body.club_protocol.protocol,player_results:created.body.club_protocol.player_results});
  expect((await save()).status).toBe(200);
  await db.run("UPDATE players SET contact_status='blocked' WHERE id='j'");
  expect((await request(app).get(`/api/live-checkpoints/club:${created.body.id}`).set('Cookie',cookie)).status).toBe(401);
  expect((await save()).status).toBe(401);
});
