import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { EveningParticipantsView as BaseEveningParticipantsView } from './EveningParticipantsViewBase.tsx';
import EveningGameRegistrationDashboard from './EveningGameRegistrationDashboard.tsx';
import EveningInviteAudienceManager from './EveningInviteAudienceManager.tsx';
import EveningParticipantsWorkboard from './EveningParticipantsWorkboard.tsx';
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
  const [reminding, setReminding] = useState(false);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCommunicationTools, setShowCommunicationTools] = useState(false);
  const [showFullRoster, setShowFullRoster] = useState(Boolean(props.initialAddOpen));
  const [forceAddOpen, setForceAddOpen] = useState(Boolean(props.initialAddOpen));

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

  useEffect(() => {
    if (props.initialAddOpen) {
      setShowFullRoster(true);
      setForceAddOpen(true);
    }
  }, [props.initialAddOpen]);

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

  const remindUnanswered = async () => {
    if (reminding) return;
    setReminding(true);
    setReminderError(null);
    setReminderMessage(null);
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(props.eveningId)}/remind-unanswered`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Не удалось отправить напоминание');

      const eligible = Number(payload?.eligible || 0);
      const sent = Number(payload?.sent || 0);
      const failed = Number(payload?.failed || 0) + Number(payload?.delivery_state_failures || 0);
      if (eligible === 0) {
        setReminderMessage('Напоминать некому: среди получивших анонс нет игроков без ответа.');
      } else if (failed > 0) {
        setReminderMessage(`Напоминание отправлено: ${sent}, не доставлено: ${failed}.`);
      } else {
        setReminderMessage(`Напоминание отправлено ${sent} игрокам без ответа.`);
      }
      refresh();
    } catch (error: any) {
      setReminderError(error?.message || 'Не удалось отправить напоминание');
    } finally {
      setReminding(false);
    }
  };

  const openAddPlayer = () => {
    setShowFullRoster(true);
    setForceAddOpen(true);
  };

  const toggleFullRoster = () => {
    if (showFullRoster) {
      setShowFullRoster(false);
      setForceAddOpen(false);
      refresh();
    } else {
      setShowFullRoster(true);
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

      <EveningParticipantsWorkboard
        eveningId={props.eveningId}
        onBack={props.onBack}
        onAddPlayer={openAddPlayer}
        onOpenPlayerCard={props.onOpenPlayerCard}
        onChanged={refresh}
      />

      <section className="rounded-[18px] border border-border-soft bg-surface-1 p-2.5" data-testid="evening-roster-secondary-tools">
        <button
          type="button"
          onClick={() => setShowCommunicationTools((value) => !value)}
          className="flex min-h-[48px] w-full items-center gap-3 rounded-[13px] px-2.5 text-left hover:bg-surface-2"
        >
          <span className="min-w-0 flex-1"><strong className="block text-[11px] font-semibold text-text-primary">Рассылка и игровая регистрация</strong><span className="mt-0.5 block text-[9px] text-text-muted">Анонс, напоминания, приглашения и слоты — когда они действительно нужны.</span></span>
          {showCommunicationTools ? <ChevronUp className="h-4 w-4 shrink-0 text-text-muted" /> : <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />}
        </button>

        {showCommunicationTools ? <div className="mt-2 space-y-3 border-t border-border-soft pt-3">
          <EveningInviteAudienceManager onChanged={refresh} />

          {status === 'published' || status === 'active' ? (
            <section className="rounded-[16px] border border-border-soft bg-surface-2 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <strong className="block text-[13px] text-text-primary">Telegram-анонс</strong>
                  <span className="mt-0.5 block text-[11px] text-text-secondary">Личные приглашения получают только игроки из рассылки, подходящие по уровню. Напоминание уйдёт только тем, кто уже получил анонс и всё ещё без ответа.</span>
                </div>
                <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={announcing || reminding}
                    onClick={() => void announceEvening()}
                    className="min-h-[44px] rounded-[12px] bg-accent px-4 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    {announcing ? 'Отправляем…' : '📣 Отправить анонс'}
                  </button>
                  <button
                    type="button"
                    disabled={announcing || reminding}
                    onClick={() => void remindUnanswered()}
                    className="min-h-[44px] rounded-[12px] border border-border-soft bg-surface-1 px-4 text-[12px] font-bold text-text-primary disabled:opacity-50"
                  >
                    {reminding ? 'Напоминаем…' : '🔔 Напомнить без ответа'}
                  </button>
                </div>
              </div>
              {announceMessage ? <p className="mt-2 text-[11px] text-success">{announceMessage}</p> : null}
              {announceError ? <p className="mt-2 text-[11px] text-danger">{announceError}</p> : null}
              {reminderMessage ? <p className="mt-2 text-[11px] text-success">{reminderMessage}</p> : null}
              {reminderError ? <p className="mt-2 text-[11px] text-danger">{reminderError}</p> : null}
            </section>
          ) : null}

          <EveningGameRegistrationDashboard eveningId={props.eveningId} refreshKey={refreshKey} />
          <EveningRosterSlotEditor eveningId={props.eveningId} onChanged={refresh} />
        </div> : null}

        <div className="my-1 border-t border-border-soft" />

        <button
          type="button"
          data-testid="evening-roster-full-toggle"
          onClick={toggleFullRoster}
          className="flex min-h-[48px] w-full items-center gap-3 rounded-[13px] px-2.5 text-left hover:bg-surface-2"
        >
          <span className="min-w-0 flex-1"><strong className="block text-[11px] font-semibold text-text-primary">Полный состав и правки</strong><span className="mt-0.5 block text-[9px] text-text-muted">Добавление, частичная оплата, сортировка и редкие поля остаются здесь.</span></span>
          {showFullRoster ? <ChevronUp className="h-4 w-4 shrink-0 text-text-muted" /> : <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />}
        </button>
      </section>

      {showFullRoster ? <BaseEveningParticipantsView
        key={`${props.eveningId}:${refreshKey}`}
        {...props}
        initialAddOpen={forceAddOpen || props.initialAddOpen}
        onInitialAddHandled={() => {
          setForceAddOpen(false);
          props.onInitialAddHandled?.();
        }}
      /> : null}
    </div>
  );
};