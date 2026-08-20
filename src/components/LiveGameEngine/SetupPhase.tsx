import { useEffect } from 'react';
import { ChevronDown, Mic2 } from 'lucide-react';
import type { Player } from '../../types.js';
import ClubGameSetupPhase from './ClubGameSetupPhase.tsx';
import GeneralSetupPhase from './GeneralSetupPhase.tsx';
import SpeechRecordingPilot from './SpeechRecordingPilot.tsx';
import { mountSpeechRecordingServerSync } from './SpeechRecordingServerSync.ts';
import { getLiveGameSetupMode } from './setupMode.js';
import type { ActivePlayerState } from './types.js';

interface SetupPhaseProps {
  players: Player[];
  judgeId: number;
  setJudgeId: (id: number) => void;
  activePlayers: ActivePlayerState[];
  handleAutoFillSetupPlayers: () => void;
  handleAutoFillSetupRoles: () => void;
  handleSelectSetupPlayer: (slotNum: number, userId: number) => void;
  handleSelectSetupRole: (slotNum: number, role: 'Мирный' | 'Шериф' | 'Мафия' | 'Дон') => void;
  onCancel: () => void;
  validateSetupAndStart: () => void;
  onRoleDealActiveChange?: (active: boolean) => void;
}

const ClubSpeechRecordingControl = () => (
  <details data-testid="speech-recording-setup" className="group overflow-hidden rounded-[20px] border border-white/[0.07] bg-white/[0.025]">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-left [&::-webkit-details-marker]:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-black/20 text-white/38">
          <Mic2 className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-white/68">Запись речей</div>
          <div className="mt-0.5 text-[9px] leading-4 text-white/28">Опционально · можно оставить выключенной</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1 text-[8px] font-semibold text-white/28">Выкл.</span>
        <ChevronDown className="h-3.5 w-3.5 text-white/24 transition-transform group-open:rotate-180" aria-hidden="true" />
      </div>
    </summary>
    <div className="border-t border-white/[0.06] p-2">
      <SpeechRecordingPilot />
    </div>
  </details>
);

export default function SetupPhase(props: SetupPhaseProps) {
  const setupMode = getLiveGameSetupMode(props.players);
  const isClubEveningEngine = setupMode === 'club';

  useEffect(() => {
    if (!isClubEveningEngine) return undefined;
    return mountSpeechRecordingServerSync();
  }, [isClubEveningEngine]);

  if (isClubEveningEngine) {
    return (
      <ClubGameSetupPhase
        players={props.players}
        activePlayers={props.activePlayers}
        handleAutoFillSetupPlayers={props.handleAutoFillSetupPlayers}
        handleSelectSetupRole={props.handleSelectSetupRole}
        onCancel={props.onCancel}
        validateSetupAndStart={props.validateSetupAndStart}
        onRoleDealActiveChange={props.onRoleDealActiveChange}
        speechRecordingControl={<ClubSpeechRecordingControl />}
      />
    );
  }

  return (
    <div className="space-y-3">
      <SpeechRecordingPilot />
      <GeneralSetupPhase {...props} />
    </div>
  );
}
