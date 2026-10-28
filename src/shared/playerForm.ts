export const FORM_WINDOW=10;
export const FORM_STREAK_LIMIT=5;
export const FORM_STREAK_POINTS=3;
export const FORM_MAX=100+FORM_STREAK_LIMIT*FORM_STREAK_POINTS;
export type FormResult={won:boolean};
export function formWinStreak(results:FormResult[]){let streak=0;for(const result of results){if(!result.won)break;streak++;}return streak;}
/** Results are newest first. This is the existing pulse formula, with no calendar decay. */
export function playerFormScore(results:FormResult[]){
 if(!results.length)return 0;
 let weightedWins=0;let totalWeight=0;
 results.forEach((result,index)=>{const weight=Math.max(1,FORM_WINDOW-index);totalWeight+=weight;if(result.won)weightedWins+=weight;});
 return Math.round(weightedWins/Math.max(1,totalWeight)*100+Math.min(FORM_STREAK_LIMIT,formWinStreak(results))*FORM_STREAK_POINTS);
}
export function comparePlayerForm(a:{score:number;wins:number;elo:number;nickname:string},b:{score:number;wins:number;elo:number;nickname:string}){return b.score-a.score||b.wins-a.wins||b.elo-a.elo||a.nickname.localeCompare(b.nickname,'ru');}
