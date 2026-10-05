/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsCRM } from '../components/crm/AnalyticsCRM.tsx';
import { OnlineNowPanel } from '../components/crm/OnlineNowPanel.tsx';
import { ClubOwnerContext } from '../components/crm/useClubOwner.ts';
import { parseAnalyticsPeriod } from '../lib/analyticsPeriod.ts';
import { buildClubGameStatistics } from '../lib/gameStatistics.ts';

const overview = (period='30d', visits=62) => ({ range:parseAnalyticsPeriod(period),totalPlayers:24,completedEvenings:5,totalAttended:visits,newPlayers:8,activePlayers:18,
  fillRate:.71,fillEvenings:5,fillSkipped:0,cohortFirstVisits:8,cohortReturnedIn30Days:3,cohortPending:2,
  inactive30:1,inactive60:2,inactive90:3,sourceBreakdown:{ Telegram:8 },neverPlayed:0,playedOnce:2,playedTwoOrThree:4,playedFourPlus:18,
  totalRegistrations:60,totalCancelled:2,totalNoShow:1,registrationBase:62,noviceLevel:4,clubApproved:20,tournamentApproved:10,
  communicationFunnel:{ delivered:20,answered:10,positive:5,attended:4,reminded:0,failed:0 } });
const response=(body:unknown)=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
const fetchMock=vi.fn(async(input:RequestInfo | URL)=>{
  const url=new URL(String(input),'http://test');
  if(url.pathname.endsWith('/overview')) return response(overview(url.searchParams.get('period') || '30d'));
  if(url.pathname.endsWith('/game-stats')) return response(buildClubGameStatistics([]));
  if(url.pathname.endsWith('/staff')) return response({staff:[],label:'30 дней'});
  if(url.pathname.endsWith('/summary')) return response({people:{player:0,crm:0},screens:[],actions:[]});
  if(url.pathname.endsWith('/now')) return response({today:[],next:null,openDebtCount:0});
  if(url.pathname.endsWith('/presence')) return response({online:[]});
  return response({});
});
beforeEach(()=>{sessionStorage.clear();fetchMock.mockClear();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const mount=(owner=true)=>render(<ClubOwnerContext.Provider value={owner}><AnalyticsCRM /></ClubOwnerContext.Provider>);

describe('analytics screen',()=>{
  it('starts with club, preserves DOM on tab switches and uses one period picker',async()=>{
    mount();
    await screen.findByText(/визитов — 62/);
    const club=screen.getByRole('tabpanel');
    fireEvent.click(screen.getByRole('tab',{name:'Игры и люди'}));
    await screen.findByText(/нет игр с журналом/);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getAllByText(/50%/)).toHaveLength(2); // answered / delivered, positive / answered
    expect(screen.getByText(/80%/)).toBeTruthy(); // attended / positive, not / delivered
    fireEvent.click(screen.getByRole('tab',{name:'Клуб'}));
    expect(screen.getByRole('tabpanel')).toBe(club);
    expect(screen.getByText(/визитов — 62/)).toBeTruthy();
    expect(sessionStorage.getItem('club-analytics-tab')).toBe('club');
  });
  it('keeps old numbers behind a loading bar and ignores stale responses',async()=>{
    mount();await screen.findByText(/визитов — 62/);
    let resolve!: (value:Response)=>void;
    fetchMock.mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done;}));
    fireEvent.change(screen.getByRole('combobox'),{target:{value:'7d'}});
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.getByText(/визитов — 62/)).toBeTruthy();
    await act(async()=>resolve(response(overview('7d',15))));
    await screen.findByText(/визитов — 15/);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
  it('shows a working retry after failure instead of a permanent spinner',async()=>{
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    mount();await screen.findByRole('alert');
    expect(screen.queryByRole('progressbar')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Повторить'}));
    await screen.findByText(/визитов — 62/);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('ignores a slower response for a superseded period',async()=>{
    mount();await screen.findByText(/визитов — 62/);
    let obsolete!: (value:Response)=>void;
    fetchMock.mockImplementationOnce(()=>new Promise<Response>(done=>{obsolete=done;}));
    fireEvent.change(screen.getByRole('combobox'),{target:{value:'7d'}});
    fetchMock.mockResolvedValueOnce(response(overview('90d',100)));
    fireEvent.change(screen.getByRole('combobox'),{target:{value:'90d'}});
    await screen.findByText(/визитов — 100/);
    await act(async()=>obsolete(response(overview('7d',1))));
    expect(screen.getByText(/визитов — 100/)).toBeTruthy();
    expect(screen.queryByText(/визитов — 1,/)).toBeNull();
  });
  it('hides finances even with a saved finance tab for a non-owner',async()=>{
    sessionStorage.setItem('club-analytics-tab','finance');mount(false);
    await screen.findByText(/визитов — 62/);
    expect(screen.queryByRole('tab',{name:'Деньги'})).toBeNull();
    expect(fetchMock.mock.calls.some(([url])=>String(url).includes('/finance'))).toBe(false);
  });
  it('handles empty numbers and opens the canonical metric explanation',async()=>{
    const empty=overview();for(const key of Object.keys(empty)) if(typeof empty[key as keyof typeof empty]==='number') (empty as any)[key]=0;
    empty.fillRate=null as any;empty.sourceBreakdown={} as any;
    fetchMock.mockResolvedValueOnce(response(empty));mount();
    await screen.findByText(/завершённых вечеров не было/);
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
    expect(screen.getByText('0 из 0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Как считаем: Визиты'}));
    const dialog=await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Один игрок за вечер считается один раз');
  });
  it('survives unavailable session storage',async()=>{
    vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
    mount();await screen.findByText(/визитов — 62/);
  });
});
describe('presence polling scope',()=>{
  it('stops when inactive or hidden and resumes on visibility',async()=>{
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
    vi.useFakeTimers();
    const view=render(<ClubOwnerContext.Provider value={true}><OnlineNowPanel active /></ClubOwnerContext.Provider>);
    await act(async()=>{await Promise.resolve();await Promise.resolve();});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    await act(async()=>{vi.advanceTimersByTime(30000);});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
    await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));await Promise.resolve();});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    view.rerender(<ClubOwnerContext.Provider value={true}><OnlineNowPanel active={false} /></ClubOwnerContext.Provider>);
    await act(async()=>{vi.advanceTimersByTime(30000);});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
