import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import {
  openVirtualRoleDeal, revealVirtualRole, confirmVirtualRole, undoVirtualRole, resetVirtualRoleDeal,
} from '../server/services/virtualRoleDealService.ts';
import { tableRoleCounts } from '../lib/tableComposition.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const isRed = (role: string) => role === 'citizen' || role === 'sheriff';
const ownerPlayerId = 'fad23405-9715-566f-acd9-5632c30eb198';
const gameId = 717;

async function setup(format: 'CASUAL' | 'NOVICE' | 'RATING') {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings
    (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('role-ev','Вечер','2099-10-16T18:00:00Z','Europe/Moscow',?,'published',20,100,?,?)`,
    [format, now, now]);
  const results = Array.from({ length: 10 }, (_, i) => ({
    seat_number: i + 1,
    player_id: i === 9 ? ownerPlayerId : `other-${i}`,
    participant_id: `participant-${i}`,
  }));
  const protocol = { version: 1, kind: 'club_evening_protocol', protocol: { status: 'draft' }, player_results: results };
  await db.run(`INSERT INTO games
    (id,evening_id,global_game_number,game_date,winner_team,winner_label,slots_json,protocol_text,created_at)
    VALUES (?,'role-ev',1,?,'draft','Черновик','[]',?,?)`,
    [gameId, now, JSON.stringify(protocol), now]);
  return { db, app };
}

async function storedDeck(db: DatabaseWrapper) {
  const row = await db.get<{ state_json: string }>('SELECT state_json FROM game_virtual_role_deals WHERE game_id = ?', [gameId]);
  return JSON.parse(String(row?.state_json || '{}')).deck as Array<{ id: string; role: string }>;
}

describe('server virtual role deal', () => {
  it.each(['CASUAL', 'NOVICE'] as const)('keeps a red for the tenth seat in %s without exposing unopened roles', async (format) => {
    const { db } = await setup(format);
    let view = await openVirtualRoleDeal(db, gameId);
    expect(view.cards).toHaveLength(10);
    expect(view.cards.every((card) => typeof card.id === 'string' && !('role' in card))).toBe(true);
    expect(new Set(view.cards.map((card) => card.id)).size).toBe(10);

    const revealed: string[] = [];
    for (let seat = 1; seat <= 10; seat += 1) {
      const privateDeck = await storedDeck(db);
      // Worst-case path: everybody before seat 10 tries to pick a red card.
      const picked = (seat === 10 ? privateDeck[0] : privateDeck.find((card) => isRed(card.role)) || privateDeck[0])!;
      const first = await revealVirtualRole(db, gameId, seat, picked.id, view.version);
      const retry = await revealVirtualRole(db, gameId, seat, picked.id, view.version);
      expect(retry).toEqual(first);
      if (seat === 10) expect(isRed(first.role)).toBe(true);
      revealed.push(first.role);
      view = await confirmVirtualRole(db, gameId, seat, picked.id, first.version);
      expect(view.cards).toHaveLength(10 - seat);
      expect(view.history).toHaveLength(seat);
    }
    const expected = tableRoleCounts(10);
    for (const [role, count] of Object.entries(expected)) {
      expect(revealed.filter((item) => item === role)).toHaveLength(count);
    }
    expect(new Set(view.history.map((entry) => entry.seat)).size).toBe(10);
  });

  it('does not apply a protected draw in a rating game', async () => {
    const { db } = await setup('RATING');
    let view = await openVirtualRoleDeal(db, gameId);
    for (let seat = 1; seat <= 10; seat += 1) {
      const deck = await storedDeck(db);
      const picked = seat <= 7 ? deck.find((card) => isRed(card.role))! : deck[0];
      const response = await revealVirtualRole(db, gameId, seat, picked.id, view.version);
      if (seat === 10) expect(isRed(response.role)).toBe(false);
      view = await confirmVirtualRole(db, gameId, seat, picked.id, response.version);
    }
  });

  it('undo restores a confirmed card; stale operations cannot mutate the deck', async () => {
    const { db } = await setup('CASUAL');
    const openedDeck = await openVirtualRoleDeal(db, gameId);
    const cardId = openedDeck.cards[0].id;
    const first = await revealVirtualRole(db, gameId, 1, cardId, openedDeck.version);
    const confirmed = await confirmVirtualRole(db, gameId, 1, cardId, first.version);
    await expect(confirmVirtualRole(db, gameId, 1, cardId, first.version)).rejects.toThrow();
    const undone = await undoVirtualRole(db, gameId, confirmed.version);
    expect(undone.cards).toHaveLength(10);
    expect(undone.history).toHaveLength(0);
    await expect(undoVirtualRole(db, gameId, confirmed.version)).rejects.toThrow();
    const reset = await resetVirtualRoleDeal(db, gameId, undone.version);
    expect(reset.cards).toHaveLength(10);
    expect(reset.version).toBe(undone.version + 1);
  });

  it('requires organizer authorization and never includes unrevealed roles in the start response', async () => {
    const { app } = await setup('CASUAL');
    const forbidden = await request(app).post(`/api/games/${gameId}/virtual-deal/open`);
    expect([401, 403]).toContain(forbidden.status);
    const authorized = await request(app).post(`/api/games/${gameId}/virtual-deal/open`)
      .set('Cookie', `organizer_token=${generateOrganizerToken()}`);
    expect(authorized.status).toBe(200);
    expect(authorized.body.cards).toHaveLength(10);
    expect(authorized.body.cards.every((card: any) => Object.keys(card).join(',') === 'id')).toBe(true);
    expect(JSON.stringify(authorized.body)).not.toContain('fad23405-9715-566f-acd9-5632c30eb198');
  });
});
