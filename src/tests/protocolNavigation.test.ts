// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anchorOfTab, revealProtocolSection } from '../components/crm/gameProtocol/protocolNavigation';
import { buildCircles, computeIssues, winnerRemarkTarget } from '../components/crm/gameProtocol/protocolReview';

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

const ROLES = ['don', 'citizen', 'mafia', 'citizen', 'citizen', 'citizen', 'sheriff', 'citizen', 'mafia', 'citizen'];
const exitsOf: Record<number, string> = { 2: 'voted_day', 6: 'voted_day', 7: 'voted_day', 8: 'voted_day', 9: 'voted_day' };
const results = () => ROLES.map((role, index) => ({
  participant_id: `p${index + 1}`, seat_number: index + 1, role, display_name: `Игрок ${index + 1}`, exit_type: exitsOf[index + 1] || 'alive',
})) as any[];
// Game 24 of 2026-10-30: the first night had checks but no shot, then a five-way raise; the winner «чёрные» does not match the table.
const game24 = (): any => ({
  winner_team: 'black', end_reason: 'normal', shots: [], best_moves: [], zero_round_rule: 'tournament',
  votes: [
    { round_number: 1, day_number: 1, is_revote: false, nominated_seats: [2, 6, 7, 8, 9], vote_counts: { 2: 2, 6: 2, 7: 2, 8: 2, 9: 2 }, eligible_voters: 10, outcome: 'tie_revote', eliminated_seats: [] },
    { round_number: 2, day_number: 1, is_revote: true, parent_round_number: 1, nominated_seats: [2, 6, 7, 8, 9], vote_counts: { 2: 2, 6: 2, 7: 2, 8: 2, 9: 2 }, eligible_voters: 10, outcome: 'all_tied_eliminated', eliminated_seats: [2, 6, 7, 8, 9] },
  ],
  events: [
    { seq: 1, at: 'x', round: 1, phase: 'night', kind: 'don_check', value: 'not_sheriff' },
    { seq: 2, at: 'x', round: 1, phase: 'night', kind: 'sheriff_check', value: 'black' },
    { seq: 3, at: 'x', round: 2, phase: 'day_voting', kind: 'table_vote', seat: 1 },
  ],
});

describe('every remark of the protocol is a link to the exact place', () => {
  it('scrolls to a block and flashes it', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="protocol-winner"></div><div id="circle-night"></div>';
    const winner = document.getElementById('protocol-winner')!;
    winner.scrollIntoView = vi.fn();
    expect(revealProtocolSection('winner')).toBe(true);
    expect(winner.scrollIntoView).toHaveBeenCalled();
    expect(winner.classList.contains('ring-2')).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(winner.classList.contains('ring-2')).toBe(false);
    expect(revealProtocolSection('voting')).toBe(false);
  });

  it('the old «tabs» of the protocol page are anchors', () => {
    expect(anchorOfTab('result')).toBe('winner');
    expect(anchorOfTab('players')).toBe('players');
    expect(anchorOfTab('game')).toBeNull();
  });

  it('game 24: «winner does not match the table» leads to the night of the zero circle, where the shot is missing', () => {
    const protocol = game24();
    expect(winnerRemarkTarget(protocol)).toEqual({ tab: 'game', circle: 0, anchor: 'night' });
    const issue = computeIssues({ protocol, results: results() } as any).find((item) => item.id === 'winner-table');
    expect(issue).toBeTruthy();
    expect(issue).toMatchObject({ title: 'Победитель не сходится со столом', tab: 'game', circle: 0, anchor: 'night' });
    // With every night written the remark is about the winner itself.
    expect(winnerRemarkTarget({ ...protocol, shots: [{ night_number: 1, target_seat: 0, result: 'miss' }, { night_number: 2, target_seat: 0, result: 'miss' }] })).toEqual({ tab: 'result', anchor: 'winner' });
  });

  it('every remark that points at a circle names a circle that exists and the block to show', () => {
    const protocol = game24();
    const circles = buildCircles(protocol);
    for (const issue of computeIssues({ protocol, results: results() } as any)) {
      if (issue.tab === 'game') {
        expect(issue.circle, issue.id).toBeGreaterThanOrEqual(0);
        expect(issue.circle, issue.id).toBeLessThan(circles.length);
        expect(issue.anchor, issue.id).toBeTruthy();
      }
    }
  });
});
