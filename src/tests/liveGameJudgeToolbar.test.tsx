/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LiveGameJudgeToolbar from '../components/LiveGameEngine/LiveGameJudgeToolbar.tsx';
import { createEmptyActivePlayer } from '../components/LiveGameEngine/engineStateModel.ts';

afterEach(() => cleanup());

const players = [
  { ...createEmptyActivePlayer(1), nickname: 'Альфа' },
  { ...createEmptyActivePlayer(2), nickname: 'Бета' },
];

describe('Live Game judge toolbar', () => {
  it('delegates player, undo, role and view actions without owning game state', () => {
    const onSelectPlayer = vi.fn();
    const onUndo = vi.fn();
    const onToggleRoles = vi.fn();
    const onToggleView = vi.fn();

    render(
      <LiveGameJudgeToolbar
        activePlayers={players}
        onSelectPlayer={onSelectPlayer}
        speechExtensionAvailability={{ allowed: true, reason: '' }}
        onSpeechExtension={vi.fn()}
        historyLength={3}
        onUndo={onUndo}
        rolesAreVisible={false}
        onToggleRoles={onToggleRoles}
        viewMode="table"
        onToggleView={onToggleView}
        requiresTableSeatVoting={false}
      />,
    );

    fireEvent.change(screen.getByLabelText('Действия игрока'), { target: { value: '2' } });
    expect(onSelectPlayer).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: /Отмена \(3\)/ }));
    expect(onUndo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Показать роли' }));
    expect(onToggleRoles).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Список' }));
    expect(onToggleView).toHaveBeenCalledTimes(1);
  });

  it('preserves disabled speech-extension and forced-table semantics', () => {
    const onSpeechExtension = vi.fn();
    const onToggleView = vi.fn();

    render(
      <LiveGameJudgeToolbar
        activePlayers={players}
        onSelectPlayer={vi.fn()}
        speechExtensionAvailability={{ allowed: false, reason: 'Сейчас никто не говорит' }}
        onSpeechExtension={onSpeechExtension}
        historyLength={0}
        onUndo={vi.fn()}
        rolesAreVisible
        onToggleRoles={vi.fn()}
        viewMode="list"
        onToggleView={onToggleView}
        requiresTableSeatVoting
      />,
    );

    const extension = screen.getByTestId('live-speech-extension');
    expect((extension as HTMLButtonElement).disabled).toBe(true);
    expect(extension.getAttribute('title')).toBe('Сейчас никто не говорит');
    fireEvent.click(extension);
    expect(onSpeechExtension).not.toHaveBeenCalled();

    expect(screen.getByRole('button', { name: /Отмена \(0\)/ })).toBeDisabled();

    const lockedView = screen.getByRole('button', { name: 'Стол для голосования' });
    expect((lockedView as HTMLButtonElement).disabled).toBe(true);
    expect(lockedView.getAttribute('title')).toBe('Во время голосования используется стол');
    fireEvent.click(lockedView);
    expect(onToggleView).not.toHaveBeenCalled();
  });
});
