import { afterEach, describe, expect, it } from 'vitest';
import { applyPlayerStarterTokenGrant } from '../db/applyPlayerStarterTokenGrant.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { reconcileTokenOpeningBalances, verifyTokenLedgerConsistency } from '../server/services/tokenLedgerService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('player starter token grant', () => {
  it('adds 1000 once on top of existing balances and skips merged tombstones', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const now = new Date().toISOString();
    await db.run("INSERT INTO players (id,nickname,tokens,lifecycle_status,created_at,updated_at) VALUES ('alice','Alice',350,'normal',?,?)", [now, now]);
    await db.run("INSERT INTO players (id,nickname,tokens,lifecycle_status,created_at,updated_at) VALUES ('bob','Bob',0,'normal',?,?)", [now, now]);
    await db.run("INSERT INTO players (id,nickname,tokens,lifecycle_status,created_at,updated_at) VALUES ('old','Old',250,'merged',?,?)", [now, now]);

    await reconcileTokenOpeningBalances(db);
    expect(await applyPlayerStarterTokenGrant(db)).toEqual({ applied: true, granted: 2 });

    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='alice'"))?.tokens).toBe(1350);
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='bob'"))?.tokens).toBe(1000);
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='old'"))?.tokens).toBe(250);
    expect((await db.all("SELECT amount FROM token_ledger WHERE reason_type='starter_grant'"))).toHaveLength(2);
    expect((await verifyTokenLedgerConsistency(db)).filter((row) => row.id !== 'old').every((row) => row.matches)).toBe(true);

    expect(await applyPlayerStarterTokenGrant(db)).toEqual({ applied: false, granted: 0 });
    expect((await db.all("SELECT amount FROM token_ledger WHERE reason_type='starter_grant'"))).toHaveLength(2);
  });
});
