import type { DatabaseWrapper } from '../../db/index.ts';
import type { GameRole } from '../../shared/gameRoles.ts';
import { planVipDraw } from '../../lib/vipDrawPlanner.ts';
import { vipEffectAllowed } from '../../lib/vipRoleProbabilityRules.ts';
import { vipCanTriggerInGame } from '../../lib/vipSuccessfulGamesQuota.ts';
import { listVipProbabilityRules } from './vipProbabilityRulesService.ts';
import { getVipGameQuotas } from './vipGameQuotaService.ts';

type Card = { id: string; role: GameRole };
type PrivateDraw = { seat: number; role: GameRole; vipPlayerIds?: string[] };
type DealState = { deck: Card[]; history: PrivateDraw[]; pending: PrivateDraw | null };
type Context = { eveningId: string; format: string; playerBySeat: Map<number,string> };

/** Called inside the same SQLite transaction as reveal. Private state is never sent to clients. */
export async function applyPrivateVipDraw(
  db: DatabaseWrapper, gameId: number, context: Context, state: DealState, seat: number, cardId: string, protectedClosedRoles: Partial<Record<GameRole,number>> = {},
): Promise<{ deck: Card[]; vipPlayerIds: string[] }> {
  const unchanged = { deck: state.deck, vipPlayerIds: [] as string[] };
  if (!vipEffectAllowed(context.format)) return unchanged;
  const rules = await listVipProbabilityRules(db);
  const quotas = await getVipGameQuotas(db);
  // JSON projection reads only private success markers, not every historical deck.
  // Pending reveals in OTHER games hold capacity until confirm/reset; this prevents
  // two simultaneous games from both taking the last available quota slot.
  const successes = await db.all<{ game_id:number; player_id:string }>(`
    SELECT DISTINCT d.game_id, p.value AS player_id
      FROM game_virtual_role_deals d JOIN games g ON g.id=d.game_id,
           json_each(json_extract(d.state_json,'$.history')) h,
           json_each(json_extract(h.value,'$.vipPlayerIds')) p
     WHERE g.evening_id=? AND g.archived_at IS NULL
    UNION
    SELECT d.game_id, p.value AS player_id
      FROM game_virtual_role_deals d JOIN games g ON g.id=d.game_id,
           json_each(json_extract(d.state_json,'$.pending.vipPlayerIds')) p
     WHERE g.evening_id=? AND g.archived_at IS NULL AND d.game_id<>?`,
  [context.eveningId,context.eveningId,gameId]);
  const allowed = (playerId: string) => vipCanTriggerInGame(
    quotas.find(q=>q.playerId===playerId) ?? null,
    successes.filter(row=>row.player_id===playerId).map(row=>row.game_id),gameId,
  );
  const revealedRolesByPlayer = new Map<string,GameRole>();
  for (const entry of state.history) {
    const id = context.playerBySeat.get(entry.seat);
    if (id) revealedRolesByPlayer.set(id,entry.role);
  }
  return planVipDraw(state.deck,cardId,rules.filter(rule=>allowed(rule.playerId)),{
    drawingPlayerId:context.playerBySeat.get(seat) || null,
    protectedClosedRoles,
    waitingPlayerIds:new Set([...context.playerBySeat.entries()]
      .filter(([otherSeat])=>!state.history.some(entry=>entry.seat===otherSeat)).map(([,id])=>id)),
    revealedRolesByPlayer,
  });
}
