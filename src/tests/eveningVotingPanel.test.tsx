/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EveningVotingPanel from '../components/player/EveningVotingPanel.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('evening voting panel', () => {
  it('asks one question and lists the other attendees', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      evening: { id: 'e1', title: 'Пятница' }, voting_open: true, deadline: null, categories: ['best_player'],
      nominees: [{ player_id: 'p2', nickname: 'Лис', avatar_url: '/a', categories: ['best_player'] }, { player_id: 'p3', nickname: 'Зверь', avatar_url: '/b', categories: ['best_player'] }],
      my_votes: {}, results: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    render(<EveningVotingPanel eveningId="e1" />);
    await waitFor(() => expect(screen.getByText(/Кто сыграл лучше всех/)).toBeTruthy());
    expect(screen.getByText('Лис')).toBeTruthy();
    expect(screen.getByText('Зверь')).toBeTruthy();
    expect(screen.queryByText('Симпатия')).toBeNull();
    expect(screen.queryByText('Шериф')).toBeNull();
  });
});
