/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PlayerRoleResults from '../components/player/PlayerRoleResults.tsx';
import PlayerInsightsPanel from '../components/player/PlayerInsightsPanel.tsx';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows source outcomes oldest first and keeps an unplayed role distinct from losses',()=>{
  render(<PlayerRoleResults roles={[{role:'don',games:1,wins:1,win_rate:100,recent_form:['W']},{role:'sheriff',games:3,wins:2,win_rate:66.7,recent_form:['W','W','L']},{role:'citizen',games:0,wins:0,win_rate:0}]}/>);
  expect(screen.getByText('1 победа из 1 игры')).toBeDefined();
  expect(screen.getByText('За эту роль пока нет игр')).toBeDefined();
  expect(within(screen.getAllByRole('list',{name:'Последние результаты в роли'})[1]).getAllByRole('listitem').map(x=>x.getAttribute('aria-label'))).toEqual(['Поражение','Победа','Победа']);
  expect(screen.queryByText('0%')).toBeNull();
});
it('labels the independent period, disjoint comparison and monthly denominator',async()=>{
  const sample=(games:number,wins:number)=>({games,wins,win_rate:games?wins/games*100:0});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({performance:{recent10:sample(10,6),recent20:sample(20,10),career:sample(48,29),last30_days:sample(13,8)},insights:[]}))));
  render(<PlayerInsightsPanel/>);
  const block=await screen.findByTestId('player-result-observations');
  expect(block.textContent).toContain('6 побед из 10 игр');
  expect(block.textContent).toContain('Предыдущие 10 игр');
  expect(block.textContent).toContain('4 победы из 10 игр');
  expect(block.textContent).toContain('фильтры обзора к ней не применяются');
  fireEvent.click(screen.getByRole('button',{name:/Моя аналитика/}));
  expect(block.textContent).toContain('За 30 дней: 8 побед из 13 игр');
});
