import { describe, expect, it } from 'vitest';
import { buildAllPlayerConnectionAnalytics, chooseMostSuccessfulPartnership } from '../server/services/playerConnectionAnalyticsService.ts';
import type { CompletedGameSnapshot } from '../server/services/clubGameAnalyticsService.ts';

const game = (id:string, date:string, winner:'red'|'black', aTeam:'red'|'black', bTeam:'red'|'black'):CompletedGameSnapshot => ({
  id:`club:${id}`,source:'club',event_id:'evening-1',date,dateMs:Date.parse(date),played_at:date,title:'Пятница',game_number:Number(id),winner_team:winner,
  players:[
    {player_id:'a',nickname:'Альфа',role:aTeam==='red'?'citizen':'mafia',team:aTeam,won:aTeam===winner,seat_number:1},
    {player_id:'b',nickname:'Бета',role:bTeam==='red'?'citizen':'mafia',team:bTeam,won:bTeam===winner,seat_number:2},
  ],
});

describe('player connection analytics',()=>{
  it('counts shared, team/opponent, team wins, win rate and recent games',()=>{
    const snapshots=[
      game('4','2026-09-04T20:00:00.000Z','red','red','red'),
      game('3','2026-09-03T20:00:00.000Z','black','red','red'),
      game('2','2026-09-02T20:00:00.000Z','red','red','red'),
      game('1','2026-09-01T20:00:00.000Z','black','red','black'),
    ];
    const row=buildAllPlayerConnectionAnalytics(snapshots).get('a')?.[0];
    expect(row).toMatchObject({player_id:'b',shared_games:4,same_team_games:3,opponent_games:1,same_team_wins:2,same_team_win_rate:66.7,last_shared_game_date:'2026-09-04T20:00:00.000Z'});
    expect(row?.recent_shared_games).toHaveLength(3);
    expect(row?.recent_shared_games[0].id).toBe('club:4');
    expect(chooseMostSuccessfulPartnership([row!],3)?.player_id).toBe('b');
  });

  it('does not name a partnership before the minimum sample',()=>{
    const row=buildAllPlayerConnectionAnalytics([game('2','2026-09-02T20:00:00.000Z','red','red','red'),game('1','2026-09-01T20:00:00.000Z','red','red','red')]).get('a')?.[0];
    expect(row?.same_team_games).toBe(2);
    expect(chooseMostSuccessfulPartnership([row!],3)).toBeNull();
  });
});
