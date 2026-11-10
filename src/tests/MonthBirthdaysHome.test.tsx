/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MonthBirthdaysHome from '../components/crm/MonthBirthdaysHome.tsx';

const reply = (items: unknown[]) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ month_label: 'ноябре', items }), { status: 200 })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('«Дни рождения» on the CRM home', () => {
  it('shows the upcoming ones, folds the passed ones and opens the player', async () => {
    reply([{ player_id: 'b', nickname: 'Богдан', day: 3, date_label: '3 ноября', days_left: -7 }, { player_id: 'a', nickname: 'Алоэ', day: 10, date_label: '10 ноября', days_left: 0 }, { player_id: 'c', nickname: 'Чага', day: 20, date_label: '20 ноября', days_left: 10 }]);
    const open = vi.fn();
    render(<MonthBirthdaysHome onOpenPlayer={open} />);
    expect((await screen.findByTestId('crm-month-birthdays')).textContent).toContain('Дни рождения в ноябре');
    expect(screen.getByText('сегодня')).toBeDefined();
    expect(screen.getByText('через 10 дн.')).toBeDefined();
    expect(screen.getByText(/Уже прошли · 1/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Алоэ/ }));
    expect(open).toHaveBeenCalledWith('a');
  });
  it('is hidden when nobody has a birthday this month', async () => {
    reply([]);
    const { container } = render(<MonthBirthdaysHome />);
    await Promise.resolve();
    expect(container.querySelector('[data-testid="crm-month-birthdays"]')).toBeNull();
  });
});
