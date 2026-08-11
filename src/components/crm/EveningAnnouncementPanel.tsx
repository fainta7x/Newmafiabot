import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, ChevronDown, ChevronUp, MessageCircle, RefreshCw, Send } from 'lucide-react';

type AnnouncementPlayer = {
  id: string;
  nickname: string;
  telegram_user_id: string;
  telegram_username: string | null;
  phone: string | null;
  response_status: 'going' | 'late' | 'thinking' | 'declined' | 'unanswered';
  first_sent_at: string | null;
  delivery_status: string;
  last_attempt_at: string | null;
  last_error: string | null;
  reminder_count: number;
  last_reminded_at: string | null;
  last_reminder_error: string | null;
  attention_status: 'answered' | 'unanswered' | 'failed' | 'not_sent';
};

type AnnouncementOverview = {
  summary: {
    audience: number;
    sent: number;
    answered: number;
    unanswered: number;
    failed: number;
    not_sent: number;
    reminded: number;
  };
  players: AnnouncementPlayer[];
};

interface Props {
  eveningId: string;
  eveningTitle: string;
  startsAt: string;
  status: string;
  readonly?: boolean;
}

const request = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
  return body;
};

const dateTime = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const responseLabel: Record<string, string> = {
  going: 'Иду',
  late: 'Приду позже',
  thinking: 'Пока думаю',
  declined: 'Не иду',
};

const buildPersonalMessage = (title: string, startsAt: string) => {
  const date = new Date(startsAt);
  const when = Number.isNaN(date.getTime())
    ? ''
    : ` ${date.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`;
  return `Привет! Ты ещё не отметил, получится ли прийти на «${title}»${when}. Дай знать, пожалуйста 🙂`;
};

const personalChatUrl = (player: AnnouncementPlayer, text: string) => {
  const username = String(player.telegram_username || '').replace(/^@/, '').trim();
  if (username) return `https://t.me/${username}?text=${encodeURIComponent(text)}`;
  const userId = String(player.telegram_user_id || '').trim();
  return userId ? `tg://user?id=${encodeURIComponent(userId)}` : null;
};

export const EveningAnnouncementPanel: React.FC<Props> = ({ eveningId, eveningTitle, startsAt, status, readonly }) => {
  const [overview, setOverview] = useState<AnnouncementOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setOverview(await request(`/api/evenings/${encodeURIComponent(eveningId)}/announcement-overview`));
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить состояние рассылки');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [eveningId]);

  const attentionPlayers = useMemo(
    () => (overview?.players || []).filter((player) => player.attention_status !== 'answered'),
    [overview],
  );

  const canSend = !readonly && ['published', 'active'].includes(status);
  const pendingInitial = (overview?.summary.not_sent || 0) + (overview?.summary.failed || 0);
  const personalMessage = buildPersonalMessage(eveningTitle, startsAt);

  const sendAnnouncement = async () => {
    if (busy || !canSend || pendingInitial <= 0) return;
    if (!window.confirm(`Отправить личный анонс ${pendingInitial} игрокам?\n\nУже успешно получившим анонс повторное сообщение не уйдёт.`)) return;
    setBusy('announce'); setError(null); setMessage(null);
    try {
      const result = await request(`/api/evenings/${encodeURIComponent(eveningId)}/announce`, { method: 'POST' });
      const sent = Number(result?.dm?.sent || 0);
      const failed = Number(result?.dm?.failed || 0);
      setMessage(`Рассылка завершена: доставлено ${sent}${failed ? `, ошибок ${failed}` : ''}.`);
      await load(true);
    } catch (err: any) {
      setError(err?.message || 'Не удалось отправить анонс');
    } finally { setBusy(null); }
  };

  const remindUnanswered = async () => {
    const count = Number(overview?.summary.unanswered || 0);
    if (busy || !canSend || count <= 0) return;
    if (!window.confirm(`Напомнить ${count} игрокам, которые получили анонс, но ещё не ответили?`)) return;
    setBusy('remind'); setError(null); setMessage(null);
    try {
      const result = await request(`/api/evenings/${encodeURIComponent(eveningId)}/remind-unanswered`, { method: 'POST' });
      const sent = Number(result?.sent || 0);
      const failed = Number(result?.failed || 0);
      setMessage(`Напоминания отправлены: ${sent}${failed ? `, ошибок ${failed}` : ''}.`);
      await load(true);
    } catch (err: any) {
      setError(err?.message || 'Не удалось отправить напоминания');
    } finally { setBusy(null); }
  };

  return (
    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-black text-text-primary">📨 Личная рассылка</h3>
          <p className="mt-1 text-[10px] leading-4 text-text-muted">Кому дошёл анонс, кто уже ответил и кого ещё нужно догнать.</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={Boolean(busy)} className="rounded-full bg-surface-2 p-2 text-text-muted disabled:opacity-40" aria-label="Обновить">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !overview ? <div className="mt-4 flex items-center gap-2 text-[11px] text-text-muted"><RefreshCw className="h-4 w-4 animate-spin" /> Загружаем рассылку…</div> : null}
      {error ? <div className="mt-3 rounded-[12px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</div> : null}
      {message ? <div className="mt-3 rounded-[12px] bg-success-soft px-3 py-2 text-[11px] text-success">{message}</div> : null}

      {overview ? <>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-[13px] bg-surface-2 p-3"><div className="text-[20px] font-black text-text-primary">{overview.summary.sent}</div><div className="mt-1 text-[10px] text-text-muted">доставлено</div></div>
          <div className="rounded-[13px] bg-success-soft p-3"><div className="text-[20px] font-black text-success">{overview.summary.answered}</div><div className="mt-1 text-[10px] text-text-muted">ответили</div></div>
          <div className="rounded-[13px] bg-warning-soft p-3"><div className="text-[20px] font-black text-warning">{overview.summary.unanswered}</div><div className="mt-1 text-[10px] text-text-muted">ждём ответа</div></div>
          <div className={`rounded-[13px] p-3 ${overview.summary.failed ? 'bg-danger-soft' : 'bg-surface-2'}`}><div className={`text-[20px] font-black ${overview.summary.failed ? 'text-danger' : 'text-text-primary'}`}>{overview.summary.failed}</div><div className="mt-1 text-[10px] text-text-muted">не доставлено</div></div>
        </div>

        <div className="mt-2 text-[10px] text-text-muted">Аудитория этого формата: {overview.summary.audience} · ещё не отправлено: {overview.summary.not_sent}</div>

        {!canSend && status === 'draft' ? <div className="mt-3 rounded-[12px] bg-accent-soft px-3 py-2 text-[11px] text-text-secondary">Личная рассылка станет доступна после публикации вечера.</div> : null}

        {canSend ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {pendingInitial > 0 ? <button type="button" disabled={Boolean(busy)} onClick={() => void sendAnnouncement()} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-accent px-3 text-[11px] font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{busy === 'announce' ? 'Рассылаем…' : `Разослать / повторить · ${pendingInitial}`}</button> : <div className="flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-success-soft px-3 text-[11px] font-bold text-success"><CheckCircle2 className="h-4 w-4" /> Всем доступным отправлено</div>}
          <button type="button" disabled={Boolean(busy) || overview.summary.unanswered === 0} onClick={() => void remindUnanswered()} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[11px] font-bold text-text-primary disabled:opacity-40"><BellRing className="h-4 w-4" />{busy === 'remind' ? 'Напоминаем…' : `Напомнить неответившим · ${overview.summary.unanswered}`}</button>
        </div> : null}

        <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-4 flex min-h-[42px] w-full items-center justify-between rounded-[12px] bg-surface-2 px-3 text-left">
          <span><strong className="block text-[11px] text-text-primary">Требуют внимания</strong><span className="text-[10px] text-text-muted">{attentionPlayers.length ? `${attentionPlayers.length} игроков` : 'Никого'}</span></span>
          {expanded ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
        </button>

        {expanded ? <div className="mt-2 space-y-2">
          {attentionPlayers.length === 0 ? <div className="rounded-[12px] bg-success-soft px-3 py-3 text-[11px] text-success">Все получившие анонс уже ответили.</div> : attentionPlayers.map((player) => {
            const chatUrl = personalChatUrl(player, personalMessage);
            const sentAt = dateTime(player.first_sent_at);
            const remindedAt = dateTime(player.last_reminded_at);
            const failed = player.attention_status === 'failed';
            const notSent = player.attention_status === 'not_sent';
            return <div key={player.id} className="rounded-[14px] border border-border-soft bg-surface-2 p-3">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 rounded-full p-1.5 ${failed ? 'bg-danger-soft text-danger' : notSent ? 'bg-surface-1 text-text-muted' : 'bg-warning-soft text-warning'}`}>
                  {failed ? <AlertTriangle className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-[12px] text-text-primary">{player.nickname}</strong>
                  <div className="mt-1 text-[10px] leading-4 text-text-muted">
                    {failed ? 'Бот не смог доставить анонс.' : notSent ? 'Личный анонс ещё не отправлялся.' : `Анонс доставлен${sentAt ? ` · ${sentAt}` : ''}, ответа пока нет.`}
                    {player.reminder_count > 0 ? ` Напоминаний: ${player.reminder_count}${remindedAt ? ` · последнее ${remindedAt}` : ''}.` : ''}
                  </div>
                  {failed && player.last_error ? <div className="mt-1 line-clamp-1 text-[9px] text-danger/80">{player.last_error}</div> : null}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="flex min-h-[38px] items-center justify-center rounded-[10px] bg-surface-1 px-2 text-[10px] font-bold text-text-secondary">
                  {player.response_status === 'unanswered' ? 'Нет ответа' : responseLabel[player.response_status] || player.response_status}
                </div>
                {chatUrl ? <a href={chatUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-[10px] bg-accent px-2 text-[10px] font-bold text-white"><MessageCircle className="h-3.5 w-3.5" /> Написать лично</a> : <div className="flex min-h-[38px] items-center justify-center rounded-[10px] bg-surface-1 px-2 text-[10px] text-text-muted">Нет контакта</div>}
              </div>
            </div>;
          })}
        </div> : null}
      </> : null}
    </section>
  );
};

export default EveningAnnouncementPanel;
