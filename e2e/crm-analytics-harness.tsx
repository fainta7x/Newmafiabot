import ReactDOM from 'react-dom/client';
import OrganizerCRM from '../src/components/OrganizerCRM.tsx';
import { parseAnalyticsPeriod } from '../src/lib/analyticsPeriod.ts';
import { buildClubGameStatistics } from '../src/lib/gameStatistics.ts';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const json=(body:unknown)=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(input:RequestInfo | URL)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
  const period=url.searchParams.get('period')||'30d';
  if(url.pathname==='/api/auth/me') return json({role:'ORGANIZER',isOrganizer:true,isClubOwner:true});
  if(url.pathname==='/api/crm/overview') return json({total_players:24,upcoming_evenings:0,open_tasks:0,unpaid_total:0,upcoming:[],tasks:[],recent_activity:[]});
  if(url.pathname==='/api/evenings' || url.pathname==='/api/players') return json([]);
  if(url.pathname.endsWith('/overview')) return json({range:parseAnalyticsPeriod(period),totalPlayers:24,completedEvenings:5,totalAttended:62,newPlayers:8,activePlayers:18,fillRate:.71,fillEvenings:5,fillSkipped:1,
    cohortFirstVisits:8,cohortReturnedIn30Days:3,cohortPending:2,inactive30:2,inactive60:1,inactive90:3,sourceBreakdown:{Telegram:4,'Приглашение друга':3,'ВКонтакте':1},
    neverPlayed:2,playedOnce:3,playedTwoOrThree:5,playedFourPlus:14,totalRegistrations:60,totalCancelled:2,totalNoShow:1,registrationBase:62,noviceLevel:4,clubApproved:20,tournamentApproved:10,
    communicationFunnel:{delivered:42,answered:32,positive:25,attended:22,reminded:10,failed:1}});
  if(url.pathname.endsWith('/finance')) return json({range:parseAnalyticsPeriod(period),accrued:25000,incomePaid:22000,outstandingDebt:3000,receivedInPeriod:24000,avgRevenuePerEvening:4400,eveningCount:5,eveningsTruncated:false,
    evenings:[{id:'e1',title:'Пятничный клубный вечер',starts_at:'2026-10-02T18:00:00Z',accrued:5000,incomePaid:4400,outstandingDebt:600}]});
  if(url.pathname.endsWith('/now')) return json({today:[],next:{id:'e1',title:'Ближайший клубный вечер',starts_at:'2026-10-09T18:00:00Z'},openDebtCount:3});
  if(url.pathname.endsWith('/presence')) return json({online:[{player_id:'p1',nickname:'Игрок клуба',screen:'/player/rating',on_screen_seconds:180}]});
  if(url.pathname.endsWith('/game-stats')) return json(buildClubGameStatistics([]));
  if(url.pathname.endsWith('/staff')) return json({label:parseAnalyticsPeriod(period).label,staff:[{player_id:'p1',nickname:'Организатор с длинным никнеймом',evenings:5,games:20}]});
  if(url.pathname.endsWith('/summary')) return json({people:{player:18,crm:2},visits:{player:35,crm:8},screens:[{surface:'player',name:'/player/rating',people:12,visits:20}],actions:[{surface:'player',name:'player-nav-rating',people:8,visits:12}]});
  return json({});
};
ReactDOM.createRoot(document.getElementById('root')!).render(<OrganizerCRM pathname="/admin/analytics" onNavigate={()=>undefined} />);
