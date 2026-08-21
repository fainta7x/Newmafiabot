import ReactDOM from 'react-dom/client';
import CenterPanel from '../src/components/LiveGameEngine/CenterPanel.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/components/crm/liveGameJudge.css';
import '../src/components/crm/liveGameCabinetShell.css';
import '../src/components/crm/liveGameTelegram.css';

const players = Array.from({ length: 10 }, (_, index) => ({
  slot_num: index + 1,
  user_id: `p${index + 1}`,
  nickname: ['Чагин', 'Богданчик', 'Матроскина', 'Денди', 'Вид', 'Пристань', 'Лиса', 'Фокс', 'Мята', 'Джек'][index],
  role: index === 0 ? 'Дон' : index < 3 ? 'Мафия' : index === 3 ? 'Шериф' : 'Мирный',
  team: index < 3 ? 'black' : 'red',
  alive: true,
  fouls: 0,
})) as any[];

const query = new URLSearchParams(window.location.search);
const night = query.get('phase') === 'night';

const noOp = () => undefined;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-[#090a0d] p-2 font-sans text-white">
    <div className="evening-live-engine-shell mx-auto w-full max-w-[430px] rounded-[24px] border border-white/[0.07] p-2">
      <div className="grid grid-cols-2 gap-2">
        <CenterPanel
          activePlayers={players as any}
          activeSpeakerSlot={null}
          setActiveSpeakerSlot={noOp}
          phase={night ? 'night' : 'day_speeches'}
          roundNumber={1}
          timeLeft={night ? 35 : 60}
          setTimeLeft={noOp}
          zeroNightSubPhase={null}
          zeroNightMusicState="pending"
          setZeroNightMusicState={noOp}
          customTimerLabel={night ? 'Отстрел' : null}
          isTimerRunning={false}
          setIsTimerRunning={noOp}
          timerMax={60}
          handleAdjustTime={noOp}
          handleStartZeroNightTimer={noOp}
          donCheckSlot={null}
          donCheckResult={null}
          sheriffCheckSlot={null}
          sheriffCheckResult={null}
          nextSpeaker={night ? null : players[0] as any}
          handleStartNextSpeaker={noOp}
          nominations={[3, 7]}
          currentVotingNomineeIndex={0}
          selectVotingNomineeIndex={noOp}
          votes={{}}
          votesByPlayer={{}}
          handleInteractiveAutoRemainder={noOp}
          handleAllocateVotes={noOp}
          handleResolveVoting={noOp}
          nightSubPhase={night ? 'shooting' : 'intro'}
          shotPlayerSlot={null}
          getPrevStepAction={() => ({ label: 'Назад', onClick: noOp })}
          getNextStepInfo={() => ({ label: night ? 'Проверка Дона' : 'К голосованию', onClick: noOp })}
          onCancel={noOp}
          isMuted={false}
          setIsMuted={() => undefined}
          votingRounds={[]}
          activeVotingRoundIndex={0}
          votingStage="setup"
        />
      </div>
    </div>
  </main>,
);
