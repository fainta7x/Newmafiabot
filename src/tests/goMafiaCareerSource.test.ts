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
    expect(tournaments.find(t => t.tournamentId === '30')?.eloDelta).toBe(-32);
  });
  it('uses exact user IDs in finalist and non-finalist standings, and never replaces points with GG or Elo', () => {
    const all = [...parseGoMafiaHistory(history1, ref).tournaments, ...parseGoMafiaHistory(history2, ref).tournaments];
    for (const [tid,data,score] of [['2765',cheaters,11.3],['1846',restart,7.1],['30',tula,2.2]] as const) {
      const appearance = all.find(t => t.tournamentId === tid)!;
      expect(enrichGoMafiaAppearance(appearance,data,'1202')).toMatchObject({totalScore:score,status:'results_published'});
      expect(enrichGoMafiaAppearance(appearance,data,'999').totalScore).toBeNull();
      if (tid === '2765') expect(enrichGoMafiaAppearance(appearance,{...data,tournamentResultWithoutFinal:data.tournamentResultWithFinal},'1202').totalScore).toBe(11.3);
      expect(enrichGoMafiaAppearance(appearance,{...data,tournament:{...data.tournament,is_hidden_result:'1'}},'1202').totalScore).toBeNull();
    }
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
    expect(snapshot.career?.registrationsStatus).toBe('unavailable');
    expect(read).toHaveBeenCalledWith('/stats/1202?tab=history&page=2', undefined);
    const repeated = await fetchPublicGoMafiaCareer(ref,read);
    expect(repeated.career?.tournaments.map(t=>t.tournamentId)).toEqual(snapshot.career?.tournaments.map(t=>t.tournamentId));
    expect(()=>parseGoMafiaHistory({...history1,history:[{...history1.history[0],games:[history1.history[0].games[0],history1.history[0].games[0]]}]},ref)).toThrow(/Duplicate/);
  });
  it('fails incomplete pagination without marking a partial career current', async () => {
    const read = vi.fn(async(path: string)=>path.includes('page=2')?{...history2,history:[]}:history1);
    await expect(fetchPublicGoMafiaCareer(ref,read)).rejects.toThrow(/pagination/);
  });
  it('rejects arbitrary private paths before requesting them', async () => {
    await expect(readPublicGoMafia('/api/private/players')).rejects.toThrow(/Invalid/);
  });
});
