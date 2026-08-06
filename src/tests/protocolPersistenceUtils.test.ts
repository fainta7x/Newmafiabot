import { describe, expect, it } from 'vitest';
import type {
  PlayerResultData,
  TournamentGameProtocolData
} from '../lib/api';
import {
  findUnclassifiedTechFouls,
  getProtocolBackupKey,
  hasUnclassifiedTechFouls,
  parseRestorableProtocolBackup,
  serializeBlockedProtocolBackup,
  serializeProtocolLocalBackup
} from '../components/crm/tournaments/protocol/protocolPersistenceUtils';

const protocol = {
  game_id: 'game-1',
  status: 'draft',
  votes: [],
  shots: []
} as unknown as TournamentGameProtocolData;

const createPlayer = (
  participantId: string,
  total: number,
  minor: number,
  major: number
): PlayerResultData => ({
  participant_id: participantId,
  technical_fouls: total,
  minor_technical_fouls: minor,
  major_technical_fouls: major
} as PlayerResultData);

describe('protocol persistence utilities', () => {
  it('builds the existing localStorage key', () => {
    expect(getProtocolBackupKey('game-42'))
      .toBe('tournament_protocol_backup_game-42');
  });

  it('serializes and restores a newer draft backup', () => {
    const players = [createPlayer('p-1', 0, 0, 0)];
    const serialized = serializeProtocolLocalBackup(
      protocol,
      players,
      '2026-08-06T10:00:00.000Z'
    );

    const restored = parseRestorableProtocolBackup(
      serialized,
      'draft',
      '2026-08-06T09:00:00.000Z'
    );

    expect(restored).toEqual({
      updatedAt: '2026-08-06T10:00:00.000Z',
      protocol,
      playerResults: players
    });
  });

  it('does not restore completed, stale or malformed backups', () => {
    const serialized = serializeProtocolLocalBackup(
      protocol,
      [],
      '2026-08-06T08:00:00.000Z'
    );

    expect(
      parseRestorableProtocolBackup(
        serialized,
        'completed',
        '2026-08-06T07:00:00.000Z'
      )
    ).toBeNull();

    expect(
      parseRestorableProtocolBackup(
        serialized,
        'draft',
        '2026-08-06T09:00:00.000Z'
      )
    ).toBeNull();

    expect(
      parseRestorableProtocolBackup('{broken', 'draft', null)
    ).toBeNull();
  });

  it('finds only unclassified technical fouls', () => {
    const players = [
      createPlayer('p-1', 2, 1, 0),
      createPlayer('p-2', 2, 1, 1),
      createPlayer('p-3', 0, 0, 0)
    ];

    expect(findUnclassifiedTechFouls(players)).toEqual({
      'p-1': 2
    });
    expect(hasUnclassifiedTechFouls(players)).toBe(true);
    expect(hasUnclassifiedTechFouls(players.slice(1))).toBe(false);
  });

  it('preserves the blocked-save backup schema', () => {
    const players = [createPlayer('p-1', 1, 0, 0)];
    const serialized = serializeBlockedProtocolBackup(
      protocol,
      players,
      '2026-08-06T10:00:00.000Z'
    );

    expect(JSON.parse(serialized)).toEqual({
      protocol,
      player_results: players,
      timestamp: '2026-08-06T10:00:00.000Z',
      version: '1.0'
    });
  });
});
