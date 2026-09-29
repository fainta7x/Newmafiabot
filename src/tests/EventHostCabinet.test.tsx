/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventHostCabinet } from '../components/crm/EventHostCabinet.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const soon = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();
const evenings = [
  { id: 'mine', title: 'Мой вечер', starts_at: soon(24), format: 'CASUAL', status: 'draft', registered_count: 3, organizer_player_id: 'me' },
  { id: 'other', title: 'Чужой вечер', starts_at: soon(48), format: 'CASUAL', status: 'published', registered_count: 9, organizer_player_id: 'x', organizer_nickname: 'Хозяин' },
] as any[];

describe('EventHostCabinet', () => {
  it('opens only own evenings and names who runs the others', () => {
    const onOpen = vi.fn();
    render(<EventHostCabinet playerId="me" formats={['CASUAL']} evenings={evenings} onOpenEvening={onOpen} onChanged={() => undefined} />);
    fireEvent.click(screen.getByTestId('event-host-evening-mine'));
    expect(onOpen).toHaveBeenCalledWith('mine');
    const other = screen.getByTestId('event-host-evening-other');
    expect(other.tagName).toBe('DIV');
    expect(other.textContent).toContain('Проводит Хозяин');
  });

  it('offers only the kinds of evenings the owner marked', () => {
    render(<EventHostCabinet playerId="me" formats={['NOVICE', 'RATING']} evenings={[]} onOpenEvening={() => undefined} onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Создать вечер/ }));
    const kinds = Array.from((screen.getByRole('combobox') as HTMLSelectElement).options).map((option) => option.value);
    expect(kinds).toEqual(['NOVICE', 'RATING']);
  });

  it('keeps an old own evening that is not closed yet, hides old closed ones', () => {
    const old = new Date(Date.now() - 5 * 86400_000).toISOString();
    render(<EventHostCabinet playerId="me" formats={['CASUAL']} evenings={[
      { id: 'stuck', title: 'Незакрытый', starts_at: old, format: 'CASUAL', status: 'active', organizer_player_id: 'me' },
      { id: 'done', title: 'Закрытый', starts_at: old, format: 'CASUAL', status: 'completed', organizer_player_id: 'me' },
      { id: 'foreign', title: 'Чужой старый', starts_at: old, format: 'CASUAL', status: 'active', organizer_player_id: 'x' },
    ] as any[]} onOpenEvening={() => undefined} onChanged={() => undefined} />);
    expect(screen.queryByTestId('event-host-evening-stuck')).not.toBeNull();
    expect(screen.queryByTestId('event-host-evening-done')).toBeNull();
    expect(screen.queryByTestId('event-host-evening-foreign')).toBeNull();
  });
});
