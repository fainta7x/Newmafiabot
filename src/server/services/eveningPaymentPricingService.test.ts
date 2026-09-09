import { describe, expect, it } from 'vitest';
import {
  calculateRegularEveningPlayedAmount,
  reconcileRegularEveningPayments,
} from './eveningPaymentPricingService.ts';

type LedgerRow = {
  type: 'income' | 'debt_created' | 'debt_paid';
  amount: number;
  source_type: string;
  source_id: string;
};

const completedGame = (id: number, participantId = 'ep1') => ({
  id,
  winner_team: 'red',
  protocol_text: JSON.stringify({
    version: 1,
    kind: 'club_evening_protocol',
    protocol: { status: 'completed' },
    player_results: [{ participant_id: participantId }],
  }),
  slots_json: '[]',
});

const createFixture = (input: {
  format?: string;
  games?: any[];
  due?: number;
  paid?: number;
  status?: string;
  closed?: boolean;
} = {}) => {
  const participant: any = {
    id: 'ep1',
    player_id: 'p1',
    amount_due: input.due ?? 600,
    amount_paid: input.paid ?? 300,
    payment_status: input.status ?? 'partial',
    club_role: 'member',
    judge_level: 'player',
  };
  const evening: any = {
    id: 'e1',
    title: 'Regular evening',
    format: input.format ?? 'CASUAL',
    status: input.closed === false ? 'active' : 'completed',
    settled_at: input.closed === false ? null : '2026-09-05T00:00:00.000Z',
  };
  const games = input.games ?? [completedGame(1), completedGame(2), completedGame(3)];
  const ledger: LedgerRow[] = input.closed === false ? [] : [
    { type: 'income', amount: input.paid ?? 300, source_type: 'evening_settle', source_id: 'ep1' },
    { type: 'debt_created', amount: Math.max(0, (input.due ?? 600) - (input.paid ?? 300)), source_type: 'evening_settle', source_id: 'ep1' },
  ];

  const db: any = {
    async get(sql: string) {
      if (sql.includes('FROM game_evenings')) return evening;
      if (sql.includes('FROM financial_transactions')) {
        const sum = (type: LedgerRow['type']) => ledger
          .filter((row) => row.type === type && row.source_id === participant.id)
          .reduce((total, row) => total + row.amount, 0);
        return { income: sum('income'), debt_created: sum('debt_created'), debt_paid: sum('debt_paid') };
      }
      return null;
    },
    async all(sql: string) {
      if (sql.includes('FROM evening_participants')) return [participant];
      if (sql.includes('FROM games')) return games;
      return [];
    },
    async run(sql: string, params: any[] = []) {
      if (sql.includes('INSERT INTO financial_transactions')) {
        const [, type, amount, , , , , sourceId] = params;
        const existing = ledger.find((row) =>
          row.source_type === 'evening_pricing_reconcile'
          && row.source_id === String(sourceId)
          && row.type === type,
        );
        if (existing) existing.amount += Number(amount);
        else ledger.push({
          type,
          amount: Number(amount),
          source_type: 'evening_pricing_reconcile',
          source_id: String(sourceId),
        });
        return { changes: 1, lastID: null };
      }
      if (sql.includes('UPDATE evening_participants')) {
        participant.amount_due = Number(params[0]);
        participant.amount_paid = Number(params[1]);
        participant.payment_status = String(params[2]);
        return { changes: 1, lastID: null };
      }
      return { changes: 0, lastID: null };
    },
    async transaction(callback: (tx: any) => Promise<any>) {
      return callback(db);
    },
  };

  return { db, evening, participant, games, ledger };
};

describe('CRM-PAY-003 regular evening pricing', () => {
  it.each([
    [0, 0],
    [1, 100],
    [2, 200],
    [3, 300],
    [4, 400],
    [5, 400],
    [8, 400],
  ])('charges %i completed games as %i ₽', (games, expected) => {
    expect(calculateRegularEveningPlayedAmount(games)).toBe(expected);
  });

  it('durably reconciles a legacy 600 ₽ CASUAL row from completed games', async () => {
    const fixture = createFixture();
    await reconcileRegularEveningPayments(fixture.db, 'e1');

    expect(fixture.participant.amount_due).toBe(300);
    expect(fixture.participant.amount_paid).toBe(300);
    expect(fixture.participant.payment_status).toBe('paid');
  });

  it('keeps repeated reconciliation idempotent without duplicate ledger rows', async () => {
    const fixture = createFixture();
    await reconcileRegularEveningPayments(fixture.db, 'e1');
    const afterFirst = fixture.ledger.map((row) => ({ ...row }));

    await reconcileRegularEveningPayments(fixture.db, 'e1');

    expect(fixture.ledger).toEqual(afterFirst);
  });

  it('recalculates safely after a completed-game correction', async () => {
    const fixture = createFixture();
    await reconcileRegularEveningPayments(fixture.db, 'e1');
    fixture.games.splice(2, 1);

    await reconcileRegularEveningPayments(fixture.db, 'e1');

    expect(fixture.participant.amount_due).toBe(200);
    expect(fixture.participant.amount_paid).toBe(200);
    const snapshot = fixture.ledger.map((row) => ({ ...row }));
    await reconcileRegularEveningPayments(fixture.db, 'e1');
    expect(fixture.ledger).toEqual(snapshot);
  });

  it('does not create debt when there are no completed games', async () => {
    const fixture = createFixture({
      games: [{
        id: 1,
        winner_team: 'draft',
        protocol_text: JSON.stringify({
          version: 1,
          kind: 'club_evening_protocol',
          protocol: { status: 'draft' },
          player_results: [{ participant_id: 'ep1' }],
        }),
        slots_json: '[]',
      }],
      due: 600,
      paid: 0,
    });

    await reconcileRegularEveningPayments(fixture.db, 'e1');

    expect(fixture.participant.amount_due).toBe(0);
    expect(fixture.participant.payment_status).toBe('waived');
  });

  it('does not rewrite non-CASUAL formats', async () => {
    const fixture = createFixture({ format: 'TOURNAMENT' });
    const before = { ...fixture.participant };
    const ledgerBefore = fixture.ledger.map((row) => ({ ...row }));

    const result = await reconcileRegularEveningPayments(fixture.db, 'e1');

    expect(result.applied).toBe(false);
    expect(fixture.participant).toEqual(before);
    expect(fixture.ledger).toEqual(ledgerBefore);
  });
});
