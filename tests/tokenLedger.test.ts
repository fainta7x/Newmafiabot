import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabaseConnection, type DatabaseWrapper } from '../src/db/index.ts';
import { createApp } from '../src/app.ts';
import { generateOrganizerToken } from '../src/server/auth.ts';
import {
  mutateTokenBalance,
  reconcileTokenOpeningBalances,
  TokenIdempotencyConflictError,
  TokenInsufficientFundsError,
  verifyTokenLedgerConsistency,
} from '../src/server/services/tokenLedgerService.ts';

describe('canonical token ledger', () => {
  let db: DatabaseWrapper;

  beforeEach(() => {
    process.env.BOT_API_SECRET = 'test-bot-secret';
    db = createDatabaseConnection(':memory:');
  });

  afterEach(() => { db.sqlite.close(); });

  const addPlayer = async (id: string, tokens: number, telegramId?: string) => {
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO players (id, telegram_user_id, nickname, contact_status, lifecycle_status, elo, tokens, created_at, updated_at)
       VALUES (?, ?, ?, 'normal', 'normal', 1000, ?, ?, ?)`,
      [id, telegramId || null, id, tokens, now, now],
    );
  };

  it('preserves opening balances exactly and is idempotent; zero creates no artificial row', async () => {
    await addPlayer('positive', 4300);
    await addPlayer('zero', 0);
    const before = await db.all('SELECT id, tokens FROM players ORDER BY id');
    expect(await reconcileTokenOpeningBalances(db)).toBe(1);
    expect(await reconcileTokenOpeningBalances(db)).toBe(0);
    expect(await db.all('SELECT id, tokens FROM players ORDER BY id')).toEqual(before);
    expect((await db.get<any>('SELECT COUNT(*) AS c FROM token_ledger WHERE player_id = ?', ['positive']))?.c).toBe(1);
    expect((await db.get<any>('SELECT COUNT(*) AS c FROM token_ledger WHERE player_id = ?', ['zero']))?.c).toBe(0);
    expect((await verifyTokenLedgerConsistency(db)).every((row) => row.matches)).toBe(true);
  });

  it('credits and debits atomically and rejects insufficient funds', async () => {
    await addPlayer('p1', 1000);
    await reconcileTokenOpeningBalances(db);
    await mutateTokenBalance(db, { playerId: 'p1', delta: 500, reasonType: 'test', description: 'credit', sourceType: 'test', idempotencyKey: 'credit-1' });
    await mutateTokenBalance(db, { playerId: 'p1', delta: -1200, reasonType: 'test', description: 'debit', sourceType: 'test', idempotencyKey: 'debit-1' });
    expect((await db.get<any>('SELECT tokens FROM players WHERE id = ?', ['p1']))?.tokens).toBe(300);
    await expect(mutateTokenBalance(db, { playerId: 'p1', delta: -301, reasonType: 'test', description: 'overspend', sourceType: 'test', idempotencyKey: 'debit-2' })).rejects.toBeInstanceOf(TokenInsufficientFundsError);
    expect((await db.get<any>('SELECT tokens FROM players WHERE id = ?', ['p1']))?.tokens).toBe(300);
  });

  it('replays the same idempotency payload and rejects a conflicting payload', async () => {
    await addPlayer('p2', 0);
    const input = { playerId: 'p2', delta: 100, reasonType: 'test', description: 'same', sourceType: 'test', idempotencyKey: 'same-key' };
    const first = await mutateTokenBalance(db, input);
    const replay = await mutateTokenBalance(db, input);
    expect(replay.id).toBe(first.id);
    expect((await db.get<any>('SELECT tokens FROM players WHERE id = ?', ['p2']))?.tokens).toBe(100);
    await expect(mutateTokenBalance(db, { ...input, delta: 200 })).rejects.toBeInstanceOf(TokenIdempotencyConflictError);
  });

  it('serializes concurrent debits so balance cannot overspend', async () => {
    await addPlayer('p3', 100);
    await reconcileTokenOpeningBalances(db);
    const results = await Promise.allSettled([
      mutateTokenBalance(db, { playerId: 'p3', delta: -80, reasonType: 'test', description: 'a', sourceType: 'test', idempotencyKey: 'a' }),
      mutateTokenBalance(db, { playerId: 'p3', delta: -80, reasonType: 'test', description: 'b', sourceType: 'test', idempotencyKey: 'b' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await db.get<any>('SELECT tokens FROM players WHERE id = ?', ['p3']))?.tokens).toBe(20);
  });

  it('journals a non-zero starting balance on organizer player creation', async () => {
    const app = await createApp(db);
    const token = generateOrganizerToken();
    const response = await request(app).post('/api/players').set('Authorization', `Bearer ${token}`).send({ nickname: 'Created', tokens: 2400 });
    expect(response.status).toBe(201);
    expect(response.body.tokens).toBe(2400);
    const rows = await db.all<any>('SELECT amount, balance_after, reason_type FROM token_ledger WHERE player_id = ?', [response.body.id]);
    expect(rows).toEqual([{ amount: 2400, balance_after: 2400, reason_type: 'initial_balance' }]);
  });

  it('protects manual adjustment, requires a reason, applies signed changes, and blocks raw token PATCH', async () => {
    await addPlayer('api-player', 500);
    const app = await createApp(db);
    const unauthorized = await request(app).post('/api/players/api-player/tokens/adjustments').send({ delta: 100, reason: 'test', idempotency_key: 'u' });
    expect(unauthorized.status).toBe(401);

    const token = generateOrganizerToken();
    const noReason = await request(app).post('/api/players/api-player/tokens/adjustments').set('Authorization', `Bearer ${token}`).send({ delta: 100, reason: '', idempotency_key: 'r' });
    expect(noReason.status).toBe(400);

    const adjusted = await request(app).post('/api/players/api-player/tokens/adjustments').set('Authorization', `Bearer ${token}`).send({ delta: -200, reason: 'Ручная корректировка', idempotency_key: 'manual-ok' });
    expect(adjusted.status).toBe(200);
    expect(adjusted.body.balance).toBe(300);

    const history = await request(app).get('/api/players/api-player/tokens?limit=10').set('Authorization', `Bearer ${token}`);
    expect(history.status).toBe(200);
    expect(history.body.balance).toBe(300);
    expect(history.body.ledger.items[0].description).toBe('Ручная корректировка');

    const rawPatch = await request(app).patch('/api/players/api-player').set('Authorization', `Bearer ${token}`).send({ tokens: 999999 });
    expect(rawPatch.status).toBe(400);
    expect((await db.get<any>('SELECT tokens FROM players WHERE id = ?', ['api-player']))?.tokens).toBe(300);
  });

  it('resolves bot balance only by exact telegram_user_id', async () => {
    await addPlayer('tg-player', 700, '123456');
    const app = await createApp(db);
    const exact = await request(app).get('/api/bot/players/by-telegram/123456/tokens').set('X-Bot-Token', 'test-bot-secret');
    expect(exact.status).toBe(200);
    expect(exact.body.balance).toBe(700);
    const partial = await request(app).get('/api/bot/players/by-telegram/12345/tokens').set('X-Bot-Token', 'test-bot-secret');
    expect(partial.status).toBe(404);
  });

  it('retires the legacy game route before its historical +1/+2 side effect can run', async () => {
    await addPlayer('legacy-player', 900);
    const app = await createApp(db);
    const token = generateOrganizerToken();
    const response = await request(app).post('/api/games').set('Authorization', `Bearer ${token}`).send({});
    expect(response.status).toBe(410);
    expect((await db.get<any>('SELECT tokens FROM players WHERE id = ?', ['legacy-player']))?.tokens).toBe(900);
  });
});
