/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CuratorTasksPanel from '../components/crm/CuratorTasksPanel.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const payload = (tasks: unknown[] = []) => ({
  open: tasks,
  closed: [],
  curators: [{ id: 'owner-curator', nickname: 'Куратор', areas: ['SMM'] }],
});

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

describe('curator tasks on CRM «Дела»', () => {
  it('shows a load error and retry instead of silently hiding the section', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ error: 'Связь с сервером потеряна' }, 503))
      .mockResolvedValue(response(payload()));
    vi.stubGlobal('fetch', fetchMock);

    render(<CuratorTasksPanel />);

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Связь с сервером потеряна');
    expect(screen.getByText('Задачи кураторов')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Открытых задач нет.')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the task and tells the organizer if cancellation fails', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url).endsWith('/cancel')) return Promise.resolve(response({ error: 'Не удалось отменить задачу на сервере' }, 503));
      return Promise.resolve(response(payload([{
        id: 'task-1', title: 'Подготовить анонс', curator_player_id: 'owner-curator',
        curator_nickname: 'Куратор', area: 'SMM', description: null, due_at: null,
        status: 'todo', done_note: null, completed_at: null,
      }])));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<CuratorTasksPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Отменить задачу' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Не удалось отменить задачу на сервере'));
    expect(screen.getByText('Подготовить анонс')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Отменить задачу' }).hasAttribute('disabled')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
