export type PokerCardFace = { rank: string; suit: string };

const RANK_VALUE: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, '10': 10, J: 11, Q: 12, K: 13, A: 14 };

/** A card's identity for React: it must not depend on the position, or a card that moves in the hand is rebuilt and flies in again. */
export const cardIdentity = (card: PokerCardFace) => `${card.rank}-${card.suit}`;

/**
 * The player's own cards as shown. While they are being dealt they stay in the order they arrive: the first card lies still
 * and the second one flies to its side (owner, 2026-10-05: «прилетает одна карта, потом заново обе»). After the deal the pair
 * is put high card first, and since every card keeps its identity nothing animates again.
 */
export const orderOwnCards = (cards: PokerCardFace[], dealing: boolean): PokerCardFace[] => (
  dealing ? [...cards] : [...cards].sort((a, b) => (RANK_VALUE[b.rank] || 0) - (RANK_VALUE[a.rank] || 0))
);
