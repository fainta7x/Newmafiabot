import type { GameRole } from '../shared/gameRoles.ts';

export type ClosedRoleCard = { id: number; role: GameRole };

const isRed = (role: GameRole): boolean => role === 'citizen' || role === 'sheriff';

/**
 * Changes only the roles of two still-closed cards.
 * Previously revealed cards are not passed to this function.
 * The number of cards of every role remains unchanged.
 */
export function exchangeClosedRolesForDraw<T extends ClosedRoleCard>(
  deck: readonly T[],
  selectedCardId: number,
  targetDrawing: boolean,
  targetStillWaiting: boolean,
): T[] {
  const selected = deck.find((card) => card.id === selectedCardId);
  if (!selected || (!targetDrawing && !targetStillWaiting)) return [...deck];

  // The target's draw must be red, regardless of the chosen closed card.
  if (targetDrawing) {
    if (isRed(selected.role)) return [...deck];
    const donor = deck.find((card) => card.id !== selected.id && isRed(card.role));
    if (!donor) throw new Error('No red card remains for the designated draw');
    return deck.map((card) =>
      card.id === selected.id ? { ...card, role: donor.role }
        : card.id === donor.id ? { ...card, role: selected.role }
          : card,
    );
  }

  // Other players can draw red until only one red card remains. Protect
  // that last one by exchanging it with a different, still-closed black card.
  if (!isRed(selected.role) || deck.filter((card) => isRed(card.role)).length > 1) return [...deck];
  const donor = deck.find((card) => card.id !== selected.id && !isRed(card.role));
  if (!donor) throw new Error('No closed black card available for exchange');
  return deck.map((card) =>
    card.id === selected.id ? { ...card, role: donor.role }
      : card.id === donor.id ? { ...card, role: selected.role }
        : card,
  );
}
