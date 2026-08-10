import './api.ts';

declare module './api.ts' {
  interface TournamentGame {
    judge_player_id: string | null;
  }
}

export {};
