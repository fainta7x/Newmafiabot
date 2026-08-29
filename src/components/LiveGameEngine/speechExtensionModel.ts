import type { GameDiscipline } from '../../lib/gameDiscipline.js';

export type SpeechExtensionPhase = 'day_speeches' | 'day_voting' | 'night' | string;

export interface SpeechExtensionAvailabilityInput {
  phase: SpeechExtensionPhase;
  roundNumber: number;
  votingStage: string;
  postNightStage: string;
  activeSpeakerSlot: number | null;
  votingFarewellActive: boolean;
  regularFouls: number;
  isRemoved: boolean;
  hasPendingDisciplineAction: boolean;
}

export interface SpeechExtensionAvailability {
  allowed: boolean;
  reason: string;
}

export const getSpeechExtensionAvailability = ({
  phase,
  roundNumber,
  votingStage,
  postNightStage,
  activeSpeakerSlot,
  votingFarewellActive,
  regularFouls,
  isRemoved,
  hasPendingDisciplineAction,
}: SpeechExtensionAvailabilityInput): SpeechExtensionAvailability => {
  if (activeSpeakerSlot === null) return { allowed: false, reason: 'Сейчас никто не говорит' };
  if (roundNumber <= 1) return { allowed: false, reason: 'На нулевом круге обмен недоступен' };

  const isRegularSpeech = phase === 'day_speeches';
  const isRevoteSpeech = phase === 'day_voting' && votingStage === 'revote_speeches';
  const isVotingFarewell = phase === 'day_voting' && votingFarewellActive;
  const isNightFarewell = phase === 'night' && postNightStage === 'farewell';
  if (!isRegularSpeech && !isRevoteSpeech && !isVotingFarewell && !isNightFarewell) {
    return { allowed: false, reason: 'Обмен доступен только во время речи игрока' };
  }

  if (isRemoved) return { allowed: false, reason: 'Удалённый игрок не может обменять фолы на речь' };
  if (hasPendingDisciplineAction) return { allowed: false, reason: 'Сначала завершите текущее дисциплинарное действие' };
  if (regularFouls >= 2) return { allowed: false, reason: 'Нужно иметь 0 или 1 обычный фол' };

  return { allowed: true, reason: '' };
};

export const exchangeTwoFoulsForSpeech = (state: GameDiscipline, playerId: string): GameDiscipline => {
  if (state.isPpk) return state;
  const player = state.players[playerId];
  if (!player || player.isRemoved || player.pendingAction || player.regularFouls >= 2) return state;

  const regularFouls = player.regularFouls + 2;
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        regularFouls,
        // 1 -> 3: the current speech gets +30 now, while the normal third-foul
        // penalty remains queued for the player's next speech.
        has30SecPenalty: regularFouls === 3 ? true : player.has30SecPenalty,
      },
    },
  };
};
