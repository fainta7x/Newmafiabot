import { getDonCheckResult, getSheriffCheckResult } from './liveNightChecks.ts';
import { GAME_ROLES, normalizeGameRole, type GameRole, type GameTeam } from '../shared/gameRoles.ts';
import type { LiveGameEvent } from '../shared/liveGameEvents.ts';
import type { GameDiscipline } from './gameDiscipline.ts';

type RolePlayer = { slot_num: number; role: GameRole; team: GameTeam };
export type LiveRoleAssignments = Record<number, GameRole>;

/** Incomplete edits must never turn an unknown role into a citizen or mix two partial deals. */
export function completeLiveRoleAssignments(rows: readonly { seat_number: number; role?: unknown }[], tableSize = 10): LiveRoleAssignments | null {
  if (rows.length !== tableSize) return null;
  const assignments: LiveRoleAssignments = {};
  for (const row of rows) {
    const seat = Number(row.seat_number);
    const role = normalizeGameRole(row.role);
    if (!Number.isInteger(seat) || seat < 1 || seat > tableSize || assignments[seat] || !role) return null;
    assignments[seat] = role;
  }
  return assignments;
}

export function liveRoleCorrectionEvents(
  players: readonly RolePlayer[], assignments: LiveRoleAssignments,
  context: { nextSeq: number; at: string; round: number; phase: string },
): LiveGameEvent[] {
  const changed = players.filter(player => assignments[player.slot_num] && assignments[player.slot_num] !== player.role);
  return changed.map((player, index) => ({
    seq: context.nextSeq + index, at: context.at, round: context.round, phase: context.phase,
    kind: 'role_corrected', seat: player.slot_num, value: assignments[player.slot_num],
  }));
}

/** These commands are also replayed onto recovery/Undo snapshots; all other player facts stay intact. */
export function applyLiveRoleCorrectionEvents<T extends RolePlayer>(players: T[], events: readonly LiveGameEvent[]): T[] {
  const roles = new Map<number, GameRole>();
  for (const event of events) {
    const role = normalizeGameRole(event.value);
    if (event.kind === 'role_corrected' && event.seat && role) roles.set(event.seat, role);
  }
  return players.map(player => {
    const role = roles.get(player.slot_num);
    return role ? { ...player, role, team: GAME_ROLES[role].team } : player;
  });
}

export function projectLiveRoleSnapshot<T extends { activePlayers: RolePlayer[]; discipline: GameDiscipline; donCheckSlot: number | null; donCheckResult: boolean | null; sheriffCheckSlot: number | null; sheriffCheckResult: string | null }>(snapshot: T, assignments: LiveRoleAssignments, commands?: readonly LiveGameEvent[]): T {
  const events = commands || liveRoleCorrectionEvents(snapshot.activePlayers, assignments, { nextSeq: 1, at: '', round: 0, phase: '' });
  const activePlayers = applyLiveRoleCorrectionEvents(snapshot.activePlayers, events);
  const players = { ...snapshot.discipline.players };
  for (const player of activePlayers) {
    const key = String(player.slot_num);
    if (players[key]) players[key] = { ...players[key], team: player.team };
  }
  const donTarget = activePlayers.find(p => p.slot_num === snapshot.donCheckSlot);
  const sheriffTarget = activePlayers.find(p => p.slot_num === snapshot.sheriffCheckSlot);
  return {
    ...snapshot, activePlayers, discipline: { ...snapshot.discipline, players },
    donCheckResult: donTarget && snapshot.donCheckResult !== null ? getDonCheckResult(donTarget) : snapshot.donCheckResult,
    sheriffCheckResult: sheriffTarget && snapshot.sheriffCheckResult !== null ? getSheriffCheckResult(sheriffTarget) : snapshot.sheriffCheckResult,
  };
}
