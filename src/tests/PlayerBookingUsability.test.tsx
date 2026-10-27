/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerEventSlotDetail from '../components/player/PlayerEventSlotDetail.tsx';
import { DEFAULT_EVENING_PRICES } from '../lib/eveningPrices.ts';
vi.mock('../components/player/PlayerEveningWorkspace.tsx', () => ({ default: () => null }));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const event = { id: 'a', title: 'Вечер А', starts_at: '2027-01-15T16:00:00Z', format: 'NOVICE', event_type: 'evening' as const };
const plan = (id = 'a', format = 'NOVICE', selected = ['s1','s2']) => ({
 event: { ...event, id, format, assembled: true, assembled_slots: 2, required_slots: 2, required_players_per_slot: 9, price_per_game: format === 'RATING' ? 500 : 200, max_evening_price: null },
 pricing: { ...DEFAULT_EVENING_PRICES },
 slots: [1,2].map((n) => ({ id: `s${n}`, slot_number: n, starts_at: event.starts_at, price: format === 'RATING' ? 100 : 200, registered_count: 9, target_players: 9, participants: [] })),
 selection: { slot_ids: selected, games: selected.length, total: format === 'RATING' ? 500 : 400 },
});
const props = { onBack: vi.fn(), onSaved: vi.fn(), onFirstApplication: vi.fn() };
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('existing booking screen correctness', () => {
 it('uses the actual novice two-game / nine-person gathering thresholds', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(plan())));
  render(<PlayerEventSlotDetail event={event} {...props} />);
  await screen.findByText('Стол собран');
  expect(screen.getByText('2/2')).toBeTruthy();
  expect(screen.getAllByText(/9 игроков · собрано/)).toHaveLength(2);
  expect(screen.queryByText(/нужно 4/)).toBeNull();
 });
 it('quotes one configured rating entry fee rather than adding slot prices', async () => {
  const body = plan('a', 'RATING'); body.pricing.rating_entry = 750; body.event.price_per_game = 750; body.selection.total = 750;
  vi.stubGlobal('fetch', vi.fn(async () => json(body)));
  render(<PlayerEventSlotDetail event={{ ...event, format: 'RATING' }} {...props} />);
  await screen.findByText(/750 ₽ за вечер/);
  expect(screen.getByText('750 ₽')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Игра 1/ }));
  fireEvent.click(screen.getByRole('button', { name: /Игра 2/ }));
  expect(screen.getByText('0 ₽')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Весь вечер' }));
  expect(screen.getByText('750 ₽')).toBeTruthy();
 });
 it('locks selection during submission so an acknowledgement cannot erase a later choice', async () => {
  let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn((_url, init) => init?.method === 'PUT' ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(json(plan('a', 'NOVICE', [])))));
  render(<PlayerEventSlotDetail event={event} {...props} />);
  const first = await screen.findByRole('button', { name: /Игра 1/ });
  fireEvent.click(first); fireEvent.click(screen.getByRole('button', { name: 'Сохранить мой план' }));
  expect((screen.getByRole('button', { name: /Игра 2/ }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Весь вечер' }) as HTMLButtonElement).disabled).toBe(true);
  finish(json(plan('a','NOVICE',['s1'])));
  await screen.findByText('План сохранён');
  expect((screen.getByRole('button', { name: /Игра 2/ }) as HTMLButtonElement).disabled).toBe(false);
 });
 it('ignores the old evening response after a newer evening has loaded', async () => {
  let finishOld!: (value: Response) => void;
  const newer = plan('b'); newer.slots = [{ ...newer.slots[0], id: 'b4', slot_number: 4 }]; newer.selection.slot_ids = ['b4'];
  vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('/a/') ? new Promise((resolve) => { finishOld = resolve; }) : Promise.resolve(json(newer))));
  const { rerender } = render(<PlayerEventSlotDetail event={event} {...props} />);
  rerender(<PlayerEventSlotDetail event={{ ...event, id: 'b', title: 'Вечер Б' }} {...props} />);
  await screen.findByRole('button', { name: /Игра 4/ });
  await act(async () => { finishOld(json(plan())); });
  await waitFor(() => expect(screen.queryByRole('button', { name: /Игра 1/ })).toBeNull());
 });
 it('offers immediate retry after a failed initial load', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ error: 'Нет связи' },503)).mockResolvedValueOnce(json(plan())));
  render(<PlayerEventSlotDetail event={event} {...props} />);
  await screen.findByText('Нет связи');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await screen.findByRole('button', { name: /Игра 1/ });
 });
 it('keeps the selected plan after a failed save and allows retry', async () => {
  let fail = true;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => init?.method === 'PUT' ? fail ? (fail = false, json({ error: 'Нет связи' },503)) : json(plan('a','NOVICE',['s1'])) : json(plan('a','NOVICE',[]))));
  render(<PlayerEventSlotDetail event={event} {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: /Игра 1/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить мой план' }));
  await screen.findByText('Нет связи');
  expect(screen.queryByText('План сохранён')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить мой план' }));
  await screen.findByText('План сохранён');
  expect(props.onSaved).toHaveBeenCalledOnce();
 });
 it('does not apply an old save response to the next evening', async () => {
  let finish!: (value: Response) => void;
  const newer = plan('b'); newer.slots = [{ ...newer.slots[0], id: 'b4', slot_number: 4 }]; newer.selection.slot_ids = ['b4'];
  vi.stubGlobal('fetch', vi.fn((url: string, init) => init?.method === 'PUT' ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(json(url.includes('/a/') ? plan('a','NOVICE',[]) : newer))));
  const { rerender } = render(<PlayerEventSlotDetail event={event} {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: /Игра 1/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить мой план' }));
  rerender(<PlayerEventSlotDetail event={{ ...event, id: 'b', title: 'Вечер Б' }} {...props} />);
  await screen.findByRole('button', { name: /Игра 4/ });
  await act(async () => { finish(json(plan('a','NOVICE',['s1']))); });
  expect(screen.queryByRole('button', { name: /Игра 1/ })).toBeNull();
  expect(props.onSaved).not.toHaveBeenCalled();
 });
});
