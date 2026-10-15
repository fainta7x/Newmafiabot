import { GAME_ROLES, GAME_ROLE_KEYS, GAME_ROLE_LABELS, normalizeGameRole, type GameRole } from '../shared/gameRoles.ts';
export type TournamentRole = GameRole;

export const ROLE_LIMITS = Object.fromEntries(GAME_ROLE_KEYS.map(key => [key, GAME_ROLES[key].standardCount])) as Record<TournamentRole, number>;

export const ROLE_LABELS = GAME_ROLE_LABELS;

export const ROLE_GENITIVE_LABELS = Object.fromEntries(GAME_ROLE_KEYS.map(key => [key, GAME_ROLES[key].genitive])) as Record<TournamentRole, string>;

export interface SeatRoleInput {
  seat_number: number;
  role: string | null | undefined;
}

export function normalizeRoleValue(role: string | null | undefined): TournamentRole | null {
  const canonical = normalizeGameRole(role);
  if (canonical) return canonical;
  // Compatibility only: historic assignment inputs used team colours as role aliases.
  const lower = role?.trim().toLowerCase();
  if (lower === 'red' || lower === 'красный') return 'citizen';
  if (lower === 'black' || lower === 'черный') return 'mafia';
  return null;
}

export interface RoleCounts {
  citizen: number;
  sheriff: number;
  mafia: number;
  don: number;
}

export function calculateRoleCounts(seats: SeatRoleInput[]): RoleCounts {
  const counts: RoleCounts = { citizen: 0, sheriff: 0, mafia: 0, don: 0 };
  for (const seat of seats) {
    const r = normalizeRoleValue(seat.role);
    if (r) {
      counts[r]++;
    }
  }
  return counts;
}

export function calculateRoleOverflows(counts: RoleCounts): Record<TournamentRole, number> {
  return {
    citizen: Math.max(0, counts.citizen - ROLE_LIMITS.citizen),
    sheriff: Math.max(0, counts.sheriff - ROLE_LIMITS.sheriff),
    mafia: Math.max(0, counts.mafia - ROLE_LIMITS.mafia),
    don: Math.max(0, counts.don - ROLE_LIMITS.don),
  };
}

export function getTotalOverflow(counts: RoleCounts): number {
  const overflows = calculateRoleOverflows(counts);
  return overflows.citizen + overflows.sheriff + overflows.mafia + overflows.don;
}

export function calculateProspectiveRoleCounts(
  currentSeats: SeatRoleInput[],
  targetSeatNumber: number,
  newRole: string | null | undefined
): RoleCounts {
  const normalizedNewRole = normalizeRoleValue(newRole);
  const updatedSeats = currentSeats.map((s) =>
    s.seat_number === targetSeatNumber ? { ...s, role: normalizedNewRole } : s
  );
  return calculateRoleCounts(updatedSeats);
}

export function validateRoleCountsTransition(
  currentCounts: RoleCounts,
  prospectiveCounts: RoleCounts
): { allowed: boolean; error?: string } {
  const currentTotalOverflow = getTotalOverflow(currentCounts);
  const prospectiveTotalOverflow = getTotalOverflow(prospectiveCounts);

  const currentOverflows = calculateRoleOverflows(currentCounts);
  const prospectiveOverflows = calculateRoleOverflows(prospectiveCounts);

  if (currentTotalOverflow === 0) {
    // Mode 1: Correct initial state (no role exceeds limit)
    for (const role of (['citizen', 'sheriff', 'mafia', 'don'] as TournamentRole[])) {
      const limit = ROLE_LIMITS[role];
      if (prospectiveCounts[role] > limit) {
        const labelGenitive = ROLE_GENITIVE_LABELS[role];
        return {
          allowed: false,
          error: `Нельзя назначить ещё одного ${labelGenitive}: допустим только ${limit}`,
        };
      }
    }
    return { allowed: true };
  } else {
    // Mode 2: Already incorrect initial state (overflow > 0)
    if (prospectiveTotalOverflow >= currentTotalOverflow) {
      return {
        allowed: false,
        error: `Нельзя сделать это изменение: операция не уменьшает общий перерасход ролей`,
      };
    }

    for (const role of (['citizen', 'sheriff', 'mafia', 'don'] as TournamentRole[])) {
      if (prospectiveOverflows[role] > currentOverflows[role]) {
        return {
          allowed: false,
          error: `Нельзя сделать это изменение: увеличивается превышение для роли "${ROLE_LABELS[role]}"`,
        };
      }
    }

    return { allowed: true };
  }
}

export interface RoleAssignmentValidationResult {
  allowed: boolean;
  error?: string;
  prospectiveCounts: RoleCounts;
}

export function validateRoleAssignmentChange(
  currentSeats: SeatRoleInput[],
  targetSeatNumber: number,
  newRole: string | null | undefined
): RoleAssignmentValidationResult {
  const currentSeat = currentSeats.find((s) => s.seat_number === targetSeatNumber);
  const currentRoleNormalized = normalizeRoleValue(currentSeat?.role);
  const newRoleNormalized = normalizeRoleValue(newRole);

  const currentCounts = calculateRoleCounts(currentSeats);
  const prospectiveCounts = calculateProspectiveRoleCounts(currentSeats, targetSeatNumber, newRoleNormalized);

  if (currentRoleNormalized === newRoleNormalized) {
    return { allowed: true, prospectiveCounts };
  }

  const transition = validateRoleCountsTransition(currentCounts, prospectiveCounts);

  return {
    allowed: transition.allowed,
    error: transition.error,
    prospectiveCounts,
  };
}

export function isRoleOptionDisabled(
  currentSeats: SeatRoleInput[],
  targetSeatNumber: number,
  optionRole: string | null | undefined
): boolean {
  const currentSeat = currentSeats.find((s) => s.seat_number === targetSeatNumber);
  const currentRoleNormalized = normalizeRoleValue(currentSeat?.role);
  const optionRoleNormalized = normalizeRoleValue(optionRole);

  if (currentRoleNormalized === optionRoleNormalized) {
    return false;
  }

  const validation = validateRoleAssignmentChange(currentSeats, targetSeatNumber, optionRole);
  return !validation.allowed;
}
