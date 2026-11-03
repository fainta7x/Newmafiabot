/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api.ts', () => ({ api: { getPlayers: async () => [{ id: 'p1', nickname: 'Чагин' }, { id: 'p2', nickname: 'Дина' }] } }));
import { PlayerVipSettings } from '../components/crm/PlayerVipSettings';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('VIP in the player card (owner, 2026-11-03)', () => {
  it('hides for anybody but the club owner', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ error: 'нет' }, 403)));
    const { container } = render(<PlayerVipSettings playerId="p1" />);
    await waitFor(() => expect((fetch as any).mock.calls.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelector('[data-testid="crm-player-vip"]')).toBeNull();
  });

  it('shows only this player\'s conditions in plain words; a new one starts at 50 % and switches «На весь вечер» on', async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(String(init.body)) : null });
      if (url.endsWith('/game-quotas')) return json({ quotas: [] });
      if (url === '/api/admin/vip-probability-rules' && !init.method) return json({ rules: [
        { id: 'r1', playerId: 'p1', kind: 'different_color', role: null, otherPlayerId: 'p2', percent: 30, enabled: true },
        { id: 'r2', playerId: 'p2', kind: 'role', role: 'don', otherPlayerId: null, percent: 90, enabled: true },
      ] });
      return json({ ok: true });
    }));
    render(<PlayerVipSettings playerId="p1" />);
    await waitFor(() => expect(screen.getAllByTestId('crm-player-vip-rule')).toHaveLength(1));
    expect(screen.getByText('Не хочу играть в одноцвете с')).toBeDefined();
    expect(screen.getByTestId('crm-player-vip-no-quota')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '+ Мне нравится играть на…' }));
    fireEvent.change(screen.getByTestId('crm-player-vip-draft').querySelector('select')!, { target: { value: 'sheriff' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT' && call.url.includes('/game-quotas/p1'))).toBe(true));
    const created = calls.find((call) => call.method === 'POST')!;
    expect(created.body).toMatchObject({ playerId: 'p1', kind: 'role', role: 'sheriff', percent: 50, enabled: true });
    expect(calls.find((call) => call.url.includes('/game-quotas/p1'))!.body).toEqual({ wholeEvening: true, maxSuccessfulGames: null });
  });
});
