/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerReplayScreen from '../components/player/PlayerReplayScreen.tsx';
vi.mock('../components/public/LiveBroadcastOverlay.tsx', () => ({ default: () => <div>Сохранённый кадр OBS</div> }));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const replay = { game_key: 'club:11', replay_available: true, game: { id: '11', number: 11, title: 'Клубный вечер', created_at: null, winner_team: 'red' }, events: ['Начало', 'Ночь', 'Финал'].map((title, index) => ({ id: String(index), type: index === 1 ? 'night' : 'round', round: index, title, text: title })), analysis: [] };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Replay recovery', () => {
  it('retries Replay, then retries speech clips without reloading Replay or changing its step', async () => {
    let replays = 0, speeches = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/replay')) return ++replays === 1 ? json({ error: 'Нет связи с Replay' }, 503) : json(replay);
      return ++speeches === 1 ? json({ error: 'Записи временно недоступны' }, 503) : json({ clips: [] });
    }));
    render(<PlayerReplayScreen gameKey="club:11" />);
    await screen.findByText('Нет связи с Replay');
    expect(screen.getByRole('button', { name: 'Назад к протоколу' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await screen.findByText('Записи временно недоступны');
    const position = screen.getByRole('slider', { name: 'Шаг старой хронологии' });
    fireEvent.change(position, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку речей' }));
    await screen.findByText('Для этой игры сохранённых речей нет.');
    expect((position as HTMLInputElement).value).toBe('2');
    expect(replays).toBe(2);
    expect(speeches).toBe(2);
    expect(screen.queryByRole('button', { name: 'Повторить загрузку речей' })).toBeNull();
  });

  it('stops playback when switching to a different game', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => json(url.endsWith('/replay') ? { ...replay, replay_frames: [0, 1].map(index => ({ state: { roundNumber: index, phaseKey: 'day_speeches', phaseTitle: 'Речь' } })) } : { clips: [] })));
    const { rerender } = render(<PlayerReplayScreen gameKey="club:11" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Воспроизвести ▶' }));
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeDefined();
    rerender(<PlayerReplayScreen gameKey="club:12" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Воспроизвести ▶' })).toBeDefined());
    expect(screen.queryByRole('button', { name: 'Пауза' })).toBeNull();
  });
});
