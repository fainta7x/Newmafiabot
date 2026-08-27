import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { api, type EveningParticipant } from '../../lib/api.ts';

type ResponseStatus = 'going' | 'late' | 'thinking' | 'declined' | 'unanswered';
type Filter = 'all' | ResponseStatus;

type AudiencePlayer = {
  id: string;
  nickname: string;
  telegram_user_id?: string | null;
  telegram_username?: string | null;
  response_status?: ResponseStatus;
  eligible_now?: boolean;
};

type Row = {
  playerId: string;
  nickname: string;
  participant: EveningParticipant | null;
  responseStatus: ResponseStatus;
  telegramUserId: string | null;
  telegramUsername: string | null;
};

const STATUS_LABELS: Record<ResponseStatus, string> = {
  going: 'Идёт',
  late: 'Позже',
  thinking: 'Думает',
  declined: 'Не идёт',
  unanswered: 'Ждём ответа',
};

const STATUS_ORDER: ResponseStatus[] = ['unanswered', 'going', 'late', 'thinking', 'declined'];

const chatUrlFor = (row: Row) => {
  const username = String(row.telegramUsername || '').replace(/^@/, '').trim();
  if (username) return `https://t.me/${username}`;
  const userId = String(row.telegramUserId || '').trim();
  return userId ? `tg://user?id=${encodeURIComponent(userId)}` : null;
};

export default function EveningPersonalInvites({ eveningId }: { eveningId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<Filter>('unanswered');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [readonly, setReadonly] = useState(false);
  const [error, setError] = useState('');

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [evening, audienceResponse] = await Promise.all([
        api.getEvening(eveningId),
        fetch(`/api/evenings/${encodeURIComponent(eveningId)}/announcement-overview`, { credentials: 'same-origin' }),
      ]);
      const audienceBody = audienceResponse.ok ? await audienceResponse.json().catch(() => ({})) : {};
      const audiencePlayers: AudiencePlayer[] = Array.isArray(audienceBody?.players) ? audienceBody.players : [];
      const participants = (evening.participants || []) as EveningParticipant[];
      const participantByPlayer = new Map(participants.map((participant) => [String(participant.player_id), participant]));
      const audienceByPlayer = new Map(audiencePlayers.map((player) => [String(player.id), player]));
      const candidateIds = new Set<string>();

      audiencePlayers.filter((player) => Boolean(player.eligible_now)).forEach((player) => candidateIds.add(String(player.id)));
      participants.forEach((participant) => candidateIds.add(String(participant.player_id)));

      const nextRows = Array.from(candidateIds).map((playerId): Row => {
        const participant = participantByPlayer.get(playerId) || null;
        const audience = audienceByPlayer.get(playerId);
        const responseStatus = String(
          (participant as any)?.response_status
          || (participant as any)?.registration_status
          || audience?.response_status
          || 'unanswered',
        ) as ResponseStatus;
        return {
          playerId,
          nickname: String(participant?.nickname || audience?.nickname || 'Игрок'),
          participant,
          responseStatus: STATUS_ORDER.includes(responseStatus) ? responseStatus : 'unanswered',
          telegramUserId: audience?.telegram_user_id ? String(audience.telegram_user_id) : null,
          telegramUsername: audience?.telegram_username ? String(audience.telegram_username) : null,
        };
      }).sort((a, b) => {
        const priority = STATUS_ORDER.indexOf(a.responseStatus) - STATUS_ORDER.indexOf(b.responseStatus);
        return priority || a.nickname.localeCompare(b.nickname, 'ru');
      });

      setReadonly(String(evening.status || '') === 'completed' || Boolean((evening as any).settled_at));
      setRows(nextRows);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить личные приглашения');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [eveningId]);

  const counts = useMemo(() => STATUS_ORDER.reduce<Record<ResponseStatus, number>>((acc, status) => {
    acc[status] = rows.filter((row) => row.responseStatus === status).length;
    return acc;
  }, { going: 0, late: 0, thinking: 0, declined: 0, unanswered: 0 }), [rows]);

  const visibleRows = useMemo(
    () => filter === 'all' ? rows : rows.filter((row) => row.responseStatus === filter),
    [filter, rows],
  );

  const setStatus = async (row: Row, status: ResponseStatus) => {
    if (savingId || readonly || row.responseStatus === status) return;
    setSavingId(row.playerId);
    setError('');
    try {
      if (row.participant) {
        await api.updateParticipant(row.participant.id, { response_status: status } as any);
      } else {
        const created = await api.addParticipant(eveningId, {
          player_id: row.playerId,
          table_id: null,
          registration_status: 'unanswered' as any,
          amount_due: 0,
        });
        await api.updateParticipant(created.id, { response_status: status } as any);
      }
      await load(true);
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить решение игрока');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-black text-text-primary">Личные приглашения</h3>
          <p className="mt-1 text-[10px] leading-4 text-text-muted">Главный рабочий список до вечера: сразу фиксируй ответ игрока, без дополнительных экранов.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || Boolean(savingId)} className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-surface-2 text-text-secondary disabled:opacity-40" aria-label="Обновить">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        <button type="button" onClick={() => setFilter('all')} className={`shrink-0 rounded-full px-3 py-1.5 text-[9px] font-bold ${filter === 'all' ? 'bg-accent text-white' : 'bg-surface-2 text-text-secondary'}`}>Все · {rows.length}</button>
        {STATUS_ORDER.map((status) => (
          <button key={status} type="button" onClick={() => setFilter(status)} className={`shrink-0 rounded-full px-3 py-1.5 text-[9px] font-bold ${filter === status ? 'bg-accent text-white' : status === 'unanswered' && counts.unanswered ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-text-secondary'}`}>
            {STATUS_LABELS[status]} · {counts[status]}
          </button>
        ))}
      </div>

      {error ? <div className="mt-3 rounded-[11px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</div> : null}
      {readonly ? <div className="mt-3 rounded-[11px] bg-surface-2 px-3 py-2 text-[10px] text-text-muted">Вечер завершён — ответы доступны только для просмотра.</div> : null}
      {loading ? <div className="py-7 text-center text-[11px] text-text-muted">Загружаю игроков…</div> : null}

      {!loading ? <div className="mt-3 space-y-2">
        {visibleRows.map((row) => {
          const busy = savingId === row.playerId;
          const chatUrl = chatUrlFor(row);
          return <div key={row.playerId} className="rounded-[13px] bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-[12px] text-text-primary">{row.nickname}</strong>
                <span className="mt-0.5 block text-[9px] text-text-muted">Сейчас: {STATUS_LABELS[row.responseStatus]}</span>
              </div>
              {chatUrl ? <a href={chatUrl} target="_blank" rel="noreferrer" aria-label={`Написать ${row.nickname}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface-1 text-accent"><MessageCircle className="h-4 w-4" /></a> : null}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {STATUS_ORDER.map((status) => {
                const active = row.responseStatus === status;
                return <button
                  key={status}
                  type="button"
                  disabled={busy || readonly}
                  onClick={() => void setStatus(row, status)}
                  className={`min-h-[36px] rounded-[9px] px-1.5 text-[9px] font-bold transition-colors disabled:opacity-40 ${active ? 'bg-accent text-white' : 'bg-surface-1 text-text-secondary'}`}
                >
                  {busy && !active ? '…' : STATUS_LABELS[status]}
                </button>;
              })}
            </div>
          </div>;
        })}
        {!visibleRows.length ? <div className="rounded-[12px] bg-surface-2 px-3 py-5 text-center text-[11px] text-text-muted">В этой группе сейчас никого.</div> : null}
      </div> : null}
    </section>
  );
}
