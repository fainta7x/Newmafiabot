import { normalizeGameRole, teamOfPlayer } from '../shared/gameRoles.ts';

type CheckedPlayer = { role: unknown; team?: unknown };
export const getDonCheckResult = (player: CheckedPlayer): boolean => normalizeGameRole(player.role) === 'sheriff';
export const getSheriffCheckResult = (player: CheckedPlayer): 'ЧЁРНЫЙ!' | 'Красный' => (
  teamOfPlayer(player) === 'black' ? 'ЧЁРНЫЙ!' : 'Красный'
);
