/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EveningPersonalInvites from '../components/crm/EveningPersonalInvites.tsx';
import { api } from '../lib/api.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('EveningPersonalInvites «Думают»', () => {
  it('notifies the parent after a successfully saved quick answer', async () => {
    const onChanged = vi.fn();
    vi.spyOn(api, 'getEvening').mockResolvedValue({
      id: 'ev', status: 'published', participants: [{
        id: 'ep1', evening_id: 'ev', player_id: 'p1', nickname: 'Молчун',
        response_status: 'unanswered', registration_status: 'unanswered',
      }],
    } as any);
    const update = vi.spyOn(api, 'updateParticipant').mockResolvedValue({} as any);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      players: [{ id: 'p1', nickname: 'Молчун', eligible_now: true, response_status: 'unanswered' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))));
    render(<EveningPersonalInvites eveningId="ev" onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: /Молчун/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Идёт' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('ep1', { response_status: 'going' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('says nobody is thinking instead of «Все уже ответили» when people still have not answered', async () => {
    vi.spyOn(api, 'getEvening').mockResolvedValue({ id: 'ev', status: 'published', participants: [] } as any);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      players: [{ id: 'p1', nickname: 'Молчун', eligible_now: true, response_status: 'unanswered' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))));
    render(<EveningPersonalInvites eveningId="ev" />);
    fireEvent.click(await screen.findByTestId('evening-invites-thinking'));
    expect(screen.getByTestId('evening-invites-thinking-empty').textContent).toContain('Никто не думает');
    expect(screen.queryByText('Все уже ответили.')).toBeNull();
  });
});
