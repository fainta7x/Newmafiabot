// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOCKTOWER_COMPOSITION, CLOCKTOWER_GUIDE_PATH, CLOCKTOWER_RULES } from '../lib/clocktowerGuide';
import { GUIDE_ENTRIES, GUIDE_SHELVES, findGuideEntry } from '../lib/guideCatalog';
import { PublicGuide } from '../components/public/PublicGuide';
import PlayerClocktower from '../components/player/PlayerClocktower';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('«Кровь на часовой башне»: the rules page', () => {
  it('the table composition adds up for every number of players, with exactly one Demon', () => {
    for (const [players, townsfolk, outsiders, minions] of CLOCKTOWER_COMPOSITION) {
      expect(townsfolk + outsiders + minions + 1).toBe(players);
    }
    expect(CLOCKTOWER_COMPOSITION.map(([players]) => players)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const text = CLOCKTOWER_RULES.flatMap((block) => block.points).join(' ');
    expect(text).toContain('10 — 7/0/2');
  });

  it('is a guide section with its own address, found from the guide home', () => {
    expect(GUIDE_SHELVES.map((shelf) => shelf.id)).toContain('games');
    const ids = GUIDE_ENTRIES.filter((entry) => entry.shelf === 'games').map((entry) => entry.id);
    expect(ids).toEqual(['clocktower', 'clocktower-rules', 'clocktower-roles']);
    expect(findGuideEntry('clocktower')?.blocks?.length).toBeGreaterThan(2);
    expect(CLOCKTOWER_GUIDE_PATH).toBe('/guide?tab=clocktower');
  });

  it('shows the overview with the honest «no game in the app» note', () => {
    render(<PublicGuide initialTab="clocktower" />);
    expect(screen.getByTestId('guide-article').textContent).toContain('В приложении пока нет самой игры');
  });
});

describe('«Кровь на часовой башне»: the section of the player cabinet', () => {
  const room = { id: 'r1', title: 'Башня у Миши', note: 'Есть набор', starts_at: null, host_nickname: 'Миша', members: [{ player_id: 'p1', nickname: 'Миша', is_storyteller: false }], joined: false, is_host: false, has_storyteller: false, i_am_storyteller: false };

  it('lists rooms, joins one and creates a new one', async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method || 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.endsWith('/rooms') && (init?.method || 'GET') === 'POST') return new Response(JSON.stringify({ id: 'r2' }), { status: 201 });
      if (url.endsWith('/rooms')) return new Response(JSON.stringify({ rooms: [room] }), { status: 200 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }));
    const opened: Array<string | null> = [];
    render(<PlayerClocktower onOpenRoom={(id) => opened.push(id)} />);
    expect((await screen.findByTestId('clocktower-room')).textContent).toContain('Башня у Миши');
    fireEvent.click(screen.getByTestId('clocktower-join'));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith('/rooms/r1/join') && call.method === 'POST')).toBe(true));
    fireEvent.click(screen.getByTestId('clocktower-create'));
    fireEvent.change(screen.getByTestId('clocktower-title'), { target: { value: 'Вечер башни' } });
    fireEvent.click(screen.getByTestId('clocktower-create-submit'));
    await waitFor(() => expect(opened).toEqual(['r2']));
    expect(calls.find((call) => call.url.endsWith('/rooms') && call.method === 'POST')?.body.title).toBe('Вечер башни');
  });

  it('says so when a shared room is already closed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ rooms: [room] }), { status: 200 })));
    render(<PlayerClocktower initialRoomId="gone" />);
    expect(await screen.findByText(/закрыта или её уже нет/)).toBeTruthy();
  });
});
