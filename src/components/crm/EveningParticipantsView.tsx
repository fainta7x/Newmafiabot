import React from 'react';
import { EveningParticipantsView as BaseEveningParticipantsView } from './EveningParticipantsViewBase.tsx';
import { EveningAttendanceQuickControls } from './EveningAttendanceQuickControls.tsx';

interface EveningParticipantsViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
  initialAddOpen?: boolean;
  onInitialAddHandled?: () => void;
}

export const EveningParticipantsView: React.FC<EveningParticipantsViewProps> = (props) => (
  <div className="min-w-0 overflow-x-hidden space-y-4">
    <EveningAttendanceQuickControls eveningId={props.eveningId} />
    <BaseEveningParticipantsView {...props} />
  </div>
);
