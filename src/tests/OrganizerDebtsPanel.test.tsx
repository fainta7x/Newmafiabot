// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizerDebtsPanel from '../components/crm/OrganizerDebtsPanel.tsx';

const debtors = [{ player_id: 'p', nickname: 'Перец', owed: 800, evenings: [
  { evening_id: 'e2', title: 'Вечер 20.10', starts_at: '2026-10-20T17:00:00Z', owed: 400 },
  { evening_id: 'e1', title: 'Вечер 16.10', starts_at: '2026-10-16T17:00:00Z', owed: 400 }] },
{ player_id: 'q', nickname: 'Квант', owed: 300, evenings: [{ evening_id: 'e2', title: 'Вечер 20.10', starts_at: '2026-10-20T17:00:00Z', owed: 300 }] }];
const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('Today debts panel', () => {
  const calls: Array<[string, any]> = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal('fetch', vi.fn((url: string, init?: any) => { calls.push([String(url), init]); return reply(String(url).endsWith('/remind') ? { queued: 2, skipped_recent: 0, undeliverable: 0 } : { debtors, total: 1100 }); }));
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('shows one row per player with the total and every evening behind it', async () => {
    render(<OrganizerDebtsPanel enabled refreshKey={0} onOpenPlayer={vi.fn()} onChanged={vi.fn()} />);
    const panel = await screen.findByTestId('debts-panel');
    expect(panel.textContent).toContain('2 чел.');
    const rows = screen.getAllByTestId('debt-row');
    expect(rows[0].textContent).toContain('Перец');
    expect(rows[0].textContent).toContain('Вечер 20.10');
    expect(rows[0].textContent).toContain('Вечер 16.10');
    expect(rows[0].textContent).toContain('Оплачено всё');
    expect(rows[1].textContent).not.toContain('Оплачено всё');
  });

  it('confirms one evening or everything of a player, and reminds all debtors', async () => {
    const onChanged = vi.fn();
    render(<OrganizerDebtsPanel enabled refreshKey={0} onOpenPlayer={vi.fn()} onChanged={onChanged} />);
    await screen.findByTestId('debts-panel');
    fireEvent.click(screen.getAllByText('Оплачено')[0]);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    const single = calls.find(([url]) => url === '/api/crm/debts/p/paid')!;
    expect(JSON.parse(single[1].body)).toEqual({ evening_id: 'e2' });
    fireEvent.click(screen.getByText(/Оплачено всё/));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
    expect(JSON.parse(calls.filter(([url]) => url === '/api/crm/debts/p/paid')[1][1].body)).toEqual({});
    fireEvent.click(screen.getByText('Напомнить всем должникам'));
    expect((await screen.findByRole('status')).textContent).toContain('отправлены: 2');
  });

  it('shows nothing while payments are being refreshed', async () => {
    render(<OrganizerDebtsPanel enabled={false} refreshKey={0} onOpenPlayer={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByTestId('debts-panel')).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
