import { describe, expect, it } from 'vitest';
import { playerResultObservations, previousTenResults } from '../lib/playerResultObservations.ts';

const sample=(games:number,wins:number)=>({games,wins,win_rate:games?wins/games*100:0});
describe('observed results without skill judgments',()=>{
  it('compares disjoint tens only when twenty games really exist',()=>{
    expect(previousTenResults(sample(10,6),sample(20,10))).toEqual(sample(10,4));
    expect(previousTenResults(sample(10,6),sample(13,8))).toBeNull();
    expect(previousTenResults(sample(3,2),sample(3,2))).toBeNull();
    expect(previousTenResults(sample(10,6),sample(20,4))).toBeNull();
  });
  it('keeps a single-game role visible with its denominator and Russian role name',()=>{
    const observations=playerResultObservations({career:sample(11,5),recent10:sample(10,4),red:sample(10,4),black:sample(1,1),roles:[{role:'don',...sample(1,1)},{role:'citizen',...sample(10,4)}]});
    expect(observations.find(row=>row.kind==='role_gap')?.text).toContain('Дон: 1 победа из 1 игры');
    expect(observations.find(row=>row.kind==='side_gap')?.text).toBe('За красных: 4 из 10; за чёрных: 1 из 1.');
    expect(JSON.stringify(observations)).not.toMatch(/играешь лучше|играешь хуже|Сильнее|Лучше всего/);
  });
  it('does not invent observations without games or call one game the last ten',()=>{
    const empty={career:sample(0,0),recent10:sample(0,0),red:sample(0,0),black:sample(0,0),roles:[]};
    expect(playerResultObservations(empty)).toEqual([]);
    expect(playerResultObservations({...empty,career:sample(1,1),recent10:sample(1,1)})[0].text).toContain('Последние игры: 1 победа из 1 игры');
  });
});
