import { describe, expect, it } from 'vitest';
import {
  getConfirmedPlayerDisciplineUpdates,
  getRegularFoulChange,
  getTechFoulChange
} from '../components/crm/tournaments/protocol/protocolDisciplineUtils';
import { PlayerResultData } from '../lib/api';

const createPlayer = (
  overrides: Partial<PlayerResultData> = {}
): PlayerResultData => ({
  participant_id: 'p-1',
  player_id: 'player-1',
  seat_number: 1,
  display_name: 'Player 1',
  role: 'citizen',
  exit_type: 'alive',
  exit_order: null,
  regular_fouls: 0,
  minor_technical_fouls: 0,
  major_technical_fouls: 0,
  technical_fouls: 0,
  judge_bonus: 0,
  protocol_bonus: 0,
  penalty_points: 0,
  color_protocol: [],
  notes: null,
  removal_reason: null,
  ...overrides
});

describe('protocol discipline utilities', () => {
  it('requests confirmation before assigning a fourth regular foul', () => {
    const player = createPlayer({ regular_fouls: 3 });
    expect(getRegularFoulChange(player, 1)).toEqual({
      kind: 'confirm',
      action: 'foul_4'
    });
  });

  it('restores a player when the fourth foul is removed', () => {
    const player = createPlayer({
      regular_fouls: 4,
      exit_type: 'removed',
      removal_reason: '4th_foul'
    });
    expect(getRegularFoulChange(player, -1)).toEqual({
      kind: 'update',
      updates: {
        regular_fouls: 3,
        exit_type: 'alive',
        removal_reason: null
      }
    });
  });

  it('adds the first technical foul without confirmation', () => {
    const player = createPlayer();
    expect(getTechFoulChange(player, 'minor', 1)).toEqual({
      kind: 'update',
      updates: {
        minor_technical_fouls: 1,
        technical_fouls: 1
      }
    });
  });

  it('requests confirmation before assigning a second technical foul', () => {
    const player = createPlayer({ minor_technical_fouls: 1, technical_fouls: 1 });
    expect(getTechFoulChange(player, 'major', 1)).toEqual({
      kind: 'confirm',
      action: 'tech_2',
      techType: 'major'
    });
  });

  it('restores a player when a second technical foul is removed', () => {
    const player = createPlayer({
      minor_technical_fouls: 1,
      major_technical_fouls: 1,
      technical_fouls: 2,
      exit_type: 'removed',
      removal_reason: '2nd_tech'
    });
    expect(getTechFoulChange(player, 'major', -1)).toEqual({
      kind: 'update',
      updates: {
        major_technical_fouls: 0,
        technical_fouls: 1,
        exit_type: 'alive',
        removal_reason: null
      }
    });
  });

  it('builds confirmed removal updates without changing UI state', () => {
    const player = createPlayer({ minor_technical_fouls: 1, technical_fouls: 1 });

    expect(getConfirmedPlayerDisciplineUpdates(player, 'direct_removal')).toEqual({
      exit_type: 'removed',
      removal_reason: 'direct'
    });
    expect(getConfirmedPlayerDisciplineUpdates(player, 'foul_4')).toEqual({
      regular_fouls: 4,
      exit_type: 'removed',
      removal_reason: '4th_foul'
    });
    expect(getConfirmedPlayerDisciplineUpdates(player, 'tech_2', 'major')).toEqual({
      major_technical_fouls: 1,
      technical_fouls: 2,
      exit_type: 'removed',
      removal_reason: '2nd_tech'
    });
    expect(getConfirmedPlayerDisciplineUpdates(player, 'ppk')).toBeNull();
  });
});
