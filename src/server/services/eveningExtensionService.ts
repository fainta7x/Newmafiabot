/**
 * «Продление вечера» (owner, 2026-10-12): the club paid the venue an arbitrary amount for extra time. The organizer enters how many
 * games the extension covered and the amount; the amount is split equally between the players of those last games, not counting the
 * organizer and the judge of the evening (they do not pay). Round DOWN to a whole ruble (owner, 2026-10-12).
 * The charge is calculated after the evening is closed and is part of the player's ordinary single payment for the evening.
 */
export type EveningExtensionInput = { id: string; games_count: number; amount: number };

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
 * Several extensions are taken from the end: the newest one covers the last `games_count` games, the one before it the games before those.
 */
export const calculateExtensionShares = (
  extensions: EveningExtensionInput[],
  completedGames: Array<Set<string>>,
  excluded: Set<string>,
): Map<string, number> => {
  const shares = new Map<string, number>();
  let end = completedGames.length;
  for (const extension of [...extensions].reverse()) {
    const count = Math.max(0, Math.floor(Number(extension.games_count || 0)));
    const start = Math.max(0, end - count);
    const payers = new Set<string>();
    for (const game of completedGames.slice(start, end)) {
      for (const participantId of game) if (!excluded.has(participantId)) payers.add(participantId);
    }
    end = start;
    const share = splitExtensionAmount(extension.amount, payers.size);
    if (!share) continue;
    for (const participantId of payers) shares.set(participantId, (shares.get(participantId) || 0) + share);
  }
  return shares;
};
