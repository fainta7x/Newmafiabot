/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OrganizerAgenda from '../components/crm/OrganizerAgenda.tsx';

const agenda = {
  items: [
    { id: 'check:unclosed:e1', group: 'now', kind: 'unclosed', title: 'Вечер прошёл, но не закрыт', why: 'Вечер 25 — закрой вечер', action: { type: 'evening', evening_id: 'e1', section: 'closeout' }, action_label: 'Закрыть вечер' },
    { id: 'people:absent_regular', group: 'week', kind: 'absent_regular', title: 'Давно не были: постоянные · 1', why: 'Напиши и позови', contact_reason: 'absent_regular',
      people: [{ player_id: 'p1', nickname: 'Спящий', detail: 'не был 20 дн.', telegram_url: 'https://t.me/sleepy', vk_url: null }], people_total: 1 },
    { id: 'task:t1', group: 'later', kind: 'manual', title: 'Позвонить в кафе', why: 'Задача без описания', task_id: 't1', can_complete: true },
  ],
  counts: { now: 1, week: 1, later: 1 }, total: 3, snoozed: 0,
  groups: { now: 'Сейчас', week: 'На этой неделе', later: 'Когда будет время' },
};
const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

describe('«Дела»', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('groups by urgency, opens the evening, records «Написал» and puts an item off', async () => {
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      return json(String(input).includes('/api/crm/agenda') && !init?.method ? agenda : { ok: true });
    }));
    const openEvening = vi.fn();
    render(<OrganizerAgenda mode="full" onOpenEveningSection={openEvening} onOpenPlayer={vi.fn()} onCreateEvening={vi.fn()} />);
    await screen.findByText('Вечер прошёл, но не закрыт');
    expect(screen.getByTestId('agenda-group-now').textContent).toContain('Сейчас · 1');
    expect(screen.getByTestId('agenda-group-later').textContent).toContain('Позвонить в кафе');

    fireEvent.click(screen.getByRole('button', { name: /Закрыть вечер/ }));
    expect(openEvening).toHaveBeenCalledWith('e1', 'closeout');

    expect(screen.getByText('Telegram').closest('a')?.getAttribute('href')).toBe('https://t.me/sleepy');
    fireEvent.click(screen.getByRole('button', { name: 'Написал' }));
    await waitFor(() => expect(calls.some((call) => call.url === '/api/crm/agenda/contacted' && call.body.player_id === 'p1' && call.body.reason === 'absent_regular')).toBe(true));

    fireEvent.click(screen.getAllByRole('button', { name: 'Отложить' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'На неделю' }));
    await waitFor(() => expect(calls.some((call) => call.url === '/api/crm/agenda/snooze' && call.body.item_id === 'check:unclosed:e1' && call.body.days === 7)).toBe(true));
  });

  it('shows the urgent part on the home screen with a way to all items', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(agenda)));
    const openAll = vi.fn();
    render(<OrganizerAgenda mode="preview" onOpenEveningSection={vi.fn()} onOpenPlayer={vi.fn()} onCreateEvening={vi.fn()} onOpenAll={openAll} />);
    await screen.findByText('Вечер прошёл, но не закрыт');
    expect(screen.queryByText('Позвонить в кафе')).toBeNull();
    fireEvent.click(screen.getByTestId('agenda-open-all'));
    expect(openAll).toHaveBeenCalled();
    expect(screen.getByTestId('agenda-open-all').textContent).toContain('Все дела · 3');
  });
});
