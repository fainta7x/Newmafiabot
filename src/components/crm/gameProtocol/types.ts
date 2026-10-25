import type { LiveGameEvent } from '../../../shared/liveGameEvents';
import type { PlayerResultData, TournamentGameProtocolData } from '../../../lib/api';
import type { ZeroRoundRule } from '../../../shared/zeroRoundRule';
import type { TechFoulType } from '../tournaments/protocol/protocolDisciplineUtils';

/** Everything the views may do to the protocol. The editor owns the state; the views only call these. */
export type ProtocolApi = {
  protocol: TournamentGameProtocolData;
  results: PlayerResultData[];
  /** A confirmed game cannot be edited until «Исправить протокол». */
  locked: boolean;
  tableSize: number;
  zeroRoundRule: ZeroRoundRule;

  updateResult: (participantId: string, updates: Partial<PlayerResultData>) => void;
  changeRegularFoul: (player: PlayerResultData, delta: number) => void;
  changeTechFoul: (player: PlayerResultData, type: TechFoulType, delta: number) => void;
  causePpk: (player: PlayerResultData) => void;
  cancelPpk: () => void;
  removeByJudge: (player: PlayerResultData) => void;
  cancelRemoval: (player: PlayerResultData) => void;
  setWinner: (team: 'red' | 'black' | null) => void;
  setJudgeNotes: (notes: string) => void;
  setReplacement: (replacement: any | null) => void;

  changeRound: (index: number, updater: (round: any) => any) => void;
  confirmOutcome: (index: number, outcome: string, winners: number[]) => void;
  resetOutcome: (index: number) => void;
  addVoting: (day: number) => void;
  deleteVoting: (index: number) => void;
  setEvents: (updater: (events: LiveGameEvent[]) => LiveGameEvent[]) => void;
  setZeroBreakSeat: (seat: number | null) => void;

  changeFirstKilled: (participantId: string | null) => void;
  changeZeroRoundVoted: (participantId: string | null) => void;
  toggleBestMoveSeat: (source: 'first_killed' | 'zero_round_voted', participantId: string, seat: number) => void;
  addNight: () => void;
  deleteNight: (index: number) => void;
  changeShot: (index: number, targetSeat: number, result: 'killed' | 'miss' | 'agreement_failed') => void;
  assessMiss: (index: number, reason: 'error' | 'intentional' | null, responsible: number[]) => void;
};

