/** @vitest-environment jsdom */
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import PlayerEloJourney from '../components/player/PlayerEloJourney.tsx';
import PlayerSeasonsPanel from '../components/player/PlayerSeasonsPanel.tsx';
import {resultsContextJourney,resultsContextSeason} from '../../e2e/results-context.fixture.ts';

afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals();});
const respond=(body:unknown)=>vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}})));
it('distinguishes filtered accrual, actual endpoints and the lifetime current Elo',async()=>{
  respond(resultsContextJourney('RATING'));render(<PlayerEloJourney/>);
  const endpoints=await screen.findByTestId('elo-chart-endpoints');
  expect(endpoints.textContent).toContain('1500 Elo');expect(endpoints.textContent).toContain('1550 Elo');
  expect(endpoints.textContent).toContain('1 окт');expect(endpoints.textContent).toContain('17 окт');
  expect(screen.getByText('1562')).toBeTruthy();
  expect(screen.getByText(/Сумма начислений за выбранные игры: \+40 Elo/)).toBeTruthy();
  expect(screen.getByTestId('elo-history-count').textContent).toBe('Показано: 8 из 9 · сначала новые');
  fireEvent.click(screen.getByRole('button',{name:'Все 9'}));
  expect(screen.getByTestId('elo-history-count').textContent).toBe('Показано: 9 из 9 · сначала новые');
});
it('keeps a loss separate from a positive personal Elo outcome',async()=>{
  respond(resultsContextJourney('RATING'));render(<PlayerEloJourney/>);
  const event=(await screen.findAllByRole('button')).find(button=>button.textContent?.includes('№4'))!;
  expect(event.textContent).toContain('Поражение');expect(event.textContent).toContain('+5');
  fireEvent.click(event);
  expect(screen.getByText('Оценка шанса победы команды до игры: 40%.')).toBeTruthy();
  expect(screen.getByText('-10 + (15) = 5')).toBeTruthy();
});
it('does not invent dated endpoints or a format warning for empty history',async()=>{
  const data=resultsContextJourney('RATING');respond({...data,events:[],summary:{...data.summary,games:0,net:0}});
  render(<PlayerEloJourney/>);await screen.findByText('В выбранном периоде нет рейтинговых игр.');
  expect(screen.queryByTestId('elo-chart-endpoints')).toBeNull();
  expect(screen.queryByText(/Между ними могли быть игры/)).toBeNull();
});
const archive=(unranked=false,absent=false)=>{
  const season=resultsContextSeason('past','Лето 2026',unranked);
  return {viewer_id:'preview-player',season:{...season,key:'current'},season_history:[{...season,viewer:absent?null:season.viewer}],hall_of_fame:[]};
};
it('shows the archived personal result even outside the five visible leaders',async()=>{
  respond(archive());render(<PlayerSeasonsPanel part="history"/>);
  const result=await screen.findByRole('region',{name:'Мой результат в сезоне'});
  expect(result.textContent).toContain('8 побед из 12 игр');expect(result.textContent).toContain('Место по победам: 8 из 21');
  expect(screen.getByText('Показаны места 1–5. Участников в сезоне: 21.')).toBeTruthy();
  expect(screen.getAllByText('Очень длинный игровой псевдоним').at(-1)?.className).not.toContain('truncate');
});
it('keeps known games when a seasonal place is unavailable',async()=>{
  respond(archive(true));render(<PlayerSeasonsPanel part="history"/>);
  const result=await screen.findByRole('region',{name:'Мой результат в сезоне'});
  expect(result.textContent).toContain('2 победы из 3 игр');expect(result.textContent).toContain('Место не указано');
  expect(result.textContent).not.toContain('Место 0');
});
it('states no recorded participation without fabricating zero percentages',async()=>{
  respond(archive(false,true));render(<PlayerSeasonsPanel part="history"/>);
  const result=await screen.findByRole('region',{name:'Мой результат в сезоне'});
  expect(result.textContent).toContain('В этом сезоне нет записанных игр.');expect(result.textContent).not.toContain('0%');
});

it('labels the available leading places without claiming the truncated API list is every participant',async()=>{
  respond(archive());render(<PlayerSeasonsPanel part="season"/>);
  const button=await screen.findByRole('button',{name:'Показать места 6–15'});
  expect(screen.getByText('Показаны места 1–5. Участников в сезоне: 21.')).toBeTruthy();
  fireEvent.click(button);
  expect(screen.getByText('Показаны места 1–15. Участников в сезоне: 21.')).toBeTruthy();
});
