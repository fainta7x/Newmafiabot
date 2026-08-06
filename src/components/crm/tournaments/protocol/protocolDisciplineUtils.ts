import { PlayerResultData } from '../../../../lib/api';

export type TechFoulType = 'minor' | 'major';

export type DisciplineActionType =
  | 'foul_4'
  | 'tech_2'
  | 'direct_removal'
  | 'ppk'
  | 'cancel_ppk'
  | 'cancel_direct';

type ConfirmableDisciplineAction = 'foul_4' | 'tech_2';

export type DisciplineChange =
  | { kind: 'noop' }
  | { kind: 'confirm'; action: ConfirmableDisciplineAction; techType?: TechFoulType }
  | { kind: 'update'; updates: Partial<PlayerResultData> };

export const getRegularFoulChange = (
  player: PlayerResultData,
  delta: number
): DisciplineChange => {
  const newValue = Math.max(0, Math.min(4, player.regular_fouls + delta));

  if (delta > 0 && newValue === 4) {
    return { kind: 'confirm', action: 'foul_4' };
  }

  if (delta < 0 && player.regular_fouls === 4 && player.removal_reason === '4th_foul') {
    return {
      kind: 'update',
      updates: {
        regular_fouls: 3,
        exit_type: 'alive',
        removal_reason: null
      }
    };
  }

  return { kind: 'update', updates: { regular_fouls: newValue } };
};

export const getTechFoulChange = (
  player: PlayerResultData,
  techType: TechFoulType,
  delta: number
): DisciplineChange => {
  const currentMinor = player.minor_technical_fouls || 0;
  const currentMajor = player.major_technical_fouls || 0;
  const currentTotal = currentMinor + currentMajor;

  if (delta > 0) {
    if (currentTotal >= 2) return { kind: 'noop' };
    if (currentTotal === 1) {
      return { kind: 'confirm', action: 'tech_2', techType };
    }

    const updates: Partial<PlayerResultData> = techType === 'minor'
      ? { minor_technical_fouls: currentMinor + 1 }
      : { major_technical_fouls: currentMajor + 1 };

    updates.technical_fouls =
      (updates.minor_technical_fouls || currentMinor) +
      (updates.major_technical_fouls || currentMajor);

    return { kind: 'update', updates };
  }

  const updates: Partial<PlayerResultData> = {};
  if (techType === 'minor' && currentMinor > 0) {
    updates.minor_technical_fouls = currentMinor - 1;
  } else if (techType === 'major' && currentMajor > 0) {
    updates.major_technical_fouls = currentMajor - 1;
  } else {
    return { kind: 'noop' };
  }

  const newTotal =
    (updates.minor_technical_fouls ?? currentMinor) +
    (updates.major_technical_fouls ?? currentMajor);
  updates.technical_fouls = newTotal;

  if (newTotal === 1 && player.removal_reason === '2nd_tech') {
    updates.exit_type = 'alive';
    updates.removal_reason = null;
  }

  return { kind: 'update', updates };
};

export const getConfirmedPlayerDisciplineUpdates = (
  player: PlayerResultData,
  type: DisciplineActionType,
  techType?: TechFoulType
): Partial<PlayerResultData> | null => {
  if (type === 'direct_removal') {
    return { exit_type: 'removed', removal_reason: 'direct' };
  }

  if (type === 'cancel_direct') {
    return { exit_type: 'alive', removal_reason: null };
  }

  if (type === 'foul_4') {
    return {
      regular_fouls: 4,
      exit_type: 'removed',
      removal_reason: '4th_foul'
    };
  }

  if (type === 'tech_2' && techType) {
    const currentMinor = player.minor_technical_fouls || 0;
    const currentMajor = player.major_technical_fouls || 0;
    const updates: Partial<PlayerResultData> = techType === 'minor'
      ? { minor_technical_fouls: currentMinor + 1 }
      : { major_technical_fouls: currentMajor + 1 };

    updates.technical_fouls =
      (updates.minor_technical_fouls || currentMinor) +
      (updates.major_technical_fouls || currentMajor);
    updates.exit_type = 'removed';
    updates.removal_reason = '2nd_tech';
    return updates;
  }

  return null;
};
