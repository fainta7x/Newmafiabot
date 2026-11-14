import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { setClosedEveningParticipantPaid, setClosedEveningParticipantPaidAmount } from '../server/services/closedEveningPaymentService.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { runCrmAutomationsAfterWrite } from '../server/services/crmAutomationService.ts';
import { markPlayerDebtPartiallyPaid } from '../server/services/debtActionsService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); opened.splice(0).forEach(db => db.sqlite.close()); });
const now = '2026-11-14T10:00:00Z';
const session = (roundNumber: number) => JSON.stringify({ phase: 'day_speeches', roundNumber, activePlayers: [] });
async function seed() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  await db.run("INSERT INTO players(id,nickname,judge_level,created_at,updated_at) VALUES ('p','Audit player','judge',?,?),('other','Other judge','judge',?,?)", [now, now, now, now]);
  await db.run("INSERT INTO game_evenings(id,title,starts_at,timezone,format,status,settled_at,created_at,updated_at) VALUES ('e','Audit',?,'Europe/Moscow','NOVICE','completed',?,?,?)", [now, now, now, now]);
  await db.run("INSERT INTO evening_participants(id,evening_id,player_id,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES ('ep','e','p','attended','on_time','unpaid',400,0,?,?)", [now, now]);
  await db.run("INSERT INTO financial_transactions(id,type,amount,category,description,player_id,evening_id,source_type,source_id,created_at) VALUES ('debt','debt_created',400,'audit','synthetic','p','e','evening_settle','ep',?)", [now]);
  await db.run("INSERT INTO tournaments(id,title,date,status,judge_player_id,created_at,updated_at) VALUES ('t','Audit tournament',?,'active','p',?,?)", [now, now, now]);
  await db.run("INSERT INTO tournament_games(id,tournament_id,game_number,status,judge_player_id) VALUES ('g','t',1,'active','p')");
  return { db, app };
}

describe('functional audit: payments and task projection', () => {
  it('two distinct received partial payments are both retained', async () => {
    const { db } = await seed();
    await Promise.all([markPlayerDebtPartiallyPaid(db, 'p', 'e', 100), markPlayerDebtPartiallyPaid(db, 'p', 'e', 150)]);
    expect(await db.get("SELECT amount_paid FROM evening_participants WHERE id='ep'")).toEqual({ amount_paid: 250 });
    expect(await db.get("SELECT SUM(amount) AS amount FROM financial_transactions WHERE type='debt_paid'")).toEqual({ amount: 250 });
  });
  it('parallel full confirmations write the payment once, including a subsequent retry', async () => {
    const { db } = await seed();
    await Promise.all([setClosedEveningParticipantPaid(db, 'ep', true), setClosedEveningParticipantPaid(db, 'ep', true)]);
    await setClosedEveningParticipantPaid(db, 'ep', true);
    expect(await db.get("SELECT SUM(amount) AS amount FROM financial_transactions WHERE type='debt_paid'")).toEqual({ amount: 400 });
    expect(await db.get("SELECT amount_paid FROM evening_participants WHERE id='ep'")).toEqual({ amount_paid: 400 });
  });
  it('parallel absolute partial-payment updates agree with the ledger, and correction stays supported', async () => {
    const { db } = await seed();
    await Promise.all([setClosedEveningParticipantPaidAmount(db, 'ep', 150), setClosedEveningParticipantPaidAmount(db, 'ep', 150)]);
    expect(await db.get("SELECT SUM(amount) AS amount FROM financial_transactions WHERE type='debt_paid'")).toEqual({ amount: 150 });
    await setClosedEveningParticipantPaidAmount(db, 'ep', 100);
    expect(await db.get("SELECT SUM(amount) AS amount FROM financial_transactions WHERE type='debt_paid'")).toEqual({ amount: 100 });
    expect(await db.get("SELECT amount_paid FROM evening_participants WHERE id='ep'")).toEqual({ amount_paid: 100 });
  });
  it('retains a successful participant edit if task generation fails, then retries the projection', async () => {
    const { db, app } = await seed();
    await db.run("UPDATE game_evenings SET status='active',settled_at=NULL WHERE id='e'");
    const original = db.all.bind(db);
    const all = vi.spyOn(db, 'all').mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT p.id as player_id')) throw new Error('Synthetic task projection outage');
      return original(sql, params);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const response = await request(app).patch('/api/participant/ep').set('Cookie', `organizer_token=${generateOrganizerToken()}`).send({ notes: 'Saved note' });
    expect(response.status).toBe(200);
    expect(response.body.notes).toBe('Saved note');
    expect(await db.get("SELECT notes FROM evening_participants WHERE id='ep'")).toEqual({ notes: 'Saved note' });
    all.mockRestore();
    const retryRead = vi.spyOn(db, 'all');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(retryRead.mock.calls.some(([sql]) => sql.includes('SELECT p.id as player_id'))).toBe(true);
  });
  it('rebuilds the same derived tasks idempotently after a process restart', async () => {
    const { db } = await seed();
    await runCrmAutomationsAfterWrite(db);
    const before = await db.get('SELECT COUNT(*) AS n FROM organizer_tasks');
    await runCrmAutomationsAfterWrite(db);
    expect(await db.get('SELECT COUNT(*) AS n FROM organizer_tasks')).toEqual(before);
  });
});

describe('functional audit: game-scoped checkpoint API', () => {
  it('allows the assigned judge, denies another judge and revokes permission on reassignment', async () => {
    const { db, app } = await seed();
    const put = (player: string, revision: string | null = null) => request(app).put('/api/live-checkpoints/tournament%3Ag').set('Cookie', `player_token=${generatePlayerSessionToken(player)}`).send({ session: session(2), expected_revision: revision });
    expect((await put('other')).status).toBe(401);
    const first = await put('p');
    expect(first.status).toBe(200);
    expect(typeof first.body.revision).toBe('string');
    expect((await request(app).get('/api/live-checkpoints/tournament%3Ag').set('Cookie', `player_token=${generatePlayerSessionToken('p')}`)).status).toBe(200);
    await db.run("UPDATE tournament_games SET judge_player_id='other' WHERE id='g'");
    expect((await put('p', first.body.revision)).status).toBe(401);
    expect((await put('other', first.body.revision)).status).toBe(200);
  });
  it('rejects stale and unversioned saves, permits Undo with the current revision', async () => {
    const { app } = await seed();
    const put = (round: number, revision: string | null = null) => request(app).put('/api/live-checkpoints/tournament%3Ag').set('Cookie', `organizer_token=${generateOrganizerToken()}`).send({ session: session(round), expected_revision: revision });
    const first = await put(2);
    const newer = await put(5, first.body.revision);
    expect(newer.status).toBe(200);
    expect((await put(2, first.body.revision)).body.code).toBe('checkpoint_conflict');
    expect((await put(2)).status).toBe(409);
    const copy = await request(app).get('/api/live-checkpoints/tournament%3Ag').set('Cookie', `organizer_token=${generateOrganizerToken()}`);
    expect(JSON.parse(copy.body.session).roundNumber).toBe(5);
    expect((await put(4, newer.body.revision)).status).toBe(200);
  });
  it('arbitrates two competing devices: exactly one save wins', async () => {
    const { app } = await seed();
    const put = (revision: string | null) => request(app).put('/api/live-checkpoints/tournament%3Ag').set('Cookie', `organizer_token=${generateOrganizerToken()}`).send({ session: session(3), expected_revision: revision });
    const first = await put(null);
    const responses = await Promise.all([put(first.body.revision), put(first.body.revision)]);
    expect(responses.map(result => result.status).sort()).toEqual([200, 409]);
  });
  it('supports the assigned evening host without granting access to other games', async () => {
    const { db, app } = await seed();
    await db.run("UPDATE game_evenings SET status='active',settled_at=NULL WHERE id='e'");
    await db.run("INSERT INTO evening_staff_assignments(evening_id,organizer_player_id,assigned_at,updated_at) VALUES ('e','p',?,?)", [now, now]);
    const payload = JSON.stringify({ kind: 'club_evening_protocol', protocol: { status: 'draft' }, player_results: [] });
    await db.run("INSERT INTO games(id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES (7,'e',7,?,'red','',?,'[]',?)", [now, payload, now]);
    const response = await request(app).put('/api/live-checkpoints/club%3A7').set('Cookie', `player_token=${generatePlayerSessionToken('p')}`).send({ session: session(1) });
    expect(response.status).toBe(200);
    expect((await request(app).get('/api/live-checkpoints/club%3A7').set('Cookie', `player_token=${generatePlayerSessionToken('other')}`)).status).toBe(401);
  });
});
