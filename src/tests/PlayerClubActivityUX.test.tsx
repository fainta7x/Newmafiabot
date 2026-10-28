/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerClubActivity from '../components/player/PlayerClubActivity.tsx';
import { openCanonicalPlayerProfile } from '../components/player/playerProfileNavigation.ts';

vi.mock('../components/player/playerProfileNavigation.ts', () => ({ openCanonicalPlayerProfile: vi.fn() }));

const ranking = Array.from({ length: 6 }, (_, i) => ({
  place: i + 1, player_id: 'p' + (i + 1), nickname: 'Игрок ' + (i + 1),
  avatar_url: '', games: 6, wins: i + 1, win_rate: 16 + 12 * i,
  streak: i + 1, score: 45 - i * 4, movement: i === 0 ? null : i % 2 ? 2 : -1,
}));
const form = {
  viewer_id: 'p6', players_with_form: 6,
  highlights: [{ player_id: 'p2', nickname: 'Игрок 2', avatar_url: '', type: 'win_streak', text: 'Три победы подряд' }],
  power_ranking: ranking,
  meta: { formula: 'Учитываем результаты последних игр и серии побед.' },
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ЛК «Сообщество → Игроки → Форма»: readable ranking and actions', () => {
  it('makes each ranking card a real profile action and always shows own standing outside top five', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(form)));
    render(<PlayerClubActivity />);
    const own = await screen.findByTestId('player-form-own-position');
    expect(own.textContent).toContain('Игрок 6');
    expect(own.textContent).toContain('25');
    expect(screen.getByTestId('player-form-own-preview')).toBeDefined();
    expect(screen.queryByTestId('player-form-row-p6')).toBeNull();
    const first = screen.getByTestId('player-form-row-p1');
    expect(first.textContent).toContain('баллы формы');
    expect(first.textContent).toContain('Побед: 1 из 6 игр');
    fireEvent.click(first);
    expect(openCanonicalPlayerProfile).toHaveBeenCalledExactlyOnceWith('p1');
    fireEvent.click(own);
    expect(openCanonicalPlayerProfile).toHaveBeenCalledWith('p6');

    fireEvent.click(screen.getByRole('button', { name: 'Показать места 6–6' }));
    expect(screen.getByTestId('player-form-row-p6')).toBeDefined();
    expect(screen.queryByTestId('player-form-own-position')).toBeNull();
    expect(screen.getAllByTestId(/^player-form-row-/)).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть список' }));
    expect(screen.getAllByTestId(/^player-form-row-/)).toHaveLength(5);
    expect(screen.getByTestId('player-form-own-position')).toBeDefined();
  });

  it('keeps spotlight profiles tappable and explains the original formula only on demand', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(form)));
    render(<PlayerClubActivity />);
    const root = await screen.findByTestId('player-club-form');
    const highlight = within(root).getByRole('button', { name: 'Открыть профиль Игрок 2' });
    fireEvent.click(highlight);
    expect(openCanonicalPlayerProfile).toHaveBeenCalledWith('p2');
    expect(screen.getByText('Что значат баллы Формы')).toBeDefined();
    expect(screen.getByTestId('form-explanation').textContent).toContain('Максимум — 115 баллов');
    expect(screen.getByTestId('form-explanation').textContent).toContain('97 баллов');
    expect(screen.getByTestId('form-explanation').textContent).toContain('38 баллов');
  });

  it('distinguishes service errors from no players and recovers in place after retry', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      attempts++;
      return attempts === 1 ? response({ error: 'Нет данных сейчас' }, 503) : response(form);
    }));
    render(<PlayerClubActivity />);
    const error = await screen.findByTestId('player-form-error');
    expect(error.textContent).toContain('Нет данных сейчас');
    expect(screen.queryByText('Пока недостаточно завершённых игр для формы клуба.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(screen.getByTestId('player-form-own-position')).toBeDefined());
    expect(screen.queryByTestId('player-form-error')).toBeNull();
    expect(attempts).toBe(2);
  });

  it('preserves the genuine empty view without suggesting unavailable results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ ...form, highlights: [], power_ranking: [], players_with_form: 0 })));
    render(<PlayerClubActivity />);
    await screen.findByText('Пока недостаточно завершённых игр для формы клуба.');
    expect(screen.queryByTestId('player-form-error')).toBeNull();
    expect(screen.queryByTestId('player-form-own-position')).toBeNull();
  });
});
