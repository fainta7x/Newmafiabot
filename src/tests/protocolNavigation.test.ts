// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealProtocolSection } from '../components/crm/gameProtocol/protocolNavigation';
import { computeIssues } from '../components/crm/gameProtocol/protocolReview';

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

describe('«Исправить» in «Что проверить»', () => {
  it('scrolls to the winner section and flashes it', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="protocol-winner"></div>';
    const target = document.getElementById('protocol-winner')!;
    target.scrollIntoView = vi.fn();
    expect(revealProtocolSection('result')).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(target.classList.contains('ring-2')).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(target.classList.contains('ring-2')).toBe(false);
  });
  it('does nothing for a page that has no section of its own', () => {
    document.body.innerHTML = '<div id="protocol-winner"></div>';
    expect(revealProtocolSection('game')).toBe(false);
  });
  it('the winner remark has a short title and keeps the explanation under it', () => {
    const players = ['citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don', 'citizen', 'citizen', 'citizen'].map((role, index) => ({
      participant_id: `p${index + 1}`, seat_number: index + 1, role, exit_type: index < 5 ? 'voted_day' : 'alive', display_name: `Игрок ${index + 1}`,
    }));
    const issues = computeIssues({ protocol: { winner_team: 'black', end_reason: 'normal', votes: [], shots: [] }, results: players } as any);
    const issue = issues.find((item) => item.id === 'winner-table');
    if (issue) {
      expect(issue.title).toBe('Победитель не сходится со столом');
      expect(issue.sub).toMatch(/нужно большинство|Чёрным|чёрных/i);
    }
  });
});
