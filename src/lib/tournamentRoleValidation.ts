export type TournamentRole = 'citizen' | 'sheriff' | 'mafia' | 'don';

export const ROLE_LIMITS: Record<TournamentRole, number> = {
  citizen: 6,
  sheriff: 1,
  mafia: 2,
  don: 1,
};

export const ROLE_LABELS: Record<TournamentRole, string> = {
  citizen: 'Мирный',
  sheriff: 'Шериф',
  mafia: 'Мафия',
  don: 'Дон',
};

export const ROLE_GENITIVE_LABELS: Record<TournamentRole, string> = {
  citizen: 'Мирного',
  sheriff: 'Шерифа',
  mafia: 'Мафию',
  don: 'Дона',
};

export interface SeatRoleInput {
  seat_number: number;
  role: string | null | undefined;
}

export function normalizeRoleValue(role: string | null | undefined): TournamentRole | null {
  if (!role) return null;
  const lower = role.trim().toLowerCase();
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный'].includes(lower)) return 'citizen';
  if (['sheriff', 'шериф'].includes(lower)) return 'sheriff';
  if (['mafia', 'мафия', 'black', 'черный'].includes(lower)) return 'mafia';
  if (['don', 'дон'].includes(lower)) return 'don';
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
