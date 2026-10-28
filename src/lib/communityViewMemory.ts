export type CommunityDestination = {section:'rating'|'ratingperiods'|'ratingtournaments'|'club';target:string|null};
export type CommunityRatingView = {section:'rating'|'ratingperiods'|'ratingtournaments';target:'archive'|null};
export type CommunityActivityView = 'form'|'matches'|'season'|'history';
export type CommunityViewMemory = {rating:CommunityRatingView;activity:CommunityActivityView;players:'list'|'metrics'|'form';history:'matches'|'hall';last:CommunityDestination};
const key=(viewer:string)=>`community-view:${viewer}`;
const targets=['metrics','form','history','hall','connections','games'];
/** View preferences only; explicit addresses always take priority over remembered groups. */
export function readCommunityView(viewer:string):CommunityViewMemory {
  let value:any={};try{value=JSON.parse(sessionStorage.getItem(key(viewer))||'{}')||{};}catch{}
  const section=value.rating?.section==='ratingperiods'||value.rating?.section==='ratingtournaments'?value.rating.section:'rating';
  const last=value.last;
  const validLast=last&&(['rating','ratingperiods','ratingtournaments'].includes(last.section)||last.section==='club'&&(last.target==null||targets.includes(last.target)));
  return {rating:{section,target:section==='ratingperiods'&&value.rating?.target==='archive'?'archive':null},activity:['form','matches','season','history'].includes(value.activity)?value.activity:'form',players:value.players==='metrics'||value.players==='form'?value.players:value.rating?.target==='metrics'?'metrics':'list',history:value.history==='hall'?'hall':'matches',last:validLast?{section:last.section,target:last.target||null}:{section:'club',target:null}};
}
export function writeCommunityView(viewer:string,view:CommunityViewMemory){try{sessionStorage.setItem(key(viewer),JSON.stringify(view));}catch{}}
