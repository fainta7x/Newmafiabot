import type { LiveRosterIdentity } from '../../lib/liveRosterCorrections.ts';
import type { LiveRoleAssignments } from '../../lib/liveRoleCorrections.ts';
import type { LiveProtocolEvidence, LiveSessionSnapshot } from '../../lib/liveClubSession.ts';
import type { GameRole, GameTeam } from '../../shared/gameRoles.ts';
import type { ZeroRoundRule } from '../../shared/zeroRoundRule.ts';
import { Player, GameSlot } from "../../types.js";
import type { PhysicalRole } from '../game/PhysicalRoleDeal.tsx';
import type { GameExitType, RemovalReason } from '../../shared/gameExit.ts';

export interface ActivePlayerState {
  slot_num: number;
  user_id: number;
  nickname: string;
  role: GameRole;
  team: GameTeam;
  fouls: number;
  minor_tech_fouls?: number;
  major_tech_fouls?: number;
  removal_reason?: RemovalReason | null;
  alive: boolean;
  nominated_this_round: boolean;
  has_spoken_this_round: boolean;
  mute_this_round: boolean;
  is_pu: boolean;
  best_move_guesses: number[];
  kick: boolean;
  ppk: boolean;
  bonus_points: number;
  lh_points: number;
  will_protocol_points: number;
  will_opinion_points: number;
  dc_points: number;
  eliminated_phase: string;
  has_foul_penalty?: boolean;
  note?: string;
  exit_reason?: GameExitType;
}

export type Phase = "setup" | "zero_night" | "day_speeches" | "day_voting" | "shootout" | "night";
export type NightSubPhase = "intro" | "shooting" | "don" | "sheriff" | "best_move" | "morning";

export interface LiveGameEngineProps {
  players: Player[];
  /** Latest complete role assignment observed in the tournament CRM. */
  roleAssignments?: LiveRoleAssignments | null;
  /** Complete CRM participant identities by seat, independent of historical seat actions. */
  rosterIdentity?: LiveRosterIdentity | null;
  readProtocolEvidence?: () => LiveProtocolEvidence;
  initialJudgeId: number;
  onGameFinished: (gameData: { winning_team: "Красные" | "Чёрные"; protocol_text: string; slots: GameSlot[]; judge_id: number; protocol_evidence?: LiveProtocolEvidence; protocol_snapshot?: LiveSessionSnapshot }) => void;
  onCancel: () => void;
  onPhaseChange?: (phase: string) => void;
  rolesHidden?: boolean;
  onRolesHiddenChange?: (hidden: boolean) => void;
  /** Identity of the game this engine runs (for example `tournament:<gameId>`): a saved session of another game is never offered. */
  sessionKey?: string;
  trainingRoles?: Record<number, PhysicalRole>;
  /** What a broken zero-round split does; the judge may change it on the setup screen. Default: tournament. */
  zeroRoundRule?: ZeroRoundRule;
}
