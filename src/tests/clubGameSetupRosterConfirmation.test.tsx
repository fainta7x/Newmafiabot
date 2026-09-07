// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClubGameSetupPhase from '../components/LiveGameEngine/ClubGameSetupPhase';

vi.mock('../components/game/PhysicalRoleDeal.tsx', () => ({
  default: () => <div data-testid="physical-role-deal-mock">role deal</div>,
}));

const players = Array.from({ length: 10 }, (_, index) => ({
  user_id: index + 1,
  nickname: `Игрок ${index + 1}`,
})) as any;

const activePlayers = Array.from({ length: 10 }, (_, index) => ({
  slot_num: index + 1,
  user_id: index + 1,
  nickname: `Игрок ${index + 1}`,
  role: 'Мирный',
  team: 'Красные',
})) as any;

const renderSetup = (roster = activePlayers) => render(
  <ClubGameSetupPhase
    players={players}
    activePlayers={roster}
    handleAutoFillSetupPlayers={vi.fn()}
    handleSelectSetupRole={vi.fn()}
    onCancel={vi.fn()}
    validateSetupAndStart={vi.fn()}
  />,
);

afterEach(() => cleanup());

describe('ClubGameSetupPhase roster confirmation', () => {
  it('requires an explicit roster confirmation before physical role dealing', () => {
    renderSetup();

    const primary = screen.getByTestId('club-game-start-role-deal') as HTMLButtonElement;
    expect(primary.textContent).toContain('Подтвердить состав');
    expect(primary.disabled).toBe(false);
    expect(screen.queryByTestId('physical-role-deal-mock')).toBeNull();

    fireEvent.click(primary);
    expect(screen.getByTestId('club-game-roster-confirmed')).toBeTruthy();
    expect(primary.textContent).toContain('Начать раздачу ролей');
    expect(screen.queryByTestId('physical-role-deal-mock')).toBeNull();

    fireEvent.click(primary);
    expect(screen.getByTestId('physical-role-deal-mock')).toBeTruthy();
  });

  it('blocks confirmation and dealing while the table is incomplete', () => {
    const incomplete = activePlayers.map((player: any) => ({ ...player }));
    incomplete[9].user_id = 0;
    incomplete[9].nickname = '';
    renderSetup(incomplete);

    const primary = screen.getByTestId('club-game-start-role-deal') as HTMLButtonElement;
    expect(primary.disabled).toBe(true);
    expect(primary.textContent).toContain('Нужно 10 разных игроков');
    expect(screen.getByText('9/10', { exact: true })).toBeTruthy();
    expect(screen.getByText('Не выбран', { exact: true })).toBeTruthy();
    expect(screen.queryByTestId('physical-role-deal-mock')).toBeNull();
  });

  it('invalidates confirmation when any selected player changes', () => {
    const { rerender } = renderSetup();
    const primary = screen.getByTestId('club-game-start-role-deal') as HTMLButtonElement;
    fireEvent.click(primary);
    expect(screen.getByTestId('club-game-roster-confirmed')).toBeTruthy();

    const changed = activePlayers.map((player: any) => ({ ...player }));
    changed[0].user_id = 99;
    changed[0].nickname = 'Замена';
    rerender(
      <ClubGameSetupPhase
        players={[...players, { user_id: 99, nickname: 'Замена' }] as any}
        activePlayers={changed}
        handleAutoFillSetupPlayers={vi.fn()}
        handleSelectSetupRole={vi.fn()}
        onCancel={vi.fn()}
        validateSetupAndStart={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('club-game-roster-confirmed')).toBeNull();
    expect((screen.getByTestId('club-game-start-role-deal') as HTMLButtonElement).textContent).toContain('Подтвердить состав');
    expect(screen.queryByTestId('physical-role-deal-mock')).toBeNull();
  });
});
