export type PokerCardFace = { rank: string; suit: string };

const RANK_VALUE: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, '10': 10, J: 11, Q: 12, K: 13, A: 14 };

/** A card's identity for React: it must not depend on the position, or a card that moves in the hand is rebuilt and flies in again. */
export const cardIdentity = (card: PokerCardFace) => `${card.rank}-${card.suit}`;

/**
 * The player's own cards as laid out: high card first, from the very first card. While the cards are being dealt each one
 * flies straight to the slot it keeps (owner, 2026-10-05: «нужно чтобы при раздаче уже было понятно, на какое место должна
 * упасть карта»), and since every card keeps its identity nothing moves again afterwards.
 */
export const orderOwnCards = (cards: PokerCardFace[]): PokerCardFace[] => (
  [...cards].sort((a, b) => (RANK_VALUE[b.rank] || 0) - (RANK_VALUE[a.rank] || 0))
);
