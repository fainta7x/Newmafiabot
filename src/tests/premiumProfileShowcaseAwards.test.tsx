/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PremiumProfileShowcase from '../components/player/PremiumProfileShowcase.tsx';

const award = (id: string, title: string, place: string | null, kind = 'placement', date = '2026-10-01T00:00:00Z') => ({ id, kind, title, tournament_name: 'Кубок', award_date: date, award_year: 2026, place_result: place, team_name: null, description: null, photo_url: null, pinned_position: null });
const showcase = (awards: any[], pinned: any[] = []) => ({ awards, pinned_awards: pinned, earned_achievements: [], timeline: [], achievements: { earned: 0, total: 0, percentage: 0 }, stats: { verified_awards: awards.length, achievements_earned: 0, achievements_total: 0, completed_games: 0, manual_milestones: 0 } });

const mockShowcase = (body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('player award showcase', () => {
  it('uses a medal for the first three places and a ribbon for a nomination', async () => {
    mockShowcase(showcase([award('a', 'Победитель', '1 место'), award('b', 'Второе', '2 место'), award('c', 'Лучший Дон', null, 'nomination')]));
    render(<PremiumProfileShowcase playerId="p1" isSelf={false} section="awards" />);
    await waitFor(() => expect(screen.getByText(/Победитель/)).toBeTruthy());
    expect(screen.getByText(/🥇 Победитель/)).toBeTruthy();
    expect(screen.getByText(/🥈 Второе/)).toBeTruthy();
    expect(screen.getByText(/🎖️ Лучший Дон/)).toBeTruthy();
  });

  it('shows the best awards on the overview when nothing is pinned, and nothing when there are no awards', async () => {
    mockShowcase(showcase([award('n', 'Номинация', null, 'nomination'), award('w', 'Победитель', '1 место')]));
    const first = render(<PremiumProfileShowcase playerId="p1" isSelf={false} section="pinned" />);
    await waitFor(() => expect(screen.getByTestId('profile-pinned-awards')).toBeTruthy());
    const titles = Array.from(first.container.querySelectorAll('.font-semibold')).map((node) => node.textContent);
    expect(titles.indexOf('Победитель')).toBeLessThan(titles.indexOf('Номинация'));
    cleanup();
    mockShowcase(showcase([]));
    const empty = render(<PremiumProfileShowcase playerId="p2" isSelf={false} section="pinned" />);
    await waitFor(() => expect(empty.container.querySelector('[data-testid="premium-profile-showcase"]')).toBeNull());
    expect(empty.container.querySelector('[data-testid="profile-pinned-awards"]')).toBeNull();
  });
});
