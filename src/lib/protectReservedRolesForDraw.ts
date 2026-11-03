import type { GameRole } from '../shared/gameRoles.ts';

export type RoleCard = { id: string; role: GameRole };

/**
 * Every reserved role remains available in the closed part of the deck until
 * the buyer draws. Only exchanges of two still-closed cards are allowed.
 * Never touch a card that has already been revealed or confirmed.
 */
export function protectReservedRolesForDraw<T extends RoleCard>(
  deck: readonly T[],
  selectedCardId: string,
  drawingSeat: number,
  reservedBySeat: ReadonlyMap<number, GameRole>,
): T[] {
  const chosen = deck.find((card) => card.id === selectedCardId);
  if (!chosen) throw new Error('Selected card is absent from the closed deck');
  const myRole = reservedBySeat.get(drawingSeat);
  const otherRoles = [...reservedBySeat]
    .filter(([seat]) => seat !== drawingSeat)
    .map(([, role]) => role);
  const needed = (role: GameRole) => otherRoles.filter((value) => value === role).length;
  const count = (role: GameRole) => deck.filter((card) => card.role === role).length;

  if (myRole) {
    if (chosen.role === myRole) return [...deck];
    const donor = deck.find((card) => card.id !== selectedCardId && card.role === myRole);
    if (!donor) throw new Error('Purchased role is missing from closed cards');
    // The card exchanged back from the buyer might belong to another reservation
    // only if it is still present after this swap. Count invariants stay unchanged.
    return deck.map((card) => card.id === chosen.id
      ? { ...card, role: donor.role }
      : card.id === donor.id
        ? { ...card, role: chosen.role }
        : card);
  }

  if (count(chosen.role) > needed(chosen.role)) return [...deck];
  // The selected role belongs to other buyers: find a role with a free copy.
  const donor = deck.find((card) =>
    card.id !== selectedCardId && count(card.role) > needed(card.role),
  );
  if (!donor) throw new Error('No unreserved role remains for this player');
  return deck.map((card) => card.id === chosen.id
    ? { ...card, role: donor.role }
    : card.id === donor.id
      ? { ...card, role: chosen.role }
      : card);
}
