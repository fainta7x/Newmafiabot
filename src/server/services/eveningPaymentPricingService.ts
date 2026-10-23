import crypto from 'crypto';
import { loadEveningPrices } from './eveningPriceSettingsService.ts';
import { DEFAULT_EVENING_PRICES, type EveningPrices } from '../../lib/eveningPrices.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import { calculateExtensionShares } from './eveningExtensionService.ts';

/**
 * Who plays a regular (CASUAL) evening without a fee: the club owner always, and the organizer assigned to that evening
 * (owner decision 2026-10-12: the organizer who runs the evening is never charged, also when he plays; the 2026-10-06 rule that
 * charged the assigned organizer is withdrawn). Everybody else, the judge included, pays for the games played, and a player who
 * should not pay is given a gifted evening by hand.
 */
export const isRegularFeeFreeByStaffRule = (_startsAt: unknown, playerId: string, assignedOrganizerId: string | null): boolean => {
  if (playerId === PRIMARY_ORGANIZER_PLAYER_ID) return true;
  return assignedOrganizerId !== null && assignedOrganizerId === playerId;
};

export const REGULAR_GAME_PRICE = DEFAULT_EVENING_PRICES.casual_game;
export const REGULAR_EVENING_MAX_PRICE = DEFAULT_EVENING_PRICES.casual_cap;

export const calculateRegularEveningPlayedAmount = (gamesPlayed: number, policy: EveningPrices = DEFAULT_EVENING_PRICES): number => {
  const count = Math.max(0, Math.floor(Number(gamesPlayed || 0)));
  return Math.min(count * policy.casual_game, policy.casual_cap);
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

/** Shares of the evening's extensions per participant id, and the participants who never pay one (organizer, judge, club owner). */
const loadExtensionShares = async (
  db: DatabaseWrapper,
  eveningId: string,
  evening: any,
  participants: any[],
  completedGameParticipants: Array<Set<string>>,
  assignedOrganizerId: string | null,
  assignedJudgeId: string | null,
) => {
  const hasExtensions = await tableExists(db, 'evening_extensions');
  const extensionRows = hasExtensions
    ? await db.all<any>('SELECT id, games_count, amount, games_total_at_entry FROM evening_extensions WHERE evening_id = ? ORDER BY created_at ASC, id ASC', [eveningId])
    : [];
  const excluded = new Set<string>();
  for (const participant of participants) {
    const playerId = String(participant.player_id);
    if (isRegularFeeFreeByStaffRule(evening.starts_at, playerId, assignedOrganizerId) || (assignedJudgeId !== null && playerId === assignedJudgeId)) {
      excluded.add(String(participant.id));
    }
  }
  return { shares: calculateExtensionShares(extensionRows, completedGameParticipants, excluded), excluded, hasExtensions: extensionRows.length > 0 };
};

/** The completed games of an evening: how many each participant played and who sat in each game, in playing order. */
const loadCompletedGames = async (db: DatabaseWrapper, eveningId: string, participants: any[]) => {
  const participantIds = new Set(participants.map((participant: any) => String(participant.id)));
  const byPlayerId = new Map(participants.map((participant: any) => [String(participant.player_id), String(participant.id)]));
  const gameRows = await db.all<any>(`
    SELECT id, winner_team, protocol_text, slots_json
      FROM games
     WHERE evening_id = ? AND archived_at IS NULL
     ORDER BY global_game_number ASC, id ASC
  `, [eveningId]);

  const playedCounts = new Map<string, number>();
  const completedGameParticipants: Array<Set<string>> = [];
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
    completedGameParticipants.push(ids);
  }
  return { playedCounts, completedGameParticipants };
};

/** How many games of the evening are completed right now (the point an extension entered now is tied to). */
export async function countCompletedEveningGames(db: DatabaseWrapper, eveningId: string): Promise<number> {
  const participants = await db.all<any>('SELECT ep.* FROM evening_participants ep WHERE ep.evening_id = ?', [eveningId]);
  return (await loadCompletedGames(db, eveningId, participants)).completedGameParticipants.length;
}

export async function reconcileRegularEveningPayments(
  db: DatabaseWrapper,
  eveningId: string,
): Promise<{ applied: boolean; games_by_participant: Record<string, number> }> {
  const evening = await db.get<any>(
    'SELECT id, title, format, status, settled_at, starts_at FROM game_evenings WHERE id = ? LIMIT 1',
    [eveningId],
  );
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  const policy = await loadEveningPrices(db, eveningId);
  if (normalizeEveningFormat(evening.format) !== 'CASUAL') {
    return { applied: false, games_by_participant: {} };
  }

  // Historical charging must depend only on facts attached to this evening.
  // Current global club_role/judge_level are permissions/qualifications and are
  // deliberately not selected here: changing them later must never rewrite history.
  const participants = await db.all<any>(`
    SELECT ep.*
      FROM evening_participants ep
     WHERE ep.evening_id = ?
  `, [eveningId]);
  const hasExtensionColumn = participants.length > 0 && 'extension_due' in participants[0];

  const hasStaffAssignments = await tableExists(db, 'evening_staff_assignments');
  const staffAssignment = hasStaffAssignments
    ? await db.get<any>('SELECT organizer_player_id, judge_player_id FROM evening_staff_assignments WHERE evening_id = ? LIMIT 1', [eveningId])
    : null;
  const assignedStaffPlayerId = staffAssignment?.organizer_player_id
    ? String(staffAssignment.organizer_player_id)
    : null;
  const assignedJudgePlayerId = staffAssignment?.judge_player_id ? String(staffAssignment.judge_player_id) : null;

  const hasFeeWaivers = await tableExists(db, 'evening_fee_waivers');
  const waiverRows = hasFeeWaivers
    ? await db.all<any>('SELECT participant_id FROM evening_fee_waivers WHERE evening_id = ?', [eveningId])
    : [];
  const explicitWaiverIds = new Set(waiverRows.map((row: any) => String(row.participant_id)));

  // Ambiguous legacy `waived + due=0` rows are not evidence of an explicit waiver,
  // but charging them automatically would be unsafe because the old global-role
  // triggers may have created them. Keep them on a durable review hold until the
  // organizer explicitly resolves the record.
  const hasWaiverDiagnostics = await tableExists(db, 'evening_fee_waiver_migration_diagnostics');
  const diagnosticRows = hasWaiverDiagnostics
    ? await db.all<any>(`
        SELECT participant_id
          FROM evening_fee_waiver_migration_diagnostics
         WHERE evening_id = ? AND status = 'needs_review'
      `, [eveningId])
    : [];
  const reviewHoldIds = new Set(diagnosticRows.map((row: any) => String(row.participant_id)));

  const { playedCounts, completedGameParticipants } = await loadCompletedGames(db, eveningId, participants);

  // «Продление вечера»: shares of what the club paid for extra time (see eveningExtensionService); charged as soon as it is entered.
  const { shares: extensionShares } = await loadExtensionShares(db, eveningId, evening, participants, completedGameParticipants, assignedStaffPlayerId, assignedJudgePlayerId);

  const closed = evening.status === 'completed' || Boolean(evening.settled_at);
  const now = new Date().toISOString();
  await db.transaction(async (tx: DatabaseWrapper) => {
    for (const participant of participants) {
      const participantId = String(participant.id);
      const playerId = String(participant.player_id);
      const feeExempt = explicitWaiverIds.has(participantId)
        || reviewHoldIds.has(participantId)
        || isRegularFeeFreeByStaffRule(evening.starts_at, playerId, assignedStaffPlayerId);
      const gamesPlayed = playedCounts.get(participantId) || 0;
      const extensionDue = !feeExempt ? (extensionShares.get(participantId) || 0) : 0;
      const canonicalDue = feeExempt ? 0 : calculateRegularEveningPlayedAmount(gamesPlayed, policy) + extensionDue;
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
        || (hasExtensionColumn && Number(participant.extension_due || 0) !== extensionDue)
        || String(participant.payment_status || '') !== paymentStatus
      ) {
        // `extension_due` is added by ensureClubOperationsSchema; a participants table that does not have it yet is simply not touched.
        await tx.run(
          hasExtensionColumn
            ? 'UPDATE evening_participants SET amount_due = ?, extension_due = ?, payment_status = ?, updated_at = ? WHERE id = ?'
            : 'UPDATE evening_participants SET amount_due = ?, payment_status = ?, updated_at = ? WHERE id = ?',
          hasExtensionColumn
            ? [canonicalDue, extensionDue, paymentStatus, now, participant.id]
            : [canonicalDue, paymentStatus, now, participant.id],
        );
      }
    }
  });

  return {
    applied: true,
    games_by_participant: Object.fromEntries([...playedCounts.entries()]),
  };
}

/**
 * «Продление вечера» on evenings of the other formats (rating, novice, tournament evening ...): the price of such an evening is
 * written by other services and may be recalculated at any time, so the extension is added on top of whatever `amount_due` is now.
 * `extension_total_due` remembers the total we wrote: while `amount_due` still equals it, the base price is `amount_due - extension_due`;
 * otherwise another service has rewritten the price and `amount_due` already is the base. Charged as soon as it is entered; once the
 * evening is closed a change is an ordinary ledger adjustment (before that the closing writes the ledger from `amount_due`). Regular (CASUAL) evenings are handled by reconcileRegularEveningPayments.
 */
export async function reconcileOtherFormatExtensions(db: DatabaseWrapper, eveningId: string): Promise<void> {
  const evening = await db.get<any>('SELECT id, title, format, status, settled_at, starts_at FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening || normalizeEveningFormat(evening.format) === 'CASUAL') return;
  if (!(await tableExists(db, 'evening_extensions'))) return;

  const participants = await db.all<any>('SELECT ep.* FROM evening_participants ep WHERE ep.evening_id = ?', [eveningId]);
  if (!participants.length || !('extension_total_due' in participants[0])) return;

  const hasStaffAssignments = await tableExists(db, 'evening_staff_assignments');
  const staffAssignment = hasStaffAssignments
    ? await db.get<any>('SELECT organizer_player_id, judge_player_id FROM evening_staff_assignments WHERE evening_id = ? LIMIT 1', [eveningId])
    : null;
  const assignedOrganizerId = staffAssignment?.organizer_player_id ? String(staffAssignment.organizer_player_id) : null;
  const assignedJudgeId = staffAssignment?.judge_player_id ? String(staffAssignment.judge_player_id) : null;
  const waiverRows = (await tableExists(db, 'evening_fee_waivers'))
    ? await db.all<any>('SELECT participant_id FROM evening_fee_waivers WHERE evening_id = ?', [eveningId])
    : [];
  const waivedIds = new Set(waiverRows.map((row: any) => String(row.participant_id)));

  const { completedGameParticipants } = await loadCompletedGames(db, eveningId, participants);
  const { shares } = await loadExtensionShares(db, eveningId, evening, participants, completedGameParticipants, assignedOrganizerId, assignedJudgeId);
  const closed = evening.status === 'completed' || Boolean(evening.settled_at);
  const now = new Date().toISOString();

  await db.transaction(async (tx: DatabaseWrapper) => {
    for (const participant of participants) {
      const participantId = String(participant.id);
      const oldExtension = Math.max(0, Number(participant.extension_due || 0));
      const due = Math.max(0, Number(participant.amount_due || 0));
      // A player who is free of the evening — a gifted evening, or a shop free-evening credit that set `waived` with a zero amount
      // without writing a waiver row — is free of the extension too.
      const freeOfCharge = waivedIds.has(participantId) || (String(participant.payment_status) === 'waived' && due === 0);
      const newExtension = !freeOfCharge ? (shares.get(participantId) || 0) : 0;
      const previousTotal = Number(participant.extension_total_due || 0);
      const ourTotalStillStands = oldExtension > 0 && due === previousTotal;
      if (newExtension === oldExtension && (oldExtension === 0 || ourTotalStillStands)) continue;

      const base = ourTotalStillStands ? due - oldExtension : due;
      const total = base + newExtension;
      const paid = Math.max(0, Number(participant.amount_paid || 0));
      const status = total === 0 ? String(participant.payment_status || '') : paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
      await tx.run(
        'UPDATE evening_participants SET amount_due = ?, extension_due = ?, extension_total_due = ?, payment_status = ?, updated_at = ? WHERE id = ?',
        [total, newExtension, newExtension > 0 ? total : 0, status, now, participantId],
      );
      if (closed && newExtension !== oldExtension) {
        await addLedgerAdjustment(tx, {
          type: 'debt_created',
          amount: newExtension - oldExtension,
          eveningId,
          playerId: String(participant.player_id),
          participantId,
          description: `Продление вечера: ${String(evening.title || 'Игровой вечер')}`,
        });
      }
    }
  });
}

/**
 * Right after an evening is closed: the amounts and the ledger are brought in line with the extension once more (an extension is already
 * charged while the evening runs; the closing wrote the ledger from those amounts). Evenings without an extension are left as the closing wrote them.
 */
export async function reconcileExtensionsAfterClose(db: DatabaseWrapper, eveningId: string): Promise<void> {
  if (!(await tableExists(db, 'evening_extensions'))) return;
  const row = await db.get<any>('SELECT 1 AS present FROM evening_extensions WHERE evening_id = ? LIMIT 1', [eveningId]);
  if (!row) return;
  await reconcileRegularEveningPayments(db, eveningId);
  await reconcileOtherFormatExtensions(db, eveningId);
}
