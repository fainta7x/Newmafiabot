export type CommunityRatingView = {section:'rating'|'ratingperiods'|'ratingtournaments';target:'metrics'|null};
export type CommunityActivityView = 'form'|'matches'|'season'|'history';
export type CommunityViewMemory = {rating:CommunityRatingView;activity:CommunityActivityView};
const key=(viewer:string)=>`community-view:${viewer}`;
/** View preferences only. Explicit addresses always take priority in the hub. */
export function readCommunityView(viewer:string):CommunityViewMemory {
  let value:any={};
  try{value=JSON.parse(sessionStorage.getItem(key(viewer))||'{}')||{};}catch{}
  const section=value.rating?.section==='ratingperiods'||value.rating?.section==='ratingtournaments'?value.rating.section:'rating';
  return {rating:{section,target:section==='rating'&&value.rating?.target==='metrics'?'metrics':null},activity:['form','matches','season','history'].includes(value.activity)?value.activity:'form'};
}
export function writeCommunityView(viewer:string,view:CommunityViewMemory){
  try{sessionStorage.setItem(key(viewer),JSON.stringify(view));}catch{/* Optional view memory. */}
}
