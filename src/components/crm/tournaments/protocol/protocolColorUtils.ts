import type { ColorProtocolMark, PlayerResultData } from '../../../../lib/api';

export type ColorMarkType = ColorProtocolMark['mark'];

export interface ColorMarkEditState {
  index: number;
  seats: number[];
  mark: ColorMarkType;
}

const sortSeats = (seats: number[]): number[] =>
  [...seats].sort((a, b) => a - b);

export const toggleColorSeatInList = (
  seats: number[],
  seatNumber: number
): number[] => {
  if (seats.includes(seatNumber)) {
    return seats.filter((seat) => seat !== seatNumber);
  }
  return sortSeats([...seats, seatNumber]);
};

export const addColorMarkToResults = (
  results: PlayerResultData[],
  participantId: string,
  seats: number[],
  mark: ColorMarkType
): PlayerResultData[] =>
  results.map((player) => {
    if (player.participant_id !== participantId) return player;

    return {
      ...player,
      color_protocol: [
        ...(player.color_protocol || []),
        {
          seat_numbers: sortSeats(seats),
          mark
        }
      ]
    };
  });

export const moveColorMarkInResults = (
  results: PlayerResultData[],
  participantId: string,
  fromIndex: number,
  toIndex: number
): PlayerResultData[] =>
  results.map((player) => {
    if (player.participant_id !== participantId) return player;

    const marks = [...(player.color_protocol || [])];
    if (toIndex < 0 || toIndex >= marks.length) return player;

    const [moved] = marks.splice(fromIndex, 1);
    marks.splice(toIndex, 0, moved);

    return {
      ...player,
      color_protocol: marks
    };
  });

export const deleteColorMarkFromResults = (
  results: PlayerResultData[],
  participantId: string,
  index: number
): PlayerResultData[] =>
  results.map((player) => {
    if (player.participant_id !== participantId) return player;

    return {
      ...player,
      color_protocol: (player.color_protocol || []).filter(
        (_, markIndex) => markIndex !== index
      )
    };
  });

export const createColorMarkEditState = (
  index: number,
  entry: ColorProtocolMark
): ColorMarkEditState => ({
  index,
  seats: [...entry.seat_numbers],
  mark: entry.mark
});

export const toggleColorMarkEditSeat = (
  state: ColorMarkEditState,
  seatNumber: number
): ColorMarkEditState => ({
  ...state,
  seats: toggleColorSeatInList(state.seats, seatNumber)
});

export const setColorMarkEditType = (
  state: ColorMarkEditState,
  mark: ColorMarkType
): ColorMarkEditState => ({
  ...state,
  mark
});

export const saveEditedColorMarkToResults = (
  results: PlayerResultData[],
  participantId: string,
  state: ColorMarkEditState
): PlayerResultData[] =>
  results.map((player) => {
    if (player.participant_id !== participantId) return player;

    const marks = [...(player.color_protocol || [])];
    if (state.index >= 0 && state.index < marks.length) {
      marks[state.index] = {
        seat_numbers: sortSeats(state.seats),
        mark: state.mark
      };
    }

    return {
      ...player,
      color_protocol: marks
    };
  });
