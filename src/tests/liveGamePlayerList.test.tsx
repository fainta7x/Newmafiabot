/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LiveGamePlayerList from '../components/LiveGameEngine/LiveGamePlayerList.tsx';
import { createEmptyActivePlayer } from '../components/LiveGameEngine/engineStateModel.ts';

afterEach(() => cleanup());

describe('Live Game player list', () => {
  it('renders alive/eliminated status and delegates player selection', () => {
    const onSelectPlayer = vi.fn();
    const players = [
      { ...createEmptyActivePlayer(1), nickname: 'Альфа' },
      {
        ...createEmptyActivePlayer(2),
        nickname: 'Бета',
        alive: false,
        eliminated_phase: 'Заголосован',
        exit_reason: 'voted_day' as const,
      },
    ];

    render(<LiveGamePlayerList activePlayers={players} onSelectPlayer={onSelectPlayer} />);

    expect(screen.getByText('Жив')).toBeTruthy();
    expect(screen.getByText('Заголосован')).toBeTruthy();
    expect(screen.getAllByText('Открыть действия игрока')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /#2 Бета/ }));
    expect(onSelectPlayer).toHaveBeenCalledWith(2);
  });

  it('preserves distinct alive and eliminated card presentation classes', () => {
    const players = [
      { ...createEmptyActivePlayer(1), nickname: 'Альфа' },
      {
        ...createEmptyActivePlayer(2),
        nickname: 'Бета',
        alive: false,
        eliminated_phase: 'Убит ночью',
        exit_reason: 'killed' as const,
      },
    ];

    render(<LiveGamePlayerList activePlayers={players} onSelectPlayer={vi.fn()} />);

    const alive = screen.getByRole('button', { name: /#1 Альфа/ });
    const eliminated = screen.getByRole('button', { name: /#2 Бета/ });

    expect(alive.className).toContain('bg-slate-900/50');
    expect(alive.className).toContain('border-slate-800');
    expect(eliminated.className).toContain('bg-rose-950/20');
    expect(eliminated.className).toContain('border-rose-950');
    expect(eliminated.className).toContain('opacity-70');
  });
});
