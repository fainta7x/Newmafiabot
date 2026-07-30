export type RecognizedRole = 'citizen' | 'sheriff' | 'mafia' | 'don' | null;
export type WinnerTeam = 'red' | 'black' | null;
export type ShotResult = 'killed' | 'miss' | 'agreement_failed' | null;
export type ProtocolMark = 'red' | 'black' | 'sheriff';

export interface ConfidenceField<T> {
  value: T;
  confidence: number;
}

export interface RecognizedPlayer {
  seat_number: number;
  written_name: string | null;
  role: ConfidenceField<RecognizedRole>;
  regular_fouls: ConfidenceField<number>;
  technical_fouls: ConfidenceField<number>;
  judge_bonus: ConfidenceField<number>;
  protocol_bonus: ConfidenceField<number>;
  penalty_points: ConfidenceField<number>;
}

export interface RecognizedBestMove {
  recipient_seat: number | null;
  seat_numbers: number[];
  confidence: number;
}

export interface RecognizedShot {
  night_number: number;
  seat_number: number | null;
  result: ShotResult;
  confidence: number;
}

export interface RecognizedVoteEntry {
  candidate_seat: number;
  votes_count: number;
}

export interface RecognizedVote {
  round_number: number;
  is_revote: boolean;
  entries: RecognizedVoteEntry[];
  confidence: number;
}

export interface RecognizedColorProtocolEntry {
  seat_numbers: number[];
  mark: ProtocolMark;
}

export interface RecognizedColorProtocol {
  owner_seat: number;
  entries: RecognizedColorProtocolEntry[];
  confidence: number;
}

export interface DetectedGame {
  game_number: number | null;
  game_number_confidence: number;
  winner_team: ConfidenceField<WinnerTeam>;
  players: RecognizedPlayer[];
  best_move: RecognizedBestMove | null;
  shots: RecognizedShot[];
  votes: RecognizedVote[];
  color_protocols: RecognizedColorProtocol[];
  judge_name: ConfidenceField<string | null>;
  warnings: string[];
}

export interface RecognitionResult {
  detected_games: DetectedGame[];
}

export interface RecognitionProvider {
  recognizeScoresheet(imageBuffer: Buffer, mimeType: string): Promise<RecognitionResult>;
}
