import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import JudgeGameMusicController from '../src/components/JudgeGameMusicController.tsx';
import LiveGameEngine from '../src/components/LiveGameEngine.tsx';
import { EveningDeathProtocolBridge } from '../src/components/crm/EveningDeathProtocolOverlay.tsx';
import { EveningLiveDisciplineGlyphBridge } from '../src/components/crm/EveningLiveDisciplineGlyphBridge.tsx';
import JudgeTestGameModal from '../src/components/player/JudgeTestGameModal.tsx';
import AppErrorBoundary from '../src/components/ui/AppErrorBoundary.tsx';
import { createInitialGameDiscipline } from '../src/lib/gameDiscipline.ts';
import { createEmptyLiveProtocolMarkers } from '../src/lib/gameProtocolCore.ts';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';
import '../src/components/crm/liveGameJudge.css';
import '../src/components/crm/liveGameCabinetShell.css';
import '../src/components/crm/liveGameSeatCabinet.css';
import '../src/components/crm/liveGameTelegram.css';

const RECOVERY_MODE = new URLSearchParams(window.location.search).get('mode') === 'recovery';

const buildRecoveryPlayers = () => {
  const roles = ['Мирный', 'Мафия', 'Мирный', 'Шериф', 'Мирный', 'Мафия', 'Мирный', 'Дон', 'Мирный', 'Мирный'] as const;
  return roles.map((role, index) => {
    const slot = index + 1;
    const black = role === 'Мафия' || role === 'Дон';
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
      alive: true,
      nominated_this_round: false,
      has_spoken_this_round: slot === 2,
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
      eliminated_phase: '',
      has_foul_penalty: false,
      exit_reason: 'alive' as const,
    };
  });
};

const seedRecoverySession = () => {
  const activePlayers = buildRecoveryPlayers();
  const discipline = createInitialGameDiscipline(activePlayers.map((player) => ({
    id: String(player.slot_num),
    team: player.team === 'Чёрные' ? 'black' as const : 'red' as const,
  })));
  localStorage.setItem('mafia_live_session', JSON.stringify({
    activePlayers,
    nominations: [],
    nominationsMap: {},
    phase: 'day_speeches',
    roundNumber: 2,
    nightSubPhase: 'intro',
    postNightStage: 'none',
    protocolMarkers: createEmptyLiveProtocolMarkers(),
    activeBestMoveSource: null,
    activeBestMoveSlot: null,
    pendingBestMoveSeats: [],
    votingRounds: [],
    activeVotingRoundIndex: 0,
    votesByPlayer: {},
    votes: {},
    votingStage: 'setup',
    revoteSpeakerIndex: 0,
    tableLeaveVotesInput: null,
    currentVotingNomineeIndex: 0,
    activeSpeakerSlot: null,
    customTimerLabel: null,
    timeLeft: 60,
    timerMax: 60,
    isTimerRunning: false,
    zeroNightSubPhase: null,
    shotPlayerSlot: null,
    donCheckSlot: null,
    donCheckResult: null,
    sheriffCheckSlot: null,
    sheriffCheckResult: null,
    nightLogs: [{ round: 1, log: 'E2E: сохранённая игра перед восстановлением.' }],
    votingFarewellQueue: [],
    votingFarewellIndex: 0,
    discipline,
    savedAt: '18:00',
  }));
};

if (RECOVERY_MODE) seedRecoverySession();

function Harness() {
  const [result, setResult] = useState<'running' | 'completed' | 'cancelled'>('running');

  return (
    <AppErrorBoundary>
      {result === 'running' ? (
        RECOVERY_MODE ? (
          <LiveGameEngine
            players={[]}
            initialJudgeId="e2e-judge"
            onGameFinished={() => setResult('completed')}
            onCancel={() => setResult('cancelled')}
          />
        ) : (
          <JudgeTestGameModal
            judge={{ id: 'e2e-judge', nickname: 'E2E Judge' }}
            onClose={(completed) => setResult(completed ? 'completed' : 'cancelled')}
          />
        )
      ) : (
        <main className="flex min-h-screen items-center justify-center bg-[#090a0d] p-6 text-white">
          <div data-testid="e2e-live-game-result" className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 text-center text-lg font-black">
            {result === 'completed' ? 'E2E LIVE GAME COMPLETED' : 'E2E LIVE GAME CANCELLED'}
          </div>
        </main>
      )}
      <JudgeGameMusicController />
      <EveningDeathProtocolBridge />
      <EveningLiveDisciplineGlyphBridge />
    </AppErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
