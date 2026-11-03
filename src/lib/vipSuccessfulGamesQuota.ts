/**
 * One quota belongs to one player across all of their VIP conditions.
 * A "success" means a game with at least one real card substitution;
 * several substituted conditions in that same game still count once.
 */
export type VipGameQuota = {
  playerId: string;
  wholeEvening: boolean;
  maxSuccessfulGames: number | null;
};

export function validateVipGameQuota(input: unknown, playerId: string): VipGameQuota {
  const data = input as Partial<VipGameQuota> | null;
  if (!playerId || playerId.length > 128) throw new Error('Выберите игрока');
  if (typeof data?.wholeEvening !== 'boolean') throw new Error('Укажите период действия VIP');
  const max = data.maxSuccessfulGames;
  if (data.wholeEvening) {
    if (max !== null && max !== undefined) throw new Error('На весь вечер лимит игр не нужен');
    return { playerId, wholeEvening: true, maxSuccessfulGames: null };
  }
  if (!Number.isInteger(max) || (max as number) < 1 || (max as number) > 10000) {
    throw new Error('Количество успешных игр должно быть от 1 до 10000');
  }
  return { playerId, wholeEvening: false, maxSuccessfulGames: max as number };
}

/**
 * Count distinct game IDs, not effects or swapped cards. Call only with
 * successful confirmed VIP card exchanges, never failed/rolled-back draws.
 * An unconfirmed pending reveal cannot consume the quota.
 */
export function successfulVipGameCount(gameIds: readonly (string | number)[]): number {
  return new Set(gameIds.map(String)).size;
}

export function vipCanTriggerInGame(
  quota: VipGameQuota | null,
  successfulGameIds: readonly (string | number)[],
  currentGameId: string | number,
): boolean {
  // No configured quota is not permission for an unconfigured player.
  if (!quota) return false;
  // An already-successful game counts only once and may finish its
  // conditional checks; for following games the cap takes effect.
  if (quota.wholeEvening) return true;
  if (successfulGameIds.some(id => String(id) === String(currentGameId))) return true;
  return successfulVipGameCount(successfulGameIds) < (quota.maxSuccessfulGames ?? 0);
}
