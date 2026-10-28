import {describe,expect,it} from 'vitest';
import {parsePlayerRoute,playerPathForSection} from '../lib/appNavigation.ts';
import {playerFormScore,comparePlayerForm} from '../shared/playerForm.ts';
describe('approved Community destinations',()=>{
 it.each([['/player/rating/metrics','club','metrics','/player/club/metrics'],['/player/seasons/form','club','form','/player/club/form'],['/player/seasons/matches','club','history','/player/club/history'],['/player/seasons/season','ratingperiods',null,'/player/rating/periods'],['/player/seasons/history','ratingperiods','archive','/player/rating/periods/archive']])('keeps %s meaningful',(old,section,target,path)=>{expect(parsePlayerRoute(old!)).toMatchObject({section,target,canonicalPath:path});expect(playerPathForSection(section as any,target)).toBe(path);});
 it('preserves the established Form points, including the 97/38 example and 115 maximum',()=>{
  expect(playerFormScore([...Array(6).fill({won:true}),...Array(4).fill({won:false})])).toBe(97);
  expect(playerFormScore([...Array(4).fill({won:false}),...Array(6).fill({won:true})])).toBe(38);
  expect(playerFormScore(Array(10).fill({won:true}))).toBe(115);
  expect(playerFormScore(Array(3).fill({won:true}))).toBe(109);
 });
 it('uses the same equal-score order for today and the comparison snapshot',()=>{
  const a={score:60,wins:4,elo:1200,nickname:'А'};const b={score:60,wins:3,elo:1300,nickname:'Б'};
  expect([b,a].sort(comparePlayerForm)).toEqual([a,b]);expect([a,b].sort(comparePlayerForm)).toEqual([a,b]);
 });
});
