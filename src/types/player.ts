export type PlayerMeResponse = {
  player: {
    id: string;
    nickname: string;
    full_name: string | null;
    telegram_username: string | null;
    elo: number;
    tokens: number;
    game_level: string;
    avatar_url: string | null;
  };
  achievements: {
    earned: number;
    total: number;
    percentage: number;
    categories: Array<{
      id: string;
      name: string;
      achievements: Array<{
        id: string;
        name: string;
        description: string;
        icon: string;
        rarity_name: string;
        rarity_icon: string;
        earned: boolean;
      }>;
    }>;
  };
  games: {
    all: Array<{
      id: string;
      source: 'club' | 'tournament';
      title: string;
      date: string | null;
      game_number: number;
      role: string | null;
      status: string;
      won: boolean | null;
      seat_number: number;
      judge_name: string | null;
      table_name: string | null;
      judge_bonus: number;
      protocol_bonus: number;
      ci_points: number;
      penalty_points: number;
      disciplinary_penalty_points: number;
      regular_fouls: number;
      minor_technical_fouls: number;
      major_technical_fouls: number;
      best_move: boolean;
      first_killed: boolean;
      zero_round_voted: boolean;
    }>;
    stats: {
      totalGames: number;
      completedGames: number;
      wins: number;
      losses: number;
      winRate: number;
      clubGames: number;
      tournamentGames: number;
      redGames: number;
      blackGames: number;
      bestMoves: number;
      firstKilled: number;
      zeroRoundVoted: number;
      lastGameAt: string | null;
      roleCounts: {
        citizen: number;
        sheriff: number;
        mafia: number;
        don: number;
        unknown: number;
      };
    };
  };
  tournaments: {
    games: PlayerMeResponse['games']['all'];
    awards: Array<{
      id: string;
      title: string;
      tournament_title: string;
      tournament_date: string | null;
    }>;
    award_stats: {
      firstPlaces: number;
      secondPlaces: number;
      thirdPlaces: number;
      nominations: number;
    };
    completed_participations: unknown[];
  };
};
