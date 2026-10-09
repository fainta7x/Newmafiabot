import { randomInt } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { isPaymentExpected } from './playerPaymentEligibility.ts';
import { createRobokassaTestCheckout, verifyRobokassaTestResult, type RobokassaTestConfig } from './robokassaTestAdapter.ts';

type TestInvoice = {
  id: string; player_id: string; participant_id: string; merchant_login: string;
  amount_kopecks: number; due_kopecks: number; paid_kopecks: number;
  description: string; status: 'pending' | 'confirmed' | 'superseded' | 'needs_review';
  created_at: string; confirmed_at: string | null;
};

export async function ensureRobokassaTestSchema(db: DatabaseWrapper) {
  // Called only with the isolated sandbox connection. This is deliberately outside payment_intents/ledgers.
  await db.exec(`CREATE TABLE IF NOT EXISTS robokassa_test_invoices (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL, participant_id TEXT NOT NULL,
    merchant_login TEXT NOT NULL, amount_kopecks INTEGER NOT NULL,
    due_kopecks INTEGER NOT NULL, paid_kopecks INTEGER NOT NULL,
    description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL, confirmed_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_robokassa_test_pending
    ON robokassa_test_invoices(player_id, participant_id) WHERE status = 'pending';`);
}

const paymentError = (message: string, status = 409): never => {
  throw Object.assign(new Error(message), { status });
};

async function obligation(db: DatabaseWrapper, participantId: string, playerId: string) {
  return db.get<any>(`SELECT ep.*, e.title, e.status AS evening_status,
    e.format AS evening_format, e.settled_at FROM evening_participants ep
    JOIN game_evenings e ON e.id = ep.evening_id WHERE ep.id = ? AND ep.player_id = ?`, [participantId, playerId]);
}

function amounts(row: any) {
  if (!row || row.evening_status === 'cancelled' || row.payment_status === 'waived' || !isPaymentExpected(row)) return null;
  const due = Math.round(Number(row.amount_due) * 100);
  const paid = Math.round(Number(row.amount_paid) * 100);
  if (!Number.isSafeInteger(due) || !Number.isSafeInteger(paid) || due <= 0 || paid < 0 || due <= paid) return null;
  const outstanding = due - paid;
  if (outstanding > 100_000_000) return null;
  return { due, paid, outstanding };
}

export async function createTestEveningCheckout(db: DatabaseWrapper, config: RobokassaTestConfig, playerId: string, participantId: string) {
  await ensureRobokassaTestSchema(db);
  return db.transaction(async tx => {
    const row = await obligation(tx, participantId, playerId);
    if (!row) paymentError('Вечер не найден', 404);
    const amount = amounts(row);
    if (!amount) return paymentError('Для этого вечера сейчас нет суммы к оплате');
    let invoice = await tx.get<TestInvoice>("SELECT * FROM robokassa_test_invoices WHERE player_id = ? AND participant_id = ? AND status = 'pending'", [playerId, participantId]);
    if (invoice && (invoice.due_kopecks !== amount.due || invoice.paid_kopecks !== amount.paid || invoice.merchant_login !== config.merchantLogin)) {
      await tx.run("UPDATE robokassa_test_invoices SET status = 'superseded' WHERE id = ?", [invoice.id]);
      invoice = null;
    }
    if (!invoice) {
      // Random IDs do not reuse old invoices after a disposable sandbox is reseeded.
      let id = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        id = String(randomInt(1_000_000_000_000, 9_999_999_999_999));
        if (!(await tx.get('SELECT id FROM robokassa_test_invoices WHERE id = ?', [id]))) break;
        id = '';
      }
      if (!id) paymentError('Не удалось создать тестовый платёж', 503);
      invoice = { id, player_id: playerId, participant_id: participantId, merchant_login: config.merchantLogin,
        amount_kopecks: amount.outstanding, due_kopecks: amount.due, paid_kopecks: amount.paid,
        description: `Тест: участие в вечере ${String(row.title || '').trim()}`.slice(0, 100),
        status: 'pending', created_at: new Date().toISOString(), confirmed_at: null };
      await tx.run(`INSERT INTO robokassa_test_invoices
        (id, player_id, participant_id, merchant_login, amount_kopecks, due_kopecks, paid_kopecks, description, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [invoice.id, playerId, participantId, config.merchantLogin, invoice.amount_kopecks, invoice.due_kopecks, invoice.paid_kopecks, invoice.description, invoice.created_at]);
    }
    const checkout = createRobokassaTestCheckout(config, { invoiceId: invoice.id, amountKopecks: invoice.amount_kopecks, description: invoice.description });
    return { test: true, invoice_id: invoice.id, ...checkout };
  });
}

export async function confirmTestEveningPayment(db: DatabaseWrapper, config: RobokassaTestConfig, fields: Record<string, unknown>) {
  if (typeof fields.InvId !== 'string' || !/^[1-9][0-9]{0,14}$/.test(fields.InvId)) return null;
  await ensureRobokassaTestSchema(db);
  return db.transaction(async tx => {
    const invoice = await tx.get<TestInvoice>('SELECT * FROM robokassa_test_invoices WHERE id = ?', [fields.InvId]);
    if (!invoice || invoice.merchant_login !== config.merchantLogin) return null;
    const verified = verifyRobokassaTestResult(config, fields, { invoiceId: invoice.id, amountKopecks: invoice.amount_kopecks });
    if (!verified) return null;
    if (!invoice.confirmed_at) {
      const row = await obligation(tx, invoice.participant_id, invoice.player_id);
      const amount = amounts(row);
      const unchanged = invoice.status === 'pending' && amount?.due === invoice.due_kopecks && amount?.paid === invoice.paid_kopecks;
      await tx.run('UPDATE robokassa_test_invoices SET status = ?, confirmed_at = ? WHERE id = ?',
        [unchanged ? 'confirmed' : 'needs_review', new Date().toISOString(), invoice.id]);
    }
    // No real/sandbox debt or token balance is changed. Acknowledgement leaves only after COMMIT.
    return verified.acknowledgement;
  });
}

export async function getTestInvoice(db: DatabaseWrapper, playerId: string, id: string) {
  await ensureRobokassaTestSchema(db);
  return db.get<Pick<TestInvoice, 'id' | 'status' | 'amount_kopecks' | 'confirmed_at'>>(
    'SELECT id, status, amount_kopecks, confirmed_at FROM robokassa_test_invoices WHERE id = ? AND player_id = ?', [id, playerId]);
}
