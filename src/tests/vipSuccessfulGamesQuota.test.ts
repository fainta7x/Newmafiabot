import { describe,expect,it } from 'vitest';
import { successfulVipGameCount,validateVipGameQuota,vipCanTriggerInGame } from '../lib/vipSuccessfulGamesQuota.ts';
const unlimited={playerId:'p1',wholeEvening:true,maxSuccessfulGames:null};
const limited={playerId:'p1',wholeEvening:false,maxSuccessfulGames:2};

describe('VIP limit is successful GAMES, never successful individual substitutions',()=>{
  it('accepts one owner option: whole evening or a positive number of games',()=>{
    expect(validateVipGameQuota({wholeEvening:true,maxSuccessfulGames:null},'p1')).toEqual(unlimited);
    expect(validateVipGameQuota({wholeEvening:false,maxSuccessfulGames:2},'p1')).toEqual(limited);
    expect(()=>validateVipGameQuota({wholeEvening:false,maxSuccessfulGames:0},'p1')).toThrow();
    expect(()=>validateVipGameQuota({wholeEvening:false,maxSuccessfulGames:2.5},'p1')).toThrow();
    expect(()=>validateVipGameQuota({wholeEvening:false,maxSuccessfulGames:null},'p1')).toThrow();
    expect(()=>validateVipGameQuota({wholeEvening:true,maxSuccessfulGames:2},'p1')).toThrow();
  });
  it('counts 3 triggered conditions in game A as one successful game',()=>{
    expect(successfulVipGameCount(['game-a','game-a','game-a'])).toBe(1);
    expect(vipCanTriggerInGame(limited,['game-a','game-a','game-a'],'game-b')).toBe(true);
    expect(vipCanTriggerInGame(limited,['game-a','game-a','game-b'],'game-c')).toBe(false);
  });
  it('does not consume a quota when a game had no successful VIP exchange',()=>{
    expect(vipCanTriggerInGame(limited,['game-a'],'game-c')).toBe(true);
    expect(vipCanTriggerInGame(limited,[],'game-z')).toBe(true);
  });
  it('whole-evening setting remains eligible after any number of successes',()=>{
    expect(vipCanTriggerInGame(unlimited,['1','2','3','4'],'5')).toBe(true);
  });
  it('starts a new evening with an empty list and does not count prior events',()=>{
    const thisEveningGameIds:string[]=[];
    expect(vipCanTriggerInGame(limited,thisEveningGameIds,'new-game')).toBe(true);
  });
  it('never grants VIP to an unconfigured player',()=>{
    expect(vipCanTriggerInGame(null,[],'game-a')).toBe(false);
  });
});
