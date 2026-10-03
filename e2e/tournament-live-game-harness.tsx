import ReactDOM from 'react-dom/client';
import TournamentLiveGameModal from '../src/components/player/TournamentLiveGameModal.tsx';
import ScopedEveningDeathProtocolBridge from '../src/components/crm/ScopedEveningDeathProtocolBridge.tsx';
import AppErrorBoundary from '../src/components/ui/AppErrorBoundary.tsx';
import { createInitialGameDiscipline } from '../src/lib/gameDiscipline.ts';
import { createEmptyLiveProtocolMarkers } from '../src/lib/gameProtocolCore.ts';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/styles/telegram-viewport.css';
import '../src/releasePolish.css';
import '../src/components/crm/liveGameJudge.css';
import '../src/components/crm/liveGameDesktopParity.css';
import '../src/components/crm/liveGameCabinetShell.css';
import '../src/components/crm/liveGameSeatCabinet.css';
import '../src/components/crm/liveGameActionPriority.css';
import '../src/components/crm/liveGameNightReadability.css';
import '../src/components/crm/liveGameRecoveryPolish.css';
import '../src/components/crm/liveGameDeathProtocolCabinet.css';
import '../src/components/crm/liveGameTelegram.css';
import '../src/components/crm/liveGameUrgentResume.css';

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
  activePlayers,
  nominations: deathMode ? [] : [3, 4],
  nominationsMap: deathMode ? {} : { 1: 3, 2: 4 },
  phase: deathMode ? 'night' : 'day_speeches',
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

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(rawUrl, window.location.origin);
  if (url.pathname === '/api/tournaments/tournament-e2e/games/game-e2e/protocol') {
    if (String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase() === 'PUT') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ protocol, player_results: playerResults }), {
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
