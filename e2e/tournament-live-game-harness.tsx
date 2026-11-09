import ReactDOM from 'react-dom/client';
import TournamentLiveGameModal from '../src/components/player/TournamentLiveGameModal.tsx';
import ScopedEveningDeathProtocolBridge from '../src/components/crm/ScopedEveningDeathProtocolBridge.tsx';
import AppErrorBoundary from '../src/components/ui/AppErrorBoundary.tsx';
import { createInitialGameDiscipline } from '../src/lib/gameDiscipline.ts';
import { createEmptyLiveProtocolMarkers } from '../src/lib/gameProtocolCore.ts';
import './appStyles.ts';

const mode = new URLSearchParams(window.location.search).get('mode') || 'audit';
const deathMode = mode === 'death';

const roles = ['citizen', 'mafia', 'citizen', 'sheriff', 'citizen', 'mafia', 'citizen', 'don', 'citizen', 'citizen'] as const;
const roleRu = ['Мирный', 'Мафия', 'Мирный', 'Шериф', 'Мирный', 'Мафия', 'Мирный', 'Дон', 'Мирный', 'Мирный'] as const;

const playerResults = roles.map((role, index) => ({
  participant_id: `participant-${index + 1}`,
  player_id: `player-${index + 1}`,
  display_name: `Игрок ${index + 1}`,
  seat_number: index + 1,
  role,
  team: role === 'mafia' || role === 'don' ? 'black' : 'red',
  exit_type: 'alive',
  regular_fouls: 0,
  minor_technical_fouls: 0,
  major_technical_fouls: 0,
  technical_fouls: 0,
  removal_reason: null,
  notes: null,
}));

const protocol = {
  status: 'draft',
  winner_team: null,
  end_reason: null,
  judge_notes: null,
  best_moves: [],
  best_move_participant_id: null,
  best_move_source: null,
  best_move_seats: [],
  first_killed_participant_id: null,
  zero_round_voted_participant_id: null,
};

const activePlayers = roleRu.map((role, index) => {
  const slot = index + 1;
  const black = role === 'Мафия' || role === 'Дон';
  const killed = deathMode && slot === 2;
  return {
    slot_num: slot,
    user_id: slot,
    nickname: `Игрок ${slot}`,
    role,
    team: black ? 'Чёрные' as const : 'Красные' as const,
    fouls: 0,
    minor_tech_fouls: 0,
    major_tech_fouls: 0,
    removal_reason: null,
    alive: !killed,
    nominated_this_round: false,
    has_spoken_this_round: !deathMode,
    mute_this_round: false,
    is_pu: false,
    best_move_guesses: [],
    kick: false,
    ppk: false,
    bonus_points: 0,
    lh_points: 0,
    will_protocol_points: 0,
    will_opinion_points: 0,
    dc_points: 0,
    eliminated_phase: killed ? 'night' : '',
    has_foul_penalty: false,
    exit_reason: killed ? 'night_kill' : 'alive',
  };
});

const discipline = createInitialGameDiscipline(activePlayers.map((player) => ({
  id: String(player.slot_num),
  team: player.team === 'Чёрные' ? 'black' as const : 'red' as const,
})));

localStorage.setItem('mafia_live_session', JSON.stringify({
  // A saved session belongs to one game and is offered only to it.
  sessionKey: 'tournament:game-e2e',
  activePlayers,
  nominations: deathMode ? [] : [3, 4],
  nominationsMap: deathMode ? {} : { 1: 3, 2: 4 },
  phase: mode==='deal' ? 'setup' : deathMode ? 'night' : 'day_speeches',
  roundNumber: 2,
  dayStarterSlot: 1,
  nightSubPhase: 'intro',
  postNightStage: deathMode ? 'death_protocol' : 'none',
  protocolMarkers: createEmptyLiveProtocolMarkers(),
  activeBestMoveSource: null,
  activeBestMoveSlot: null,
  pendingBestMoveSeats: [],
  bestMoveDeadlineMs: null,
  votingRounds: [],
  activeVotingRoundIndex: 0,
  votesByPlayer: {},
  votes: {},
  votingStage: 'setup',
  revoteSpeakerIndex: 0,
  tableLeaveVotesInput: null,
  tableDecisionSelectionKey: null,
  tableDecisionSelectedVoterSlots: [],
  currentVotingNomineeIndex: 0,
  activeSpeakerSlot: deathMode ? 2 : null,
  customTimerLabel: deathMode ? 'Протокол убитого #2' : null,
  timeLeft: deathMode ? 15 : 60,
  timerMax: deathMode ? 15 : 60,
  isTimerRunning: false,
  zeroNightSubPhase: null,
  zeroNightMusicState: 'pending',
  shotPlayerSlot: deathMode ? 2 : null,
  donCheckSlot: null,
  donCheckResult: null,
  sheriffCheckSlot: null,
  sheriffCheckResult: null,
  nightLogs: [{ round: 1, log: 'E2E tournament Live Game' }],
  votingFarewellQueue: [],
  votingFarewellIndex: 0,
  discipline,
  savedAt: '20:00',
}));

if (mode === 'deal') {
  localStorage.removeItem('mafia_live_session');
  playerResults.forEach(row => { (row as {role: string}).role = ''; });
}

if (mode === 'offline-retry') {
  localStorage.setItem('mafia_live_pending_save:tournament:game-e2e', JSON.stringify({
    winning_team: 'Красные',
    slots: activePlayers,
    votes: [], shots: [],
    protocol_evidence: { votes: [], shots: [], events: [] },
  }));
}

let protocolReads = 0;
let protocolPuts = 0;
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(rawUrl, window.location.origin);
  // A small stand-in for the server deal (the same five calls as the club's): the state is kept in the page, so a reload resumes it.
  if(url.pathname.startsWith('/api/tournaments/tournament-e2e/games/game-e2e/virtual-deal/')){
    const action=url.pathname.split('/').pop();
    const body=init?.body?JSON.parse(String(init.body)):{};
    const key='__e2eServerDeal';
    const load=()=>JSON.parse(localStorage.getItem(key)||'null');
    const save=(state:any)=>localStorage.setItem(key,JSON.stringify(state));
    const view=(st:any)=>({version:st.version,cards:st.deck.map((c:any)=>({id:c.id})),history:st.history.map((h:any)=>({seat:h.seat,cardId:h.cardId,role:h.role})),pending:st.pending?{seat:st.pending.seat,cardId:st.pending.cardId,role:st.pending.role}:null});
    const fresh=(version:number)=>{
      const roles=['sheriff','don','mafia','mafia',...Array(6).fill('citizen')];
      for(let i=roles.length-1;i>0;i-=1){const j=Math.floor(Math.random()*(i+1));[roles[i],roles[j]]=[roles[j],roles[i]];}
      return {version,deck:roles.map((role,i)=>({id:`c${i}-${Math.random().toString(36).slice(2,8)}`,role})),history:[] as any[],pending:null as any};
    };
    let st=load();
    if(action==='open'){
      if(!(st&&(st.history.length>0||st.pending)&&st.history.length<10)){st=fresh((st?.version??-1)+1);save(st);}
      return Response.json(view(st));
    }
    if(action==='reveal'){
      const card=st.deck.find((c:any)=>c.id===body.cardId);
      st.pending={seat:body.seat,cardId:body.cardId,role:card.role};st.version+=1;save(st);
      return Response.json({version:st.version,role:card.role});
    }
    if(action==='confirm'){
      st.history.push({seat:st.pending.seat,cardId:st.pending.cardId,role:st.pending.role});
      st.deck=st.deck.filter((c:any)=>c.id!==st.pending.cardId);st.pending=null;st.version+=1;save(st);
      return Response.json(view(st));
    }
    if(action==='undo'){
      const last=st.history.pop();if(last)st.deck.push({id:last.cardId,role:last.role});st.version+=1;save(st);
      return Response.json(view(st));
    }
    if(action==='reset'){st=fresh(st.version+1);save(st);return Response.json(view(st));}
  }
  if(url.pathname==='/api/tournaments/tournament-e2e/games/game-e2e/roles'){
    const {roles}=JSON.parse(String(init?.body));
    (window as any).__savedVirtualRoles=roles;
    roles.forEach((entry:any)=>{const p=playerResults.find(p=>p.seat_number===entry.seat_number);if(p)p.role=entry.role;});
    return Response.json({success:true});
  }
  if (url.pathname === '/api/tournaments/tournament-e2e/games/game-e2e/protocol') {
    if (String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase() === 'PUT') {
      protocolPuts += 1;
      (window as any).__tournamentProtocolPuts = protocolPuts;
      (window as any).__tournamentProtocolLastBody = JSON.parse(String(init?.body || '{}'));
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    protocolReads += 1;
    if (mode === 'offline-retry' && protocolReads === 2) {
      return Response.json({ error: 'Временный разрыв связи с CRM' }, { status: 503 });
    }
    const observedResults = mode === 'role-correction' && protocolReads > 1
      ? playerResults.map((row, index) => index < 2 ? { ...row, role: index === 0 ? 'mafia' : 'citizen', team: index === 0 ? 'black' : 'red' } : row)
      : playerResults;
    return new Response(JSON.stringify({ protocol, player_results: observedResults }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return originalFetch(input as any, init);
};

function Harness() {
  return (
    <AppErrorBoundary>
      <TournamentLiveGameModal
        tournamentId="tournament-e2e"
        gameId="game-e2e"
        judgeName="E2E Судья"
        onClose={() => undefined}
        onCompleted={() => undefined}
      />
      <ScopedEveningDeathProtocolBridge />
    </AppErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
