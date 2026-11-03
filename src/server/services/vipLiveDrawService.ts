import type { DatabaseWrapper } from '../../db/index.ts';
import type { GameRole } from '../../shared/gameRoles.ts';
import { simulateVipDraw } from '../../lib/vipClosedDeckSimulation.ts';
import { vipEffectAllowed } from '../../lib/vipRoleProbabilityRules.ts';
import { vipCanTriggerInGame } from '../../lib/vipSuccessfulGamesQuota.ts';
import { listVipProbabilityRules } from './vipProbabilityRulesService.ts';
import { getVipGameQuotas } from './vipGameQuotaService.ts';

type Card = { id: string; role: GameRole };
type PrivateDraw = { seat: number; role: GameRole; vipPlayerIds?: string[] };
type DealState = { deck: Card[]; history: PrivateDraw[]; pending: PrivateDraw | null };
type Context = { eveningId: string; format: string; playerBySeat: Map<number,string> };
const red = (role: GameRole) => role === 'citizen' || role === 'sheriff';

/** Called inside the same SQLite transaction as reveal. Private state is never sent to clients. */
export async function applyPrivateVipDraw(
  db: DatabaseWrapper, gameId: number, context: Context, state: DealState, seat: number, cardId: string,
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
  const playerId = context.playerBySeat.get(seat);
  const vipPlayerIds: string[] = [];
  let deck = state.deck;

  // Preserve the existing 100% red guarantee through the SAME editable rule.
  // Purchases have already removed their cards and assigned their seats. No
  // bought role or previously revealed card is part of this exchange.
  const waiting = [...context.playerBySeat.entries()].filter(([otherSeat,id]) =>
    otherSeat!==seat && !state.history.some(entry=>entry.seat===otherSeat) && allowed(id)
      && rules.some(rule=>rule.playerId===id && rule.enabled && rule.kind==='red_color' && rule.percent===100));
  const selected = deck.find(card=>card.id===cardId)!;
  const redCount = deck.filter(card=>red(card.role)).length;
  // If purchases made every reservation impossible, apply only feasible effects;
  // never manufacture a role or fail the whole deal.
  if (waiting.length && red(selected.role) && redCount<=waiting.length) {
    const donor = deck.find(card=>!red(card.role));
    if (donor) {
      // Reserving a red is an actual exchange for its beneficiary. The marker is
      // confirmed/undone together with this card, not incremented on each retry.
      const beneficiary = waiting.find(([,id])=>!successes.some(row=>row.game_id===gameId && row.player_id===id)) || waiting[0];
      deck = deck.map(card=>card.id===cardId ? {...card,role:donor.role}
        : card.id===donor.id ? {...card,role:selected.role} : card);
      vipPlayerIds.push(beneficiary[1]);
    }
  }
  // Reserve only as many red cards as actually remain. Paid roles were removed
  // before this point. The pure engine cannot consume these closed reserves.
  const protectedClosedRoles: Partial<Record<GameRole,number>> = {};
  let toProtect = waiting.length;
  for (const role of ['citizen','sheriff'] as const) {
    protectedClosedRoles[role] = Math.min(toProtect,deck.filter(card=>card.role===role).length);
    toProtect -= protectedClosedRoles[role]!;
  }
  const effect = simulateVipDraw(deck,cardId,rules,{
    playerId:playerId || '',revealedRolesByPlayer,protectedClosedRoles,
    limitAllows:!!playerId && allowed(playerId),
  });
  if (effect.appliedRuleIds.length && playerId) vipPlayerIds.push(playerId);
  return { deck:effect.deck,vipPlayerIds };
}
