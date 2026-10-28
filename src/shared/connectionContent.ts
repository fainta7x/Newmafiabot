import type {ConnectionMember,ConnectionSample} from './clubConnectionStories.ts';
import type {MetricFilters} from './metricTable.ts';
import type {GameRole} from './gameRoles.ts';
export type PairGame={game_key:string;date:string;title:string;number:number;a_role:GameRole|null;b_role:GameRole|null;a_team:'red'|'black';b_team:'red'|'black';a_won:boolean;b_won:boolean};
export type PairSummary={members:ConnectionMember[];games:number;events:number;together:number;against:number;a_wins:number;b_wins:number;last_date:string};
export type PairStreak={members:ConnectionMember[];team:'red'|'black';games:number;current:number;best:number;last_date:string};
export type NewPair={members:ConnectionMember[];team:'red'|'black';date:string;game_key:string};
export type PairHistory=PairSummary&{red:ConnectionSample;black:ConnectionSample;roles:Array<{a_role:GameRole|null;b_role:GameRole|null;games:number;wins:number}>;last_games:PairGame[]};
export type ConnectionContent={filters:MetricFilters;players:ConnectionMember[];streaks:PairStreak[];new_pairs:NewPair[];rivals:PairSummary[];table_pairs:PairSummary[];pair:PairHistory|null};
