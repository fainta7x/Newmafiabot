import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { cancelPreGameRolePurchase, reserveRoleBeforeDeal } from '../server/services/preGameRolePurchaseService.ts';
import { orderGameMusic, markGameMusicPlayed, cancelGameMusicOrder, cancelOutstandingGameMusicOrders } from '../server/services/gameMusicOrderService.ts';
import { orderGameSeatSwap, applyGameSeatSwap, cancelGameSeatSwap, cancelOutstandingGameSeatSwaps } from '../server/services/gameSeatSwapOrderService.ts';
import { reconcileNoviceEveningCharges } from '../server/services/eveningSlotPlanningService.ts';
import { reconcileOtherFormatExtensions } from '../server/services/eveningPaymentPricingService.ts';
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

  it('API allows a player to order only for their own game and organizer to cancel', async () => {
    const db = await setup();
    // createApp installs all routes; it shares this in-memory database.
    const app = await createApp(db);
    const buyerToken = generatePlayerSessionToken('buyer-0');
    const otherToken = generatePlayerSessionToken('not-at-table');
    const payload = { gameId: 817, role: 'don' };

    await request(app).post('/api/player/role-purchases').send(payload).expect(401);
    await request(app).post('/api/player/role-purchases').set('Cookie', `player_token=${otherToken}`).send(payload).expect(403);
    const receipt = await request(app).post('/api/player/role-purchases')
      .set('Cookie', `player_token=${buyerToken}`).send(payload).expect(201);
    expect(receipt.body).toMatchObject({ accepted: true, priceRub: 150 });
    expect(receipt.body).not.toHaveProperty('role');
    expect(await due(db, 'buyer-0')).toBe(150);

    const buyerList = await request(app).get('/api/player/role-purchases')
      .set('Cookie', `player_token=${buyerToken}`).expect(200);
    expect(buyerList.body.orders).toEqual([expect.objectContaining({ role: 'don' })]);
    const strangerList = await request(app).get('/api/player/role-purchases')
      .set('Cookie', `player_token=${otherToken}`).expect(200);
    expect(strangerList.body.orders).toEqual([]);

    await request(app).delete(`/api/admin/role-purchases/${receipt.body.orderId}`)
      .set('Cookie', `player_token=${buyerToken}`).expect(401);
    await request(app).delete(`/api/admin/role-purchases/${receipt.body.orderId}`)
      .set('Cookie', `organizer_token=${generateOrganizerToken()}`).expect(200);
    expect(await due(db, 'buyer-0')).toBe(0);
  });

  it('admin can inspect and order privately, but a regular buyer cannot list admin orders', async () => {
    const db = await setup();
    const app = await createApp(db);
    const admin = `organizer_token=${generateOrganizerToken()}`;
    const guest = `player_token=${generatePlayerSessionToken('buyer-1')}`;
    const created = await request(app).post('/api/admin/role-purchases')
      .set('Cookie', admin).send({ gameId: 817, playerId: 'buyer-0', role: 'mafia' }).expect(201);
    expect(created.body).toMatchObject({ accepted: true, priceRub: 150 });
    const adminView = await request(app).get('/api/admin/role-purchases?gameId=817')
      .set('Cookie', admin).expect(200);
    expect(adminView.body.orders).toEqual([expect.objectContaining({ player_id: 'buyer-0', role: 'mafia', status: 'reserved' })]);
    await request(app).get('/api/admin/role-purchases?gameId=817').set('Cookie', guest).expect(401);
    const guestView = await request(app).get('/api/player/role-purchases').set('Cookie', guest).expect(200);
    expect(guestView.body.orders).toEqual([]);
    await request(app).delete(`/api/admin/role-purchases/${created.body.orderId}`)
      .set('Cookie', admin).expect(200);
    expect(await due(db, 'buyer-0')).toBe(0);
  });

  it('assigned judge can create and list purchases for own game but cannot cancel them', async () => {
    const db = await setup();
    await db.run("UPDATE players SET judge_level='host' WHERE id='buyer-9'");
    await db.run("UPDATE games SET judge_player_id='buyer-9' WHERE id=817");
    // For real games a judge is not seated; replace the last seat with a
    // separate participant rather than treating a seated buyer as judge.
    const row = await db.get<{ protocol_text: string }>('SELECT protocol_text FROM games WHERE id=817');
    const payload = JSON.parse(String(row?.protocol_text));
    payload.player_results[9].player_id = 'buyer-8';
    await db.run('UPDATE games SET protocol_text=? WHERE id=817', [JSON.stringify(payload)]);
    const app = await createApp(db);
    const judge = `player_token=${generatePlayerSessionToken('buyer-9')}`;
    const outsider = `player_token=${generatePlayerSessionToken('buyer-7')}`;
    const order = await request(app).post('/api/admin/role-purchases').set('Cookie', judge)
      .send({ gameId: 817, playerId: 'buyer-0', role: 'sheriff' }).expect(201);
    const list = await request(app).get('/api/admin/role-purchases?gameId=817').set('Cookie', judge).expect(200);
    expect(list.body.orders).toEqual([expect.objectContaining({ role: 'sheriff', player_id: 'buyer-0' })]);
    await request(app).get('/api/admin/role-purchases?gameId=817').set('Cookie', outsider).expect(401);
    await request(app).delete(`/api/admin/role-purchases/${order.body.orderId}`).set('Cookie', judge).expect(401);
  });

  it('shop lists only this player\'s prepared games, and hides any paid card details', async () => {
    const db = await setup();
    const app = await createApp(db);
    const buyer = `player_token=${generatePlayerSessionToken('buyer-0')}`;
    const outside = `player_token=${generatePlayerSessionToken('outsider')}`;
    const games = await request(app).get('/api/player/role-purchase-games').set('Cookie', buyer).expect(200);
    expect(games.body.games).toEqual([expect.objectContaining({ gameId: 817, eveningId: 'reservation-evening' })]);
    expect(JSON.stringify(games.body)).not.toContain('role');
    const other = await request(app).get('/api/player/role-purchase-games').set('Cookie', outside).expect(200);
    expect(other.body.games).toEqual([]);
    await reserveRoleBeforeDeal(db, 817, 'buyer-1', 'don');
    const after = await request(app).get('/api/player/role-purchase-games').set('Cookie', buyer).expect(200);
    expect(after.body.games).toEqual(games.body.games); // A secret role order never changes public availability.
    await openVirtualRoleDeal(db, 817);
    const closed = await request(app).get('/api/player/role-purchase-games').set('Cookie', buyer).expect(200);
    expect(closed.body.games).toEqual([]);
  });

  it('old in-deal purchase endpoint is closed even to an organizer', async () => {
    const db = await setup();
    const app = await createApp(db);
    const opened = await openVirtualRoleDeal(db, 817);
    const response = await request(app).post('/api/games/817/virtual-deal/buy')
      .set('Cookie', `organizer_token=${generateOrganizerToken()}`)
      .send({ seat: 1, role: 'don', version: opened.version }).expect(409);
    expect(response.body.error).toMatch(/до начала раздачи/);
  });

  it('cannot silently remove the debt after the buyer has revealed a paid role', async () => {
    const db = await setup();
    const order = await reserveRoleBeforeDeal(db, 817, 'buyer-0', 'don');
    const opened = await openVirtualRoleDeal(db, 817);
    await revealVirtualRole(db, 817, 1, opened.cards[0].id, opened.version);
    await expect(cancelPreGameRolePurchase(db, order.id)).rejects.toThrow(/открытую карту/);
    expect(await due(db, 'buyer-0')).toBe(150);
  });

  it('music order adds 50 rubles instantly and organizer cancellation returns it', async () => {
    const db = await setup();
    const order = await orderGameMusic(db, 817, 'buyer-0', 'https://music.yandex.ru/album/123/track/456');
    expect(order.priceRub).toBe(50);
    expect(await due(db, 'buyer-0')).toBe(50);
    await cancelGameMusicOrder(db, order.id);
    expect(await due(db, 'buyer-0')).toBe(0);
  });

  it('judge can order by song name, mark played and avoid duplicate charges', async () => {
    const db = await setup();
    const order = await orderGameMusic(db, 817, 'buyer-0', 'Тестовая песня', true);
    expect(await due(db, 'buyer-0')).toBe(50);
    await markGameMusicPlayed(db, order.id, 817);
    await markGameMusicPlayed(db, order.id, 817);
    expect(await due(db, 'buyer-0')).toBe(50);
    await expect(cancelGameMusicOrder(db, order.id)).rejects.toThrow(/уже исполнена/);
  });

  it('music order requires Yandex Music URL from player, not arbitrary link', async () => {
    const db = await setup();
    await expect(orderGameMusic(db, 817, 'buyer-0', 'https://example.com/track')).rejects.toThrow(/Яндекс/);
    await expect(orderGameMusic(db, 817, 'outsider', 'https://music.yandex.ru/album/2')).rejects.toThrow(/участвуете/);
    expect(await due(db, 'buyer-0')).toBe(0);
  });

  it('unplayed music is cancelled at end of evening, played music stays charged', async () => {
    const db = await setup();
    const first = await orderGameMusic(db, 817, 'buyer-0', 'https://music.yandex.ru/album/1');
    const second = await orderGameMusic(db, 817, 'buyer-1', 'https://music.yandex.ru/album/2');
    await markGameMusicPlayed(db, first.id, 817);
    const cancelled = await cancelOutstandingGameMusicOrders(db, 'reservation-evening');
    expect(cancelled).toBe(1);
    expect(await due(db, 'buyer-0')).toBe(50);
    expect(await due(db, 'buyer-1')).toBe(0);
    await expect(cancelGameMusicOrder(db, first.id)).rejects.toThrow();
    expect(second.id).toBeTruthy();
  });

  it('music is available on rating evenings with 50-ruble debt', async () => {
    const db = await setup('RATING');
    await orderGameMusic(db, 817, 'buyer-0', 'https://music.yandex.ru/album/12');
    expect(await due(db, 'buyer-0')).toBeGreaterThanOrEqual(50);
  });

  it('music API hides orders from other players and restricts cancellation to organizers', async () => {
    const db = await setup();
    const app = await createApp(db);
    const buyer = `player_token=${generatePlayerSessionToken('buyer-0')}`;
    const other = `player_token=${generatePlayerSessionToken('buyer-1')}`;
    const response = await request(app).post('/api/player/music-orders').set('Cookie', buyer)
      .send({ gameId: 817, track: 'https://music.yandex.ru/album/7' }).expect(201);
    expect(response.body).toMatchObject({ priceRub: 50 });
    const own = await request(app).get('/api/player/music-orders').set('Cookie', buyer).expect(200);
    const hidden = await request(app).get('/api/player/music-orders').set('Cookie', other).expect(200);
    expect(own.body.orders).toHaveLength(1);
    expect(hidden.body.orders).toEqual([]);
    await request(app).delete(`/api/admin/music-orders/${response.body.orderId}`).set('Cookie', buyer).expect(401);
    await request(app).delete(`/api/admin/music-orders/${response.body.orderId}`)
      .set('Cookie', `organizer_token=${generateOrganizerToken()}`).expect(200);
    expect(await due(db, 'buyer-0')).toBe(0);
  });

  it('seat exchange charges 50 immediately and judge exchanges actual game positions', async () => {
    const db = await setup();
    const order = await orderGameSeatSwap(db, 817, 'buyer-0', 'buyer-1');
    expect(order.priceRub).toBe(50);
    expect(await due(db, 'buyer-0')).toBe(50);
    const result = await applyGameSeatSwap(db, order.id, 817);
    expect(result).toMatchObject({ applied: true, firstSeat: 2, secondSeat: 1 });
    const saved = await db.get<{ protocol_text: string }>('SELECT protocol_text FROM games WHERE id=817');
    const results = JSON.parse(String(saved?.protocol_text)).player_results;
    expect(results.find((row: any) => row.player_id === 'buyer-0').seat_number).toBe(2);
    expect(results.find((row: any) => row.player_id === 'buyer-1').seat_number).toBe(1);
    expect(await due(db, 'buyer-0')).toBe(50);
    await expect(cancelGameSeatSwap(db, order.id)).rejects.toThrow(/выполнен/);
  });

  it('seat exchange can be cancelled before execution without retaining debt', async () => {
    const db = await setup();
    const order = await orderGameSeatSwap(db, 817, 'buyer-0', 'buyer-1');
    await cancelGameSeatSwap(db, order.id);
    expect(await due(db, 'buyer-0')).toBe(0);
    const next = await orderGameSeatSwap(db, 817, 'buyer-0', 'buyer-1');
    expect(next.id).not.toEqual(order.id);
    await cancelOutstandingGameSeatSwaps(db, 'reservation-evening');
    expect(await due(db, 'buyer-0')).toBe(0);
  });

  it('seat swap refuses rating games and refuses any exchange after the deal begins', async () => {
    const rating = await setup('RATING');
    await expect(orderGameSeatSwap(rating, 817, 'buyer-0', 'buyer-1')).rejects.toThrow(/формате/);
    const casual = await setup();
    const ordered = await orderGameSeatSwap(casual, 817, 'buyer-0', 'buyer-1');
    await openVirtualRoleDeal(casual, 817);
    await expect(applyGameSeatSwap(casual, ordered.id, 817)).rejects.toThrow(/начала раздачи/);
    expect(await due(casual, 'buyer-0')).toBe(50);
  });

  it('players may request their own paid swaps but cannot execute or cancel other orders', async () => {
    const db = await setup();
    const app = await createApp(db);
    const buyer = `player_token=${generatePlayerSessionToken('buyer-0')}`;
    const other = `player_token=${generatePlayerSessionToken('buyer-2')}`;
    const bought = await request(app).post('/api/player/seat-swap-orders').set('Cookie',buyer)
      .send({ gameId:817, targetPlayerId:'buyer-1' }).expect(201);
    expect(bought.body.priceRub).toBe(50);
    const hidden = await request(app).get('/api/player/seat-swap-orders').set('Cookie',other).expect(200);
    expect(hidden.body.orders).toEqual([]);
    await request(app).post(`/api/admin/seat-swap-orders/${bought.body.orderId}/apply`)
      .set('Cookie',buyer).send({ gameId:817 }).expect(401);
    await request(app).post(`/api/admin/seat-swap-orders/${bought.body.orderId}/apply`)
      .set('Cookie',`organizer_token=${generateOrganizerToken()}`)
      .send({ gameId:817 }).expect(200);
    expect(await due(db, 'buyer-0')).toBe(50);
  });

  it('unified shop options expose no paid reservation data and include rating music', async () => {
    const casual = await setup();
    const app = await createApp(casual);
    const buyer = `player_token=${generatePlayerSessionToken('buyer-0')}`;
    const before = await request(app).get('/api/player/game-purchase-options').set('Cookie',buyer).expect(200);
    expect(before.body.games).toHaveLength(1);
    expect(before.body.games[0]).toMatchObject({ gameId:817, canRoleOrSwap:true });
    await reserveRoleBeforeDeal(casual,817,'buyer-1','sheriff');
    const after = await request(app).get('/api/player/game-purchase-options').set('Cookie',buyer).expect(200);
    expect(after.body.games).toEqual(before.body.games);
    expect(JSON.stringify(after.body)).not.toContain('sheriff');

    const rating = await setup('RATING');
    const ratingApp = await createApp(rating);
    const ratingChoices = await request(ratingApp).get('/api/player/game-purchase-options')
      .set('Cookie',buyer).expect(200);
    expect(ratingChoices.body.games).toHaveLength(1);
    expect(ratingChoices.body.games[0]).toMatchObject({ format:'RATING', canRoleOrSwap:false });
  });

  it('novice and rating repricing preserve music charges exactly once', async () => {
    for (const format of ['NOVICE','RATING']) {
      const db = await setup(format);
      const first = await orderGameMusic(db,817,'buyer-0','https://music.yandex.ru/album/18');
      const afterOrder = await due(db,'buyer-0');
      await reconcileNoviceEveningCharges(db,'reservation-evening');
      await reconcileOtherFormatExtensions(db,'reservation-evening');
      const afterReprice = await due(db,'buyer-0');
      await reconcileNoviceEveningCharges(db,'reservation-evening');
      await reconcileOtherFormatExtensions(db,'reservation-evening');
      expect(await due(db,'buyer-0')).toBe(afterReprice);
      expect(afterReprice).toBeGreaterThanOrEqual(50);
      await cancelGameMusicOrder(db,first.id);
      expect(await due(db,'buyer-0')).toBe(afterReprice-50);
      expect(afterOrder).toBeGreaterThanOrEqual(50);
    }
  });

  it('does not sell roles on rating evenings', async () => {
    const db = await setup('RATING');
    await expect(reserveRoleBeforeDeal(db, 817, 'buyer-0', 'don')).rejects.toThrow();
  });
});
