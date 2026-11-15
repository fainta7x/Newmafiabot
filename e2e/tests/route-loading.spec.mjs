import { test, expect } from '@playwright/test';
test.skip(!process.env.ROUTE_LOADING_PREVIEW, 'Requires a production preview: use route-loading.config.mjs');
const profile={player:{id:'p',nickname:'Loading audit',full_name:null,phone:null,telegram_username:null,elo:1000,tokens:100,game_level:'club',club_role:'member',judge_level:'none',avatar_url:null},achievements:{earned:0,total:0,percentage:0,categories:[]},games:{all:[],stats:{totalGames:0,completedGames:0,wins:0,losses:0,winRate:0,clubGames:0,tournamentGames:0,redGames:0,blackGames:0,bestMoves:0,firstKilled:0,zeroRoundVoted:0,lastGameAt:null,roleCounts:{citizen:0,sheriff:0,mafia:0,don:0,unknown:0}}},tournaments:{games:[],awards:[],award_stats:{firstPlaces:0,secondPlaces:0,thirdPlaces:0,nominations:0},completed_participations:[]}};
async function mockApi(page, authGate=Promise.resolve()){
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname;
  if(p==='/api/auth/me'){await authGate;return route.fulfill({json:{linked:true,isOrganizer:false}});}
  if(p==='/api/player/me')return route.fulfill({json:profile});
  const bodies={'/api/player/evenings':{evenings:[]},'/api/player/payments':{summary:{historical_debt:0}},'/api/player/news':{news:[]},'/api/player/novice':{player:null},'/api/rating':{players:[]},'/api/player/profile-completeness':{complete:true,missing:[]},'/api/player/evening-journey':{journey:null}};
  return route.fulfill(p in bodies?{json:bodies[p]}:{status:404,json:{error:'not part of this isolated flow'}});
 });
}
for(const width of [390,1440])test(`player chunk starts before auth completes at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:844});
 let release;const gate=new Promise(r=>{release=r;});
 await mockApi(page,gate);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const files=[];page.on('request',r=>files.push(new URL(r.url()).pathname));
 await page.goto('/player',{waitUntil:'domcontentloaded'});
 try{await expect.poll(()=>files.some(p=>/PlayerCabinetShell-.*\.js$/.test(p))).toBe(true);}finally{release();}
 await expect(page.getByTestId('player-cabinet-shell')).toBeVisible();
 await expect(page.getByTestId('player-bottom-nav')).toBeVisible();
 expect(errors).toEqual([]);
 await page.reload();
 await expect(page.getByTestId('player-cabinet-shell')).toBeVisible();
 expect(errors).toEqual([]);
 await page.screenshot({path:info.outputPath(`player-${width}.png`),fullPage:true});
});
test('one stale player chunk reloads and recovers the signed-in cabinet',async({page})=>{
 await mockApi(page);
 let attempts=0;
 // A stale asset stays absent for this document, including modulepreload retries.
 // Reloading the entry document is what makes the fresh chunk available.
 await page.route('**/assets/PlayerCabinetShell-*.js',async route=>{
  attempts++;
  // History.replaceState also emits framenavigated; it is not a document reload.
  const reloaded=await page.evaluate(()=>performance.getEntriesByType('navigation')[0]?.type==='reload');
  return reloaded?route.continue():route.fulfill({status:404,body:'stale deployment chunk'});
 });
 await page.goto('/player',{waitUntil:'domcontentloaded'});
 await expect(page.getByTestId('player-cabinet-shell')).toBeVisible();
 expect(attempts).toBeGreaterThanOrEqual(2);
 expect(await page.evaluate(()=>Number(sessionStorage.getItem('mafia_chunk_reload_at')))).toBeGreaterThan(0);
});
