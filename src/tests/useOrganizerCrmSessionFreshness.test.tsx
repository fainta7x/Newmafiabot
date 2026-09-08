/** @vitest-environment jsdom */
import React from 'react';
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
    <button type="button" onClick={() => void crm.retryLoad()}>manual</button>
  </div>;
}

beforeEach(() => {
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
      call += 1;
      if (call === 1) return jsonResponse(overview('initial'));
      if (call === 2) return slow;
      return jsonResponse(overview('newest'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('overview-title').textContent).toBe('initial'));

    window.dispatchEvent(new Event('focus'));
    await new Promise<void>((resolve) => setTimeout(resolve, 140));
    fireEvent.click(screen.getByRole('button', { name: 'manual' }));
    await waitFor(() => expect(screen.getByTestId('overview-title').textContent).toBe('newest'));

    resolveSlow(await jsonResponse(overview('stale')));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId('overview-title').textContent).toBe('newest');

    const overviewCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/crm/overview'));
    expect(overviewCalls.length).toBeGreaterThanOrEqual(3);
    for (const [, init] of overviewCalls) expect(init?.cache).toBe('no-store');
  });
});
