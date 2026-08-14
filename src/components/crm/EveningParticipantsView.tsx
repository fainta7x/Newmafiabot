import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.ts';
import { EveningParticipantsView as BaseEveningParticipantsView } from './EveningParticipantsViewBase.tsx';
import EveningGameRegistrationDashboard from './EveningGameRegistrationDashboard.tsx';
import EveningInviteAudienceManager from './EveningInviteAudienceManager.tsx';
import EveningRosterSlotEditor from './EveningRosterSlotEditor.tsx';

interface EveningParticipantsViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
  initialAddOpen?: boolean;
  onInitialAddHandled?: () => void;
}

export const EveningParticipantsView: React.FC<EveningParticipantsViewProps> = (props) => {
  const [status, setStatus] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [announcing, setAnnouncing] = useState(false);
  const [announceMessage, setAnnounceMessage] = useState<string | null>(null);
  const [announceError, setAnnounceError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void api.getEvening(props.eveningId)
      .then((evening) => {
        if (!cancelled) setStatus(String(evening.status || ''));
      })
      .catch(() => {});
    void fetch(`/api/evenings/${encodeURIComponent(props.eveningId)}/slots`, { credentials: 'include' }).catch(() => {});
    return () => { cancelled = true; };
  }, [props.eveningId, refreshKey]);

  const refresh = () => setRefreshKey((value) => value + 1);

  const publishEvening = async () => {
    if (publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const updated = await api.updateEvening(props.eveningId, { status: 'published' });
      setStatus(String(updated.status || 'published'));
      refresh();
    } catch (error: any) {
      setPublishError(error?.message || 'Не удалось опубликовать вечер');
    } finally {
      setPublishing(false);
    }
  };

  const announceEvening = async () => {
    if (announcing) return;
    setAnnouncing(true);
    setAnnounceError(null);
    setAnnounceMessage(null);
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(props.eveningId)}/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Не удалось отправить анонс');

      const dm = payload?.dm || {};
      const sent = Number(dm.sent || 0);
      const failed = Number(dm.failed || 0) + Number(dm.delivery_state_failures || 0);
      const alreadySent = Boolean(payload?.group?.already_sent) && Number(dm.eligible_remaining_before_send || 0) === 0;
      if (alreadySent) {
        setAnnounceMessage('Анонс уже был отправлен — дублей не создано.');
      } else if (failed > 0) {
        setAnnounceMessage(`Анонс опубликован. В ЛС доставлено: ${sent}, не доставлено: ${failed}. Повтор отправит только недоставленным.`);
      } else {
        setAnnounceMessage(`Анонс опубликован. В ЛС доставлено: ${sent}.`);
      }
      refresh();
    } catch (error: any) {
      setAnnounceError(error?.message || 'Не удалось отправить анонс');
    } finally {
      setAnnouncing(false);
    }
  };

  return (
    <div className="min-w-0 overflow-x-hidden space-y-4">
      {status === 'draft' ? (
        <section className="rounded-[16px] border border-border-soft bg-surface-1 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <strong className="block text-[13px] text-text-primary">Черновик сохранён</strong>
              <span className="mt-0.5 block text-[11px] text-text-secondary">Пока вечер не опубликован, Telegram-бот его не видит.</span>
            </div>
            <button
              type="button"
              disabled={publishing}
              onClick={() => void publishEvening()}
              className="min-h-[44px] shrink-0 rounded-[12px] bg-accent px-4 text-[12px] font-bold text-white disabled:opacity-50"
            >
              {publishing ? 'Публикуем…' : 'Опубликовать вечер'}
            </button>
          </div>
          {publishError ? <p className="mt-2 text-[11px] text-danger">{publishError}</p> : null}
        </section>
      ) : null}

      <EveningInviteAudienceManager onChanged={refresh} />

      {status === 'published' || status === 'active' ? (
        <section className="rounded-[16px] border border-border-soft bg-surface-1 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <strong className="block text-[13px] text-text-primary">Telegram-анонс</strong>
              <span className="mt-0.5 block text-[11px] text-text-secondary">Группа + личные приглашения только тем, кто сейчас включён в рассылку и подходит по уровню.</span>
            </div>
            <button
              type="button"
              disabled={announcing}
              onClick={() => void announceEvening()}
              className="min-h-[44px] shrink-0 rounded-[12px] bg-accent px-4 text-[12px] font-bold text-white disabled:opacity-50"
            >
              {announcing ? 'Отправляем…' : '📣 Отправить анонс'}
            </button>
          </div>
          {announceMessage ? <p className="mt-2 text-[11px] text-success">{announceMessage}</p> : null}
          {announceError ? <p className="mt-2 text-[11px] text-danger">{announceError}</p> : null}
        </section>
      ) : null}

      <EveningGameRegistrationDashboard eveningId={props.eveningId} refreshKey={refreshKey} onChanged={refresh} />
      <EveningRosterSlotEditor eveningId={props.eveningId} onChanged={refresh} />
      <BaseEveningParticipantsView key={`${props.eveningId}:${refreshKey}`} {...props} />
    </div>
  );
};