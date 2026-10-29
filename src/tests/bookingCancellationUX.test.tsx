/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PlayerEventSlotDetail from '../components/player/PlayerEventSlotDetail.tsx';
import { confirmPageLeave } from '../lib/pageLeave.ts';

vi.mock('../components/player/PlayerEveningWorkspace.tsx', () => ({ default: () => null }));
const event = { id: 'e1', title: 'Вечер', starts_at: '2026-11-06T18:00:00Z', event_type: 'evening' as const, format: 'CASUAL' };
const plan = (ids: string[]) => ({ event, slots: [{ id: 's1', slot_number: 1, starts_at: event.starts_at, price: 100, registered_count: 10, participants: [] }], selection: { slot_ids: ids, games: ids.length, total: ids.length * 100 } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('confirms cancellation, preserves the booking on failure, and retries through the canonical slot save', async () => {
  const writes: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      writes.push(JSON.parse(String(init.body)));
      return writes.length === 1 ? json({ error: 'Нет связи' }, 503) : json(plan([]));
    }
    return json(plan(['s1']));
  }));
  render(<PlayerEventSlotDetail event={event} onBack={vi.fn()} onSaved={vi.fn()} onFirstApplication={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Отменить запись' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(writes).toEqual([]);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Отменить запись' }));
  await screen.findByText(/Не удалось отменить запись: Нет связи/);
  expect(screen.queryByText('Запись отменена')).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Отменить запись' }));
  await screen.findByText('Запись отменена');
  expect(writes).toEqual([{ slot_ids: [] }, { slot_ids: [] }]);
});

it('keeps an edited selection when the player declines leaving the app page', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(plan(['s1']))));
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const back = vi.fn();
  render(<PlayerEventSlotDetail event={event} onBack={back} onSaved={vi.fn()} onFirstApplication={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Выбрать игру 1' }));
  expect(confirmPageLeave(`${window.location.pathname}${window.location.search}#prices`)).toBe(true);
  expect(window.confirm).not.toHaveBeenCalled();
  expect(confirmPageLeave()).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '← События' }));
  expect(back).not.toHaveBeenCalled();
  expect(screen.getByText('Выбор изменён, но ещё не сохранён.')).toBeTruthy();
});
