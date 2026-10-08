import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import JudgeGameMusicController from '../src/components/JudgeGameMusicController.tsx';
import LiveGameEngine from '../src/components/LiveGameEngine.tsx';
import { EveningDeathProtocolBridge } from '../src/components/crm/EveningDeathProtocolOverlay.tsx';
import JudgeTestGameModal, { buildTestGame } from '../src/components/player/JudgeTestGameModal.tsx';
import { EveningLiveGameModal } from '../src/components/crm/EveningLiveGameModal.tsx';
import { beginTestGameSandbox, endTestGameSandbox, TEST_GAME_ID } from '../src/lib/testGameSandbox.ts';
import { TRAINING_PEOPLE } from '../src/lib/judgeTrainingSetup.ts';
import AppErrorBoundary from '../src/components/ui/AppErrorBoundary.tsx';
import { createInitialGameDiscipline } from '../src/lib/gameDiscipline.ts';
import { createEmptyLiveProtocolMarkers } from '../src/lib/gameProtocolCore.ts';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';
import '../src/components/crm/liveGameJudge.css';
import '../src/components/crm/liveGameCabinetShell.css';
import '../src/components/crm/liveGameSeatCabinet.css';
import '../src/components/crm/liveGameActionPriority.css';
import '../src/components/crm/liveGameNightReadability.css';
import '../src/components/crm/liveGameTelegram.css';
import '../src/components/crm/liveGameRecoveryPolish.css';
import '../src/components/crm/liveGameDeathProtocolCabinet.css';

const AUDIT_MODE = new URLSearchParams(window.location.search).get('mode') === 'audit';
const RECOVERY_MODE = new URLSearchParams(window.location.search).get('mode') === 'recovery';
const TRAINING_MODE = new URLSearchParams(window.location.search).get('mode') === 'training';
const TRAINING_FINISH_MODE = new URLSearchParams(window.location.search).get('mode') === 'training-finish';

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
      has_spoken_this_round: AUDIT_MODE || slot === 2,
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
    nominations: AUDIT_MODE ? [3, 4] : [],
    nominationsMap: AUDIT_MODE ? { 1: 3, 2: 4 } : {},
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

if (RECOVERY_MODE || AUDIT_MODE) seedRecoverySession();

function RecoveryShell({ onResult }: { onResult: (result: 'completed' | 'cancelled') => void }) {
  return (
    <div className="fixed inset-0 z-[95] flex flex-col overflow-hidden bg-[#090a0d] text-white">
      <div className="flex h-[34px] shrink-0 items-center border-b border-white/[0.07] bg-[#0b0c10]/95 px-2 text-[10px] font-semibold text-white/55">
        Восстановленная игра
      </div>
      <div className="evening-live-engine-shell min-h-0 flex-1">
        <LiveGameEngine
          players={[]}
          initialJudgeId="e2e-judge"
          onGameFinished={() => onResult('completed')}
          onCancel={() => onResult('cancelled')}
        />
      </div>
    </div>
  );
}

/** A real saved synthetic winner state, used only by browser regression tests.
 * No game-engine internals are mocked: restore, winner confirmation,
 * onGameFinished, local completion, and sandbox cleanup all execute. */
function TrainingFinishShell({ onResult }: { onResult: (result: 'completed' | 'cancelled') => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    beginTestGameSandbox();
    const players = buildRecoveryPlayers().map((p) => ({
      ...p,
      alive: p.team === 'Красные',
      eliminated_phase: p.team === 'Чёрные' ? 'Убит' : '',
      exit_reason: (p.team === 'Чёрные' ? 'killed' : 'alive') as 'killed' | 'alive',
    }));
    const discipline = createInitialGameDiscipline(players.map((p) => ({
      id: String(p.slot_num),
      team: p.team === 'Чёрные' ? 'black' as const : 'red' as const,
    })));
    localStorage.setItem('mafia_live_session', JSON.stringify({
      activePlayers: players,
      nominations: [], nominationsMap: {},
      phase: 'day_speeches', roundNumber: 4, dayStarterSlot: 1,
      sessionKey: 'club:' + TEST_GAME_ID,
      nightSubPhase: 'intro', postNightStage: 'none',
      protocolMarkers: createEmptyLiveProtocolMarkers(),
      activeBestMoveSource: null, activeBestMoveSlot: null, pendingBestMoveSeats: [],
      votingRounds: [], activeVotingRoundIndex: 0, votesByPlayer: {}, votes: {},
      votingStage: 'setup', revoteSpeakerIndex: 0,
      tableLeaveVotesInput: null, currentVotingNomineeIndex: 0,
      activeSpeakerSlot: null, customTimerLabel: null,
      timeLeft: 60, timerMax: 60, isTimerRunning: false,
      zeroNightSubPhase: null, zeroNightMusicState: 'stopped',
      shotPlayerSlot: null, donCheckSlot: null, donCheckResult: null,
      sheriffCheckSlot: null, sheriffCheckResult: null,
      nightLogs: [], votingFarewellQueue: [], votingFarewellIndex: 0,
      discipline, savedAt: '17:00',
    }));
    setReady(true);
    return () => endTestGameSandbox();
  }, []);

  return ready ? (
    <EveningLiveGameModal
      game={buildTestGame({ id: 'e2e-judge', nickname: 'E2E Judge' }, TRAINING_PEOPLE)}
      trainingMode
      onClose={() => onResult('cancelled')}
      onUpdated={() => onResult('completed')}
    />
  ) : null;
}

function Harness() {
  const [result, setResult] = useState<'running' | 'completed' | 'cancelled'>('running');

  return (
    <AppErrorBoundary>
      {result === 'running' ? (
        TRAINING_FINISH_MODE ? (
          <TrainingFinishShell onResult={setResult} />
        ) : RECOVERY_MODE || AUDIT_MODE ? (
          <RecoveryShell onResult={setResult} />
        ) : (
          <JudgeTestGameModal
            judge={{ id: 'e2e-judge', nickname: 'E2E Judge' }}
            training={TRAINING_MODE}
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
    </AppErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
