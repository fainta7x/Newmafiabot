import {createRoot} from 'react-dom/client';
import './appStyles.ts';
import PlayerTournamentView from '../src/components/player/PlayerTournamentView.tsx';
import {TournamentSeatMessagesCard} from '../src/components/crm/tournaments/TournamentSeatMessagesCard.tsx';

// Tournament preview (owner, 2026-11-18): ?mode=games-open|games-hidden|results-hidden for the player, seating-choice for the CRM card.
const mode=new URLSearchParams(location.search).get('mode')||'games-open';
const hidden=mode.includes('hidden');
const names=['Богданчик','Очень длинный никнейм игрока клуба','Серый','Millourt','Насон','Знак','Кавасаки','Точка','Аня','Боря'];
const roles=['mafia','citizen','sheriff','don','citizen','citizen','mafia','citizen','citizen','citizen'];
const game=(n:number,status:string)=>({game_number:n,status,winner_team:status==='completed'?'red':null,judge:'Судья с длинным ником',
 seats:names.map((nickname,i)=>({seat:i+1,nickname,role:status==='completed'?roles[(i+n)%10]:null,is_me:i===1,additional:status!=='completed'?null:hidden&&i!==1?null:[0.5,-0.3,0,1.25,0.2,-1,0.4,0,0.1,0.75][(i+n)%10]}))});
const data={tournament:{id:'t',title:'Кубок клуба',date:'2026-11-20T16:00:00Z',venue:'Бар',stage:null,phase:'live',judge:'Судья',organizer:null,entry_fee_rub:0,prize_fund_rub:0,games_planned:10,games_completed:2},
 registration:{capacity:10,confirmed_count:10,reserve_count:0,open:false,mine:null,participated:true},
 roster:names.map((nickname,i)=>({number:i+1,nickname,is_me:i===1})),
 games:[game(1,'completed'),game(2,'completed'),game(3,'active')],table_hidden:hidden,provisional:true,
 standings:hidden?null:names.map((nickname,i)=>({place:i+1,nickname,is_me:i===1,games_played:2,wins:1,total_points:2-i*0.1,additional_total:1-i*0.1})),nominations:hidden?null:[]};
globalThis.fetch=async()=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
try{sessionStorage.setItem('player-tournament:t:section',mode.startsWith('results')?'results':'games');}catch{/* preview */}
const root=createRoot(document.getElementById('root')!);
if(mode==='seating-choice'){
 root.render(<div style={{padding:16,maxWidth:480}}><TournamentSeatMessagesCard tournamentId="t" status="draft" games={Array.from({length:10},()=>({status:'planned'}))}/></div>);
 setTimeout(()=>(document.querySelector('[data-testid="tournament-seating-regenerate"]') as HTMLButtonElement|null)?.click(),300);
}else root.render(<PlayerTournamentView tournamentId="t" onBack={()=>undefined}/>);
