import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import {
  calculateEveningSelectionTotal,
  SLOT_PRICE,
} from './eveningSlotPlanningService.ts';

const safeJsonParse = <T = any>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

export const calculateRegularEveningPlayedAmount = (gamesPlayed: number): number => (
  calculateEveningSelectionTotal('CASUAL', Array.from({ length: Math.max(0, Math.floor(Number(gamesPlayed || 0))) }, () => SLOT_PRICE))
);

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
  const targetPaid = Math.min(
    input.canonicalDue,
    Math.max(0, Number(input.recordedPaid || 0), currentPaid),
  );

  const paidDelta = targetPaid - currentPaid;
  if (paidDelta > 0.0001) {
    await addLedgerAdjustment(db, {
      type: 'debt_paid', amount: paidDelta,
      eveningId: input.eveningId, playerId: input.playerId, participantId: input.participantId,
      description: `Синхронизация оплаты с единым тарифом: ${input.eveningTitle}`,
    });
  } else if (paidDelta < -0.0001) {
    await addLedgerAdjustment(db, {
      type: 'income', amount: paidDelta,
      eveningId: input.eveningId, playerId: input.playerId, participantId: input.participantId,
      description: `Снижение переплаты после пересчёта тарифа: ${input.eveningTitle}`,
    });
    await addLedgerAdjustment(db, {
      type: 'debt_created', amount: -paidDelta,
      eveningId: input.eveningId, playerId: input.playerId, participantId: input.participantId,
      description: `Балансировка долга после снижения подтверждённой оплаты: ${input.eveningTitle}`,
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

  return targetPaid;
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

  const participants = await db.all<any>(`
    SELECT ep.id, ep.player_id, ep.amount_due, ep.amount_paid, ep.payment_status,
           p.club_role, p.judge_level
      FROM evening_participants ep
      JOIN players p ON p.id = ep.player_id
     WHERE ep.evening_id = ?
  `, [eveningId]);
  const participantIds = new Set(participants.map((participant: any) => String(participant.id)));
  const byPlayerId = new Map(participants.map((participant: any) => [String(participant.player_id), String(participant.id)]));

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
      const feeExempt = participant.club_role === 'organizer'
        || participant.judge_level === 'host'
        || participant.judge_level === 'judge';
      const gamesPlayed = playedCounts.get(String(participant.id)) || 0;
      const canonicalDue = feeExempt ? 0 : calculateRegularEveningPlayedAmount(gamesPlayed);
      let canonicalPaid = Math.min(canonicalDue, Math.max(0, Number(participant.amount_paid || 0)));

      if (closed) {
        canonicalPaid = await reconcileClosedLedger(tx, {
          eveningId,
          eveningTitle: String(evening.title || 'Игровой вечер'),
          participantId: String(participant.id),
          playerId: String(participant.player_id),
          canonicalDue,
          recordedPaid: Number(participant.amount_paid || 0),
        });
      }

      const paymentStatus = canonicalDue === 0
        ? 'waived'
        : canonicalPaid >= canonicalDue
          ? 'paid'
          : canonicalPaid > 0
            ? 'partial'
            : 'unpaid';
      if (
        Number(participant.amount_due || 0) !== canonicalDue
        || Number(participant.amount_paid || 0) !== canonicalPaid
        || String(participant.payment_status || '') !== paymentStatus
      ) {
        await tx.run(
          'UPDATE evening_participants SET amount_due = ?, amount_paid = ?, payment_status = ?, updated_at = ? WHERE id = ?',
          [canonicalDue, canonicalPaid, paymentStatus, now, participant.id],
        );
      }
    }
  });

  return {
    applied: true,
    games_by_participant: Object.fromEntries([...playedCounts.entries()]),
  };
}
