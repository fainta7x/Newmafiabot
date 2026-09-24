import type { DatabaseWrapper } from '../../db/index.ts';
import { mutateTokenBalance } from './tokenLedgerService.ts';

/**
 * Staff token rewards (user-approved 2026-09-24):
 * - a judge gets twice the regular player participation reward (2 × 100 = 200) per completed game;
 * - the evening's organizer gets 1000 tokens per closed evening.
 * The judge increase applies to games created from 2026-09-24 (Moscow), so re-settlement does
 * not retroactively pay extra for games judged under the old 100-token rule.
 */
export const LEGACY_JUDGE_REWARD = 100;
export const JUDGE_REWARD = 200;
export const ORGANIZER_EVENING_REWARD = 1000;
export const STAFF_REWARD_CUTOVER = Date.parse('2026-09-24T00:00:00+03:00');

export const judgeRewardFor = (gameCreatedAt: unknown): number => {
  const created = Date.parse(String(gameCreatedAt || ''));
  return Number.isFinite(created) && created >= STAFF_REWARD_CUTOVER ? JUDGE_REWARD : LEGACY_JUDGE_REWARD;
};

/**
 * Pays the evening's organizer once the evening is closed. Idempotent by evening: the ledger key
 * is stable, so re-running a settlement never pays twice. Evenings before the cutover are not paid.
 */
export async function awardEveningOrganizer(db: DatabaseWrapper, eveningId: string) {
  const evening = await db.get<any>('SELECT id, title, starts_at, status, settled_at FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening || !(evening.status === 'completed' || evening.settled_at)) return null;
  if (!(Date.parse(String(evening.starts_at || '')) >= STAFF_REWARD_CUTOVER)) return null;
  const hasStaff = await db.get<any>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'evening_staff_assignments' LIMIT 1");
  const staff = hasStaff ? await db.get<any>('SELECT organizer_player_id FROM evening_staff_assignments WHERE evening_id = ? LIMIT 1', [eveningId]) : null;
  if (!staff?.organizer_player_id) return null;
  return mutateTokenBalance(db, {
    playerId: String(staff.organizer_player_id),
    delta: ORGANIZER_EVENING_REWARD,
    reasonType: 'evening_organizer',
    description: `Вечер «${String(evening.title || 'Игровой вечер')}»: жетоны организатору`,
    sourceType: 'evening_organizer',
    sourceId: eveningId,
    idempotencyKey: `evening-organizer:${eveningId}`,
    debitPolicy: 'allow_negative',
    actorType: 'system',
    actorId: null,
    metadata: { evening_id: eveningId, reward: ORGANIZER_EVENING_REWARD },
  });
}
