/** @vitest-environment jsdom */
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import PlayerSeasonHub from '../components/player/PlayerSeasonHub.tsx';
import PlayerSeasonsPanel from '../components/player/PlayerSeasonsPanel.tsx';
import {structureClubWorld,structurePeriods,structurePeriodDetail} from '../../e2e/community-structure.fixture.ts';
afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals();});
const response=(body:unknown)=>Promise.resolve(new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}}));
it('retains club statistics when no sporting season has been opened, without duplicating Hall of Fame',async()=>{
 vi.stubGlobal('fetch',vi.fn((input:RequestInfo|URL)=>String(input).includes('rating-periods')?response({active_periods:[],completed_periods:[]}):response(structureClubWorld(null))));
 render(<PlayerSeasonHub playerId="preview-player"/>);
 expect((await screen.findByTestId('club-period-stats')).textContent).toContain('Спортивный зачёт пока недоступен');
 expect(screen.queryByTestId('club-hall-of-fame')).toBeNull();
 fireEvent.change(screen.getByRole('combobox',{name:'Период статистики клуба'}),{target:{value:'period:demo-past'}});
 expect(screen.getByTestId('club-period-stats').textContent).toContain('2 победы из 4 игр');
});
it('does not silently substitute the current period when the requested statistics are absent',async()=>{
 vi.stubGlobal('fetch',vi.fn(()=>response(structureClubWorld(null))));
 render(<PlayerSeasonsPanel part="period" periodKey="period:missing"/>);
 expect(await screen.findByTestId('club-period-unavailable')).toBeTruthy();expect(screen.queryByTestId('club-period-stats')).toBeNull();
});

it('restores the selected historical period from the old archive address',async()=>{
 sessionStorage.setItem('club-archive-season','period:demo-older');
 const older={...structurePeriods.completed_periods[0],id:'demo-older',title:'Весна 2026'};
 vi.stubGlobal('fetch',vi.fn((input:RequestInfo|URL)=>{const url=String(input);if(url==='/api/player/rating-periods')return response({...structurePeriods,completed_periods:[...structurePeriods.completed_periods,older]});if(url.includes('/rating-periods/'))return response({...structurePeriodDetail('demo-past'),period:older});return response(structureClubWorld(null));}));
 render(<PlayerSeasonHub playerId="preview-player" initialArchive/>);
 expect((await screen.findByRole('combobox',{name:'Выбрать сезон'}) as HTMLSelectElement).value).toBe('demo-older');
});
