// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WelcomePage from '../components/public/WelcomePage.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const page = { promo: { headline: 'Вечер для новичков', firstTimeTitle: '', firstTimeText: 'Правила объясним с нуля.', title: 'Мафия', intro: 'Игра умов.', reasonsTitle: '', reasons: ['🧠 Думаешь'] },
  evening: { id: 'e1', title: 'Новички', starts_at: '2026-11-14T16:00:00Z', venue: { name: 'Суп с Котом', address: 'Тула', mapUrl: 'https://yandex.ru/maps' }, schedule: 'Рассказываем правила — 18:30, первая игра — 19:00', price: '200 ₽ за игру', join_url: '/join/e1', telegram_url: 'https://t.me/bot?start=event_e1' },
  contacts: [{ label: 'Telegram', url: 'https://t.me/x' }], vk_group: null, telegram_group: null };

describe('welcome page for newcomers', () => {
  it('shows the evening and takes a contact, then says what happens next', async () => {
    const calls: Array<[string, any]> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push([url, init?.body ? JSON.parse(init.body) : null]);
      if (url === '/api/public/welcome') return new Response(JSON.stringify(page));
      if (url === '/api/public/welcome/lead') return new Response(JSON.stringify({ ok: true, created: true }), { status: 201 });
      return new Response(JSON.stringify({ ok: true }));
    }));
    render(<WelcomePage />);
    expect(await screen.findByText('Суп с Котом')).toBeTruthy();
    expect(screen.getByText('200 ₽ за игру')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Как вас зовут/), { target: { value: 'Иван' } });
    fireEvent.change(screen.getByLabelText(/Ваш ник в Telegram/), { target: { value: '@ivan_tg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Хочу на вечер' }));
    expect(await screen.findByTestId('welcome-done')).toBeTruthy();
    const lead = calls.find(([url]) => url === '/api/public/welcome/lead');
    expect(lead?.[1]).toMatchObject({ name: 'Иван', contact_kind: 'telegram', contact_value: '@ivan_tg', website: '' });
    expect(calls.some(([url]) => url === '/api/public/welcome/visit')).toBe(true);
  });
  it('keeps the button off until a name and a contact are given and shows a server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/public/welcome' ? new Response(JSON.stringify({ ...page, evening: null })) : url === '/api/public/welcome/lead' ? new Response(JSON.stringify({ error: 'Укажите ник в Telegram' }), { status: 400 }) : new Response('{}')));
    render(<WelcomePage />);
    await screen.findByText(/пока не объявлена/);
    const button = screen.getByRole('button', { name: 'Хочу на вечер' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Как вас зовут/), { target: { value: 'Иван' } });
    fireEvent.change(screen.getByLabelText(/Ваш ник в Telegram/), { target: { value: 'x' } });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Укажите ник'));
  });
});
