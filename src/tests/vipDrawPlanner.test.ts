import {describe,it,expect} from 'vitest';
import {planVipDraw} from '../lib/vipDrawPlanner.ts';
import type {VipProbabilityRule} from '../lib/vipRoleProbabilityRules.ts';
import type {GameRole} from '../shared/gameRoles.ts';
const card=(id:string,role:GameRole)=>({id,role});
const rule=(patch:Partial<VipProbabilityRule>={}):VipProbabilityRule=>({
 id:'r',playerId:'owner',kind:'role',role:'sheriff',otherPlayerId:null,percent:80,enabled:true,...patch,
});
const context=(drawingPlayerId='other',revealed: Array<[string,GameRole]>=[])=>({
 drawingPlayerId,waitingPlayerIds:new Set(['owner','other','peer']),revealedRolesByPlayer:new Map(revealed),
});
const rolls=(...values:number[])=>()=>values.shift()??0;
const deck=[card('s','sheriff'),card('c','citizen'),card('b','mafia')];
const multiset=(d:typeof deck)=>d.map(c=>c.role).sort();
describe('one atomic VIP decision per reveal',()=>{
 it('red card means citizen only, never sheriff, and 100% excludes a soft sheriff effect',()=>{
  const result=planVipDraw(deck,'s',[rule({kind:'red_color',role:null,percent:100}),rule({id:'sheriff',percent:60})],context('owner'),()=>0);
  expect(result.deck.find(c=>c.id==='s')?.role).toBe('citizen');
  expect(multiset(result.deck)).toEqual(multiset(deck));
 });
 it('retains a last citizen even when the remaining other red-team card is sheriff',()=>{
  const result=planVipDraw(deck,'c',[rule({kind:'red_color',role:null,percent:100})],context(),()=>0);
  expect(result.deck.find(c=>c.id==='c')?.role).not.toBe('citizen');
  expect(result.deck.filter(c=>c.role==='citizen')).toHaveLength(1);
  expect(result.vipPlayerIds).toEqual(['owner']);
 });
 it('does not block surplus citizens for a single 100% guarantee',()=>{
  const d=[...deck,card('c2','citizen')];
  const result=planVipDraw(d,'c',[rule({kind:'red_color',role:null,percent:100})],context(),()=>0);
  expect(result.deck).toEqual(d);expect(result.vipPlayerIds).toEqual([]);
 });
 it.each([79,80])('checks the 80%% sheriff boundary per attempt: %s',value=>{
  const result=planVipDraw(deck,'s',[rule()],context(),rolls(value,0));
  expect(result.deck.find(c=>c.id==='s')?.role==='sheriff').toBe(value===80);
 });
 it('draws a new percentage on every attempt and never replaces a failed check by a game-long reservation',()=>{
  const first=planVipDraw(deck,'s',[rule()],context(),rolls(20,0));
  const closed=first.deck.filter(c=>c.id!=='s');
  const sheriff=closed.find(c=>c.role==='sheriff')!;
  const second=planVipDraw(closed,sheriff.id,[rule()],context(),()=>95);
  expect(second.deck.find(c=>c.id===sheriff.id)?.role).toBe('sheriff');
  expect(second.vipPlayerIds).toEqual([]);
 });
 it.each([0,1])('lottery includes compatible sheriff and citizen conditions (winner %s)',winner=>{
  const result=planVipDraw(deck,'b',[rule({id:'s',percent:60}),rule({id:'red',kind:'red_color',role:null,percent:80})],context('owner'),rolls(10,10,winner,0));
  expect(result.deck.find(c=>c.id==='b')?.role).toBe(winner===0?'sheriff':'citizen');
 });
 it('does not substitute sheriff for an exhausted citizen condition',()=>{
  const remaining=[card('s','sheriff'),card('b','mafia')];
  expect(planVipDraw(remaining,'b',[rule({kind:'red_color',role:null,percent:100})],context('owner'),()=>0).deck).toEqual(remaining);
 });
 it.each(['owner','peer'])('applies a pair to the second drawer in either order (first %s)',first=>{
  const second=first==='owner'?'peer':'owner';
  const ctx=context(second,[[first,'don']]);ctx.waitingPlayerIds.delete(first);
  const result=planVipDraw(deck,'c',[rule({kind:'same_color',role:null,otherPlayerId:'peer',percent:70})],ctx,()=>0);
  expect(result.deck.find(c=>c.id==='c')?.role).toBe('mafia');
  expect(result.vipPlayerIds).toEqual(['owner']);
 });
 it.each([69,70])('protects a pair colour on earlier draws with a fresh 70%% check: %s',value=>{
  const ctx=context('other',[['owner','don']]);ctx.waitingPlayerIds.delete('owner');
  const result=planVipDraw(deck,'b',[rule({kind:'same_color',role:null,otherPlayerId:'peer',percent:70})],ctx,rolls(value,0));
  expect(result.deck.find(c=>c.id==='b')?.role==='mafia').toBe(value===70);
 });
 it('leaves a pair unresolved before the first member draws',()=>{
  expect(planVipDraw(deck,'b',[rule({kind:'same_color',role:null,otherPlayerId:'peer',percent:100})],context('owner'),()=>0).deck).toEqual(deck);
 });
 it('handles different colour in both directions with no changes to the first card',()=>{
  const ctx=context('peer',[['owner','don']]);ctx.waitingPlayerIds.delete('owner');
  const result=planVipDraw(deck,'b',[rule({kind:'different_color',role:null,otherPlayerId:'peer',percent:100})],ctx,()=>0);
  expect(['citizen','sheriff']).toContain(result.deck.find(c=>c.id==='b')?.role);
  expect(ctx.revealedRolesByPlayer.get('owner')).toBe('don');
 });
 it('chooses donor cards uniformly rather than weighting role labels equally',()=>{
  const d=[card('s','sheriff'),card('c1','citizen'),card('c2','citizen'),card('b','mafia')];
  for(let index=0;index<3;index++){
   const result=planVipDraw(d,'s',[rule({percent:100})],context(),rolls(0,index));
   expect(result.deck.find(c=>c.id==='s')?.role).toBe(index<2?'citizen':'mafia');
   expect(multiset(result.deck)).toEqual(multiset(d));
  }
 });
 it('natural matching role and impossible exchange never spend a successful game',()=>{
  expect(planVipDraw(deck,'s',[rule({percent:100})],context('owner'),()=>0).vipPlayerIds).toEqual([]);
  const only=[card('c','citizen')];
  expect(planVipDraw(only,'c',[rule({percent:100})],context(),()=>0).deck).toEqual(only);
 });
 it('rolls close to 80% across a reproducible 10000-attempt simulation',()=>{
  let seed=123456789,changed=0;
  const random=(max:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*max);};
  for(let i=0;i<10000;i++)if(planVipDraw(deck,'s',[rule()],context(),random).vipPlayerIds.length)changed++;
  expect(changed/10000).toBeGreaterThan(0.78);expect(changed/10000).toBeLessThan(0.82);
 });
});
