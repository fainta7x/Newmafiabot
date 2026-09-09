export type ClubGameSeatIdentity = {
  participantId: string;
  playerId: string;
  nickname: string;
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
  if (envelope.player_results.some((item: any) => Number(item.seat_number) !== seatNumber && String(item.player_id) === replacement.playerId)) {
    throw new Error('Этот игрок уже занимает другое место в игре');
  }

  const oldParticipantId = String(current.participant_id || '');
  if (!oldParticipantId) throw new Error(`У места #${seatNumber} отсутствует участник`);
  const nextEnvelope = replaceParticipantReference(envelope, oldParticipantId, replacement.participantId);
  nextEnvelope.player_results = nextEnvelope.player_results.map((item: any) => Number(item.seat_number) === seatNumber
    ? {
        ...item,
        participant_id: replacement.participantId,
        player_id: replacement.playerId,
        guest_placeholder_id: null,
        display_name: replacement.nickname,
      }
    : item);

  const nextSlots = (Array.isArray(slots) ? slots : []).map((slot: any) => Number(slot.slot_num ?? slot.seat_number) === seatNumber
    ? {
        ...slot,
        participant_id: replacement.participantId,
        player_id: replacement.playerId,
        guest_placeholder_id: null,
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
