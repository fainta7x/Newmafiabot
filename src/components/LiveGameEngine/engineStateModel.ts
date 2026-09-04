import type { VotingRound } from '../../shared/tournamentVoting.js';
import {
  createInitialGameDiscipline,
  type GameDiscipline,
  type PendingActionType,
} from '../../lib/gameDiscipline.js';
import {
  createEmptyLiveProtocolMarkers,
  type BestMoveSource,
  type LiveProtocolMarkers,
} from '../../lib/gameProtocolCore.js';
import type { ActivePlayerState, NightSubPhase, Phase } from './types.js';

export type VotingStage = 'setup' | 'collecting' | 'round_result' | 'revote_speeches' | 'table_decision' | 'resolved';
export type PostNightStage = 'none' | 'farewell' | 'death_protocol';
export type ZeroNightMusicState = 'pending' | 'playing' | 'stopped';

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
  dayStarterSlot?: number;
  nightSubPhase: NightSubPhase;
  postNightStage: PostNightStage;
  protocolMarkers: LiveProtocolMarkers;
  activeBestMoveSource: BestMoveSource | null;
  activeBestMoveSlot: number | null;
  pendingBestMoveSeats: number[];
  bestMoveDeadlineMs: number | null;
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
  zeroNightMusicState: ZeroNightMusicState;
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

const jsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

export const cloneLiveSnapshot = (snapshot: LiveSnapshot): LiveSnapshot => ({
  ...snapshot,
  activePlayers: jsonClone(snapshot.activePlayers),
  nominations: [...snapshot.nominations],
  nominationsMap: { ...snapshot.nominationsMap },
  protocolMarkers: jsonClone(snapshot.protocolMarkers),
  pendingBestMoveSeats: [...snapshot.pendingBestMoveSeats],
  votingRounds: jsonClone(snapshot.votingRounds),
  votesByPlayer: { ...snapshot.votesByPlayer },
  votes: { ...snapshot.votes },
  nightLogs: jsonClone(snapshot.nightLogs),
  votingFarewellQueue: [...snapshot.votingFarewellQueue],
  discipline: jsonClone(snapshot.discipline),
});

export const normalizeLiveSnapshotForRestore = (snapshot: LiveSnapshot): LiveSnapshot => ({
  ...snapshot,
  dayStarterSlot: snapshot.dayStarterSlot ?? (((snapshot.roundNumber - 1) % 10) + 1),
  nominationsMap: snapshot.nominationsMap || {},
  postNightStage: snapshot.postNightStage || 'none',
  protocolMarkers: snapshot.protocolMarkers || createEmptyLiveProtocolMarkers(),
  activeBestMoveSource: snapshot.activeBestMoveSource || null,
  activeBestMoveSlot: snapshot.activeBestMoveSlot ?? null,
  pendingBestMoveSeats: snapshot.pendingBestMoveSeats || [],
  bestMoveDeadlineMs: snapshot.bestMoveDeadlineMs ?? null,
  votingRounds: snapshot.votingRounds || [],
  activeVotingRoundIndex: snapshot.activeVotingRoundIndex || 0,
  votesByPlayer: snapshot.votesByPlayer || {},
  votes: snapshot.votes || {},
  votingStage: snapshot.votingStage || 'setup',
  revoteSpeakerIndex: snapshot.revoteSpeakerIndex || 0,
  tableLeaveVotesInput: snapshot.tableLeaveVotesInput ?? null,
  currentVotingNomineeIndex: snapshot.currentVotingNomineeIndex || 0,
  activeSpeakerSlot: snapshot.activeSpeakerSlot ?? null,
  customTimerLabel: snapshot.customTimerLabel ?? null,
  timeLeft: snapshot.timeLeft ?? 60,
  timerMax: snapshot.timerMax ?? 60,
  isTimerRunning: Boolean(snapshot.isTimerRunning),
  zeroNightSubPhase: snapshot.zeroNightSubPhase ?? null,
  zeroNightMusicState: snapshot.zeroNightMusicState ?? 'pending',
  shotPlayerSlot: snapshot.shotPlayerSlot ?? null,
  donCheckSlot: snapshot.donCheckSlot ?? null,
  donCheckResult: snapshot.donCheckResult ?? null,
  sheriffCheckSlot: snapshot.sheriffCheckSlot ?? null,
  sheriffCheckResult: snapshot.sheriffCheckResult ?? null,
  nightLogs: snapshot.nightLogs || [],
  votingFarewellQueue: snapshot.votingFarewellQueue || [],
  votingFarewellIndex: snapshot.votingFarewellIndex || 0,
  discipline: snapshot.discipline || createInitialLiveDiscipline(),
});
