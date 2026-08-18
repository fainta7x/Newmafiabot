import type { VotingRound } from '../../shared/tournamentVoting.js';
import {
  createInitialGameDiscipline,
  type GameDiscipline,
  type PendingActionType,
} from '../../lib/gameDiscipline.js';
import type { BestMoveSource, LiveProtocolMarkers } from '../../lib/gameProtocolCore.js';
import type { ActivePlayerState, NightSubPhase, Phase } from './types.js';

export type VotingStage = 'setup' | 'collecting' | 'round_result' | 'revote_speeches' | 'table_decision' | 'resolved';
export type PostNightStage = 'none' | 'farewell' | 'death_protocol';

export type PendingDisciplineConfirmation = {
  slot: number;
  action: PendingActionType;
};

export type LiveSnapshot = {
  activePlayers: ActivePlayerState[];
  nominations: number[];
  nominationsMap: Record<number, number>;
  phase: Phase;
  roundNumber: number;
  nightSubPhase: NightSubPhase;
  postNightStage: PostNightStage;
  protocolMarkers: LiveProtocolMarkers;
  activeBestMoveSource: BestMoveSource | null;
  activeBestMoveSlot: number | null;
  pendingBestMoveSeats: number[];
  votingRounds: VotingRound[];
  activeVotingRoundIndex: number;
  votesByPlayer: Record<number, number>;
  votes: Record<number, number>;
  votingStage: VotingStage;
  revoteSpeakerIndex: number;
  tableLeaveVotesInput: number | null;
  currentVotingNomineeIndex: number;
  activeSpeakerSlot: number | null;
  customTimerLabel: string | null;
  timeLeft: number;
  timerMax: number;
  isTimerRunning: boolean;
  zeroNightSubPhase: 'agreement' | 'sheriff' | 'seating' | null;
  shotPlayerSlot: number | null;
  donCheckSlot: number | null;
  donCheckResult: boolean | null;
  sheriffCheckSlot: number | null;
  sheriffCheckResult: string | null;
  nightLogs: { round: number; log: string }[];
  votingFarewellQueue: number[];
  votingFarewellIndex: number;
  discipline: GameDiscipline;
};

export const createEmptyActivePlayer = (slot: number): ActivePlayerState => ({
  slot_num: slot,
  user_id: 0,
  nickname: '',
  role: 'Мирный',
  team: 'Красные',
  fouls: 0,
  minor_tech_fouls: 0,
  major_tech_fouls: 0,
  removal_reason: null,
  alive: true,
  nominated_this_round: false,
  has_spoken_this_round: false,
  mute_this_round: false,
  is_pu: false,
  best_move_guesses: [],
  kick: false,
  ppk: false,
  bonus_points: 0,
  lh_points: 0,
  will_protocol_points: 0,
  will_opinion_points: 0,
  dc_points: 0,
  eliminated_phase: '',
  has_foul_penalty: false,
  exit_reason: 'alive',
});

export const createInitialLiveDiscipline = (): GameDiscipline => createInitialGameDiscipline(
  Array.from({ length: 10 }, (_, index) => ({ id: String(index + 1), team: 'red' as const })),
);
