// Diagnostic only: synthetic players; no database, network or production writes.
import { pokerHandRank, compareRanks, createDeck, createPokerHand, applyPokerAction, type PokerCard, type PokerSuit } from '../server/services/pokerEngine.ts';
import { observePokerHand, resetPokerBotMemoryForTests, estimateEquity, opponentRanges, pokerOpponentProfile, chooseStrongBotAction, exportPokerOpponentStats } from '../server/services/pokerBot.ts';
const suits: Record<string, PokerSuit> = {s:'spades',h:'hearts',d:'diamonds',c:'clubs'};
const c = (s: string): PokerCard => ({rank: s[0] as PokerCard['rank'], suit: suits[s[1]]});
const hole=['Ah','Ad'].map(c),board=['Qc','7d','2s','9h','3c'].map(c),used=new Set([...hole,...board].map(x=>x.rank+x.suit));
const pool=createDeck().filter(x=>!used.has(x.rank+x.suit));const hero=pokerHandRank([...hole,...board]);
const combos=[];
for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++){const rank=pokerHandRank([pool[i],pool[j],...board]);const cmp=compareRanks(hero,rank);combos.push({rank,equity:cmp>0?1:cmp===0?.5:0});}
combos.sort((a,b)=>compareRanks(b.rank,a.rank));
const top=combos.slice(0,Math.ceil(combos.length*.1));
console.log(JSON.stringify({probe:'exact complete river enumeration',combos:combos.length,allEquity:combos.reduce((s,x)=>s+x.equity,0)/combos.length,strongestTenPctCombos:top.length,strongestTenPctEquity:top.reduce((s,x)=>s+x.equity,0)/top.length}));
resetPokerBotMemoryForTests();
for(let i=0;i<30;i++)observePokerHand({players:[{id:'a'},{id:'b'},{id:'bot'}],action_log:[{player_id:'a',street:'preflop',type:'all_in',amount:1000},{player_id:'b',street:'preflop',type:'fold',amount:0},{player_id:'bot',street:'preflop',type:'fold',amount:0}]});
const hand=createPokerHand({id:'short-caller',dealer_seat:1,players:[{id:'a',nickname:'a',seat:1,chips:1000},{id:'b',nickname:'b',seat:2,chips:100},{id:'bot',nickname:'bot',seat:3,chips:1000}]});
applyPokerAction(hand,{type:'all_in'});applyPokerAction(hand,{type:'all_in'});
console.log(JSON.stringify({probe:'legal short all-in caller',current:hand.current_seat,actions:hand.action_log.map(x=>({id:x.player_id,type:x.type,amount:x.amount})),profileActualRaiser:pokerOpponentProfile('a'),ranges:opponentRanges(hand,hand.players[2])}));
for(let i=0;i<30;i++)observePokerHand({players:[{id:'a'},{id:'b'},{id:'bot'}],action_log:[{player_id:'a',street:'preflop',type:'all_in',amount:1000},{player_id:'b',street:'preflop',type:'fold',amount:0},{player_id:'bot',street:'preflop',type:'fold',amount:0}]});
const base=createPokerHand({id:'all-in-compare',dealer_seat:1,players:[{id:'a',nickname:'a',seat:1,chips:1000},{id:'b',nickname:'b',seat:2,chips:100},{id:'bot',nickname:'bot',seat:3,chips:1000}]});
applyPokerAction(base,{type:'all_in'});
for(const answer of ['fold','all_in'] as const){
 const h=structuredClone(base);applyPokerAction(h,{type:answer});h.hole_cards.bot=['Kc','9d'].map(c);
 let x=7;const random=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};
 console.log(JSON.stringify({probe:'reply to known wide shover',shortStackAnswer:answer,botReply:chooseStrongBotAction(h,h.players[2],random)}));
}
const callHand=createPokerHand({id:'post-all-in-call',dealer_seat:1,players:[{id:'p1',nickname:'p1',seat:1,chips:50},{id:'p2',nickname:'p2',seat:2,chips:1000}]});
applyPokerAction(callHand,{type:'call'});applyPokerAction(callHand,{type:'check'});applyPokerAction(callHand,{type:'bet',amount:100});applyPokerAction(callHand,{type:'all_in'});
resetPokerBotMemoryForTests();observePokerHand(callHand);
console.log(JSON.stringify({probe:'legal postflop all-in call learning',actions:callHand.action_log.map(x=>({id:x.player_id,street:x.street,type:x.type,amount:x.amount})),stats:exportPokerOpponentStats()}));

function rng(seed: number) { let x = seed; return () => { x = (Math.imul(x,1664525)+1013904223) >>> 0; return x/4294967296; }; }
const flop = ['Qc','7d','2s'].map(c);
const weak = pokerHandRank([...['Ah','Td'].map(c), ...flop]);
const strong = pokerHandRank([...['7h','7s'].map(c), ...flop]);
const key = (rank: number[]) => rank.reduce((total,value) => total*15+value,0);
console.log(JSON.stringify({probe:'ranking inversion',weak,strong,canonicalComparison:compareRanks(strong,weak),weakKey:key(weak),strongKey:key(strong)}));
console.log(JSON.stringify({probe:'current river range estimator',unfiltered:estimateEquity(hole,board,[1],rng(123),10000,8),boardMin90:estimateEquity(hole,board,[{range:1,boardMin:.9}],rng(123),10000,8)}));
resetPokerBotMemoryForTests();
