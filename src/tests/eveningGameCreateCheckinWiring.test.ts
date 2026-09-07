import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../server/routes/gamesRoutes.ts', import.meta.url), 'utf8');

describe('club game creation check-in wiring', () => {
  it('treats the selected ten seats as an explicit organizer check-in before validation', () => {
    const transactionStart = source.indexOf('const createdId = await db.transaction');
    const checkin = source.indexOf('await markJudgeSelectedPlayersPresent(tx, eveningId, req.body?.seats || []);', transactionStart);
    const validation = source.indexOf('const seats = await validateEveningGameSeats', transactionStart);
    expect(transactionStart).toBeGreaterThan(-1);
    expect(checkin).toBeGreaterThan(transactionStart);
    expect(validation).toBeGreaterThan(checkin);
    const nearby = source.slice(Math.max(transactionStart, checkin - 120), checkin);
    expect(nearby).not.toContain('if (delegatedJudgeId)');
  });
});
