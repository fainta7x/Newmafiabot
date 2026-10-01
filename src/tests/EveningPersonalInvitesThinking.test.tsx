/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EveningPersonalInvites from '../components/crm/EveningPersonalInvites.tsx';
import { api } from '../lib/api.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('EveningPersonalInvites «Думают»', () => {
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
