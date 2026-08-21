import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';
import EveningInviteAudienceManager from './EveningInviteAudienceManager.tsx';
import EveningGameRegistrationDashboard from './EveningGameRegistrationDashboard.tsx';

interface EveningParticipantsViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
  initialAddOpen?: boolean;
  onInitialAddHandled?: () => void;
}

export const EveningParticipantsView: React.FC<EveningParticipantsViewProps> = ({ eveningId }) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAudience, setShowAudience] = useState(false);
  const refresh = () => setRefreshKey((value) => value + 1);

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Users className="h-5 w-5" /></span>
          <div>
            <h2 className="text-[17px] font-black text-text-primary">Кого пригласил</h2>
            <p className="mt-1 text-[11px] leading-5 text-text-secondary">Проверяй ответы и запись на игры до вечера. Явка, оплата, гости и ручные правки — в разделе «Сам вечер».</p>
          </div>
        </div>
      </section>

      <EveningGameRegistrationDashboard eveningId={eveningId} refreshKey={refreshKey} onChanged={refresh} />

      <section className="overflow-hidden rounded-[16px] border border-border-soft bg-surface-1">
        <button
          type="button"
          onClick={() => setShowAudience((value) => !value)}
          aria-expanded={showAudience}
          className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3 text-left"
        >
          <span>
            <strong className="block text-[12px] text-text-primary">Кого звать на вечер</strong>
            <span className="mt-0.5 block text-[10px] leading-4 text-text-muted">База рассылки и исключения. Открывай только перед публикацией или новой рассылкой.</span>
          </span>
          {showAudience ? <ChevronUp className="h-4 w-4 shrink-0 text-text-muted" /> : <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />}
        </button>
        {showAudience ? <div className="border-t border-border-soft p-3"><EveningInviteAudienceManager onChanged={refresh} /></div> : null}
      </section>
    </div>
  );
};

export default EveningParticipantsView;
