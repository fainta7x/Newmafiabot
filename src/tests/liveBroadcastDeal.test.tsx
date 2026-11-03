/** @vitest-environment jsdom */
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LiveBroadcastOverlay from '../components/public/LiveBroadcastOverlay';
import { buildDealBroadcastState, readDealBroadcast, writeDealBroadcast } from '../lib/liveBroadcastDeal';
import { normalizeLiveBroadcastState } from '../server/services/liveBroadcastService';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const players = Array.from({ length: 10 }, (_, index) => ({ seat: index + 1, playerId: `p${index + 1}`, nickname: `Игрок ${index + 1}` }));
const metadata = { gameId: 1, globalGameNumber: 12, tableName: 'Стол', players };
const cards = Array.from({ length: 10 }, (_, index) => ({ position: index + 1, taken: index < 2 }));
const deal = { seat: 3, cards, open: { position: 5, role: 'sheriff' as const } };

describe('the role deal on the stream (owner, 2026-11-03)', () => {
  it('the deal is written on the device and read back; cleared when the deal is over', () => {
    writeDealBroadcast(deal);
    expect(readDealBroadcast()).toEqual(deal);
    writeDealBroadcast(null);
    expect(readDealBroadcast()).toBeNull();
  });

  it('the server keeps a well-formed deal of a seat at this table, only in the deal phase', () => {
    const built = buildDealBroadcastState(metadata, deal);
    const server = { gameId: 1, globalGameNumber: 12, eveningGameNumber: 1, tableName: 'Стол', players };
    expect(normalizeLiveBroadcastState(built, server)!.deal).toEqual(deal);
    const dirty = { ...built, deal: { seat: 3, cards: [...cards, { position: 42, taken: false }, { position: 1, taken: false }, 'junk'], open: { position: 5, role: 'joker' } } };
    expect(normalizeLiveBroadcastState(dirty, server)!.deal).toEqual({ seat: 3, cards, open: null });
    expect(normalizeLiveBroadcastState({ ...built, deal: { ...deal, seat: 11 } }, server)!.deal).toBeUndefined();
    expect(normalizeLiveBroadcastState({ ...built, phaseKey: 'day_speeches' }, server)!.deal).toBeUndefined();
  });

  it('the overlay lights the choosing seat, fades taken cards and turns the chosen one over to its role', async () => {
    const state = buildDealBroadcastState(metadata, deal);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ connected: true, receivedAt: state.updatedAt, state }), { status: 200, headers: { 'Content-Type': 'application/json' } }))));
    const { container } = render(<LiveBroadcastOverlay token="t" />);
    await waitFor(() => expect(container.querySelectorAll('.live-broadcast-deal-card').length).toBe(10));
    expect(container.querySelector('.live-broadcast-deal-who')!.textContent).toContain('№3 Игрок 3');
    const lit = [...container.querySelectorAll('.live-broadcast-player.is-speaking')];
    expect(lit).toHaveLength(1);
    expect(lit[0].querySelector('.live-broadcast-player-name')!.textContent).toBe('Игрок 3');
    expect(container.querySelector('.live-broadcast-speaking-tag')).toBeNull();
    expect(container.querySelectorAll('.live-broadcast-deal-card.is-taken')).toHaveLength(2);
    const open = container.querySelector('.live-broadcast-deal-card.is-open')!;
    expect(open.getAttribute('aria-label')).toBe('Карта №5: Шериф');
    expect(open.querySelector('[data-role-card-face="sheriff"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-role-card-face]')).toHaveLength(1);
  });

  it('a seat shows its role on the stream as soon as it got its card', () => {
    const state = buildDealBroadcastState(metadata, { ...deal, dealt: { 1: 'citizen', 2: 'don' } });
    expect(state.players.slice(0, 3).map((player) => [player.role, player.team])).toEqual([['Мирный', 'Красные'], ['Дон', 'Чёрные'], ['—', '—']]);
    expect(state.deal).toEqual(deal);
  });
});
