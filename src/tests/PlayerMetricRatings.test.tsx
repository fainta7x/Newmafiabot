/** @vitest-environment jsdom */
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import PlayerMetricRatings from '../components/player/PlayerMetricRatings.tsx';
import {metricTableFixture} from '../../e2e/community-content.fixture.ts';
import {metricDifference,sortMetricRows} from '../shared/metricTable.ts';
const respond=(b:unknown,status=200)=>Promise.resolve(new Response(JSON.stringify(b),{status}));
beforeEach(()=>{sessionStorage.clear();vi.stubGlobal('fetch',vi.fn((url:string)=>respond(metricTableFixture(new URL(url,'http://local').searchParams))));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows several figures together, searches and changes numeric order without another top request',async()=>{
 render(<PlayerMetricRatings/>);const a=await screen.findByTestId('metric-row-p1');expect(a.textContent).toContain('67%');expect(a.textContent).toContain('12 игр');
 const rows=()=>within(screen.getByTestId('metrics-table')).getAllByTestId(/^metric-row-/).map(n=>n.dataset.testid);
 expect(rows()[0]).toBe('metric-row-p1');fireEvent.click(screen.getByRole('button',{name:'Победы ↓'}));expect(rows()[0]).toBe('metric-row-p2');
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'Богдан'}});expect(screen.queryByTestId('metric-row-p1')).toBeNull();expect(screen.getByTestId('metric-row-p2')).toBeDefined();
 expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
});
it('compares any two players with sample sizes and percentage-point difference',async()=>{
 const onOpenPair=vi.fn();render(<PlayerMetricRatings onOpenPair={onOpenPair}/>);await screen.findByTestId('metrics-table');
 fireEvent.change(screen.getByLabelText('Первый игрок'),{target:{value:'p1'}});fireEvent.change(screen.getByLabelText('Второй игрок'),{target:{value:'p2'}});fireEvent.click(screen.getByRole('button',{name:'Показать сравнение'}));
 const compared=screen.getByTestId('compare-win_rate');expect(compared.textContent).toContain('67%');expect(compared.textContent).toContain('50%');expect(compared.textContent).toContain('−17 п.п.');
 fireEvent.click(screen.getByRole('button',{name:'История этой пары ›'}));expect(onOpenPair).toHaveBeenCalledWith('p1','p2','all','all');
 fireEvent.change(screen.getByLabelText('Категория показателей'),{target:{value:'accuracy'}});await screen.findByTestId('compare-votes_accuracy');expect((screen.getByLabelText('Первый игрок')as HTMLSelectElement).value).toBe('p1');
});
it('shows roles in the same table and keeps federation scope distinct',async()=>{
 render(<PlayerMetricRatings/>);await screen.findByTestId('metrics-table');fireEvent.change(screen.getByLabelText('Категория показателей'),{target:{value:'roles'}});await screen.findByLabelText('Команда или роль');fireEvent.change(screen.getByLabelText('Команда или роль'),{target:{value:'don'}});await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('context=don'))).toBe(true));
 fireEvent.change(screen.getByLabelText('Категория показателей'),{target:{value:'federation'}});await waitFor(()=>expect(screen.getByTestId('metric-ratings-scope').textContent).toContain('GoMafia'));expect(screen.queryByLabelText('Период рейтинга')).toBeNull();
});
it('retains nulls, sorts absent values last in both directions, and retries HTTP failures',async()=>{
 const fixture=metricTableFixture(new URLSearchParams());fixture.rows[1].cells.win_rate=null;
 expect(sortMetricRows(fixture.rows,'win_rate','asc')[1].player_id).toBe('p2');expect(sortMetricRows(fixture.rows,'win_rate','desc')[1].player_id).toBe('p2');expect(metricDifference(null,fixture.rows[0].cells.win_rate,'percent')).toBe('Нет общего значения');
 let calls=0;vi.stubGlobal('fetch',vi.fn(()=>++calls===1?respond({error:'Сбой'},503):respond(fixture)));render(<PlayerMetricRatings/>);expect((await screen.findByRole('alert')).textContent).toContain('Сбой');fireEvent.click(screen.getByRole('button',{name:'Повторить'}));await screen.findByTestId('metrics-table');
});
it('preserves filter choices but hides old numbers while a new scope is loading',async()=>{
 let resolve:((r:Response)=>void)|undefined;let calls=0;vi.stubGlobal('fetch',vi.fn(()=>++calls===1?respond(metricTableFixture(new URLSearchParams())):new Promise<Response>(r=>{resolve=r;})));
 render(<PlayerMetricRatings/>);await screen.findByTestId('metric-row-p1');fireEvent.change(screen.getByLabelText('Период рейтинга'),{target:{value:'period:autumn'}});expect(screen.queryByTestId('metrics-table')).toBeNull();expect(screen.getByRole('option',{name:'Осень 2026'})).toBeDefined();resolve?.(new Response(JSON.stringify(metricTableFixture(new URLSearchParams()))));await screen.findByTestId('metrics-table');
});
