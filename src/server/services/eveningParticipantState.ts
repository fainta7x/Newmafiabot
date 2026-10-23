import { openEveningSql } from '../../lib/eveningStatus.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import {
  EVENING_ATTENDANCE_FACTS,
  EVENING_RESPONSE_STATUSES,
  getEveningAttendanceFact,
  getEveningResponse,
  type EveningAttendanceFact,
  type EveningResponseStatus,
} from '../../lib/eveningResponse.ts';
import { ensureEveningResponseHistorySchema } from '../../db/ensureEveningResponseHistorySchema.ts';
import { reconcileParticipantAttendanceReward } from './eveningAttendanceRewardService.ts';
import { notifyOrganizerAboutResponse } from './organizerResponseNotificationService.ts';

export class EveningParticipantStateError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'EveningParticipantStateError';
    this.status = status;
  }
}

/**
 * A player's own RSVP is immutable after the organizer has marked factual
 * attendance. Organizer corrections still go through a separate authorized
 * route and are not subject to this player-facing guard.
 */
export const isParticipantResponseLockedAfterAttendance = (
  participant: { attendance_status?: unknown } | null | undefined,
): boolean => Boolean(participant) && String(participant?.attendance_status || 'pending') !== 'pending';

export const parseResponseStatus = (value: unknown): EveningResponseStatus => {
  if (!EVENING_RESPONSE_STATUSES.includes(value as EveningResponseStatus)) {
    throw new EveningParticipantStateError('Некорректный ответ игрока');
  }
  return value as EveningResponseStatus;
};

export const parseAttendanceFact = (value: unknown): EveningAttendanceFact => {
  if (!EVENING_ATTENDANCE_FACTS.includes(value as EveningAttendanceFact)) {
    throw new EveningParticipantStateError('Некорректная фактическая явка');
  }
  return value as EveningAttendanceFact;
};

export const serializeEveningParticipant = <T extends Record<string, any>>(row: T): T & {
  response_status: EveningResponseStatus;
  attendance_fact: EveningAttendanceFact;
} => ({
  ...row,
  response_status: getEveningResponse(row),
  attendance_fact: getEveningAttendanceFact(row),
});

/**
 * «Иду» means every game (owner, 2026-10-13): the player is registered in all open games at once, so they look like
 * everyone else instead of a special «идёт на весь вечер, игры не выбраны» state. Only for «Иду» with no picked games
 * at all — exact choices are never touched, and «Приду позже» stays an intent without games.
 * With `participantId` for one player; without it a sweep over every open evening (old answers set before this rule).
 */
export async function registerGoingParticipantsForAllGames(db: DatabaseWrapper, participantId?: string): Promise<number> {
  const tables = new Set((await db.all<any>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((row: any) => String(row.name)));
  if (!tables.has('evening_slot_registrations') || !tables.has('evening_game_slots')) return 0;
  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT OR IGNORE INTO evening_slot_registrations (id, slot_id, participant_id, created_at, updated_at)
     SELECT lower(hex(randomblob(16))), s.id, ep.id, ?, ?
       FROM evening_participants ep
       JOIN game_evenings e ON e.id = ep.evening_id
       JOIN evening_game_slots s ON s.evening_id = ep.evening_id AND s.status = 'open'
      WHERE ep.response_status = 'going' AND ep.player_id IS NOT NULL
        AND ${openEveningSql('e')}
        AND NOT EXISTS (SELECT 1 FROM evening_slot_registrations r WHERE r.participant_id = ep.id)
        ${participantId ? 'AND ep.id = ?' : ''}`,
    participantId ? [now, now, participantId] : [now, now],
  );
  return Number((result as any)?.changes || 0);
}

export async function setParticipantResponse(
  db: DatabaseWrapper,
  participantId: string,
  status: EveningResponseStatus,
  options: { byPlayer?: boolean; source?: string } = {},
) {
  const before = await db.get<{ response_status: string | null; evening_id: string | null; player_id: string | null }>(
    'SELECT response_status, evening_id, player_id FROM evening_participants WHERE id = ?', [participantId]);
  const previous = options.byPlayer ? before?.response_status : null;
  const now = new Date().toISOString();
  const isPositive = status === 'going' || status === 'late';
  await db.run(
    `UPDATE evening_participants
        SET response_status = ?, registration_status = ?,
            confirmed_at = CASE WHEN ? THEN COALESCE(confirmed_at, ?) ELSE confirmed_at END,
            updated_at = ?
      WHERE id = ?`,
    [status, status, isPositive ? 1 : 0, now, now, participantId],
  );

  // Every change of the answer is written down with where it came from (owner, 2026-10-12: «ставится само»).
  try {
    await ensureEveningResponseHistorySchema(db);
    await db.run(
      `INSERT INTO evening_response_history (participant_id, evening_id, player_id, previous_status, new_status, source, by_player, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [participantId, before?.evening_id ?? null, before?.player_id ?? null, before?.response_status ?? null, status, options.source || (options.byPlayer ? 'player_unspecified' : 'organizer_or_system'), options.byPlayer ? 1 : 0, now],
    );
  } catch (error) {
    console.warn('[EVENING RESPONSE] history not written:', error instanceof Error ? error.message : String(error));
  }

  // A changed answer can move an already arrived player between 500 and 400.
  await reconcileParticipantAttendanceReward(db, participantId);

  if (status === 'going') await registerGoingParticipantsForAllGames(db, participantId).catch((error) => console.warn('[EVENING RESPONSE] games not registered:', error instanceof Error ? error.message : String(error)));

  if (status === 'declined') {
    await db.run(
      `DELETE FROM evening_slot_registrations
        WHERE participant_id = ?
          AND slot_id IN (SELECT id FROM evening_game_slots WHERE evening_id = (SELECT evening_id FROM evening_participants WHERE id = ?))`,
      [participantId, participantId],
    );
  }

  if (options.byPlayer) {
    try {
      await notifyOrganizerAboutResponse(db, participantId, previous, status);
    } catch (error) {
      // A player's answer must never fail because the organizer alert could not be queued.
      console.warn('[EVENING RESPONSE] organizer notification failed:', error instanceof Error ? error.message : String(error));
    }
  }
}

export async function setParticipantAttendance(db: DatabaseWrapper, participantId: string, fact: EveningAttendanceFact) {
  const now = new Date().toISOString();
  const values: Record<EveningAttendanceFact, [string, string, string | null]> = {
    pending: ['pending', 'unknown', null],
    attended_on_time: ['attended', 'on_time', now],
    attended_late: ['attended', 'late', now],
    no_show: ['no_show', 'unknown', null],
  };
  const [attendanceStatus, arrivalStatus, checkedInAt] = values[fact];
  await db.run(
    `UPDATE evening_participants
        SET attendance_status = ?, arrival_status = ?, checked_in_at = ?, updated_at = ?
      WHERE id = ?`,
    [attendanceStatus, arrivalStatus, checkedInAt, now, participantId],
  );
  // Tokens for coming follow the attendance mark (500 at the start after signing up, 400 otherwise).
  await reconcileParticipantAttendanceReward(db, participantId);
}

export const legacyAttendancePatchToFact = (
  current: any,
  attendanceStatus: unknown,
  arrivalStatus: unknown,
): EveningAttendanceFact | null => {
  if (attendanceStatus === undefined && arrivalStatus === undefined) return null;
  const attendance = attendanceStatus === undefined ? current.attendance_status : attendanceStatus;
  const arrival = arrivalStatus === undefined ? current.arrival_status : arrivalStatus;
  if (attendance === 'no_show') return 'no_show';
  if (attendance === 'pending') return 'pending';
  if (attendance === 'attended') return arrival === 'late' ? 'attended_late' : 'attended_on_time';
  throw new EveningParticipantStateError('Некорректная комбинация фактической явки');
};

export async function loadParticipantResponseHistory(db: DatabaseWrapper, participantId: string) {
  await ensureEveningResponseHistorySchema(db);
  return db.all<{ previous_status: string | null; new_status: string; source: string; by_player: number; created_at: string }>(
    'SELECT previous_status, new_status, source, by_player, created_at FROM evening_response_history WHERE participant_id = ? ORDER BY id DESC LIMIT 50', [participantId]);
}
