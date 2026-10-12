/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import EveningParticipantsView from '../components/crm/EveningParticipantsView.tsx';
import { api } from '../lib/api.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const people = [
  { id: 'p-failed', nickname: 'Не доставлено Ирина', response_status: 'unanswered', eligible_now: true, telegram_user_id: '123', telegram_username: 'irina', delivery_status: 'failed', last_error: 'Бот заблокирован', first_sent_at: null },
  { id: 'p-unsent', nickname: 'Ещё не отправлено Ольга', response_status: 'unanswered', eligible_now: true, telegram_user_id: '456', telegram_username: null, delivery_status: 'not_sent', first_sent_at: null },
  { id: 'p-thinking', nickname: 'Думает Пётр', response_status: 'thinking', eligible_now: true, telegram_user_id: '789', telegram_username: 'petr', delivery_status: 'sent', first_sent_at: '2026-10-10T18:00:00Z', reminder_count: 1 },
  { id: 'p-going', nickname: 'Будет Антон', response_status: 'going', eligible_now: true, telegram_user_id: '987', telegram_username: 'anton', delivery_status: 'sent', first_sent_at: '2026-10-10T18:00:00Z' },
];

const setup = (failDelivery = false) => {
  vi.spyOn(api, 'getEvening').mockResolvedValue({
    id: 'evening-1', status: 'published',
    participants: people.map((person) => ({
      id: 'ep-' + person.id, player_id: person.id, nickname: person.nickname,
      response_status: person.response_status, registration_status: person.response_status,
    })),
  } as any);
  vi.spyOn(api, 'getPlayers').mockResolvedValue([] as any);
  const update = vi.spyOn(api, 'updateParticipant').mockResolvedValue({} as any);
  const fetcher = vi.fn((input: RequestInfo | URL) => {
    const u = String(input);
    if (u.includes('/announcement-overview')) return Promise.resolve(new Response(JSON.stringify({ players: people, summary: { audience: 4 } }), { status: failDelivery ? 503 : 200, headers: { 'Content-Type': 'application/json' } }));
    if (u.includes('/slots')) return Promise.resolve(new Response(JSON.stringify({ slots: [], event: { max_evening_price: 0 } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetcher);
  return { update, fetcher };
};

describe('one organizer response and delivery worklist', () => {
  it('shows replies, failed/unsent announcements and the personal chat action in the SAME row', async () => {
    const { fetcher } = setup();
    render(<EveningParticipantsView eveningId="evening-1" onBack={vi.fn()} />);
    const failed = await screen.findByTestId('evening-answer-row-p-failed');
    expect(within(failed).getByText('Нет ответа')).toBeDefined();
    expect(within(failed).getByText('Анонс не доставлен')).toBeDefined();
    expect(within(failed).getByText('Причина: Бот заблокирован')).toBeDefined();
    expect(within(failed).getByRole('link', { name: 'Написать Не доставлено Ирина' }).getAttribute('href')).toBe('https://t.me/irina');
    expect(screen.getAllByText('Ответы игроков')).toHaveLength(1);
    expect(screen.queryByText('Написать игрокам лично')).toBeNull();
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/announcement-overview'))).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Не доставлено/ }));
    expect(screen.getByTestId('evening-answer-row-p-failed')).toBeDefined();
    expect(screen.queryByTestId('evening-answer-row-p-unsent')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Не отправлено/ }));
    const unsent = screen.getByTestId('evening-answer-row-p-unsent');
    expect(within(unsent).getByText('Анонс ещё не отправлен')).toBeDefined();
    expect(within(unsent).getByRole('link', { name: 'Написать Ещё не отправлено Ольга' }).getAttribute('href')).toBe('tg://user?id=456');

    fireEvent.click(screen.getByRole('button', { name: /Все$/ }));
    expect(screen.getByTestId('evening-answer-row-p-going')).toBeDefined();
    expect(screen.getByTestId('evening-answer-row-p-thinking')).toBeDefined();

    fireEvent.change(screen.getByRole('textbox', { name: 'Найти игрока' }), { target: { value: 'пётр' } });
    expect(screen.getByTestId('evening-answer-row-p-thinking')).toBeDefined();
    expect(screen.queryByTestId('evening-answer-row-p-going')).toBeNull();
  });

  it('saves response edits from inside the one worklist using the existing participant API', async () => {
    const { update } = setup();
    render(<EveningParticipantsView eveningId="evening-1" onBack={vi.fn()} />);
    const row = await screen.findByTestId('evening-answer-row-p-failed');
    fireEvent.click(within(row).getByRole('button', { name: /^Ответ/ }));
    fireEvent.click(within(row).getByRole('button', { name: 'Иду' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('ep-p-failed', { response_status: 'going' }));
  });

  it('allows resetting a recorded reply to unanswered', async () => {
    const { update } = setup();
    render(<EveningParticipantsView eveningId="evening-1" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Все$/ }));
    const row = await screen.findByTestId('evening-answer-row-p-going');
    fireEvent.click(within(row).getByRole('button', { name: /^Ответ/ }));
    fireEvent.click(within(row).getByRole('button', { name: 'Нет ответа' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('ep-p-going', { response_status: 'unanswered' }));
  });

  it('warns rather than reporting false delivery statuses when the delivery API is unavailable', async () => {
    setup(true);
    render(<EveningParticipantsView eveningId="evening-1" onBack={vi.fn()} />);
    expect(await screen.findByText(/Не удалось загрузить статус доставки/)).toBeDefined();
    expect(await screen.findByTestId('evening-answer-row-p-failed')).toBeDefined();
  });
});
