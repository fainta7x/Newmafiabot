import { describe, expect, it } from 'vitest';
import { gameActionFacts, isCriticalCircle, playerActionMetrics } from '../lib/gameActionFacts';
import { buildAchievementStories } from '../server/services/playerAchievementStoriesService';
import type { StatGame, StatRole } from '../lib/gameStatistics';
import type { LiveGameEvent } from '../shared/liveGameEvents';
const roles: StatRole[] = ['citizen','mafia','sheriff','citizen','don','citizen','citizen','mafia','citizen','citizen'];
const make = (events: Array<Partial<LiveGameEvent>>, winner: 'red'|'black' = 'red'): StatGame => ({ id:'club:1', source:'club', date:'2026-10-08T10:00:00Z', eventId:'e1', winner,
  seats:roles.map((role,i) => ({role,seat:i+1,playerId:`p${i+1}`})),
  events: [{kind:'game_start',phase:'setup',round:1},...events,{kind:'game_end',value:winner}].map((e,i) => ({seq:i+1,at:'2026-10-08T10:00:00Z',round:2,phase:'day_voting',kind:'phase',...e})) });
const vote = (seat:number,target:number,value=1):Partial<LiveGameEvent> => ({kind:'vote',seat,target,value});
const result = (value='1:single_eliminated'):Partial<LiveGameEvent> => ({kind:'vote_round_result',value});
const exit = (seat:number,value='killed'):Partial<LiveGameEvent> => ({kind:'exit',seat,value,phase:value==='killed'?'night':'day_voting'});

describe('approved action metrics', () => {
  it.each([[4,3],[3,2],[3,1],[2,1],[4,2]])('critical red=%i black=%i', (r,b) => expect(isCriticalCircle(r,b)).toBe(true));
  it.each([[7,3],[4,0],[1,1],[5,1]])('not critical red=%i black=%i',(r,b) => expect(isCriticalCircle(r,b)).toBe(false));
  it('excludes zero circle, raise and leave even with zero raised hands; keeps only final revote', () => {
    const zero = make([vote(1,3),result(),exit(3,'voted_zero_round')]); zero.events.forEach(e => e.round=1);
    const leave = make([vote(1,3),result('1:tie_revote'),vote(1,2,2),{kind:'voting_stage',value:'table_decision'},result('2:no_elimination')]);
    const raise = make([vote(1,3),result('1:all_tied_eliminated'),exit(3,'voted_day')]);
    const revote = make([vote(1,3),result('1:tie_revote'),vote(1,2,2),result('2:single_eliminated'),exit(2,'voted_day')]);
    [zero,leave,raise,revote].forEach((g,i) => g.id=`g${i}`);
    expect(playerActionMetrics([zero,leave,raise,revote], 'p1').votes.red).toEqual({red:0,black:1,sheriff:0,unknown:0});
  });
  it('recognizes a table decision recorded only in the authoritative zero-hand protocol', () => {
    const g = make([vote(1,3),result(),exit(3,'voted_day')]);
    g.votingRounds=[{round_number:1,day_number:1,nominated_seats:[2,3],vote_counts:{2:2,3:2},table_leave_votes:0}];
    expect(gameActionFacts(g).votings).toHaveLength(0);
  });
  it('uses composition before elimination; sheriff is a subset of red; black actions separate', () => {
    const g = make([exit(4),exit(6),exit(7),exit(9),exit(10),exit(8),exit(5),vote(1,3),vote(2,1),result(),exit(3,'voted_day')]);
    const m=playerActionMetrics([g,g],'p1');
    expect(m.criticalVotes.red).toEqual({red:1,black:0,sheriff:1,unknown:0});
    expect(playerActionMetrics([g],'p2').votes.black.red).toBe(1);
  });
  it('does not infer critical states from a partial log or count cancelled ballots', () => {
    const g=make([vote(1,2),result(),exit(2,'voted_day')]);g.events.shift();
    expect(playerActionMetrics([g],'p1').unknownCriticalDays).toBe(1);
    expect(playerActionMetrics([make([vote(1,2)])],'p1').votes.red.black).toBe(0);
  });
  it('counts only confirmed regular-night checks; correction replaces earlier target and excludes dead targets', () => {
    const g=make([{kind:'sheriff_check',phase:'zero_night',target:2},
      {kind:'sheriff_check',phase:'night',target:2},{kind:'sheriff_check',phase:'night',target:4},
      {kind:'night_step',phase:'night',value:'morning'},
      {kind:'don_check',phase:'night',target:3},{kind:'night_step',phase:'night',value:'sheriff'}]);
    expect(playerActionMetrics([g],'p3').checks.sheriff).toEqual({red:1,black:0,sheriff:0,unknown:0});
    expect(playerActionMetrics([g],'p5').checks.don.sheriff).toBe(1);
    expect(playerActionMetrics([make([{kind:'sheriff_check',phase:'night',target:2}])],'p3').checks.sheriff.black).toBe(0);
    expect(playerActionMetrics([make([exit(2),{kind:'sheriff_check',phase:'night',target:2},{kind:'night_step',phase:'night',value:'morning'}])],'p3').checks.sheriff.black).toBe(0);
  });
});

describe('game stories are supported by specific evidence', () => {
  it('awards a citizen chain, with event date, not a mere vote or the zero circle', () => {
    const g=make([{kind:'nomination',seat:2,by:1},vote(1,2),result(),exit(2,'voted_day')]);
    expect(buildAchievementStories([g],'p1').case_closed).toMatchObject({current:1,evidence:{gameId:'club:1',date:g.date}});
    expect(buildAchievementStories([make([vote(1,2),result(),exit(2,'voted_day')])],'p1').case_closed.current).toBe(0);
    g.events.forEach(e => e.round=1);expect(buildAchievementStories([g],'p1').case_closed.current).toBe(0);
  });
  it('clutch requires the real final three and no disciplinary finish', () => {
    const g=make([exit(3),exit(4),exit(5),exit(6),exit(7),exit(8),exit(9),vote(1,2),result(),exit(2,'voted_day')]);
    expect(buildAchievementStories([g],'p1').last_argument.current).toBe(1);
    g.events.splice(-1,0,{seq:999,at:g.date,round:2,phase:'day_voting',kind:'ppk',seat:2});
    expect(buildAchievementStories([g],'p1').last_argument.current).toBe(0);
  });
  it('recognizes PU LH even on loss; no duplicate/self guesses, no zero-vote LH', () => {
    const g=make([{kind:'first_killed',seat:1,phase:'night'},{kind:'best_move',seat:1,value:'2,5,8',phase:'night'}],'black');
    expect(buildAchievementStories([g],'p1').whole_picture.current).toBe(1);
    const wrong=make([{kind:'zero_round_voted',seat:1},{kind:'best_move',seat:1,value:'2,5,8'}]);
    expect(buildAchievementStories([wrong],'p1').two_shadows.current).toBe(0);
    g.events.find(e=>e.kind==='best_move')!.value='2,2,5';expect(buildAchievementStories([g],'p1').two_shadows.current).toBe(0);
  });

  it('retracts restored first-killed evidence and replaces old PU markers', () => {
    const old=[{kind:'first_killed',seat:1,phase:'night'},{kind:'best_move',seat:1,value:'2,5,8',phase:'night'}];
    const restored=make([...old,{kind:'restored',seat:1}]);
    expect(buildAchievementStories([restored],'p1').two_shadows.current).toBe(0);
    expect(buildAchievementStories([restored],'p1').whole_picture.current).toBe(0);
    const replaced=make([...old,{kind:'first_killed',seat:4,phase:'night'},{kind:'best_move',seat:4,value:'2,5,8',phase:'night'}]);
    expect(buildAchievementStories([replaced],'p1').whole_picture.current).toBe(0);
    expect(buildAchievementStories([replaced],'p4').whole_picture.current).toBe(1);
    const corrected=make([...old,{kind:'restored',seat:1},...old]);
    expect(buildAchievementStories([corrected],'p1').whole_picture.current).toBe(1);
  });

  it('only different confirmed live checks qualify for two cases; partial logs do not unlock', () => {
    const g=make([{kind:'sheriff_check',phase:'night',round:1,target:2},{kind:'night_step',phase:'night',round:1,value:'morning'},
      {kind:'sheriff_check',phase:'night',round:2,target:8},{kind:'night_step',phase:'night',round:2,value:'morning'}]);
    expect(buildAchievementStories([g],'p3').two_cases.current).toBe(1);
    g.events.shift();expect(buildAchievementStories([g],'p3').two_cases.current).toBe(0);
  });
  it('counts four distinct role wins, not four wins on one role; namespaces evening identity', () => {
    const games=roles.slice(0,4).map((_,i)=>{const g=make([]);g.id=`club:${i}`;g.seats[0].role=(['citizen','sheriff','mafia','don'] as StatRole[])[i];g.winner=i<2?'red':'black';return g;});
    expect(buildAchievementStories(games,'p1').four_faces).toMatchObject({current:1,steps:['citizen','sheriff','mafia','don']});
    expect(buildAchievementStories([games[0],games[0]],'p1').four_faces.current).toBe(.25);
    games[2].source='tournament';games[3].source='tournament';
    expect(buildAchievementStories(games,'p1').full_shift.current).toBe(0);
  });
});
