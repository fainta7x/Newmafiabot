import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { closedEveningDebtOwed, loadPlayerEveningDebts } from '../server/services/playerEveningDebts.ts';

// AR03 (2026-11-03): one debt rule for the CRM debts screen, the players list and the wallet. Characterises every kind
// of row: settled/open/cancelled evenings, waiver, partial payment, empty status and amounts, contradictory status.
const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const stamp = '2026-10-20T10:00:00.000Z';

type Case = { id: string; evening: 'done' | 'settled' | 'open' | 'cancelled'; attendance: string; status: string | null; due: number | null; paid: number | null; owed: number };
const CASES: Case[] = [
  { id: 'unpaid', evening: 'done', attendance: 'attended', status: 'unpaid', due: 500, paid: 0, owed: 500 },
  { id: 'partial', evening: 'done', attendance: 'attended', status: 'partial', due: 500, paid: 200, owed: 300 },
  { id: 'paid', evening: 'done', attendance: 'attended', status: 'paid', due: 500, paid: 500, owed: 0 },
  { id: 'waived', evening: 'done', attendance: 'attended', status: 'waived', due: 500, paid: 0, owed: 0 },
  { id: 'emptystatus', evening: 'done', attendance: 'attended', status: '', due: 500, paid: 0, owed: 500 },
  { id: 'nullpaid', evening: 'done', attendance: 'attended', status: 'unpaid', due: 500, paid: null, owed: 500 },
  { id: 'paidbutshort', evening: 'done', attendance: 'attended', status: 'paid', due: 500, paid: 100, owed: 400 },
  { id: 'noshow', evening: 'done', attendance: 'no_show', status: 'unpaid', due: 500, paid: 0, owed: 0 },
  { id: 'settled', evening: 'settled', attendance: 'attended', status: 'unpaid', due: 300, paid: 0, owed: 300 },
  { id: 'open', evening: 'open', attendance: 'attended', status: 'unpaid', due: 500, paid: 0, owed: 0 },
  { id: 'cancelled', evening: 'cancelled', attendance: 'attended', status: 'unpaid', due: 500, paid: 0, owed: 0 },
];

const seed = async () => {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  for (const c of CASES) {
    const status = c.evening === 'done' ? 'completed' : c.evening === 'settled' ? 'active' : c.evening === 'open' ? 'published' : 'cancelled';
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
      VALUES (?,?,?,'Europe/Moscow','CASUAL',?,20,500,?,?,?)`, [`e-${c.id}`, c.id, stamp, status, c.evening === 'settled' ? stamp : null, stamp, stamp]);
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [`p-${c.id}`, c.id, stamp, stamp]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES (?,?,?,'going','going',?,'on_time',?,?,?,?,?)`, [`ep-${c.id}`, `e-${c.id}`, `p-${c.id}`, c.attendance, c.status, c.due ?? 0, c.paid ?? 0, stamp, stamp]);
    if (c.due === null) await db.run('UPDATE evening_participants SET amount_due = NULL WHERE id = ?', [`ep-${c.id}`]).catch(() => {});
    if (c.paid === null) await db.run('UPDATE evening_participants SET amount_paid = NULL WHERE id = ?', [`ep-${c.id}`]).catch(() => {});
  }
  return db;
};

describe('one debt read rule (AR03)', () => {
  it('the CRM debts loader owes exactly the characterised amounts', async () => {
    const db = await seed();
    const owed = new Map((await loadPlayerEveningDebts(db)).map((d) => [d.nickname, d.owed]));
    for (const c of CASES) expect([c.id, owed.get(c.id) || 0]).toEqual([c.id, c.owed]);
  });

  it('the row rule used by the wallet agrees with the SQL rule for every row', async () => {
    const db = await seed();
    const rows = await db.all<any>(`SELECT ep.*, e.status AS evening_status, e.settled_at, pl.nickname FROM evening_participants ep
      JOIN game_evenings e ON e.id = ep.evening_id JOIN players pl ON pl.id = ep.player_id`);
    for (const row of rows) expect([row.nickname, closedEveningDebtOwed(row)]).toEqual([row.nickname, CASES.find((c) => c.id === row.nickname)!.owed]);
  });

  it('one player\'s debt is read by the same rule', async () => {
    const db = await seed();
    expect((await loadPlayerEveningDebts(db, 'p-partial'))[0]?.owed).toBe(300);
    expect(await loadPlayerEveningDebts(db, 'p-waived')).toEqual([]);
  });
});
