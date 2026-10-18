// Live Game hidden-control audit (owner request 2026-10-18): restores a saved game in every phase and lists the controls that
// exist in the page but cannot be used — display:none / zero size / opacity 0, off screen, clipped by a container, or covered
// by another element. Usage (dev server on :4173, `npm --prefix e2e ci` done):
//   CHROME_BIN=/path/to/chrome node e2e/tools/live-game-hidden-controls.mjs [state1,state2] [width height]
// Known intentional findings are listed in docs/AUDIT_LOG.md (the hidden judge toolbar, phone «+Ф», nomination chips between speeches).
import { chromium } from '@playwright/test';
const roles = ['Мирный','Мафия','Мирный','Шериф','Мирный','Мафия','Мирный','Дон','Мирный','Мирный'];
const mk = (spoken=true) => roles.map((role,i)=>({slot_num:i+1,user_id:i+1,nickname:`Игрок ${i+1}`,role,team:(role==='Мафия'||role==='Дон')?'Чёрные':'Красные',fouls:0,minor_tech_fouls:0,major_tech_fouls:0,removal_reason:null,alive:true,nominated_this_round:false,has_spoken_this_round:spoken,mute_this_round:false,is_pu:false,best_move_guesses:[],kick:false,ppk:false,bonus_points:0,lh_points:0,will_protocol_points:0,will_opinion_points:0,dc_points:0,eliminated_phase:'',has_foul_penalty:false,exit_reason:'alive'}));
const round = (o={}) => ({round_number:1,is_revote:false,nominated_seats:[3,7],vote_counts:{3:0,7:0},eligible_voters:10,day_number:1,parent_round_number:null,parent_nominated_seats:[],parent_vote_counts:{},outcome:'pending',eliminated_seats:[],table_leave_votes:null,...o});
const base = (patch={}, spoken=true) => ({activePlayers:mk(spoken),nominations:[],nominationsMap:{},phase:'day_speeches',roundNumber:2,dayStarterSlot:1,nightSubPhase:'intro',postNightStage:'none',
 protocolMarkers:{firstKilledSlot:null,zeroRoundVotedSlot:null,bestMoveSource:null,bestMoveSourceSlot:null,bestMoveSeats:[]},activeBestMoveSource:null,activeBestMoveSlot:null,pendingBestMoveSeats:[],bestMoveDeadlineMs:null,
 votingRounds:[],activeVotingRoundIndex:0,votesByPlayer:{},votes:{},votingStage:'setup',revoteSpeakerIndex:0,tableLeaveVotesInput:null,currentVotingNomineeIndex:0,activeSpeakerSlot:null,customTimerLabel:null,timeLeft:60,timerMax:60,isTimerRunning:false,zeroNightSubPhase:null,zeroNightMusicState:'pending',shotPlayerSlot:null,donCheckSlot:null,donCheckResult:null,sheriffCheckSlot:null,sheriffCheckResult:null,nightLogs:[],votingFarewellQueue:[],votingFarewellIndex:0,discipline:{},savedAt:'18:00',...patch});
const dead = (slots, arr) => arr.map(p=>slots.includes(p.slot_num)?{...p,alive:false,exit_reason:'killed'}:p);
const STATES = {
  zero_night_start: base({phase:'zero_night',roundNumber:1}),
  zero_night_agreement: base({phase:'zero_night',roundNumber:1,zeroNightSubPhase:'agreement',zeroNightMusicState:'playing',customTimerLabel:'Договорка',timeLeft:50,isTimerRunning:true}),
  speeches_idle: base({},false),
  speeches_active: base({activeSpeakerSlot:1,timeLeft:40,nominations:[3],nominationsMap:{1:3}},false),
  speeches_done: base({nominations:[3,7],nominationsMap:{1:3,2:7}}),
  voting_announce: base({phase:'day_voting',nominations:[3,7],votingRounds:[round()],votingStage:'setup',votes:{3:0,7:0}}),
  voting_collecting: base({phase:'day_voting',nominations:[3,7],votingRounds:[round()],votingStage:'collecting',votes:{3:0,7:0}}),
  voting_collecting_zero_round: base({phase:'day_voting',roundNumber:1,nominations:[3,7],votingRounds:[round()],votingStage:'collecting',votes:{3:0,7:0}}),
  round_result_tie: base({phase:'day_voting',nominations:[3,7],votingRounds:[round({vote_counts:{3:5,7:5}})],votingStage:'round_result',votes:{3:5,7:5}}),
  round_result_single: base({phase:'day_voting',nominations:[3,7],votingRounds:[round({vote_counts:{3:7,7:3}})],votingStage:'round_result',votes:{3:7,7:3}}),
  revote_speeches: base({phase:'day_voting',nominations:[3,7],votingRounds:[round({vote_counts:{3:5,7:5}})],votingStage:'revote_speeches',votes:{3:5,7:5},activeSpeakerSlot:3,timeLeft:20,timerMax:30}),
  table_decision: base({phase:'day_voting',nominations:[3,7],votingRounds:[round({round_number:2,is_revote:true,vote_counts:{3:5,7:5},parent_round_number:1,parent_nominated_seats:[3,7],parent_vote_counts:{3:5,7:5}})],votingStage:'table_decision',votes:{3:5,7:5}}),
  voting_farewell: base({phase:'day_voting',nominations:[3],votingRounds:[round({nominated_seats:[3],vote_counts:{3:10},outcome:'single_eliminated',eliminated_seats:[3]})],votingStage:'resolved',votes:{3:10},votingFarewellQueue:[3],votingFarewellIndex:0,activeSpeakerSlot:3,customTimerLabel:'Прощальная речь #3',timeLeft:30,activePlayers:dead([3],mk())}),
  night_intro: base({phase:'night',nightSubPhase:'intro'}),
  night_shooting: base({phase:'night',nightSubPhase:'shooting',shotPlayerSlot:6,customTimerLabel:'Стрельба мафии'}),
  night_don: base({phase:'night',nightSubPhase:'don',shotPlayerSlot:6,donCheckSlot:4,donCheckResult:true}),
  night_sheriff: base({phase:'night',nightSubPhase:'sheriff',shotPlayerSlot:6,sheriffCheckSlot:2,sheriffCheckResult:'КРАСНЫЙ'}),
  night_morning: base({phase:'night',nightSubPhase:'morning',shotPlayerSlot:6}),
  night_best_move: base({phase:'night',roundNumber:1,nightSubPhase:'best_move',shotPlayerSlot:6,activeBestMoveSource:'first_killed',activeBestMoveSlot:6,pendingBestMoveSeats:[1,2],activePlayers:dead([6],mk()),protocolMarkers:{firstKilledSlot:6,zeroRoundVotedSlot:null,bestMoveSource:null,bestMoveSourceSlot:null,bestMoveSeats:[]}}),
  night_farewell: base({phase:'night',nightSubPhase:'morning',postNightStage:'farewell',shotPlayerSlot:6,activeSpeakerSlot:6,customTimerLabel:'Прощальная речь #6',timeLeft:30,activePlayers:dead([6],mk())}),
  night_death_protocol: base({phase:'night',nightSubPhase:'morning',postNightStage:'death_protocol',shotPlayerSlot:6,activeSpeakerSlot:6,customTimerLabel:'Протокол убитого #6',timeLeft:10,timerMax:15,activePlayers:dead([6],mk())}),
};
const which = process.argv[2] ? process.argv[2].split(',') : Object.keys(STATES);
const sizes = process.argv[3] ? [[Number(process.argv[3]),Number(process.argv[4])]] : [[390,844],[1366,768]];
const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const probe = () => {
  const shell = document.querySelector('.evening-live-engine-shell') || document.body;
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  const nodes = [...document.querySelectorAll('button, select, input, textarea, [role="button"], a[href]')];
  for (const el of nodes) {
    const name = ((el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().replace(/\s+/g,' ')).slice(0,40) || '(без текста)';
    const id = el.getAttribute('data-testid') || '';
    let hiddenBy = null;
    for (let p = el; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none') { hiddenBy = 'display:none на ' + (p === el ? 'самом элементе' : (p.getAttribute('data-testid') || p.className.toString().slice(0,50) || p.tagName)); break; } if (cs.visibility === 'hidden') { hiddenBy = 'visibility:hidden'; break; } if (Number(cs.opacity) === 0) { hiddenBy = 'opacity:0'; break; } }
    const r = el.getBoundingClientRect();
    if (!hiddenBy && (r.width < 1 || r.height < 1)) hiddenBy = 'нулевой размер';
    if (hiddenBy) { out.push({kind:'hidden', name, id, why: hiddenBy}); continue; }
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) { out.push({kind:'offscreen', name, id, why:`вне экрана (${Math.round(r.left)},${Math.round(r.top)})`}); continue; }
    // clipped by a scroll/overflow ancestor
    let clipped = null;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(cs.overflowY + cs.overflowX)) { const pr = p.getBoundingClientRect(); if (cy < pr.top - 1 || cy > pr.bottom + 1 || cx < pr.left - 1 || cx > pr.right + 1) { clipped = 'обрезан ' + (p.getAttribute('data-testid') || p.className.toString().slice(0,40)); break; } }
    }
    if (clipped) { out.push({kind:'clipped', name, id, why: clipped}); continue; }
    const top = document.elementFromPoint(Math.min(Math.max(cx,0),vw-1), Math.min(Math.max(cy,0),vh-1));
    if (top && top !== el && !el.contains(top) && !top.contains(el)) out.push({kind:'covered', name, id, why:'перекрыт: ' + (top.getAttribute('data-testid') || top.className.toString().slice(0,60) || top.tagName)});
  }
  return out;
};
for (const [w,h] of sizes) {
  console.log(`\n######## ${w}x${h}`);
  for (const key of which) {
    const page = await (await b.newContext({ viewport:{width:w,height:h}})).newPage();
    await page.addInitScript((s)=>{ const o=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){ if(k==='mafia_live_session'&&!window.__done){ try{ s.discipline=JSON.parse(v).discipline; }catch{} v=JSON.stringify(s); window.__done=true; } return o.call(this,k,v);}; }, STATES[key]);
    await page.goto('http://127.0.0.1:4173/e2e/live-game.html?mode=recovery');
    await page.getByRole('button',{name:'Восстановить',exact:true}).click({timeout:3000}).catch(()=>console.log('  (кнопка «Восстановить» перекрыта окном)'));
    await page.waitForTimeout(700);
    const res = await page.evaluate(probe);
    const interesting = res.filter(r => r.kind !== 'hidden' || true);
    console.log(`--- ${key}: ${interesting.length} проблем`);
    for (const r of interesting) console.log(`  [${r.kind}] «${r.name}» ${r.id?'#'+r.id:''} — ${r.why}`);
    await page.context().close();
  }
}
await b.close();
