import { describe, expect, it } from 'vitest';
import type { VipProbabilityRule } from '../lib/vipRoleProbabilityRules.ts';
import { simulateVipDraw } from '../lib/vipClosedDeckSimulation.ts';

const deck = [
  { id:'a',role:'citizen' as const },
  { id:'b',role:'citizen' as const },
  { id:'c',role:'sheriff' as const },
  { id:'d',role:'mafia' as const },
  { id:'e',role:'don' as const },
];
const roleRule = (overrides: Partial<VipProbabilityRule> = {}): VipProbabilityRule => ({
  id:'r1',playerId:'buyer',kind:'role',role:'sheriff',otherPlayerId:null,
  percent:100,enabled:true,...overrides,
});
const context = (overrides: Partial<Parameters<typeof simulateVipDraw>[3]> = {}) => ({
  playerId:'buyer',revealedRolesByPlayer:new Map<string, 'citizen' | 'sheriff' | 'mafia' | 'don'>(),
  protectedClosedRoles:{},limitAllows:true,...overrides,
});
const sorted = (cards: typeof deck) => cards.map(card => card.role).sort();
describe('VIP closed deck simulation, not connected to live deals', () => {
  it('swaps only closed roles preserving the exact deck multiset', () => {
    const result=simulateVipDraw(deck,'a',[roleRule()],context(),() => 0);
    expect(result.deck.find(x=>x.id==='a')?.role).toBe('sheriff');
    expect(sorted(result.deck)).toEqual(sorted(deck));
    expect(result.appliedRuleIds).toEqual(['r1']);
    expect(deck[0].role).toBe('citizen');
  });
  it('runs independent percentage checks before equal chance conflict lottery', () => {
    const rules = [
      roleRule({id:'sheriff',role:'sheriff',percent:70}),
      roleRule({id:'black',kind:'different_color',role:null,otherPlayerId:'peer',percent:80}),
    ];
    const rolls=[50,60,1,0];
    const maxes:number[]=[];
    const result=simulateVipDraw(deck,'a',rules,
      context({revealedRolesByPlayer:new Map([['peer','citizen' as const]])}),
      (max)=>{maxes.push(max);return rolls.shift() ?? 0;});
    expect(maxes.slice(0,3)).toEqual([100,100,2]);
    expect(result.appliedRuleIds).toEqual(['black']);
    expect(['mafia','don']).toContain(result.deck.find(x=>x.id==='a')?.role);
    expect(sorted(result.deck)).toEqual(sorted(deck));
  });
  it('applies compatible triggered rules together with no lottery', () => {
    const same=roleRule({id:'same',kind:'same_color',role:null,otherPlayerId:'peer'});
    const result=simulateVipDraw(deck,'a',[roleRule(),same],
      context({revealedRolesByPlayer:new Map([['peer','citizen' as const]])}),()=>0);
    expect(result.appliedRuleIds).toEqual(['r1','same']);
    expect(result.deck.find(x=>x.id==='a')?.role).toBe('sheriff');
  });
  it('does not consume a VIP quota when the natural draw already meets the condition', () => {
    const result = simulateVipDraw(deck,'c',[roleRule()],context(),()=>0);
    expect(result.appliedRuleIds).toEqual([]);
    expect(result.deck).toEqual(deck);
  });
  it('never predicts other players who have not drawn', () => {
    const same=roleRule({id:'same',kind:'same_color',role:null,otherPlayerId:'peer'});
    const result=simulateVipDraw(deck,'a',[same],context(),()=>0);
    expect(result.appliedRuleIds).toEqual([]);
    expect(result.deck).toEqual(deck);
  });
  it('cannot consume the last card of a paid reservation', () => {
    const result=simulateVipDraw(deck,'a',[roleRule()],
      context({protectedClosedRoles:{sheriff:1}}),()=>0);
    expect(result.appliedRuleIds).toEqual([]);
    expect(result.deck).toEqual(deck);
  });
  it('requires externally approved quota and never alters deck when it does not trigger', () => {
    expect(simulateVipDraw(deck,'a',[roleRule()],context({limitAllows:false}),()=>0).deck).toEqual(deck);
    const result=simulateVipDraw(deck,'a',[roleRule({percent:20})],context(),()=>50);
    expect(result.appliedRuleIds).toEqual([]);
    expect(result.deck).toEqual(deck);
  });
  it('does not claim to change a previously opened card', () => {
    const remaining=deck.filter(card=>card.id!=='c');
    const result=simulateVipDraw(remaining,'a',[roleRule()],context(),()=>0);
    expect(result.appliedRuleIds).toEqual([]);
    expect(result.deck).toEqual(remaining);
  });
});


describe('red-colour condition',()=>{
  it('accepts either red role and preserves all cards',()=>{
    for (const target of ['citizen','sheriff'] as const) {
      const cards=[{id:'black',role:'don' as const},{id:'red',role:target}];
      const result=simulateVipDraw(cards,'black',[roleRule({kind:'red_color',role:null})],context(),()=>0);
      expect(result.deck.find(c=>c.id==='black')?.role).toBe(target);
      expect(result.appliedRuleIds).toHaveLength(1);
      expect(result.deck.map(c=>c.role).sort()).toEqual(cards.map(c=>c.role).sort());
      expect(simulateVipDraw(cards,'red',[roleRule({kind:'red_color',role:null})],context(),()=>0).appliedRuleIds).toEqual([]);
    }
  });
});
