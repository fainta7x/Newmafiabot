/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BettingAdminCRM from '../components/crm/BettingAdminCRM.tsx';

const pool = (id: string, bets: number, status: string) => ({ id, game_id: Number(id.replace('g', '')), game_number: Number(id.replace('g', '')), game_date: '2026-11-03', status, opens_at: '', closes_at: '', red_pool: 0, black_pool: 0, red_coefficient: 1, black_coefficient: 1, house_rate_bps: 0, max_coefficient: 3, reserve_amount: 0, settled_winner: null, settled_at: null, total_staked: bets * 100, total_paid_out: 0, bet_count: bets, role_snapshot: [], bets: [] });

describe('«Управление ставками»', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it('keeps games nobody bet on in one folded list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ summary: { pools: 3, open: 0, unsettled: 0, settled: 3, refunded: 0, reserve_total: 0 }, pools: [pool('g36', 0, 'settled'), pool('g35', 4, 'settled'), pool('g34', 0, 'settled')] }), { status: 200 })));
    render(<BettingAdminCRM />);
    const folded = await screen.findByTestId('crm-betting-empty');
    expect(within(folded).getByText('Игры без ставок').closest('summary')!.textContent).toContain('2');
    expect(screen.getAllByText(/Игра №35/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Игра №36/).filter((node) => !folded.contains(node))).toHaveLength(0);
  });
});
