// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOCKTOWER_COMPOSITION, CLOCKTOWER_EVENT_TEMPLATE, CLOCKTOWER_GUIDE_PATH, CLOCKTOWER_RULES } from '../lib/clocktowerGuide';
import { GUIDE_ENTRIES, GUIDE_SHELVES, findGuideEntry } from '../lib/guideCatalog';
import { PublicGuide } from '../components/public/PublicGuide';
import CustomEventsPanel from '../components/crm/CustomEventsPanel';
import PlayerCustomEventDetail from '../components/player/PlayerCustomEventDetail';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('«Кровь на часовой башне»: the rules page and the invitation', () => {
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

  it('the invitation template fills a ready event and the player sees a link to the rules', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
    render(<CustomEventsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Создать ивент/ }));
    fireEvent.click(await screen.findByTestId('custom-event-template-clocktower'));
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Кровь на часовой башне');
    const description = (screen.getByLabelText('Описание') as HTMLTextAreaElement).value;
    expect(description).toContain(CLOCKTOWER_GUIDE_PATH);
    expect(description).toContain(window.location.origin);
    expect(CLOCKTOWER_EVENT_TEMPLATE.participantLimit).toBe(12);
    expect(CLOCKTOWER_EVENT_TEMPLATE.visibility).toBe('invite');
  });

  it('an invited player sees «Правила игры» on the event page, other events have no such link', async () => {
    const event = (description: string) => ({
      id: 'e1', title: 'Вечер', description, starts_at: '2026-11-01T15:00:00Z', ends_at: '2026-11-01T18:00:00Z', price_rub: 0,
      participant_limit: 12, participant_count: 3, registration_open: 1, allow_guest: 0,
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => event(CLOCKTOWER_EVENT_TEMPLATE.description('https://club.example')) })));
    const { unmount } = render(<PlayerCustomEventDetail eventId="e1" onBack={() => undefined} onSaved={() => undefined} />);
    const link = await screen.findByTestId('custom-event-rules-link');
    expect(link.getAttribute('href')).toBe(CLOCKTOWER_GUIDE_PATH);
    unmount();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => event('Квиз в пятницу') })));
    render(<PlayerCustomEventDetail eventId="e2" onBack={() => undefined} onSaved={() => undefined} />);
    await waitFor(() => expect(screen.getByText('Квиз в пятницу')).toBeTruthy());
    expect(screen.queryByTestId('custom-event-rules-link')).toBeNull();
  });
});
