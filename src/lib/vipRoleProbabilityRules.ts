import { randomInt } from 'node:crypto';
import type { GameRole } from '../shared/gameRoles.ts';

export type VipChanceKind = 'role' | 'same_color' | 'different_color';
export type VipProbabilityRule = {
  id: string;
  playerId: string;
  kind: VipChanceKind;
  role: GameRole | null;
  otherPlayerId: string | null;
  percent: number;
  enabled: boolean;
};

const ROLES: GameRole[] = ['citizen','sheriff','mafia','don'];

/** Validate persisted owner settings; selection does not yet activate dealing effects. */
export function validateVipProbabilityRule(value: any): Omit<VipProbabilityRule, 'id'> {
  const playerId = typeof value?.playerId === 'string' ? value.playerId.trim() : '';
  const kind = value?.kind;
  const percent = value?.percent;
  if (!playerId || playerId.length > 128) throw new Error('Выберите игрока');
  if (!['role','same_color','different_color'].includes(kind)) throw new Error('Неверное условие');
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error('Процент должен быть от 0 до 100');
  if (typeof value.enabled !== 'boolean') throw new Error('Неверный статус правила');
  const role = kind === 'role' ? value.role : null;
  if (kind === 'role' && !ROLES.includes(role)) throw new Error('Укажите роль');
  const otherPlayerId = kind !== 'role' && typeof value.otherPlayerId === 'string' ? value.otherPlayerId.trim() : null;
  if (kind !== 'role' && (!otherPlayerId || otherPlayerId.length > 128 || otherPlayerId === playerId))
    throw new Error('Выберите другого игрока');
  return { playerId, kind, role: role ?? null, otherPlayerId, percent,
    enabled: value.enabled };
}

/** Never activates on rating or tournament games; configured values remain stored. */
export function vipEffectAllowed(format: string): boolean {
  return format === 'CASUAL' || format === 'NOVICE';
}

/**
 * If several already-triggered, executable VIP conditions conflict, all
 * candidates have equal priority regardless of their original percent.
 * A guaranteed bought role is resolved before this function is called.
 *
 * This function only resolves a conflict; it does not perform card swaps,
 * assess each condition's chance, or alter the deck.
 */
export function chooseConflictingVipRule<T>(
  candidates: readonly T[],
  chooseIndex: (size: number) => number = randomInt,
): T | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const index = chooseIndex(candidates.length);
  if (!Number.isInteger(index) || index < 0 || index >= candidates.length) {
    throw new Error('Invalid random VIP rule index');
  }
  return candidates[index];
}
