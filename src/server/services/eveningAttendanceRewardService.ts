import type { DatabaseWrapper } from '../../db/index.ts';
import { getEveningAttendanceFact, getEveningResponse } from '../../lib/eveningResponse.ts';
import { mutateTokenBalance } from './tokenLedgerService.ts';

/**
 * Tokens for coming to an evening (user-approved 2026-09-26):
 * - 500 for a player who signed up in advance («Иду» or «Приду позже») and arrived at the start;
 * - 400 for a player who arrived late or came without signing up.
 * The reward follows the organizer's attendance mark: marking pays, unmarking takes it back, and a
 * change between «вовремя» and «опоздал» settles the difference. Guests without a profile get
 * nothing. Evenings before the cutover are never paid.
 */
export const ATTENDANCE_REWARD_ON_TIME = 500;
export const ATTENDANCE_REWARD_LATE_OR_WALK_IN = 400;
export const ATTENDANCE_REWARD_CUTOVER = Date.parse('2026-09-26T00:00:00+03:00');

export const attendanceRewardFor = (participant: Record<string, any>): number => {
  const fact = getEveningAttendanceFact(participant);
  if (fact !== 'attended_on_time' && fact !== 'attended_late') return 0;
  const signedUp = ['going', 'late'].includes(getEveningResponse(participant));
  return fact === 'attended_on_time' && signedUp ? ATTENDANCE_REWARD_ON_TIME : ATTENDANCE_REWARD_LATE_OR_WALK_IN;
};

async function ensureAttendanceRewardSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS evening_attendance_rewards (
    evening_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    target_amount INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (evening_id, player_id)
  )`);
}

/** Brings one participant's attendance reward in line with their current attendance mark. */
export async function reconcileParticipantAttendanceReward(db: DatabaseWrapper, participantId: string) {
  const participant = await db.get<any>(
    `SELECT ep.*, e.title AS evening_title, e.starts_at AS evening_starts_at
       FROM evening_participants ep JOIN game_evenings e ON e.id = ep.evening_id
      WHERE ep.id = ? LIMIT 1`,
    [participantId],
  );
  if (!participant?.player_id) return { changed: false, delta: 0 };
  if (!(Date.parse(String(participant.evening_starts_at || '')) >= ATTENDANCE_REWARD_CUTOVER)) return { changed: false, delta: 0 };
  await ensureAttendanceRewardSchema(db);

  const eveningId = String(participant.evening_id);
  const playerId = String(participant.player_id);
  const previous = await db.get<any>('SELECT target_amount, revision FROM evening_attendance_rewards WHERE evening_id = ? AND player_id = ?', [eveningId, playerId]);
  const previousAmount = Number(previous?.target_amount || 0);
  const nextAmount = attendanceRewardFor(participant);
  const delta = nextAmount - previousAmount;
  if (delta === 0) return { changed: false, delta: 0 };

  const revision = Number(previous?.revision || 0) + 1;
  const title = String(participant.evening_title || 'Игровой вечер');
  await mutateTokenBalance(db, {
    playerId,
    delta,
    reasonType: 'evening_attendance',
    description: delta > 0 ? `Вечер «${title}»: жетоны за приход` : `Вечер «${title}»: корректировка жетонов за приход`,
    sourceType: 'evening_attendance',
    sourceId: eveningId,
    idempotencyKey: `evening-attendance:${eveningId}:${playerId}:rev:${revision}`,
    debitPolicy: 'allow_negative',
    actorType: 'system',
    actorId: null,
    metadata: { evening_id: eveningId, previous_target: previousAmount, target: nextAmount, delta, revision },
  });
  await db.run(
    `INSERT INTO evening_attendance_rewards (evening_id, player_id, target_amount, revision, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(evening_id, player_id) DO UPDATE SET target_amount = excluded.target_amount, revision = excluded.revision, updated_at = excluded.updated_at`,
    [eveningId, playerId, nextAmount, revision, new Date().toISOString()],
  );
  return { changed: true, delta };
}
