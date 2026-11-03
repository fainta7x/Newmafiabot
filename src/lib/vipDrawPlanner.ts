import { randomInt } from 'node:crypto';
import type { GameRole } from '../shared/gameRoles.ts';
import { chooseConflictingVipRule, type VipProbabilityRule } from './vipRoleProbabilityRules.ts';
import type { VipClosedCard } from './vipClosedDeckSimulation.ts';

const roles: GameRole[] = ['citizen','sheriff','mafia','don'];
const isRedTeam = (role:GameRole)=>role==='citizen'||role==='sheriff';
type Context = {
  drawingPlayerId:string|null;
  protectedClosedRoles?:Partial<Record<GameRole,number>>;
  waitingPlayerIds:ReadonlySet<string>;
  revealedRolesByPlayer:ReadonlyMap<string,GameRole>;
};
type Constraint = { rule:VipProbabilityRule; target:string; wanted:GameRole[]; allowed:GameRole[] };

/** One independent roll per applicable rule, one lottery, at most one closed-card exchange.
 * No pre-deal bonus selection and no recursive rerolls of replacement cards.
 * Rules must already be gated by their OWNER's quota and game format in the service.
 */
export function planVipDraw<T extends VipClosedCard>(
  deck:readonly T[], selectedId:T['id'], rules:readonly VipProbabilityRule[], context:Context,
  randomIndex:(maxExclusive:number)=>number=randomInt,
): {deck:T[];vipPlayerIds:string[]} {
  const unchanged={deck:[...deck],vipPlayerIds:[] as string[]};
  const selected=deck.find(card=>card.id===selectedId);
  if(!selected)return unchanged;
  const available=roles.filter(role=>deck.filter(card=>card.role===role).length>(context.protectedClosedRoles?.[role]??0));
  let constraints:Constraint[]=[];
  for(const rule of rules){
    if(!rule.enabled||rule.percent<=0)continue;
    let target=rule.playerId;
    let wanted:GameRole[];
    if(rule.kind==='red_color')wanted=['citizen']; // a red CARD is strictly a citizen
    else if(rule.kind==='role')wanted=rule.role?[rule.role]:[];
    else {
      const peer=rule.otherPlayerId;
      if(!peer)continue;
      const ownRole=context.revealedRolesByPlayer.get(rule.playerId);
      const peerRole=context.revealedRolesByPlayer.get(peer);
      let first:GameRole|undefined;
      if(ownRole && context.waitingPlayerIds.has(peer)){target=peer;first=ownRole;}
      else if(peerRole && context.waitingPlayerIds.has(rule.playerId))first=peerRole;
      if(!first)continue; // neither first card nor hidden future roles are inspected
      const wantRed=rule.kind==='same_color'?isRedTeam(first):!isRedTeam(first);
      wanted=roles.filter(role=>isRedTeam(role)===wantRed);
    }
    if(!context.waitingPlayerIds.has(target))continue;
    wanted=wanted.filter(role=>available.includes(role));
    if(!wanted.length)continue;
    const allowed=target===context.drawingPlayerId?wanted:available.filter(role=>!wanted.includes(role));
    if(allowed.length)constraints.push({rule,target,wanted,allowed});
  }
  // A 100% promise reserves ONE required card per still-waiting recipient,
  // not every citizen/colour card. Other players can draw the surplus normally.
  // This preserves ordinary distribution instead of forcing all black roles
  // into the first seats when one late player has a citizen guarantee.
  constraints=constraints.filter(item=>{
    if(item.target===context.drawingPlayerId || item.rule.percent!==100)return true;
    const needed=new Set(constraints.filter(other=>other.rule.percent===100
      && other.target!==context.drawingPlayerId
      && other.wanted.every(role=>item.wanted.includes(role))).map(other=>other.target)).size;
    return deck.filter(card=>item.wanted.includes(card.role)).length<=needed;
  });
  // Preserve each feasible 100% promise against non-guaranteed effects. If several
  // promises cannot coexist, do not invent cards: the ordinary equal lottery is
  // restricted to the executable guaranteed conditions instead.
  const hard=constraints.filter(item=>item.rule.percent===100);
  const hardAllowed=hard.reduce((current,item)=>current.filter(role=>item.allowed.includes(role)),available);
  const feasible=hardAllowed.length?hardAllowed:available;
  const ownPotential=constraints.filter(item=>item.target===context.drawingPlayerId)
    .flatMap(item=>item.allowed);
  const triggered=constraints.filter(item=>{
    // A waiting condition is tested only when the current choice (or a possible
    // own replacement) could take a card it is trying to retain.
    if(item.target!==context.drawingPlayerId && !item.wanted.includes(selected.role)
      && !ownPotential.some(role=>item.wanted.includes(role)))return false;
    if(!item.allowed.some(role=>feasible.includes(role)))return false;
    return randomIndex(100)<item.rule.percent;
  });
  const pool=hard.length && !hardAllowed.length?triggered.filter(item=>item.rule.percent===100):triggered;
  const winner=chooseConflictingVipRule(pool,randomIndex);
  if(!winner)return unchanged;
  const acceptable=winner.allowed.filter(role=>feasible.includes(role));
  if(acceptable.includes(selected.role))return unchanged;
  const donors=deck.filter(card=>card.id!==selectedId && acceptable.includes(card.role));
  if(!donors.length)return unchanged;
  // Uniform among available cards, not uniformly between role labels.
  const donor=donors[randomIndex(donors.length)];
  const vipPlayerIds=new Set([winner.rule.playerId]);
  // A mandatory protection that actually changed this draw credits its owner;
  // several effects still count as only one game through the service's distinct IDs.
  for(const item of hard){
    if(!item.allowed.includes(selected.role) && item.allowed.includes(donor.role))vipPlayerIds.add(item.rule.playerId);
  }
  return {deck:deck.map(card=>card.id===selectedId?{...card,role:donor.role}
    :card.id===donor.id?{...card,role:selected.role}:card),vipPlayerIds:[...vipPlayerIds]};
}
