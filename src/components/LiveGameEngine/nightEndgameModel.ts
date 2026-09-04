export type NightEndgameStage = 'none' | 'farewell' | 'death_protocol';
export type NightEndgameAction = 'resolve_night' | 'death_protocol' | 'finish_game' | 'next_day';

export const getNightResolutionStage = (killedSlot: number | null): NightEndgameStage =>
  killedSlot === null ? 'none' : 'farewell';

export const getNightEndgameAction = (
  stage: NightEndgameStage,
  winner: 'Красные' | 'Чёрные' | null,
): NightEndgameAction => {
  if (stage === 'farewell') return 'death_protocol';
  if (stage === 'death_protocol') return winner ? 'finish_game' : 'next_day';
  return 'resolve_night';
};
