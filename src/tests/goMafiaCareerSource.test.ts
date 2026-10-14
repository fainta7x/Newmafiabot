import { describe, expect, it, vi } from 'vitest';
import history1 from './fixtures/gomafia/chagin-history-1.json';
import history2 from './fixtures/gomafia/chagin-history-2.json';
import allStats from './fixtures/gomafia/chagin-all-stats.json';
import cheaters from './fixtures/gomafia/cheaters-result.json';
import restart from './fixtures/gomafia/restart-result.json';
import tula from './fixtures/gomafia/tula2022-result.json';
import { parseGoMafiaPlayerReference } from '../lib/gomafiaExternalProfile.ts';
import { enrichGoMafiaAppearance, fetchPublicGoMafiaCareer, parseGoMafiaHistory, parseGoMafiaStructuredStats, readGoMafiaNextData, readPublicGoMafia } from '../server/services/goMafiaCareerSource.ts';
const ref = parseGoMafiaPlayerReference('1202')!;

describe('source-backed public GoMafia career', () => {
  it('reads both real history pages, stable tournament/player/game identities, and preserves missing game dates/scores', () => {
    const a = parseGoMafiaHistory(history1, ref), b = parseGoMafiaHistory(history2, ref);
    const tournaments = [...a.tournaments, ...b.tournaments];
    expect(a.total).toBe(13); expect(tournaments).toHaveLength(13);
    const games = tournaments.flatMap(t => t.games);
    expect(games).toHaveLength(164); expect(new Set(games.map(g => g.externalGameId)).size).toBe(164);
    expect(games[0]).toMatchObject({ externalGameId: '1202:2769:1', role: 'citizen', result: 'loss', date: null, score: null, eloDelta: -2 });
    expect(tournaments.find(t => t.tournamentId === '30')).toMatchObject({eloDelta:-32,eloAfter:968});
    expect(tournaments.find(t => t.tournamentId === '721')?.eloAfter).toBeNull();
  });
  it('uses exact user IDs in finalist and non-finalist standings, and never replaces points with GG or Elo', () => {
    const all = [...parseGoMafiaHistory(history1, ref).tournaments, ...parseGoMafiaHistory(history2, ref).tournaments];
    for (const [tid,data,score] of [['2765',cheaters,11.3],['1846',restart,7.1],['30',tula,2.2]] as const) {
      const appearance = all.find(t => t.tournamentId === tid)!;
      expect(enrichGoMafiaAppearance(appearance,data,'1202')).toMatchObject({totalScore:score,status:'results_published'});
      const enriched=enrichGoMafiaAppearance(appearance,data,'1202');
      expect(enriched.games.every(g=>g.score !== null && g.externalTableId !== null)).toBe(true);
      expect(enriched.games.reduce((sum,g)=>sum+(g.score??0),0)).toBeCloseTo(score);
      expect(enrichGoMafiaAppearance(appearance,data,'999').totalScore).toBeNull();
      if (tid === '2765') expect(enrichGoMafiaAppearance(appearance,{...data,tournamentResultWithoutFinal:data.tournamentResultWithFinal},'1202').totalScore).toBe(11.3);
      expect(enrichGoMafiaAppearance(appearance,{...data,tournament:{...data.tournament,is_hidden_result:'1'}},'1202').totalScore).toBeNull();
    }
  });
  it('keeps published tournament size optional and never guesses it from the player place', () => {
    const appearance = parseGoMafiaHistory(history1, ref).tournaments.find(t => t.tournamentId === '2765')!;
    expect(enrichGoMafiaAppearance(appearance, cheaters, '1202').participantCount).toBeNull();
    expect(enrichGoMafiaAppearance(appearance, {
      ...cheaters, tournament: { ...cheaters.tournament, usersCount: 10 },
    }, '1202').participantCount).toBe(10);
    expect(enrichGoMafiaAppearance(appearance, {
      ...cheaters, tournament: { ...cheaters.tournament, usersCount: 64 },
    }, '1202').participantCount).toBe(64);
    expect(enrichGoMafiaAppearance(appearance, {
      ...cheaters, tournament: { ...cheaters.tournament, usersCount: 'invalid' },
    }, '1202').participantCount).toBeNull();
  });
  it('fails closed on ambiguous game rows and mismatched seats without copying current Elo', () => {
    const appearance=parseGoMafiaHistory(history1,ref).tournaments.find(t=>t.tournamentId==='2765')!;
    const duplicate=structuredClone(cheaters);
    const table=duplicate.games[0].game[0];
    table.table.push({...table.table[0]});
    expect(enrichGoMafiaAppearance(appearance,duplicate,'1202').games[0].score).toBeNull();
    const wrongSeat=structuredClone(cheaters);
    wrongSeat.games[0].game[0].table[0].place=99;
    expect(enrichGoMafiaAppearance(appearance,wrongSeat,'1202').games[0].score).toBeNull();
    expect(enrichGoMafiaAppearance(appearance,{...cheaters,tournament:{...cheaters.tournament,is_hidden_result:'1'}},'1202').games.every(g=>g.score===null)).toBe(true);
  });
  it('imports all-time data with truthful filters instead of confusing the 2026 default with total career', () => {
    expect(parseGoMafiaStructuredStats(allStats,ref,'all','2026-10-12')).toMatchObject({year:null,totalGames:164,overallElo:1685.02,overallWinRatePercent:51,tournamentFilter:'Все турниры'});
    expect(()=>parseGoMafiaStructuredStats(allStats,parseGoMafiaPlayerReference('42')!,'all','2026-10-12')).toThrow(/another player/);
    expect(()=>parseGoMafiaHistory({...history1,user:{id:'42'}},ref)).toThrow(/identity/);
    expect(()=>readGoMafiaNextData('<html>no data</html>')).toThrow();
  });
  it('follows complete pagination and enriches source-discovered IDs without manual links', async () => {
    const read = vi.fn(async (path: string, params?: Record<string,string>) => {
      if (path === '/stats/1202') return history1;
      if (path.includes('page=2')) return history2;
      if (params) return allStats;
      return path.endsWith('2765') ? cheaters : path.endsWith('1846') ? restart : path.endsWith('/30') ? tula : {tournament:{id:path.split('/').at(-1)}};
    });
    const snapshot = await fetchPublicGoMafiaCareer(ref,read);
    expect(snapshot.career?.tournaments).toHaveLength(13);
    expect(snapshot.career?.yearlyStats.map(s=>s.year)).toEqual([2026,2025,2024,2023,2022]);
    expect(snapshot.career?.tournaments.find(t=>t.tournamentId==='2765')?.games[0]).toMatchObject({score:-0.2,externalTableId:'76238'});
    expect(snapshot.career?.registrationsStatus).toBe('unavailable');
    expect(read).toHaveBeenCalledWith('/stats/1202?tab=history&page=2', undefined);
    const repeated = await fetchPublicGoMafiaCareer(ref,read);
    expect(repeated.career?.tournaments.map(t=>t.tournamentId)).toEqual(snapshot.career?.tournaments.map(t=>t.tournamentId));
    expect(()=>parseGoMafiaHistory({...history1,history:[{...history1.history[0],games:[history1.history[0].games[0],history1.history[0].games[0]]}]},ref)).toThrow(/Duplicate/);
  });
  it('retains published history nomination winners when initial tournament enrichment fails', async () => {
    const read=vi.fn(async(path:string,params?:Record<string,string>)=>{
      if(path==='/stats/1202')return history1;
      if(path.includes('page=2'))return history2;
      if(params)return allStats;
      throw new Error('Temporary tournament failure');
    });
    const snapshot=await fetchPublicGoMafiaCareer(ref,read);
    const july=snapshot.career!.tournaments.find(t=>t.tournamentId==='616')!;
    expect(july.scoreStatus).toBe('refresh_failed');
    expect(july.nominationsStatus).toBe('available');
    expect(july.nominations).toEqual([{key:'best_red',rank:1},{key:'best_sheriff',rank:1},{key:'mvp',rank:1}]);
    expect(snapshot.career!.tournaments.flatMap(t=>t.nominations??[]).filter(n=>n.rank===1)).toHaveLength(4);
  });
  it('preserves the last confirmed tournament size through a temporary source outage', async () => {
    const initialRead = vi.fn(async (path: string, params?: Record<string,string>) => {
      if (path === '/stats/1202') return history1;
      if (path.includes('page=2')) return history2;
      if (params) return allStats;
      if (path.endsWith('/2765')) return { ...cheaters, tournament: { ...cheaters.tournament, usersCount: 48 } };
      throw new Error('unavailable');
    });
    const previous = await fetchPublicGoMafiaCareer(ref, initialRead);
    expect(previous.career?.tournaments.find(t => t.tournamentId === '2765')?.participantCount).toBe(48);
    const failedRead = vi.fn(async (path: string, params?: Record<string,string>) => {
      if (path === '/stats/1202') return history1;
      if (path.includes('page=2')) return history2;
      if (params) return allStats;
      throw new Error('temporary outage');
    });
    const updated = await fetchPublicGoMafiaCareer(ref, failedRead, previous);
    expect(updated.career?.tournaments.find(t => t.tournamentId === '2765')?.participantCount).toBe(48);
  });
  it('fails incomplete pagination without marking a partial career current', async () => {
    const read = vi.fn(async(path: string)=>path.includes('page=2')?{...history2,history:[]}:history1);
    await expect(fetchPublicGoMafiaCareer(ref,read)).rejects.toThrow(/pagination/);
  });
  it('rejects arbitrary private paths before requesting them', async () => {
    await expect(readPublicGoMafia('/api/private/players')).rejects.toThrow(/Invalid/);
  });
});
