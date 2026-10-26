/**
 * Club Elo weights. Owner, 2026-10-26: personal play must weigh about as much as the team result — a bad game can wipe out a
 * win, a game that carries the table can double it — so a point is 40 Elo and the personal part is capped at ±35, the size
 * of the largest team swing. Discipline stays ×40 outside the caps. Sporting game points stay unchanged.
 */
export const ELO_PERSONAL_POINT_WEIGHT = 40;
export const ELO_DISCIPLINE_POINT_WEIGHT = 40;
export const ELO_CONTRIBUTION_CAP = 35;
export const ELO_PERSONAL_CAP = 35;
