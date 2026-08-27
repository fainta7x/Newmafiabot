import EveningTelegramCard from './EveningTelegramCard.tsx';
import EveningVkCard from './EveningVkCard.tsx';

export default function EveningAnnouncementSettings({
  eveningId,
  status,
  readonly,
}: {
  eveningId: string;
  status: string;
  readonly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <EveningTelegramCard eveningId={eveningId} embedded />
      <EveningVkCard eveningId={eveningId} status={status} readonly={readonly} />
    </div>
  );
}
