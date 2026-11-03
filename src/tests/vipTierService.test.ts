import { describe, expect, it } from 'vitest';
import { resolveVipQuota, validateVipTier, type VipTier } from '../server/services/vipTierService.ts';

const tier: VipTier = {
  id:'gold', name:'Gold', limit:2, scope:'evening', enabled:true,
};
describe('configurable VIP tiers and quota period', () => {
  it('allows editing game and evening time windows and zero successful swaps', () => {
    expect(validateVipTier({name:' Bronze ',limit:0,scope:'game',enabled:true}))
      .toEqual({name:'Bronze',limit:0,scope:'game',enabled:true});
    expect(validateVipTier({...tier,scope:'evening',limit:null}).limit).toBeNull();
  });
  it('rejects invalid windows, quotas and tier names', () => {
    for(const candidate of [
      {...tier,scope:'week'}, {...tier,limit:-1}, {...tier,limit:2.5},
      {...tier,limit:10001},{...tier,name:''},{...tier,enabled:'yes'},
    ]) expect(()=>validateVipTier(candidate)).toThrow();
  });
  it('inherits tier limit when a personal override is not configured', () => {
    expect(resolveVipQuota(null,tier,'game',1)).toEqual({allowed:true,limit:2,scope:'evening'});
    expect(resolveVipQuota(null,tier,'game',2)).toEqual({allowed:false,limit:2,scope:'evening'});
    expect(resolveVipQuota(null,{...tier,scope:'game'},'evening',0))
      .toEqual({allowed:true,limit:2,scope:'game'});
  });
  it('personal override wins over tier and can deliberately prohibit substitutions', () => {
    expect(resolveVipQuota(0,tier,'game',0))
      .toEqual({allowed:false,limit:0,scope:'game'});
    expect(resolveVipQuota(3,tier,'game',2))
      .toEqual({allowed:true,limit:3,scope:'game'});
    expect(resolveVipQuota(3,tier,'game',3).allowed).toBe(false);
  });
  it('disabled tier does not silently allow a tier-only perk', () => {
    expect(resolveVipQuota(null,{...tier,enabled:false},'evening',0).allowed).toBe(false);
    expect(resolveVipQuota(1,{...tier,enabled:false},'game',0).allowed).toBe(true);
  });
  it('unassigned tier has no inferred limit; a future live engine must still opt in', () => {
    expect(resolveVipQuota(null,null,'evening',5))
      .toEqual({allowed:true,limit:null,scope:'evening'});
  });
});
