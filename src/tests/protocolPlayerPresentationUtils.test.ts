import { describe, expect, it } from 'vitest';
import type { PlayerResultData } from '../lib/api';
import {
  getProtocolPlayerPresentation
} from '../components/crm/tournaments/protocol/protocolPlayerPresentationUtils';

const createPlayer = (
  overrides: Partial<PlayerResultData> = {}
): PlayerResultData => ({
  participant_id: 'participant-1',
  player_id: 'player-1',
  seat_number: 1,
  display_name: 'Игрок',
  role: 'citizen',
  exit_type: 'alive',
  regular_fouls: 0,
  minor_technical_fouls: 0,
  major_technical_fouls: 0,
  technical_fouls: 0,
  judge_bonus: 0,
  protocol_bonus: 0,
  color_protocol: [],
  removal_reason: null,
  ...overrides
} as PlayerResultData);

describe('protocol player presentation utilities', () => {
  it('returns the default citizen presentation without badges', () => {
    const presentation = getProtocolPlayerPresentation(createPlayer());

    expect(presentation.roleLabel).toBe('Мирный');
    expect(presentation.statusLabel).toBeNull();
    expect(presentation.briefBadges).toEqual([]);
    expect(presentation.hasColorProtocol).toBe(false);
    expect(presentation.isPpkCulprit).toBe(false);
    expect(presentation.disciplinaryPenalty).toBe(0);
  });

  it('preserves badge order, labels and disciplinary penalty', () => {
    const player = createPlayer({
      role: 'mafia',
      exit_type: 'removed',
      removal_reason: 'direct',
      regular_fouls: 3,
      minor_technical_fouls: 1,
      major_technical_fouls: 1,
      technical_fouls: 2,
      judge_bonus: 0.3,
      protocol_bonus: -0.2,
      color_protocol: [
        { seat_numbers: [2, 5], mark: 'black' }
      ]
    });

    const presentation = getProtocolPlayerPresentation(
      player,
      player.participant_id
    );

    expect(presentation.roleLabel).toBe('Мафия');
    expect(presentation.statusLabel).toBe('Удалён');
    expect(presentation.disciplinaryPenalty).toBe(2.9);
    expect(presentation.briefBadges.map((badge) => badge.key)).toEqual([
      'fouls',
      'minor_tech',
      'major_tech',
      'disc',
      'judge',
      'proto',
      'ppk',
      'direct',
      'color_proto'
    ]);
    expect(presentation.briefBadges.map((badge) => badge.label)).toEqual([
      'Ф: 3',
      'мТ: 1',
      'бТ: 1',
      'Дисц. −2.9',
      'Судья +0.3',
      'Прот. −0.2',
      'ППК',
      'Удалён',
      'Есть цветовой протокол'
    ]);
  });

  it.each([
    ['killed', null, 'Убит'],
    ['voted_zero_round', null, 'Загол. (0)'],
    ['voted_day', null, 'Заголосован'],
    ['removed', '4th_foul', '4 фола'],
    ['removed', '2nd_tech', '2 техфола'],
    ['removed', 'direct', 'Удалён'],
    ['removed', 'ppk', 'ППК']
  ] as const)(
    'formats exit type %s with reason %s',
    (exitType, removalReason, expectedLabel) => {
      const presentation = getProtocolPlayerPresentation(
        createPlayer({
          exit_type: exitType,
          removal_reason:
            removalReason as PlayerResultData['removal_reason']
        })
      );

      expect(presentation.statusLabel).toBe(expectedLabel);
    }
  );

  it('uses the fallback role and removed labels', () => {
    const presentation = getProtocolPlayerPresentation(
      createPlayer({
        role: null as unknown as PlayerResultData['role'],
        exit_type: 'removed',
        removal_reason: null
      })
    );

    expect(presentation.roleLabel).toBe('Не указана');
    expect(presentation.statusLabel).toBe('Снят');
  });

  it('recognises legacy PPK from the removal reason', () => {
    const player = createPlayer({
      removal_reason:
        'ppk' as unknown as PlayerResultData['removal_reason']
    });

    const presentation = getProtocolPlayerPresentation(player);

    expect(presentation.isPpkCulprit).toBe(true);
    expect(presentation.briefBadges.some(
      (badge) => badge.key === 'ppk'
    )).toBe(true);
  });
});
