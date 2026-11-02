// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameFlowView } from '../components/crm/gameProtocol/GameFlowView.tsx';
import { buildCircles, computeIssues } from '../components/crm/gameProtocol/protocolReview.ts';

afterEach(cleanup);

const ROLES = ['don', 'citizen', 'mafia', 'citizen', 'citizen', 'citizen', 'sheriff', 'citizen', 'mafia', 'citizen'];
const results = ROLES.map((role, index) => ({
  participant_id: `p${index + 1}`, seat_number: index + 1, role, display_name: `Игрок ${index + 1}`, exit_type: 'alive',
  regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0, technical_fouls: 0, color_protocol: [],
})) as any[];
// Game 24: the first night has checks but no shot, the five-way raise follows.
const protocol = (): any => ({
  winner_team: 'black', end_reason: 'normal', shots: [], best_moves: [], zero_round_rule: 'tournament',
  votes: [
    { round_number: 1, day_number: 1, is_revote: false, nominated_seats: [2, 6, 7, 8, 9], vote_counts: { 2: 2, 6: 2, 7: 2, 8: 2, 9: 2 }, eligible_voters: 10, outcome: 'tie_revote', eliminated_seats: [] },
    { round_number: 2, day_number: 1, is_revote: true, parent_round_number: 1, nominated_seats: [2, 6, 7, 8, 9], vote_counts: { 2: 2, 6: 2, 7: 2, 8: 2, 9: 2 }, eligible_voters: 10, outcome: 'all_tied_eliminated', eliminated_seats: [2, 6, 7, 8, 9] },
  ],
  events: [
    { seq: 1, at: 'x', round: 1, phase: 'night', kind: 'don_check', value: 'not_sheriff' },
    { seq: 2, at: 'x', round: 1, phase: 'night', kind: 'sheriff_check', value: 'black' },
  ],
});

// A forgiving fake of the editing API: only what a circle page reads is real, every action is a spy.
const makeApi = (locked = false) => {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const base: any = { protocol: protocol(), results, locked, zeroRoundRule: 'tournament' };
  return new Proxy(base, { get: (target, key: string) => { if (key in target) return target[key]; return (calls[key] ??= vi.fn()); } });
};

const renderCircle = (circleIndex: number, api = makeApi()) => {
  const circles = buildCircles(api.protocol);
  const onCircle = vi.fn();
  render(<GameFlowView api={api} circles={circles} circleIndex={circleIndex} onCircle={onCircle} reviewed={{}} onToggleReviewed={vi.fn()} issues={computeIssues({ protocol: api.protocol, results } as any)} />);
  return { api, onCircle };
};

describe('night order in the protocol (owner, 2026-11-02, game 24: «не могу поставить убийство во вторую ночь»)', () => {
  it('the first night offers a shot and a miss (owner, 2026-11-02: «не выбрано убийство — значит промах»)', () => {
    const { api } = renderCircle(0);
    fireEvent.click(screen.getByTestId('night-add-miss'));
    expect(api.addNight).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('night-add-shot'));
    expect(api.addNight).toHaveBeenCalledTimes(2);
  });

  it('the second night does not just refuse: it can write the missing first night as a miss, or jump to it', () => {
    const { api, onCircle } = renderCircle(1);
    expect(screen.getByTestId('night-order-hint').textContent).toContain('Нулевой круг');
    fireEvent.click(screen.getByTestId('night-order-miss'));
    expect(api.addNight).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('night-order-go'));
    expect(onCircle).toHaveBeenCalledWith(0);
  });

  it('every earlier night missing is written by the one button', () => {
    const api = makeApi();
    api.protocol.events.push({ seq: 3, at: 'x', round: 3, phase: 'day_voting', kind: 'nomination', seat: 4 });
    const { api: shown } = renderCircle(2, api);
    fireEvent.click(screen.getByTestId('night-order-miss'));
    expect(shown.addNight).toHaveBeenCalledTimes(2);
  });

  it('a confirmed game says why nothing can be edited and keeps the buttons off', () => {
    renderCircle(0, makeApi(true));
    expect(screen.getByText(/Игра подтверждена/)).toBeTruthy();
    expect((screen.getByTestId('night-add-miss') as HTMLButtonElement).disabled).toBe(true);
  });
});
