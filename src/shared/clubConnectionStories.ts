export type ConnectionMember = { player_id: string; nickname: string };
export type ConnectionSample = { games: number; events: number; wins: number; win_rate: number };
export type TeamConnectionStory = ConnectionSample & { members: ConnectionMember[] };
export type RivalryConnectionStory = { members: ConnectionMember[]; games: number; events: number; a_wins: number; b_wins: number };
export type VersatileConnectionStory = { members: ConnectionMember[]; red: ConnectionSample; black: ConnectionSample };
export type CircleConnectionStory = ConnectionMember & { games: number; events: number; people: number };
export type ClubConnectionStories = {
  black_trios: TeamConnectionStory[];
  don_mafia: TeamConnectionStory[];
  sheriff_citizen: TeamConnectionStory[];
  balanced_rivalries: RivalryConnectionStory[];
  versatile_pairs: VersatileConnectionStory[];
  table_circles: CircleConnectionStory[];
};
