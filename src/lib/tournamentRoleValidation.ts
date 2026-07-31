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
  const normalizedNewRole = normalizeRoleValue(newRole);
  const prospectiveCounts = calculateProspectiveRoleCounts(currentSeats, targetSeatNumber, normalizedNewRole);

  if (!normalizedNewRole) {
    return { allowed: true, prospectiveCounts };
  }

  const limit = ROLE_LIMITS[normalizedNewRole];
  if (prospectiveCounts[normalizedNewRole] > limit) {
    const labelGenitive = ROLE_GENITIVE_LABELS[normalizedNewRole];
    return {
      allowed: false,
      error: `Нельзя назначить ещё одного ${labelGenitive}: допустим только ${limit}`,
      prospectiveCounts,
    };
  }

  return { allowed: true, prospectiveCounts };
}

export function isRoleOptionDisabled(
  currentSeats: SeatRoleInput[],
  targetSeatNumber: number,
  optionRole: TournamentRole
): boolean {
  const prospectiveCounts = calculateProspectiveRoleCounts(currentSeats, targetSeatNumber, optionRole);
  return prospectiveCounts[optionRole] > ROLE_LIMITS[optionRole];
}
