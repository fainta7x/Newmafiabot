// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerActionOverlay } from '../components/LiveGameEngine/LiveGameOverlays';
import type { ActivePlayerState } from '../components/LiveGameEngine/types';
import type { PlayerDiscipline } from '../lib/gameDiscipline';

const exitedPlayer = (overrides: Partial<ActivePlayerState> = {}): ActivePlayerState => ({
  slot_num: 4,
  user_id: 4,
  nickname: 'Игрок 4',
  role: 'Мирный',
  team: 'Красные',
  fouls: 0,
  alive: false,
  nominated_this_round: false,
  has_spoken_this_round: true,
  mute_this_round: false,
  is_pu: false,
  best_move_guesses: [],
  kick: false,
  ppk: false,
  bonus_points: 0,
  lh_points: 0,
  will_protocol_points: 0,
  will_opinion_points: 0,
  dc_points: 0,
  eliminated_phase: 'Заголосован',
  exit_reason: 'voted_day',
  ...overrides,
});

const disciplinePlayer = (overrides: Partial<PlayerDiscipline> = {}): PlayerDiscipline => ({
  id: '4',
  team: 'red',
  regularFouls: 0,
  minorTechFouls: 0,
  majorTechFouls: 0,
  isRemoved: false,
  removedReason: null,
  secondTechFoulType: null,
  gamePenalty: 0,
  pendingAction: null,
  ppkCaused: false,
  has30SecPenalty: false,
  ...overrides,
});

const renderActions = ({
  player = exitedPlayer(),
  discipline = disciplinePlayer(),
  mode = 'standard',
}: {
  player?: ActivePlayerState;
  discipline?: PlayerDiscipline;
  mode?: 'standard' | 'farewell';
} = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onAddRegularFoul: vi.fn(),
    onRemoveRegularFoul: vi.fn(),
    onAddTechFoul: vi.fn(),
    onToggleNomination: vi.fn(),
    onDirectRemove: vi.fn(),
    onPpk: vi.fn(),
    onEditNote: vi.fn(),
    onRestorePlayer: vi.fn(),
  };

  render(
    <PlayerActionOverlay
      player={player}
      mode={mode}
      disciplinePlayer={discipline}
      activeSpeakerSlot={null}
      nominations={[]}
      nominationBlockedBySpeaker={false}
      {...handlers}
    />,
  );

  return handlers;
};

afterEach(cleanup);

describe('Live Game actions for players outside the table', () => {
  it('allows direct removal and PPK for a player eliminated by voting', () => {
    const handlers = renderActions();

    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    fireEvent.click(screen.getByRole('button', { name: 'ППК' }));

    expect(handlers.onDirectRemove).toHaveBeenCalledWith(4);
    expect(handlers.onPpk).toHaveBeenCalledWith(4);
    expect(screen.getByRole('button', { name: 'Вернуть за стол' })).toBeTruthy();
  });

  it('keeps PPK available after removal without offering a duplicate removal', () => {
    const handlers = renderActions({
      player: exitedPlayer({ kick: true, removal_reason: 'direct', exit_reason: 'removed' }),
      discipline: disciplinePlayer({ isRemoved: true, removedReason: 'direct' }),
    });

    expect(screen.queryByRole('button', { name: 'Удалить' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ППК' }));

    expect(handlers.onPpk).toHaveBeenCalledWith(4);
    expect(screen.getByRole('button', { name: 'Вернуть за стол' })).toBeTruthy();
  });

  it('keeps foul controls, direct removal and PPK during a killed player farewell', () => {
    renderActions({
      player: exitedPlayer({ eliminated_phase: 'Убит ночью', exit_reason: 'killed' }),
      mode: 'farewell',
    });

    expect(screen.getByRole('button', { name: '+ Обычный фол' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Малый тех' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ППК' })).toBeTruthy();
  });
});
