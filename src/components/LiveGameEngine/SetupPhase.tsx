import { useEffect } from 'react';
import type { Player } from '../../types.js';
import ClubGameSetupPhase from './ClubGameSetupPhase.tsx';
import LegacySetupPhase from './LegacySetupPhase.tsx';
import SpeechRecordingPilot from './SpeechRecordingPilot.tsx';
import { mountSpeechRecordingServerSync } from './SpeechRecordingServerSync.ts';
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

export default function SetupPhase(props: SetupPhaseProps) {
  const isClubEveningEngine = props.players.some((player) => player.notes === '__club_evening_engine_judge__');

  useEffect(() => {
    if (!isClubEveningEngine) return undefined;
    return mountSpeechRecordingServerSync();
  }, [isClubEveningEngine]);

  const setup = isClubEveningEngine ? (
    <ClubGameSetupPhase
      players={props.players}
      activePlayers={props.activePlayers}
      handleAutoFillSetupPlayers={props.handleAutoFillSetupPlayers}
      handleSelectSetupRole={props.handleSelectSetupRole}
      onCancel={props.onCancel}
      validateSetupAndStart={props.validateSetupAndStart}
      onRoleDealActiveChange={props.onRoleDealActiveChange}
    />
  ) : (
    <LegacySetupPhase {...props} />
  );

  return (
    <div className="space-y-3">
      <SpeechRecordingPilot />
      {setup}
    </div>
  );
}