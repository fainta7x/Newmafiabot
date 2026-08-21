import { Player, GameSlot } from "../../types.js";

export interface ActivePlayerState {
  slot_num: number;
  user_id: number;
  nickname: string;
  role: "Мирный" | "Шериф" | "Мафия" | "Дон";
  team: "Красные" | "Чёрные";
  fouls: number;
  minor_tech_fouls?: number;
  major_tech_fouls?: number;
  removal_reason?: '4th_foul' | '2nd_tech' | 'direct' | null;
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
  exit_reason?: 'alive' | 'killed' | 'voted_zero_round' | 'voted_day' | 'removed';
}

export type Phase = "setup" | "zero_night" | "day_speeches" | "day_voting" | "shootout" | "night";

export type NightSubPhase = "intro" | "shooting" | "don" | "sheriff" | "best_move" | "morning";

export interface LiveGameEngineProps {
  players: Player[];
  initialJudgeId: number;
  onGameFinished: (gameData: { winning_team: "Красные" | "Чёрные"; protocol_text: string; slots: GameSlot[]; judge_id: number }) => void;
  onCancel: () => void;
  onPhaseChange?: (phase: string) => void;
  rolesHidden?: boolean;
  onRolesHiddenChange?: (hidden: boolean) => void;
}
