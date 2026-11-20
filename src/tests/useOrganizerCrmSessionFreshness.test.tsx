/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrganizerCrmSession } from '../components/crm/useOrganizerCrmSession.ts';

const apiMock = vi.hoisted(() => ({
  getMe: vi.fn(async () => ({ role: 'organizer', isOrganizer: true })),
  getPlayers: vi.fn(async () => []),
  getEvenings: vi.fn(async () => []),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../lib/api.ts', () => ({ api: apiMock }));

const overview = (label: string) => ({
  nextEvening: { id: label, title: label },
  actionLists: { unansweredInvites: [], unconfirmedRegistered: [], waitlistParticipants: [], newcomersAfterFirst: [], lapsedPlayers: [], overdueTasks: [], todayTasks: [], noDeadlineTasks: [], unpaidParticipants: [] },
  summary: { overdueTasksCount: 0, todayTasksCount: 0, noDeadlineTasksCount: 0, newcomersWithoutFollowupCount: 0, lapsedPlayersCount: 0, unpaidParticipantsCount: 0, totalUnpaidAmount: 0 },
});

const jsonResponse = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
}));

function Harness() {
  const crm = useOrganizerCrmSession();
  return <div>
    <span data-testid="overview-title">{crm.crmOverview?.nextEvening?.title || 'none'}</span>
    <span data-testid="loading">{crm.loading ? 'loading' : 'ready'}</span>
    <button type="button" onClick={() => void crm.retryLoad()}>manual</button>
    <button type="button" onClick={() => void crm.logout()}>logout</button>
  </div>;
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  apiMock.getMe.mockClear();
  apiMock.getPlayers.mockClear();
  apiMock.getEvenings.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useOrganizerCrmSession freshness', () => {
  it('uses no-store and prevents a slower resume request from overwriting a newer manual refresh', async () => {
    let resolveSlow!: (value: Response) => void;
    const slow = new Promise<Response>((resolve) => { resolveSlow = resolve; });
    let call = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes('/api/crm/overview')) return jsonResponse({});
      expect(init?.cache).toBe('no-store');
      call += 1;
      if (call === 1) return jsonResponse(overview('initial'));
      if (call === 2) return slow;
      return jsonResponse(overview('newest'));
    });
    vi.stubGlobal('fetch', fetchMock);
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('overview-title').textContent).toBe('initial'));

    // The foreground-refresh listeners are installed by a separate effect after
    // organizer authorization. Wait for the actual focus listener instead of
    // racing that effect with the synthetic focus event on a busy CI runner.
    await waitFor(() => {
      expect(addEventListenerSpy.mock.calls.some(([type]) => type === 'focus')).toBe(true);
    });

    window.dispatchEvent(new Event('focus'));
    await waitFor(() => {
      const overviewCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/crm/overview'));
      expect(overviewCalls.length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'manual' }));
    await waitFor(() => expect(screen.getByTestId('overview-title').textContent).toBe('newest'));

    resolveSlow(await jsonResponse(overview('stale')));
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    expect(screen.getByTestId('overview-title').textContent).toBe('newest');

    const overviewCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/crm/overview'));
    expect(overviewCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('shows the last cabinet at once, refreshes it in the background and forgets it on logout', async () => {
    window.localStorage.setItem('screen-cache:v1:crm:cabinet', JSON.stringify({ at: Date.now(), value: { overview: overview('kept'), evenings: [], players: [], isClubOwner: true } }));
    let resolveFresh!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => (String(input).includes('/api/crm/overview')
      ? new Promise<Response>((resolve) => { resolveFresh = resolve; })
      : jsonResponse({}))));
    render(<Harness />);
    expect(screen.getByTestId('overview-title').textContent).toBe('kept');
    expect(screen.getByTestId('loading').textContent).toBe('ready');
    await waitFor(() => expect(resolveFresh).toBeTypeOf('function'));
    resolveFresh(await jsonResponse(overview('fresh')));
    await waitFor(() => expect(screen.getByTestId('overview-title').textContent).toBe('fresh'));
    expect(JSON.parse(window.localStorage.getItem('screen-cache:v1:crm:cabinet') || '{}').value.overview.nextEvening.title).toBe('fresh');
    fireEvent.click(screen.getByRole('button', { name: 'logout' }));
    await waitFor(() => expect(window.localStorage.getItem('screen-cache:v1:crm:cabinet')).toBeNull());
  });

  it('forgets the kept cabinet when the server no longer lets this person in', async () => {
    window.localStorage.setItem('screen-cache:v1:crm:cabinet', JSON.stringify({ at: Date.now(), value: { overview: overview('kept'), evenings: [], players: [], isClubOwner: true } }));
    apiMock.getMe.mockResolvedValueOnce({ role: 'player', isOrganizer: false } as any);
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({})));
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('overview-title').textContent).toBe('none'));
    expect(window.localStorage.getItem('screen-cache:v1:crm:cabinet')).toBeNull();
  });
});
