// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeveloperTestModeCRM from '../components/crm/DeveloperTestModeCRM.tsx';

vi.mock('../components/crm/SystemStatusCard.tsx', () => ({ SystemStatusCard: () => null }));

const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('Тестовый режим: where the owner is now', () => {
  const assign = vi.fn();
  beforeEach(() => {
    assign.mockReset();
    Object.defineProperty(window, 'location', { value: { assign }, writable: true });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('in the real club it says so and leads to /test-login', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply({ enabled: true, active: false })));
    render(<DeveloperTestModeCRM />);
    expect(await screen.findByText('Вы в рабочем режиме')).toBeTruthy();
    fireEvent.click(screen.getByText('Открыть тестовую среду'));
    expect(assign).toHaveBeenCalledWith('/test-login');
  });

  it('in the sandbox it says so and offers to leave', async () => {
    const fetchMock = vi.fn((url: string) => reply(String(url).endsWith('logout') ? { success: true, redirectTo: '/test-login' } : { enabled: true, active: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<DeveloperTestModeCRM />);
    expect(await screen.findByText('Вы в тестовой среде')).toBeTruthy();
    expect(screen.queryByText('Открыть тестовую среду')).toBeNull();
    fireEvent.click(screen.getByText('Выйти из тестовой среды'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/test-login'));
  });

  it('says when the test environment is switched off on the server', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply({ enabled: false, active: false })));
    render(<DeveloperTestModeCRM />);
    expect(await screen.findByText('Тестовая среда на сервере сейчас отключена.')).toBeTruthy();
    expect(screen.queryByText('Открыть тестовую среду')).toBeNull();
  });
});
