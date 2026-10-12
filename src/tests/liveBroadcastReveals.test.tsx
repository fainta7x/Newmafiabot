/** @vitest-environment jsdom */
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LiveBroadcastOverlay from '../components/public/LiveBroadcastOverlay';
import { buildLiveBroadcastState } from '../lib/liveBroadcast';
import { normalizeLiveBroadcastState } from '../server/services/liveBroadcastService';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const roles = ['Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Шериф', 'Мафия', 'Мафия', 'Дон'];
const activePlayers = roles.map((role, index) => ({
  slot_num: index + 1, nickname: `Игрок ${index + 1}`, role, team: index >= 7 ? 'Чёрные' : 'Красные', alive: true,
  fouls: 0, minor_tech_fouls: 0, major_tech_fouls: 0, exit_reason: 'alive', eliminated_phase: '',
}));
const metadata = { gameId: 1, globalGameNumber: 12, tableName: 'Стол', players: activePlayers.map((player) => ({ seat: player.slot_num, playerId: `p${player.slot_num}`, nickname: player.nickname })) };
const snapshot = (reveals: unknown) => ({
  phase: 'day_speeches', roundNumber: 2, activePlayers, activeSpeakerSlot: 10, timeLeft: 40, timerMax: 60, isTimerRunning: true, nominations: [], nominationsMap: {},
  votingRounds: [], activeVotingRoundIndex: 0, votesByPlayer: {}, votes: {}, votingStage: 'setup', nightSubPhase: 'intro', postNightStage: 'none', protocolMarkers: {},
  discipline: { players: {}, isNextVotingCancelled: false, isPpk: false, ppkCulpritId: null }, nightLogs: [], reveals,
});

describe('reveals on the broadcast', () => {
  it('the server keeps only well-formed reveals of seats at this table', () => {
    const built = buildLiveBroadcastState(snapshot([{ seat: 10, checks: [{ target: 9, color: 'red' }] }]), metadata)!;
    const dirty = {
      ...built,
      reveals: [
        { seat: 10, checks: [{ target: 9, color: 'red' }, { target: 10, color: 'red' }, { target: 3, color: 'green' }, { target: 3, color: 'black' }, { target: 3, color: 'red' }] },
        { seat: 10, checks: [] }, { seat: 42, checks: [] }, 'junk', null,
      ],
    };
    const clean = normalizeLiveBroadcastState(dirty, { gameId: 1, globalGameNumber: 12, eveningGameNumber: 1, tableName: 'Стол', players: metadata.players })!;
    expect(clean.reveals).toEqual([{ seat: 10, checks: [{ target: 9, color: 'red' }, { target: 3, color: 'black' }] }]);
    const none = normalizeLiveBroadcastState({ ...built, reveals: undefined }, { gameId: 1, globalGameNumber: 12, eveningGameNumber: 1, tableName: 'Стол', players: metadata.players })!;
    expect(none.reveals).toBeUndefined();
  });

  it('the screen shows one line «Вскрылся с: 9кр 3ч» on the card of the player who revealed', async () => {
    const state = { ...buildLiveBroadcastState(snapshot([{ seat: 10, checks: [{ target: 9, color: 'red' }, { target: 3, color: 'black' }] }, { seat: 7, checks: [] }]), metadata)!, updatedAt: '2026-10-12T18:00:00.000Z' };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ connected: true, receivedAt: '2026-10-12T18:00:00.000Z', state }), { status: 200, headers: { 'Content-Type': 'application/json' } }))));
    const { container } = render(<LiveBroadcastOverlay token="t" />);
    await waitFor(() => expect(container.querySelectorAll('.live-broadcast-player').length).toBe(10));
    const lines = [...container.querySelectorAll('.live-broadcast-reveal-banner')];
    expect(lines).toHaveLength(2);
    const don = container.querySelector('.live-broadcast-player.is-speaking .live-broadcast-reveal-banner')!;
    expect(don.textContent).toBe('Вскрылся с:9кр3ч');
    expect([...don.querySelectorAll('.live-broadcast-announced')].map((item) => item.className.includes('is-red') ? 'red' : 'black')).toEqual(['red', 'black']);
    // A reveal without announced checks is only marked.
    expect(lines.map((line) => line.textContent)).toContain('Вскрылся шерифом');
    expect(container.querySelector('.live-broadcast-fact.is-reveal')).toBeNull();
  });

  it('shows nothing extra when nobody revealed', async () => {
    const state = { ...buildLiveBroadcastState(snapshot(undefined), metadata)!, updatedAt: '2026-10-12T18:00:00.000Z' };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ connected: true, receivedAt: '2026-10-12T18:00:00.000Z', state }), { status: 200, headers: { 'Content-Type': 'application/json' } }))));
    const { container } = render(<LiveBroadcastOverlay token="t" />);
    await waitFor(() => expect(container.querySelectorAll('.live-broadcast-player').length).toBe(10));
    expect(container.querySelector('.live-broadcast-reveal-banner')).toBeNull();
    expect(container.querySelector('.live-broadcast-fact.is-reveal')).toBeNull();
  });
});
