/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/crm/EveningStartTimeEditor.tsx', () => ({
  default: () => <div data-testid="route-inline-timing">Редактор времени</div>,
}));
vi.mock('../components/crm/EveningAnnouncementSettings.tsx', () => ({
  default: () => <div data-testid="route-inline-announcement">Каналы Telegram и VK</div>,
}));
vi.mock('../components/crm/GatheredPostSheet.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/TodayPostSheet.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/CancelEveningSheet.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/EveningGameRegistrationDashboard.tsx', () => ({
  default: () => <div data-testid="evening-main-answers">Ответы и игры</div>,
}));
vi.mock('../components/crm/EveningInviteAudienceManager.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/EveningPersonalInvites.tsx', () => ({
  default: () => <div data-testid="evening-personal-contacts">Список личных контактов</div>,
}));

import EveningRouteView from '../components/crm/EveningRouteView.tsx';
import { EveningParticipantsView } from '../components/crm/EveningParticipantsView.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('evening route inline controls', () => {
  it('opens schedule and Telegram/VK settings under their own preparation steps', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      evening: { id: 'ev', status: 'published', starts_at: '2026-10-16T21:00:00+03:00' },
      current_stage: 'gather',
      open_stage: 'gather',
      stages: [
        { id: 'prepare', title: 'Подготовка', hint: 'Готовим', state: 'attention', steps: [
          { id: 'timing', title: 'Дата и время вечера', detail: '16 октября · 21:00 (МСК)', status: 'info' },
          { id: 'posts', title: 'Анонс в Telegram и ВК', detail: 'План: понедельник, 19:00', status: 'todo' },
        ] },
        { id: 'gather', title: 'Сбор', hint: 'Ожидаем игроков', state: 'current', steps: [] },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    render(<EveningRouteView eveningId="ev" onOpenSection={vi.fn()} />);
    const prepare = await screen.findByTestId('evening-route-stage-prepare');
    fireEvent.click(within(prepare).getByRole('button', { name: /Подготовка/ }));
    expect(screen.queryByTestId('route-inline-timing')).toBeNull();
    fireEvent.click(within(prepare).getByRole('button', { name: 'Дата и время вечера' }));
    expect(screen.getByTestId('route-inline-timing')).not.toBeNull();
    fireEvent.click(within(prepare).getByRole('button', { name: 'Анонс в Telegram и ВК' }));
    expect(screen.queryByTestId('route-inline-timing')).toBeNull();
    expect(screen.getByTestId('route-inline-announcement')).not.toBeNull();
  });

  it('shows one unified worklist under Answers, without a separate personal-contacts list', () => {
    render(<EveningParticipantsView eveningId="ev" onBack={vi.fn()} />);
    expect(screen.getByTestId('evening-main-answers')).not.toBeNull();
    expect(screen.queryByTestId('evening-personal-contacts')).toBeNull();
    expect(screen.queryByRole('button', { name: /Написать игрокам лично/ })).toBeNull();
  });
});

describe('«Начать вечер» asks first (owner, 2026-10-22)', () => {
  it('shows the shortfall in the question and starts only after «Начать»', async () => {
    const calls: Array<{ method: string; body: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') { calls.push({ method: 'PATCH', body: String(init.body) }); return new Response(JSON.stringify({ id: 'ev', status: 'active' }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
      return new Response(JSON.stringify({
        evening: { id: 'ev', status: 'published', starts_at: new Date(Date.now() + 6 * 3600_000).toISOString() },
        current_stage: 'gather', open_stage: 'gather',
        stages: [{ id: 'gather', title: 'Сбор', hint: 'Ждём', state: 'current', steps: [
          { id: 'shortfall', title: 'Недобор: набрано 0 из 2 нужных игр', detail: '1-я 4/9', status: 'attention' },
          { id: 'start', title: 'Начать вечер', status: 'todo', action: 'start' },
        ] }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<EveningRouteView eveningId="ev" onOpenSection={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Начать вечер' }));
    expect(await screen.findByText('Начать вечер?')).toBeTruthy();
    expect(within(screen.getByRole('alertdialog')).getByText(/Недобор: набрано 0 из 2 нужных игр/)).toBeTruthy();
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    await vi.waitFor(() => expect(calls.some((call) => call.body.includes('"active"'))).toBe(true));
  });
});
