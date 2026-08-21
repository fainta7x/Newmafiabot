import React, { useEffect, useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { api } from '../../lib/api.ts';
import EveningParticipantsWorkboard from './EveningParticipantsWorkboard.tsx';
import EveningInviteAudienceManager from './EveningInviteAudienceManager.tsx';
import EveningGameRegistrationDashboard from './EveningGameRegistrationDashboard.tsx';
import EveningRosterSlotEditor from './EveningRosterSlotEditor.tsx';

interface EveningParticipantsViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
  initialAddOpen?: boolean;
  onInitialAddHandled?: () => void;
}

export const EveningParticipantsView: React.FC<EveningParticipantsViewProps> = ({ eveningId, onBack, onOpenPlayerCard }) => {
  const [evening, setEvening] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey((value) => value + 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.getEvening(eveningId).then((data) => {
      if (!cancelled) setEvening(data);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [eveningId]);

  if (loading) return <div className="flex min-h-[35vh] items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-accent" /></div>;
  if (!evening) return <div className="rounded-[18px] border border-danger/30 bg-danger-soft p-4 text-[12px] text-danger">Не удалось загрузить список приглашений.</div>;

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Users className="h-5 w-5" /></span>
          <div><h2 className="text-[17px] font-black text-text-primary">Кого пригласил</h2><p className="mt-1 text-[11px] leading-5 text-text-secondary">Здесь видно, кто подтвердил участие, кто ещё думает или не ответил, и на какие игры записан каждый игрок. Фактический приход и оплата находятся в разделе «Сам вечер».</p></div>
        </div>
      </section>

      <EveningInviteAudienceManager onChanged={refresh} />

      <section className="rounded-[16px] border border-border-soft bg-surface-1 p-3"><strong className="block text-[13px] text-text-primary">Ответы и запись на игры</strong><span className="mt-1 block text-[10px] leading-4 text-text-muted">Фильтры ниже позволяют быстро найти тех, кому нужно написать, и тех, кто уже выбрал игры.</span></section>

      <EveningParticipantsWorkboard eveningId={eveningId} onBack={onBack} onAddPlayer={() => undefined} onOpenPlayerCard={onOpenPlayerCard} onChanged={refresh} />

      <EveningGameRegistrationDashboard eveningId={eveningId} refreshKey={refreshKey} onChanged={refresh} />

      <EveningRosterSlotEditor eveningId={eveningId} onChanged={refresh} />
    </div>
  );
};

export default EveningParticipantsView;
