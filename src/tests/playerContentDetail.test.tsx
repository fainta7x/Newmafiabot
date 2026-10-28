/** @vitest-environment jsdom */
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import PlayerActionDistribution from '../components/player/PlayerActionDistribution.tsx';
import PlayerConnectionHistory from '../components/player/PlayerConnectionHistory.tsx';
import PremiumProfileConnections from '../components/player/PremiumProfileConnections.tsx';
import PlayerAchievementPaths from '../components/player/PlayerAchievementPaths.tsx';
import {ACHIEVEMENT_STORIES} from '../lib/achievementStories.ts';

afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals();});
const games=[
  {id:'club:42',title:'Вечер',game_number:4,played_at:'2026-10-23T18:30:00Z',same_team:true,won_together:true},
  {id:'tournament:one',title:'Турнир',game_number:2,played_at:'2026-10-20T18:30:00Z',same_team:false,won_together:false},
];
it('counts the sheriff inside red targets and keeps unknown targets in the total',()=>{
  render(<PlayerActionDistribution title="Голоса" counts={{red:3,black:2,sheriff:1,unknown:1}}/>);
  expect(screen.getByText('Всего действий: 6')).toBeDefined();
  expect(screen.getByText('Из красных — в шерифа: 1')).toBeDefined();
  expect(screen.getByText('Роль неизвестна')).toBeDefined();
});
it('does not manufacture a total when an old payload has no unknown-target count',()=>{
  render(<PlayerActionDistribution title="Голоса" counts={{red:3,black:2,sheriff:1} as any}/>);
  expect(screen.queryByText(/Всего действий/)).toBeNull();
  expect(screen.getByText('Распределение целей')).toBeDefined();
});
it('shows source games but never treats won_together=false as an opponent loss',()=>{
  render(<PlayerConnectionHistory games={games}/>);
  expect(screen.getByText(/Вместе победили/)).toBeDefined();
  const opponent=screen.getByText(/Друг против друга/).closest('li')!;
  expect(opponent.textContent).not.toMatch(/проиграли|победили/);
  expect(within(opponent).getByRole('link').getAttribute('href')).toBe('/player/games/tournament%3Aone');
});
const mockConnections=()=>vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>new Response(JSON.stringify(String(input).endsWith('/connections')?{connections:[
  {player_id:'a',nickname:'Анна',same_team_games:1,opponent_games:1,shared_games:2,same_team_wins:0,recent_shared_games:games},
  {player_id:'b',nickname:'Борис',same_team_games:2,opponent_games:1,shared_games:3,recent_shared_games:games},
],meta:{minimum_shared_games:2,maximum_connections:24}}:String(input).endsWith('/invitation-context')?{can_invite:false,evenings:[]}:{invitations:[]}))));
it('shows a known result from one team game and keeps missing results unknown',async()=>{
  mockConnections();render(<PremiumProfileConnections playerId="me" selfPlayerId="me"/>);
  expect(await screen.findByText('Анна')).toBeDefined();
  expect(screen.getByText('Вместе: 0 побед из 1 игры')).toBeDefined();
  expect(screen.getAllByText(/Вместе:/)).toHaveLength(1);
  expect(screen.getByText(/до 24 игроков/)).toBeDefined();
  expect(screen.getAllByText('Последние общие партии · 2')).toHaveLength(2);
});
it('keeps shared-game history absent on another player profile',async()=>{
  mockConnections();render(<PremiumProfileConnections playerId="other" selfPlayerId="me"/>);
  await screen.findByText('Анна');
  expect(screen.queryByText(/Последние общие партии/)).toBeNull();
});
it('counts the selected path and distinguishes career, evening and party conditions',()=>{
  const achievements=ACHIEVEMENT_STORIES.map(a=>({...a,earned:['case_closed','last_argument'].includes(a.id),earned_at:null}));
  render(<PlayerAchievementPaths profile={{earned:2,total:16,categories:[{achievements}]}} isSelf={false}/>);
  expect(screen.getByTestId('achievement-path-completion').textContent).toContain('Получено: 2 из 2 историй');
  expect(screen.getByText('Все истории этого пути получены.')).toBeDefined();
  fireEvent.change(screen.getByLabelText('Путь достижений'),{target:{value:'versatility'}});
  expect(screen.getByTestId('achievement-path-completion').textContent).toContain('Получено: 0 из 3 историй');
  expect(screen.getAllByText('За игровую карьеру').length).toBeGreaterThan(0);
  expect(screen.getAllByText('За один вечер').length).toBeGreaterThan(0);
  expect(screen.getAllByText('В одном турнире').length).toBeGreaterThan(0);
});
