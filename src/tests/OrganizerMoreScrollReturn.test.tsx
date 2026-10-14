/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizerCRM from '../components/OrganizerCRM.tsx';

vi.mock('../components/crm/useOrganizerCrmSession.ts', () => ({
  useOrganizerCrmSession: () => ({
    isOrganizer: true,
    isClubOwner: true,
    eventHost: null,
    showLoginModal: false,
    setShowLoginModal: vi.fn(),
    loginError: '',
    crmOverview: null,
    evenings: [],
    players: [],
    loading: false,
    loadError: null,
    retryLoad: vi.fn(),
    refreshSnapshotAfterEvening: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));
vi.mock('../components/crm/MoreCRM.tsx', () => ({
  MoreCRM: ({ activeScreen, onScreenChange, onOpenTasks, onOpenAnalytics }: any) => (
    <section>
      {activeScreen
        ? <button type="button" onClick={() => onScreenChange(null)}>Назад к меню</button>
        : <>
            <button type="button" onClick={() => onScreenChange('learning')}>Открыть обучение</button>
            <button type="button" onClick={onOpenTasks}>Открыть дела</button>
            <button type="button" onClick={onOpenAnalytics}>Открыть аналитику</button>
          </>}
    </section>
  ),
}));
vi.mock('../components/crm/CRMOverview.tsx', () => ({
  CRMOverview: () => <p>Сегодня</p>,
  navigateEveningSection: vi.fn(),
}));
vi.mock('../components/crm/AnalyticsCRM.tsx', () => ({ AnalyticsCRM: () => <p>Аналитика экрана</p> }));
vi.mock('../components/crm/OrganizerAgenda.tsx', () => ({ default: () => <p>Список дел</p> }));
vi.mock('../components/crm/CuratorTasksPanel.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/ThemeSelectorModal.tsx', () => ({ ThemeSelectorModal: () => null }));
vi.mock('../components/crm/PlayersHubCRM.tsx', () => ({ PlayersHubCRM: () => null }));
vi.mock('../components/crm/EveningsList.tsx', () => ({ EveningsList: () => null }));

let scrollY = 0;
let frames: FrameRequestCallback[] = [];
let oldScrollDescriptor: PropertyDescriptor | undefined;

function flushScrollFrames() {
  act(() => {
    const queued = frames.splice(0);
    for (const callback of queued) callback(0);
  });
}

function AppHarness() {
  const [pathname, setPathname] = useState('/admin/more');
  return (
    <>
      <button type="button" onClick={() => setPathname('/admin/more')}>Браузер назад</button>
      <OrganizerCRM pathname={pathname} onNavigate={(path) => setPathname(path)} />
    </>
  );
}

beforeEach(() => {
  scrollY = 0;
  frames = [];
  oldScrollDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
  vi.stubGlobal('scrollTo', vi.fn((options: ScrollToOptions) => { scrollY = Number(options.top ?? 0); }));
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (oldScrollDescriptor) Object.defineProperty(window, 'scrollY', oldScrollDescriptor);
});

describe('CRM «Ещё» menu scroll restoration', () => {
  it('returns to the selected menu position after a nested tool', () => {
    render(<AppHarness />);
    scrollY = 820;
    fireEvent.click(screen.getByRole('button', { name: 'Открыть обучение' }));
    flushScrollFrames();
    expect(scrollY).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Назад к меню' }));
    flushScrollFrames();
    expect(scrollY).toBe(820);
    expect(screen.getByRole('button', { name: 'Открыть обучение' })).toBeDefined();
  });

  it.each(['Открыть дела', 'Открыть аналитику'])('returns to the menu after %s', (target) => {
    render(<AppHarness />);
    scrollY = 510;
    fireEvent.click(screen.getByRole('button', { name: target }));
    flushScrollFrames();
    expect(scrollY).toBe(0);
    fireEvent.click(screen.getByTestId('crm-back-to-more'));
    flushScrollFrames();
    expect(scrollY).toBe(510);
    expect(screen.getByRole('button', { name: target })).toBeDefined();
  });

  it('restores the menu through a browser Back route change', () => {
    render(<AppHarness />);
    scrollY = 365;
    fireEvent.click(screen.getByRole('button', { name: 'Открыть обучение' }));
    flushScrollFrames();
    fireEvent.click(screen.getByRole('button', { name: 'Браузер назад' }));
    flushScrollFrames();
    expect(scrollY).toBe(365);
    expect(screen.getByRole('button', { name: 'Открыть обучение' })).toBeDefined();
  });

  it('does not restore an old menu scroll after switching to another primary tab', () => {
    render(<AppHarness />);
    scrollY = 700;
    fireEvent.click(screen.getByRole('button', { name: 'Открыть обучение' }));
    flushScrollFrames();
    fireEvent.click(screen.getByTestId('crm-header-home'));
    flushScrollFrames();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ещё' })[0]);
    flushScrollFrames();
    expect(scrollY).toBe(0);
  });
});
