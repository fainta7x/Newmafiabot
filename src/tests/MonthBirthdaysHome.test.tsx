/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MonthBirthdaysHome from '../components/crm/MonthBirthdaysHome.tsx';

const reply = (data: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(data), { status: 200 })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('«Ближайшие дни рождения» on the CRM home', () => {
  it('shows the nearest ones with «сегодня / через N дн.» and opens the player', async () => {
    reply({ window_days: 45, with_date: 3, total: 5, items: [{ player_id: 'a', nickname: 'Алоэ', date_label: '10 ноября', days_left: 0 }, { player_id: 'c', nickname: 'Чага', date_label: '12 декабря', days_left: 32 }] });
    const open = vi.fn();
    render(<MonthBirthdaysHome onOpenPlayer={open} />);
    expect((await screen.findByTestId('crm-month-birthdays')).textContent).toContain('Ближайшие дни рождения');
    expect(screen.getByText('сегодня')).toBeDefined();
    expect(screen.getByText('через 32 дн.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Алоэ/ }));
    expect(open).toHaveBeenCalledWith('a');
  });
  it('stays on the screen with a clear text when nobody has one soon', async () => {
    reply({ window_days: 45, with_date: 11, total: 40, items: [] });
    render(<MonthBirthdaysHome />);
    expect((await screen.findByTestId('crm-month-birthdays')).textContent).toContain('Дата указана у 11 из 40 игроков');
  });
});
