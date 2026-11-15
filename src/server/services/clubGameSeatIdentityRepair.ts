export type ClubGameSeatIdentity = {
  participantId: string;
  playerId: string;
  nickname: string;
  /** Set when the seat is handed to a guest without a profile: then `playerId` is empty. */
  guestPlaceholderId?: string | null;
};

const replaceParticipantReference = (value: any, from: string, to: string): any => {
  if (value === from) return to;
  if (Array.isArray(value)) return value.map((item) => replaceParticipantReference(item, from, to));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceParticipantReference(item, from, to)]));
  }
  return value;
};

export function replaceClubGameSeatIdentity(
  envelope: any,
  slots: any[],
  seatNumber: number,
  replacement: ClubGameSeatIdentity,
) {
  if (!envelope || envelope.kind !== 'club_evening_protocol' || !Array.isArray(envelope.player_results)) {
    throw new Error('У игры отсутствует структурированный клубный протокол');
  }
  const current = envelope.player_results.find((item: any) => Number(item.seat_number) === seatNumber);
  if (!current) throw new Error(`Место #${seatNumber} не найдено в протоколе`);
  if (replacement.playerId && envelope.player_results.some((item: any) => Number(item.seat_number) !== seatNumber && String(item.player_id) === replacement.playerId)) {
    throw new Error('Этот игрок уже занимает другое место в игре');
  }

  const oldParticipantId = String(current.participant_id || '');
  if (!oldParticipantId) throw new Error(`У места #${seatNumber} отсутствует участник`);
  const nextEnvelope = replaceParticipantReference(envelope, oldParticipantId, replacement.participantId);
  nextEnvelope.player_results = nextEnvelope.player_results.map((item: any) => Number(item.seat_number) === seatNumber
    ? {
        ...item,
        participant_id: replacement.participantId,
        player_id: replacement.playerId || null,
        guest_placeholder_id: replacement.guestPlaceholderId || null,
        display_name: replacement.nickname,
      }
    : item);

  const nextSlots = (Array.isArray(slots) ? slots : []).map((slot: any) => Number(slot.slot_num ?? slot.seat_number) === seatNumber
    ? {
        ...slot,
        participant_id: replacement.participantId,
        player_id: replacement.playerId || null,
        guest_placeholder_id: replacement.guestPlaceholderId || null,
        nickname: replacement.nickname,
      }
    : slot);

  return {
    envelope: nextEnvelope,
    slots: nextSlots,
    oldPlayerId: String(current.player_id || ''),
    oldParticipantId,
  };
}

const swapStrings = (value: any, a: string, b: string): any => {
  if (value === a) return b;
  if (value === b) return a;
  if (Array.isArray(value)) return value.map((item) => swapStrings(item, a, b));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, swapStrings(item, a, b)]));
  return value;
};

/**
 * Two players sat on each other's seats (owner, 2026-11-15: «на 5 сидит FM, а на 7 Серый — поменять местами»). The seats keep
 * their role, fouls, votes and result; only who sat there swaps — every reference to the two participants is exchanged at once.
 */
export function swapClubGameSeatIdentities(envelope: any, slots: any[], seatA: number, seatB: number) {
  if (!envelope || envelope.kind !== 'club_evening_protocol' || !Array.isArray(envelope.player_results)) {
    throw new Error('У игры отсутствует структурированный клубный протокол');
  }
  if (seatA === seatB) throw new Error('Выберите два разных места');
  const first = envelope.player_results.find((item: any) => Number(item.seat_number) === seatA);
  const second = envelope.player_results.find((item: any) => Number(item.seat_number) === seatB);
  if (!first || !second) throw new Error('Место не найдено в протоколе');
  const a = String(first.participant_id || ''); const b = String(second.participant_id || '');
  if (!a || !b) throw new Error('У места отсутствует участник');
  const identity = (item: any) => ({ participant_id: item.participant_id, player_id: item.player_id ?? null, guest_placeholder_id: item.guest_placeholder_id ?? null, display_name: item.display_name });
  const firstIdentity = identity(first); const secondIdentity = identity(second);
  const swapped = swapStrings(envelope, a, b);
  swapped.player_results = swapped.player_results.map((item: any) => Number(item.seat_number) === seatA ? { ...item, ...secondIdentity }
    : Number(item.seat_number) === seatB ? { ...item, ...firstIdentity } : item);
  const slotIdentity = (item: any) => ({ participant_id: item.participant_id, player_id: item.player_id ?? null, guest_placeholder_id: item.guest_placeholder_id ?? null, nickname: item.display_name });
  const nextSlots = (Array.isArray(slots) ? slots : []).map((slot: any) => {
    const seat = Number(slot.slot_num ?? slot.seat_number);
    return seat === seatA ? { ...slot, ...slotIdentity(second) } : seat === seatB ? { ...slot, ...slotIdentity(first) } : slot;
  });
  return { envelope: swapped, slots: nextSlots, playerIds: [first.player_id, second.player_id].filter(Boolean).map(String) };
}
