/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PremiumProfileShowcase from '../components/player/PremiumProfileShowcase.tsx';

afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });

it('retries a failed history request without leaving the profile', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ timeline: [], pinned_awards: [] })));
  vi.stubGlobal('fetch', fetcher);
  render(<PremiumProfileShowcase playerId="p1" isSelf={false} section="history" />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
  await screen.findByText('История игрока');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('loads the full showcase when switching from the light pinned section to history', async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ timeline: [], pinned_awards: [], awards: [] })));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<PremiumProfileShowcase playerId="p1" isSelf={false} section="pinned" />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  view.rerender(<PremiumProfileShowcase playerId="p1" isSelf={false} section="history" />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls[0][0]).toContain('?light=1');
  expect(fetcher.mock.calls[1][0]).toBe('/api/player/profiles/p1/showcase');
});

it('shows a failed pin write without losing the loaded awards',async()=>{
  const body={awards:[{id:'a1',kind:'trophy',title:'Кубок клуба'}],pinned_awards:[],earned_achievements:[],timeline:[],achievements:{categories:[],earned:0,total:0,percentage:0},stats:{verified_awards:1}};
  const fetcher=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>init?.method==='PATCH'?new Response(JSON.stringify({error:'Закрепление не сохранилось'}),{status:503}):new Response(JSON.stringify(body)));
  vi.stubGlobal('fetch',fetcher);
  render(<PremiumProfileShowcase playerId="p1" isSelf section="awards"/>);
  const list=await screen.findByTestId('profile-awards-list');
  fireEvent.click(list.querySelector('summary')!);
  fireEvent.click(screen.getByRole('button',{name:'Закрепить'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Закрепление не сохранилось');
  expect(screen.getByTestId('profile-awards-list')).toBeDefined();
  expect(fetcher.mock.calls.filter(([,init])=>init?.method==='PATCH')).toHaveLength(1);
});

it('labels the viewed player awards and keeps public achievement choices read-only',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({awards:[],pinned_awards:[],earned_achievements:[],timeline:[],achievements:{categories:[],earned:0,total:0},stats:{verified_awards:0}})));
 vi.stubGlobal('fetch',fetcher);
 render(<PremiumProfileShowcase playerId="other" isSelf={false} section="awards"/>);
 await screen.findByRole('button',{name:'Награды игрока'});
 expect(screen.queryByRole('button',{name:'Мои цели'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Достижения'}));
 const path=screen.getByRole('combobox',{name:'Путь достижений'}) as HTMLSelectElement;
 fireEvent.change(path,{target:{value:path.options[1].value}});
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(screen.queryByText('Закрепить достижение')).toBeNull();
});
