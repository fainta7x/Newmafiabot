// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WelcomePage from '../components/public/WelcomePage.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const page = { content: { title: 'Школа спортивной мафии | Тула', lead: 'Любишь азарт соревнований? Тогда тебе к нам!', about: 'Спортивная мафия — интеллектуальная дисциплина.', sections: [{ title: '🎯 Кому к нам?', items: ['Любителям шахмат и покера.'] }] },
  evening: { id: 'e1', title: 'Новички', starts_at: '2026-11-14T16:00:00Z', venue: { name: 'Суп с Котом', address: 'Тула', mapUrl: 'https://yandex.ru/maps' }, schedule: 'Рассказываем правила — 18:30, первая игра — 19:00', price: 'Первые 2 вечера бесплатно, дальше — 200 ₽ за игру', join_url: '/join/e1', telegram_url: 'https://t.me/bot?start=event_e1' },
  contacts: [{ label: 'Telegram', url: 'https://t.me/x' }], vk_group: null, telegram_group: null };

const seatsNow = { evening_id: 'e1', going: 2, updated_at: '2026-11-12T10:00:00Z', games: [{ number: 1, starts_at: '2026-11-14T16:00:00Z', target: 5, taken: 2, people: ['Алоэ', 'Богдан'] }] };

describe('welcome page for newcomers', () => {
  it('shows the evening and takes a contact, then says what happens next', async () => {
    const calls: Array<[string, any]> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push([url, init?.body ? JSON.parse(init.body) : null]);
      if (url === '/api/public/welcome') return new Response(JSON.stringify(page));
      if (url === '/api/public/welcome/seats') return new Response(JSON.stringify(seatsNow));
      if (url === '/api/public/welcome/lead') return new Response(JSON.stringify({ ok: true, created: true }), { status: 201 });
      return new Response(JSON.stringify({ ok: true }));
    }));
    render(<WelcomePage />);
    expect(await screen.findByText('Суп с Котом')).toBeTruthy();
    expect(screen.getByText(/Первые 2 вечера бесплатно/)).toBeTruthy();
    expect(screen.getByText('Школа спортивной мафии | Тула')).toBeTruthy();
    expect(screen.getByText('🎯 Кому к нам?')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Как тебя зовут/), { target: { value: 'Иван' } });
    fireEvent.change(screen.getByLabelText(/Твой ник в Telegram/), { target: { value: '@ivan_tg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить заявку' }));
    expect(await screen.findByTestId('welcome-done')).toBeTruthy();
    const lead = calls.find(([url]) => url === '/api/public/welcome/lead');
    expect(lead?.[1]).toMatchObject({ name: 'Иван', contact_kind: 'telegram', contact_value: '@ivan_tg', website: '' });
    expect(calls.some(([url]) => url === '/api/public/welcome/visit')).toBe(true);
  });
  it('keeps the button off until a name and a contact are given and shows a server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/public/welcome' ? new Response(JSON.stringify({ ...page, evening: null })) : url === '/api/public/welcome/lead' ? new Response(JSON.stringify({ error: 'Укажите ник в Telegram' }), { status: 400 }) : new Response('{}')));
    render(<WelcomePage />);
    await screen.findByText(/пока не объявлена/);
    const button = screen.getByRole('button', { name: 'Отправить заявку' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Как тебя зовут/), { target: { value: 'Иван' } });
    fireEvent.change(screen.getByLabelText(/Твой ник в Telegram/), { target: { value: 'x' } });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Укажите ник'));
  });

  it('draws the seats that are taken and marks a new registration that appears while the page is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let reads = 0;
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url === '/api/public/welcome') return new Response(JSON.stringify({ ...page, hero_photos: ['/announce-photo/a.jpg', '/announce-photo/b.jpg'] }));
        if (url === '/api/public/welcome/seats') {
          reads += 1;
          const people = reads === 1 ? ['Алоэ', 'Богдан'] : ['Алоэ', 'Богдан', 'Чагин'];
          return new Response(JSON.stringify({ ...seatsNow, going: people.length, games: [{ ...seatsNow.games[0], taken: people.length, people }] }));
        }
        return new Response('{}');
      }));
      render(<WelcomePage />);
      const board = await screen.findByTestId('welcome-seats');
      expect(board.textContent).toContain('Алоэ');
      expect(screen.getByText(/свободно 3 из 5/)).toBeTruthy();
      expect(screen.getByTestId('welcome-hero')).toBeTruthy();
      await vi.advanceTimersByTimeAsync(10_500);
      await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Новая запись: Чагин'));
      expect(screen.getByText(/свободно 2 из 5/)).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });
});
