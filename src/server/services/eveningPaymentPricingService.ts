import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';

export const REGULAR_GAME_PRICE = 100;
export const REGULAR_EVENING_MAX_PRICE = 400;

export const calculateRegularEveningPlayedAmount = (gamesPlayed: number): number => {
  const count = Math.max(0, Math.floor(Number(gamesPlayed || 0)));
  return Math.min(count * REGULAR_GAME_PRICE, REGULAR_EVENING_MAX_PRICE);
};

const safeJsonParse = <T = any>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const isCompletedGame = (game: any, protocol: any) => {
  if (protocol?.version === 1 && protocol?.kind === 'club_evening_protocol') {
    return protocol?.protocol?.status === 'completed';
  }
  const winner = String(game?.winner_team || '').trim().toLowerCase();
  return Boolean(winner && winner !== 'draft');
};

const participantIdsFromGame = (game: any, protocol: any): string[] => {
  if (protocol?.version === 1 && protocol?.kind === 'club_evening_protocol' && Array.isArray(protocol?.player_results)) {
    return protocol.player_results
      .map((result: any) => String(result?.participant_id || '').trim())
      .filter(Boolean);
  }
  const slots = safeJsonParse<any[]>(game?.slots_json, []);
  return Array.isArray(slots)
    ? slots.map((slot: any) => String(slot?.participant_id || '').trim()).filter(Boolean)
    : [];
};

const tableExists = async (db: DatabaseWrapper, tableName: string): Promise<boolean> => {
  const row = await db.get<any>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    [tableName],
  );
  return Boolean(row?.name);
};

const addLedgerAdjustment = async (
  db: DatabaseWrapper,
  input: {
    type: 'income' | 'debt_created' | 'debt_paid';
    amount: number;
    eveningId: string;
    playerId: string;
    participantId: string;
    description: string;
  },
) => {
  if (!Number.isFinite(input.amount) || Math.abs(input.amount) < 0.0001) return;
  if (input.type === 'income' && input.amount < 0) {
    throw new Error('Pricing reconciliation must never create negative income/refund transactions');
  }
  const category = input.type === 'debt_paid'
    ? 'Погашение долга за вечер'
    : input.type === 'debt_created'
      ? 'Корректировка долга за вечер'
      : 'Корректировка оплаты за вечер';
  await db.run(`
    INSERT INTO financial_transactions (
      id, type, amount, category, description, player_id, evening_id,
      source_type, source_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'evening_pricing_reconcile', ?, ?)
    ON CONFLICT(source_type, source_id, type) DO UPDATE SET
      amount = financial_transactions.amount + excluded.amount,
      category = excluded.category,
      description = excluded.description,
      player_id = excluded.player_id,
      evening_id = excluded.evening_id,
      created_at = excluded.created_at
  `, [
    crypto.randomUUID(), input.type, input.amount, category, input.description,
    input.playerId, input.eveningId, input.participantId, new Date().toISOString(),
  ]);
};

const reconcileClosedLedger = async (
  db: DatabaseWrapper,
  input: {
    eveningId: string;
    eveningTitle: string;
    participantId: string;
    playerId: string;
    canonicalDue: number;
    recordedPaid: number;
  },
) => {
  const totals = await db.get<any>(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'debt_created' THEN amount ELSE 0 END), 0) AS debt_created,
      COALESCE(SUM(CASE WHEN type = 'debt_paid' THEN amount ELSE 0 END), 0) AS debt_paid
      FROM financial_transactions
     WHERE evening_id = ? AND player_id = ? AND source_id = ?
  `, [input.eveningId, input.playerId, input.participantId]);

  const income = Number(totals?.income || 0);
  const debtCreated = Number(totals?.debt_created || 0);
  const debtPaid = Number(totals?.debt_paid || 0);
  const currentPaid = income + debtPaid;
  const currentAccrued = income + debtCreated;
  const recordedPaid = Math.max(0, Number(input.recordedPaid || 0));

  // Reconciliation may add missing evidence of a payment already recorded on the
  // participant, but it must never reduce monetary income or synthesize a refund.
  // Explicit organizer refund flows are the only place allowed to lower received money.
  const paidDelta = recordedPaid - currentPaid;
  if (paidDelta > 0.0001) {
    await addLedgerAdjustment(db, {
      type: 'debt_paid', amount: paidDelta,
      eveningId: input.eveningId, playerId: input.playerId, participantId: input.participantId,
      description: `Синхронизация зафиксированной оплаты: ${input.eveningTitle}`,
    });
  }

  const dueDelta = input.canonicalDue - currentAccrued;
  if (Math.abs(dueDelta) > 0.0001) {
    await addLedgerAdjustment(db, {
      type: 'debt_created', amount: dueDelta,
      eveningId: input.eveningId, playerId: input.playerId, participantId: input.participantId,
      description: `Пересчёт взноса по фактически сыгранным играм: ${input.eveningTitle}`,
    });
  }
};

export async function reconcileRegularEveningPayments(
  db: DatabaseWrapper,
  eveningId: string,
): Promise<{ applied: boolean; games_by_participant: Record<string, number> }> {
  const evening = await db.get<any>(
    'SELECT id, title, format, status, settled_at FROM game_evenings WHERE id = ? LIMIT 1',
    [eveningId],
  );
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  if (normalizeEveningFormat(evening.format) !== 'CASUAL') {
    return { applied: false, games_by_participant: {} };
  }

  // Historical charging must depend only on facts attached to this evening.
  // Current global club_role/judge_level are permissions/qualifications and are
  // deliberately not selected here: changing them later must never rewrite history.
  const participants = await db.all<any>(`
    SELECT ep.id, ep.player_id, ep.amount_due, ep.amount_paid, ep.payment_status, ep.attendance_status
      FROM evening_participants ep
     WHERE ep.evening_id = ?
  `, [eveningId]);
  const participantIds = new Set(participants.map((participant: any) => String(participant.id)));
  const byPlayerId = new Map(participants.map((participant: any) => [String(participant.player_id), String(participant.id)]));

  const hasStaffAssignments = await tableExists(db, 'evening_staff_assignments');
  const staffAssignment = hasStaffAssignments
    ? await db.get<any>('SELECT organizer_player_id FROM evening_staff_assignments WHERE evening_id = ? LIMIT 1', [eveningId])
    : null;
  const assignedStaffPlayerId = staffAssignment?.organizer_player_id
    ? String(staffAssignment.organizer_player_id)
    : null;

  const hasFeeWaivers = await tableExists(db, 'evening_fee_waivers');
  const waiverRows = hasFeeWaivers
    ? await db.all<any>('SELECT participant_id FROM evening_fee_waivers WHERE evening_id = ?', [eveningId])
    : [];
  const explicitWaiverIds = new Set(waiverRows.map((row: any) => String(row.participant_id)));

  const gameRows = await db.all<any>(`
    SELECT id, winner_team, protocol_text, slots_json
      FROM games
     WHERE evening_id = ? AND archived_at IS NULL
     ORDER BY global_game_number ASC, id ASC
  `, [eveningId]);

  const playedCounts = new Map<string, number>();
  for (const game of gameRows) {
    const protocol = safeJsonParse<any>(game.protocol_text, null);
    if (!isCompletedGame(game, protocol)) continue;
    const directParticipantIds = participantIdsFromGame(game, protocol);
    const ids = new Set(directParticipantIds.filter((id) => participantIds.has(id)));
    if (!ids.size) {
      const slots = safeJsonParse<any[]>(game.slots_json, []);
      for (const slot of Array.isArray(slots) ? slots : []) {
        const playerId = String(slot?.player_id || '').trim();
        const participantId = playerId ? byPlayerId.get(playerId) : null;
        if (participantId) ids.add(participantId);
      }
    }
    for (const id of ids) playedCounts.set(id, (playedCounts.get(id) || 0) + 1);
  }

  const closed = evening.status === 'completed' || Boolean(evening.settled_at);
  const now = new Date().toISOString();
  await db.transaction(async (tx: DatabaseWrapper) => {
    for (const participant of participants) {
      const participantId = String(participant.id);
      const playerId = String(participant.player_id);
      const feeExempt = explicitWaiverIds.has(participantId)
        || (assignedStaffPlayerId !== null && assignedStaffPlayerId === playerId);
      const gamesPlayed = playedCounts.get(participantId) || 0;
      const canonicalDue = feeExempt ? 0 : calculateRegularEveningPlayedAmount(gamesPlayed);
      const recordedPaid = Math.max(0, Number(participant.amount_paid || 0));

      if (closed) {
        await reconcileClosedLedger(tx, {
          eveningId,
          eveningTitle: String(evening.title || 'Игровой вечер'),
          participantId,
          playerId,
          canonicalDue,
          recordedPaid,
        });
      }

      const paymentStatus = canonicalDue === 0
        ? (recordedPaid > 0 ? 'paid' : 'waived')
        : recordedPaid >= canonicalDue
          ? 'paid'
          : recordedPaid > 0
            ? 'partial'
            : 'unpaid';
      if (
        Number(participant.amount_due || 0) !== canonicalDue
        || String(participant.payment_status || '') !== paymentStatus
      ) {
        await tx.run(
          'UPDATE evening_participants SET amount_due = ?, payment_status = ?, updated_at = ? WHERE id = ?',
          [canonicalDue, paymentStatus, now, participant.id],
        );
      }
    }
  });

  return {
    applied: true,
    games_by_participant: Object.fromEntries([...playedCounts.entries()]),
  };
}
