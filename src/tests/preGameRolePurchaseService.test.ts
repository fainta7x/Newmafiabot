import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { cancelPreGameRolePurchase, reserveRoleBeforeDeal } from '../server/services/preGameRolePurchaseService.ts';
import { openVirtualRoleDeal, revealVirtualRole, confirmVirtualRole, undoVirtualRole, resetVirtualRoleDeal } from '../server/services/virtualRoleDealService.ts';

const databases: DatabaseWrapper[] = [];
afterEach(() => { while (databases.length) databases.pop()?.sqlite.close(); });

async function setup(format = 'CASUAL') {
  const db = createDatabaseConnection(':memory:');
  databases.push(db);
  await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings
    (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('reservation-evening','Evening','2099-11-03T18:00:00Z','Europe/Moscow',?,'published',20,100,?,?)`,
    [format, now, now]);
  for (let i = 0; i < 10; i += 1) {
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)',
      [`buyer-${i}`, `Buyer ${i}`, now, now]);
    await db.run(`INSERT INTO evening_participants
      (id,evening_id,player_id,attendance_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES (?,'reservation-evening',?,'attended','unpaid',0,0,?,?)`,
      [`part-${i}`, `buyer-${i}`, now, now]);
  }
  const results = Array.from({ length: 10 }, (_, i) => ({
    seat_number: i + 1, player_id: `buyer-${i}`, participant_id: `part-${i}`,
  }));
  const protocol = { version: 1, kind: 'club_evening_protocol', protocol: { status: 'draft' }, player_results: results };
  await db.run(`INSERT INTO games
    (id,evening_id,global_game_number,game_date,winner_team,winner_label,slots_json,protocol_text,created_at)
    VALUES (817,'reservation-evening',1,?,'draft','Черновик','[]',?,?)`,
    [now, JSON.stringify(protocol), now]);
  return db;
}
const due = async (db: DatabaseWrapper, playerId: string) =>
  Number((await db.get<{ amount_due: number }>('SELECT amount_due FROM evening_participants WHERE player_id=?', [playerId]))?.amount_due);

describe('pre-deal role purchase persistence and debt', () => {
  it('charges immediately before the virtual role deal and reverses on organizer cancellation', async () => {
    const db = await setup();
    const order = await reserveRoleBeforeDeal(db, 817, 'buyer-0', 'sheriff');
    expect(order.status).toBe('reserved');
    expect(order.priceRub).toBe(150);
    expect(await due(db, 'buyer-0')).toBe(150);
    await cancelPreGameRolePurchase(db, order.id);
    expect(await due(db, 'buyer-0')).toBe(0);
    const replacement = await reserveRoleBeforeDeal(db, 817, 'buyer-1', 'sheriff');
    expect(replacement.status).toBe('reserved');
  });

  it('the second sheriff order is deferred but does not expose the first buyer', async () => {
    const db = await setup();
    await reserveRoleBeforeDeal(db, 817, 'buyer-0', 'sheriff');
    const second = await reserveRoleBeforeDeal(db, 817, 'buyer-1', 'sheriff');
    expect(second).toEqual(expect.objectContaining({ status: 'deferred', priceRub: 150 }));
    expect(JSON.stringify(second)).not.toContain('buyer-0');
    expect(await due(db, 'buyer-0')).toBe(150);
    expect(await due(db, 'buyer-1')).toBe(150);
  });

  it('does not reserve for non-participant or duplicate buyer', async () => {
    const db = await setup();
    await expect(reserveRoleBeforeDeal(db, 817, 'outsider', 'don')).rejects.toThrow(/участвует/);
    await reserveRoleBeforeDeal(db, 817, 'buyer-0', 'don');
    await expect(reserveRoleBeforeDeal(db, 817, 'buyer-0', 'mafia')).rejects.toThrow();
    expect(await due(db, 'buyer-0')).toBe(150);
  });

  it('a buyer receives the paid role even if choosing a different closed card; debt is charged only once', async () => {
    const db = await setup();
    await reserveRoleBeforeDeal(db, 817, 'buyer-2', 'sheriff');
    const opened = await openVirtualRoleDeal(db, 817);
    const firstCardId = opened.cards[0].id;
    const reveal = await revealVirtualRole(db, 817, 3, firstCardId, opened.version);
    expect(reveal.role).toBe('sheriff');
    const confirmed = await confirmVirtualRole(db, 817, 3, firstCardId, reveal.version);
    expect(confirmed.history).toEqual([expect.objectContaining({ seat: 3, role: 'sheriff' })]);
    expect(await due(db, 'buyer-2')).toBe(150);
    const dbRow = await db.get<{ status: string }>(
      "SELECT status FROM game_role_reservations WHERE game_id=817 AND player_id='buyer-2'",
    );
    expect(dbRow?.status).toBe('fulfilled');
  });

  it('other players cannot draw the last prepaid card; undo/redeal retain the paid reservation', async () => {
    const db = await setup();
    await reserveRoleBeforeDeal(db, 817, 'buyer-2', 'sheriff');
    const opened = await openVirtualRoleDeal(db, 817);
    const raw = await db.get<{ state_json: string }>('SELECT state_json FROM game_virtual_role_deals WHERE game_id=817');
    const state = JSON.parse(String(raw?.state_json));
    const sheriffId: string = state.deck.find((card: any) => card.role === 'sheriff').id;
    const otherReveal = await revealVirtualRole(db, 817, 1, sheriffId, opened.version);
    expect(otherReveal.role).not.toBe('sheriff');
    let confirmed = await confirmVirtualRole(db, 817, 1, sheriffId, otherReveal.version);
    const buyerCardId = confirmed.cards[0].id;
    const buyerReveal = await revealVirtualRole(db, 817, 3, buyerCardId, confirmed.version);
    expect(buyerReveal.role).toBe('sheriff');
    confirmed = await confirmVirtualRole(db, 817, 3, buyerCardId, buyerReveal.version);
    expect(await due(db, 'buyer-2')).toBe(150);
    const undone = await undoVirtualRole(db, 817, confirmed.version);
    expect(await due(db, 'buyer-2')).toBe(150);
    await resetVirtualRoleDeal(db, 817, undone.version);
    expect(await due(db, 'buyer-2')).toBe(150);
    const row = await db.get<{ status: string }>("SELECT status FROM game_role_reservations WHERE game_id=817 AND player_id='buyer-2'");
    expect(row?.status).toBe('reserved');
  });

  it('does not sell roles on rating evenings', async () => {
    const db = await setup('RATING');
    await expect(reserveRoleBeforeDeal(db, 817, 'buyer-0', 'don')).rejects.toThrow();
  });
});
