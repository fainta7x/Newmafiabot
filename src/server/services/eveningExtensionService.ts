/**
 * «Продление вечера» (owner, 2026-10-12): the club paid the venue an arbitrary amount for extra time. The organizer enters how many
 * games the extension covered and the amount; the amount is split equally between the players of those last games, not counting the
 * organizer and the judge of the evening (they do not pay). Round DOWN to a whole ruble (owner, 2026-10-12).
 * The charge is calculated at once when the extension is entered (owner, 2026-10-19; before that only after closing) and is part of the
 * player's ordinary single payment for the evening.
 */
export type EveningExtensionInput = { id: string; games_count: number; amount: number; games_total_at_entry?: number | null };

export const EXTENSION_MAX_GAMES = 20;
export const EXTENSION_MAX_AMOUNT = 100000;

/** The equal share of one payer, rounded down to a whole ruble; 0 when nobody pays. */
export const splitExtensionAmount = (amount: number, payers: number): number => {
  const total = Math.floor(Number(amount));
  const count = Math.floor(Number(payers));
  if (!Number.isFinite(total) || !Number.isFinite(count) || total <= 0 || count <= 0) return 0;
  return Math.floor(total / count);
};

/**
 * @param extensions the extensions of the evening, oldest first
 * @param completedGames the participant ids seated in each completed game of the evening, in playing order
 * @param excluded participant ids that never pay an extension (organizer, judge, the club owner)
 * An extension covers the `games_count` games that ended at the moment it was entered (`games_total_at_entry`; owner, 2026-10-19: it is
 * tied to the games, not to closing the evening), so games played afterwards do not move it. An older extension without that number
 * ends at the last game. Several extensions never overlap: the newest takes its games first, an older one only the games before them.
 */
export const calculateExtensionShares = (
  extensions: EveningExtensionInput[],
  completedGames: Array<Set<string>>,
  excluded: Set<string>,
): Map<string, number> => {
  const shares = new Map<string, number>();
  let limit = completedGames.length;
  for (const extension of [...extensions].reverse()) {
    const count = Math.max(0, Math.floor(Number(extension.games_count || 0)));
    const entered = extension.games_total_at_entry == null ? null : Math.max(0, Math.floor(Number(extension.games_total_at_entry)));
    const end = Math.min(limit, entered ?? completedGames.length);
    const start = Math.max(0, end - count);
    const payers = new Set<string>();
    for (const game of completedGames.slice(start, end)) {
      for (const participantId of game) if (!excluded.has(participantId)) payers.add(participantId);
    }
    limit = start;
    const share = splitExtensionAmount(extension.amount, payers.size);
    if (!share) continue;
    for (const participantId of payers) shares.set(participantId, (shares.get(participantId) || 0) + share);
  }
  return shares;
};
