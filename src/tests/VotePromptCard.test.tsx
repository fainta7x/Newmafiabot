/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VotePromptCard from '../components/player/VotePromptCard.tsx';

const pending = { evening_id: 'e1', title: 'Пятница', deadline: '2026-10-19T18:00:00.000Z', voted: false, my_vote_nickname: null, voters: 2, attendees: 9 };

describe('«MVP вечера» card on the player home', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('stays hidden when no vote is open', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ pending: null }), { status: 200 })));
    const { container } = render(<VotePromptCard />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('asks to vote, with how many already did, and opens the vote in place', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes('/voting/pending') ? { pending } : { error: 'x' }), { status: String(url).includes('/voting/pending') ? 200 : 403 })));
    render(<VotePromptCard />);
    expect((await screen.findByTestId('vote-prompt-card')).textContent).toContain('проголосовали 2 из 9');
    expect(screen.getByTestId('vote-prompt-toggle').textContent).toBe('Голосовать');
    fireEvent.click(screen.getByTestId('vote-prompt-toggle'));
    expect(screen.getByTestId('vote-prompt-toggle').textContent).toBe('Свернуть');
  });

  it('after the vote says who it was for and offers to change it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ pending: { ...pending, voted: true, my_vote_nickname: 'Лиса' } }), { status: 200 })));
    render(<VotePromptCard />);
    expect((await screen.findByTestId('vote-prompt-card')).textContent).toContain('Ты проголосовал за Лиса');
    expect(screen.getByTestId('vote-prompt-toggle').textContent).toBe('Изменить');
  });
});
