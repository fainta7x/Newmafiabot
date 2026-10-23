import { canRegisterFirstKilled } from '../../lib/liveVoting.js';
import type { ActivePlayerState } from './types.js';
import { normalizeGameRole, teamOfPlayer } from '../../shared/gameRoles.ts';

export const findNightTarget = (
  players: ActivePlayerState[],
  shotPlayerSlot: number | null,
): ActivePlayerState | null => shotPlayerSlot === null
  ? null
  : players.find((player) => player.slot_num === shotPlayerSlot) || null;

export const toggleNightShotTarget = (
  currentSlot: number | null,
  selectedSlot: number,
): number | null => currentSlot === selectedSlot ? null : selectedSlot;

export const canNightTargetGiveFirstKilledBestMove = (
  target: ActivePlayerState | null,
  firstKilledSlot: number | null,
  roundNumber: number,
): boolean => {
  if (!target) return false;
  if (firstKilledSlot !== null && firstKilledSlot !== target.slot_num) return false;
  return canRegisterFirstKilled(roundNumber, target.role, true);
};

export const getDonCheckResult = (player: ActivePlayerState): boolean => normalizeGameRole(player.role) === 'sheriff';

export const getSheriffCheckResult = (player: ActivePlayerState): 'ЧЁРНЫЙ!' | 'Красный' => (
  teamOfPlayer(player) === 'black' ? 'ЧЁРНЫЙ!' : 'Красный'
);
