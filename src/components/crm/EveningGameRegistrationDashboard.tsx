import { countGames } from '../../lib/russianPlural';
import { useEffect, useMemo, useState } from 'react';
import { weeklyAnnouncementDueMs } from '../../lib/weeklyAnnouncementDue.ts';
import { MessageCircle, RefreshCw, Search } from 'lucide-react';
import { api, type EveningParticipant } from '../../lib/api.ts';
import { guestContactHref } from '../../lib/guestContact.ts';
import { getEveningResponse } from '../../lib/eveningResponse.ts';

type RegistrationState = 'games' | 'thinking' | 'declined' | 'unknown';
type Filter = 'attention' | 'delivery' | 'not_sent' | 'all' | RegistrationState;
type AudiencePlayer = {
  id: string;
  nickname: string;
  eligible_now?: boolean;
  response_status?: string;
  attention_status?: string;
  telegram_user_id?: string | null;
  telegram_username?: string | null;
  first_sent_at?: string | null;
  delivery_status?: string | null;
  last_error?: string | null;
  reminder_count?: number;
};
type Slot = {
  id: string;
  slot_number: number;
  starts_at: string;
  price?: number;
  participants?: Array<{ id: string; nickname: string; whole_evening?: boolean }>;
};
type Row = {
  playerId: string;
  nickname: string;
  participant: EveningParticipant | null;
  responseStatus: string;
  slots: Slot[];
  state: RegistrationState;
  telegramUserId: string | null;
  telegramUsername: string | null;
  firstSentAt: string | null;
  deliveryStatus: string;
  lastDeliveryError: string | null;
  reminderCount: number;
  eligibleNow: boolean;
  isGuest: boolean;
};

const STATE_LABELS: Record<RegistrationState, string> = {
  games: 'Идёт',
  thinking: 'Думает',
  declined: 'Не будет',
  unknown: 'Нет ответа',
};

// The answer decides the bucket; chosen games only split «идут» in two. A player
// switched to «Думает» keeps their games but must not be counted as coming.
const stateFor = (responseStatus: string, slots: Slot[]): RegistrationState => {
  if (responseStatus === 'declined') return 'declined';
  if (responseStatus === 'thinking') return 'thinking';
  // «Иду» always means every game unless the player picked exact ones (owner, 2026-10-02): no «без игр» bucket.
  // «Приду позже» without games still counts as coming; its games stay empty until chosen.
  if (slots.length || responseStatus === 'going' || responseStatus === 'late') return 'games';
  return 'unknown';
};

const slotTime = (value: string) => new Date(value).toLocaleTimeString('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

export default function EveningGameRegistrationDashboard({ eveningId, refreshKey = 0, onChanged }: { eveningId: string; refreshKey?: number; onChanged?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [allSlots, setAllSlots] = useState<Slot[]>([]);
  const [maxEveningPrice, setMaxEveningPrice] = useState(0);
  const [audienceCount, setAudienceCount] = useState(0);
  const [readonly, setReadonly] = useState(false);
  const [announcementDueMs, setAnnouncementDueMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingStatusIds, setSavingStatusIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');
  const [deliveryWarning, setDeliveryWarning] = useState('');
  const [filter, setFilter] = useState<Filter>('attention');
  const [search, setSearch] = useState('');
  const [editingResponseId, setEditingResponseId] = useState<string | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editingSlotIds, setEditingSlotIds] = useState<string[]>([]);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const headers: Record<string, string> = {};
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('organizer_token');
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const [evening, audienceResponse, slotResponse] = await Promise.all([
        api.getEvening(eveningId),
        fetch(`/api/evenings/${encodeURIComponent(eveningId)}/announcement-overview`, { credentials: 'include', headers }),
        fetch(`/api/evenings/${encodeURIComponent(eveningId)}/slots`, { credentials: 'include', headers }),
      ]);
      const audienceBody = audienceResponse.ok ? await audienceResponse.json().catch(() => ({})) : {};
      setDeliveryWarning(audienceResponse.ok ? '' : 'Не удалось загрузить статус доставки. Ответы уже записавшихся игроков доступны, но список приглашённых может быть неполным.');
      const slotBody = slotResponse.ok ? await slotResponse.json().catch(() => ({})) : {};
      const audiencePlayers: AudiencePlayer[] = Array.isArray(audienceBody?.players) ? audienceBody.players : [];
      const slots: Slot[] = Array.isArray(slotBody?.slots) ? slotBody.slots : [];
      const participants = (evening.participants || []) as EveningParticipant[];
      // A guest (lead) has no player id: its row is keyed `guest:<id>`, and its games are looked up by the guest id.
      const isGuestParticipant = (participant: EveningParticipant) => Boolean((participant as any).is_guest);
      const rowKeyOf = (participant: EveningParticipant) => isGuestParticipant(participant) ? `guest:${participant.id}` : String(participant.player_id);
      const participantByPlayer = new Map(participants.map((participant) => [rowKeyOf(participant), participant]));
      const audienceByPlayer = new Map(audiencePlayers.map((player) => [String(player.id), player]));
      const slotByPlayer = new Map<string, Slot[]>();
      const wholeEveningIds = new Set<string>();
      for (const slot of slots) {
        for (const person of slot.participants || []) {
          // «Иду» without an exact plan is counted in every game by the server and shown as all games.
          // «Приду позже» records only intent, never a slot plan (BUSINESS_RULES), so it is filtered below.
          if (person.whole_evening) wholeEveningIds.add(String(person.id));
          const current = slotByPlayer.get(String(person.id)) || [];
          current.push(slot);
          slotByPlayer.set(String(person.id), current);
        }
      }

      const candidateIds = new Set<string>();
      audiencePlayers.filter((player) => Boolean(player.eligible_now)).forEach((player) => candidateIds.add(String(player.id)));
      participants.forEach((participant) => candidateIds.add(rowKeyOf(participant)));

      const nextRows: Row[] = Array.from(candidateIds).map((playerId) => {
        const participant = participantByPlayer.get(playerId) || null;
        const audience = audienceByPlayer.get(playerId);
        const responseStatus = participant ? getEveningResponse(participant) : String(audience?.response_status || 'unanswered');
        const isGuest = Boolean(participant && isGuestParticipant(participant));
        const slotKey = isGuest && participant ? String(participant.id) : playerId;
        const playerSlots = responseStatus === 'late' && wholeEveningIds.has(slotKey)
          ? []
          : (slotByPlayer.get(slotKey) || []).sort((a, b) => a.slot_number - b.slot_number);
        return {
          playerId,
          nickname: String(participant?.nickname || audience?.nickname || 'Игрок'),
          participant,
          responseStatus,
          slots: playerSlots,
          state: stateFor(responseStatus, playerSlots),
          telegramUserId: audience?.telegram_user_id ? String(audience.telegram_user_id) : null,
          telegramUsername: audience?.telegram_username ? String(audience.telegram_username) : null,
          firstSentAt: audience?.first_sent_at || null,
          deliveryStatus: String(audience?.delivery_status || 'not_sent'),
          lastDeliveryError: audience?.last_error || null,
          reminderCount: Number(audience?.reminder_count || 0),
          eligibleNow: Boolean(audience?.eligible_now),
          isGuest,
        };
      }).sort((a, b) => {
        const priority: Record<RegistrationState, number> = { unknown: 0, thinking: 1, games: 2, declined: 3 };
        return priority[a.state] - priority[b.state] || a.nickname.localeCompare(b.nickname, 'ru');
      });

      const dueMs = weeklyAnnouncementDueMs(String((evening as any).starts_at || ''));
      setAnnouncementDueMs(Number.isFinite(dueMs) ? dueMs : null);
      setReadonly(String(evening.status || '') === 'completed' || Boolean((evening as any).settled_at));
      setMaxEveningPrice(Number(slotBody?.event?.max_evening_price || 0));
      setAllSlots(slots);
      setAudienceCount(Number(audienceBody?.summary?.audience || audiencePlayers.filter((player) => player.eligible_now).length));
      setRows(nextRows);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить запись на игры');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [eveningId, refreshKey]);

  const counts = useMemo(() => ({
    games: rows.filter((row) => row.state === 'games').length,
    thinking: rows.filter((row) => row.state === 'thinking').length,
    declined: rows.filter((row) => row.state === 'declined').length,
    unknown: rows.filter((row) => row.state === 'unknown').length,
  }), [rows]);

  const needsReply = (row: Row) => row.state === 'unknown' || row.state === 'thinking';
  const deliveryFailed = (row: Row) => row.eligibleNow && row.state === 'unknown' && !row.firstSentAt && row.deliveryStatus === 'failed';
  const attentionCount = rows.filter(needsReply).length;
  const failedCount = rows.filter(deliveryFailed).length;
  const sentCount = rows.filter((row) => row.eligibleNow && Boolean(row.firstSentAt)).length;
  const notSentCount = rows.filter((row) => row.eligibleNow && row.state === 'unknown' && !row.firstSentAt && row.deliveryStatus !== 'failed').length;
  const visibleRows = useMemo(() => rows.filter((row) => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    if (query && !row.nickname.toLocaleLowerCase('ru-RU').includes(query)) return false;
    if (filter === 'attention') return needsReply(row);
    if (filter === 'delivery') return deliveryFailed(row);
    if (filter === 'not_sent') return row.eligibleNow && row.state === 'unknown' && !row.firstSentAt && row.deliveryStatus !== 'failed';
    return filter === 'all' || row.state === filter;
  }), [filter, rows, search]);

  const chatUrlFor = (row: Row) => {
    if (row.isGuest) return guestContactHref((row.participant as any)?.contact_kind, (row.participant as any)?.contact_value);
    const username = String(row.telegramUsername || '').trim().replace(/^@/, '');
    if (username) return `https://t.me/${username}`;
    const userId = String(row.telegramUserId || '').trim();
    return userId ? `tg://user?id=${encodeURIComponent(userId)}` : null;
  };

  // The weekly announcement (and the personal DMs with it) goes out by itself at this moment.
  const announcementWhen = (() => {
    if (!announcementDueMs || Date.now() >= announcementDueMs) return '';
    const moscowDay = (ms: number) => new Date(ms).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
    const time = new Date(announcementDueMs).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
    const day = moscowDay(announcementDueMs) === moscowDay(Date.now())
      ? 'сегодня'
      : new Date(announcementDueMs).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long' });
    return `${day} в ${time} МСК`;
  })();

  const deliveryLabel = (row: Row) => {
    if (row.isGuest) return 'Гость · записан организатором';
    if (!row.eligibleNow) return 'Вне личной рассылки';
    if (row.firstSentAt) return `Анонс доставлен${row.reminderCount ? ` · напоминаний: ${row.reminderCount}` : ''}`;
    if (row.deliveryStatus === 'failed') return 'Анонс не доставлен';
    return announcementWhen ? `Анонс отправится ${announcementWhen}` : 'Анонс ещё не отправлен';
  };

  const setStatus = async (row: Row, status: 'going' | 'late' | 'thinking' | 'declined' | 'unanswered') => {
    if (savingStatusIds.has(row.playerId) || readonly) return;

    const previousResponseStatus = row.responseStatus;
    const previousState = row.state;
    const previousParticipant = row.participant;
    const optimisticState = stateFor(status, row.slots);

    setError('');
    setSavingStatusIds((current) => {
      const next = new Set(current);
      next.add(row.playerId);
      return next;
    });
    setRows((current) => current.map((item) => item.playerId === row.playerId
      ? { ...item, responseStatus: status, state: optimisticState }
      : item));

    try {
      if (row.participant) {
        await api.updateParticipant(row.participant.id, { response_status: status } as any);
      } else {
        const createdParticipant = await api.addParticipant(eveningId, {
          player_id: row.playerId,
          table_id: null,
          response_status: 'unanswered',
          amount_due: 0,
        });
        await api.updateParticipant(createdParticipant.id, { response_status: status } as any);
      }

      await load(true);
      onChanged?.();
      setEditingResponseId(null);
    } catch (err: any) {
      setRows((current) => current.map((item) => item.playerId === row.playerId
        ? {
          ...item,
          participant: previousParticipant,
          responseStatus: previousResponseStatus,
          state: previousState,
        }
        : item));
      setError(err?.message || `Не удалось сохранить решение игрока ${row.nickname}`);
    } finally {
      setSavingStatusIds((current) => {
        const next = new Set(current);
        next.delete(row.playerId);
        return next;
      });
    }
  };

  const openSlotEditor = (row: Row) => {
    if (editingPlayerId === row.playerId) {
      setEditingPlayerId(null);
      setEditingSlotIds([]);
      return;
    }
    setEditingPlayerId(row.playerId);
    setEditingSlotIds(row.slots.map((slot) => slot.id));
    setError('');
  };

  const toggleEditingSlot = (slotId: string) => {
    setEditingSlotIds((current) => current.includes(slotId)
      ? current.filter((id) => id !== slotId)
      : [...current, slotId]);
  };

  const saveInlineSlots = async (row: Row) => {
    if (savingId || readonly) return;
    setSavingId(row.playerId);
    setError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('organizer_token');
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(
        `/api/evenings/${encodeURIComponent(eveningId)}/slots/player/${encodeURIComponent(row.playerId)}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers,
          body: JSON.stringify({ slot_ids: editingSlotIds }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить игры игрока');
      setEditingPlayerId(null);
      setEditingSlotIds([]);
      await load(true);
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить игры игрока');
    } finally {
      setSavingId(null);
    }
  };

  const editRawTotal = allSlots
    .filter((slot) => editingSlotIds.includes(slot.id))
    .reduce((sum, slot) => sum + Number(slot.price || 0), 0);
  const editTotal = maxEveningPrice > 0 ? Math.min(editRawTotal, maxEveningPrice) : editRawTotal;

  const filterItems: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'attention', label: 'Нужен ответ', count: attentionCount },
    { id: 'unknown', label: 'Нет ответа', count: counts.unknown },
    { id: 'delivery', label: 'Не доставлено', count: failedCount },
    { id: 'not_sent', label: 'Не отправлено', count: notSentCount },
    { id: 'thinking', label: 'Думают', count: counts.thinking },
    { id: 'games', label: 'Идут', count: counts.games },
    { id: 'declined', label: 'Не будут', count: counts.declined },
    { id: 'all', label: 'Все', count: rows.length },
  ];

  return (
    <section className="rounded-[16px] border border-border-soft bg-surface-1 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-text-primary">Ответы игроков</h2>
          <p className="mt-1 text-[12px] leading-5 text-text-secondary">Ответ, доставка анонса, личный контакт и игры — в одном списке.</p>
          <p className="mt-1 text-[11px] text-text-muted">В рассылке: {audienceCount} · доставлено: {sentCount} · ошибок доставки: {failedCount}</p>
          {!loading && !deliveryWarning ? <p data-testid="audience-explainer" className="mt-1 text-[11px] leading-4 text-text-muted">
            В списке все игроки клуба с привязанным Telegram, не на паузе и подходящие по уровню и формату этого вечера — не только записавшиеся.
            {notSentCount > 0 ? (announcementWhen
              ? ` Анонс отправится сам ${announcementWhen}, тогда бот напишет игрокам лично.`
              : sentCount === 0 && failedCount === 0
                ? ' «Анонс ещё не отправлен» у всех: по этому вечеру личная рассылка ещё не запускалась.'
                : ` «Анонс ещё не отправлен» у ${notSentCount}: личная рассылка до них ещё не дошла.`) : ''}
          </p> : null}
        </div>
        <button type="button" disabled={loading} onClick={() => void load()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border border-border-soft bg-surface-2 text-text-secondary disabled:opacity-40" aria-label="Обновить">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Фильтр ответов и доставки">
        {filterItems.map((item) => <button key={item.id} type="button" aria-label={`${item.count} ${item.label}`} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-[50px] rounded-[11px] px-3 text-left ${filter === item.id ? 'bg-accent text-white' : item.id === 'delivery' && item.count ? 'bg-danger-soft text-danger' : item.id === 'attention' && item.count ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-text-secondary'}`}><span className="block text-[16px] font-bold">{item.count}</span><span className={`text-[11px] ${filter === item.id ? 'text-white/90' : 'text-text-muted'}`}>{item.label}</span></button>)}
      </div>
      <label className="relative mt-3 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти игрока по имени" aria-label="Найти игрока" className="mobile-field w-full pl-9" />
      </label>

      {error ? <div className="mt-3 rounded-[11px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</div> : null}
      {deliveryWarning ? <div className="mt-3 rounded-[11px] bg-warning-soft px-3 py-2 text-[12px] text-warning">{deliveryWarning}</div> : null}
      {readonly ? <div className="mt-3 rounded-[11px] bg-surface-2 px-3 py-2 text-[10px] text-text-muted">Вечер завершён — запись доступна только для просмотра.</div> : null}
      {loading ? <p className="py-5 text-center text-[11px] text-text-secondary">Загружаю запись…</p> : null}

      {!loading ? <div className="mt-3 space-y-2">
        {visibleRows.map((row) => {
          const busy = savingId === row.playerId || savingStatusIds.has(row.playerId);
          const editing = editingPlayerId === row.playerId;
          const responseOpen = editingResponseId === row.playerId;
          const chatUrl = chatUrlFor(row);
          return <div key={row.playerId} data-testid={`evening-answer-row-${row.playerId}`} className="rounded-[13px] bg-surface-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-[13px] font-bold text-text-primary">{row.nickname}</strong>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-[7px] px-2 py-1 text-[11px] font-semibold ${row.state === 'games' ? 'bg-success-soft text-success' : row.state === 'declined' ? 'bg-danger-soft text-danger' : row.state === 'unknown' ? 'bg-warning-soft text-warning' : 'bg-surface-1 text-text-secondary'}`}>{row.responseStatus === 'late' ? 'Придёт позже' : STATE_LABELS[row.state]}</span>
                  <span className={`text-[11px] ${deliveryFailed(row) ? 'text-danger' : 'text-text-muted'}`}>{deliveryLabel(row)}</span>
                </div>
                {row.lastDeliveryError && deliveryFailed(row) ? <p className="mt-1 break-words text-[11px] text-danger">Причина: {row.lastDeliveryError}</p> : null}
                {row.slots.length ? <p className="mt-1 text-[11px] text-text-muted">Игры: {row.slots.map((slot) => `${slot.slot_number} (${slotTime(slot.starts_at)})`).join(' · ')}</p> : null}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" aria-expanded={responseOpen} disabled={busy || readonly} onClick={() => { setEditingResponseId(responseOpen ? null : row.playerId); setEditingPlayerId(null); }} className={`min-h-11 rounded-[10px] px-2 text-[12px] font-semibold disabled:opacity-40 ${responseOpen ? 'bg-accent text-white' : 'bg-surface-1 text-text-primary'}`}>Ответ {responseOpen ? '▴' : '▾'}</button>
              {!row.isGuest ? <button type="button" aria-expanded={editing} disabled={busy || readonly} onClick={() => { setEditingResponseId(null); openSlotEditor(row); }} className={`min-h-11 rounded-[10px] px-2 text-[12px] font-semibold disabled:opacity-40 ${editing ? 'bg-accent text-white' : 'bg-surface-1 text-text-primary'}`}>Игры {editing ? '▴' : '▾'}</button> : null}
              {chatUrl ? <a href={chatUrl} target="_blank" rel="noreferrer" aria-label={`Написать ${row.nickname}`} className="flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-surface-1 px-2 text-[12px] font-semibold text-accent"><MessageCircle className="h-4 w-4" />Написать</a> : <span className="flex min-h-11 items-center justify-center rounded-[10px] bg-surface-1 px-2 text-center text-[11px] text-text-muted">Нет контакта</span>}
            </div>
            {responseOpen ? <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border-soft pt-3 sm:grid-cols-4" aria-label={`Ответ ${row.nickname}`}>
              {([
                ['going', 'Иду'], ['late', 'Приду позже'], ['thinking', 'Пока думаю'], ['declined', 'Не иду'], ['unanswered', 'Нет ответа'],
              ] as const).map(([status, label]) => <button key={status} type="button" aria-pressed={row.responseStatus === status} disabled={busy || readonly} onClick={() => void setStatus(row, status)} className={`min-h-11 rounded-[10px] px-2 text-[12px] font-semibold disabled:opacity-40 ${row.responseStatus === status ? 'bg-accent text-white' : 'bg-surface-1 text-text-secondary'}`}>{label}</button>)}
            </div> : null}
            {editing ? <div className="mt-3 border-t border-border-soft pt-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-text-muted">
                <span>Точные игры</span>
                <span>{countGames(editingSlotIds.length)} · {editTotal} ₽</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {allSlots.map((slot) => {
                  const selected = editingSlotIds.includes(slot.id);
                  return <button
                    key={slot.id}
                    type="button"
                    disabled={busy || readonly}
                    onClick={() => toggleEditingSlot(slot.id)}
                    className={`min-h-[54px] rounded-[11px] border px-3 text-left disabled:opacity-40 ${selected ? 'border-accent bg-accent-soft text-text-primary' : 'border-border-soft bg-surface-1 text-text-secondary'}`}
                  >
                    <strong className="block text-[11px]">Игра {slot.slot_number}</strong>
                    <span className="mt-0.5 block text-[10px] text-text-muted">{slotTime(slot.starts_at)} · {Number(slot.price || 0)} ₽ {selected ? '· ✓' : ''}</span>
                  </button>;
                })}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={() => { setEditingPlayerId(null); setEditingSlotIds([]); }} className="min-h-[44px] rounded-[10px] border border-border-soft bg-surface-1 px-3 text-[10px] font-bold text-text-secondary disabled:opacity-40">Отмена</button>
                <button type="button" disabled={busy || readonly} onClick={() => void saveInlineSlots(row)} className="min-h-[44px] rounded-[10px] bg-accent px-3 text-[10px] font-bold text-white disabled:opacity-40">{busy ? 'Сохраняю…' : editingSlotIds.length ? 'Сохранить игры' : 'Снять со всех игр'}</button>
              </div>
            </div> : null}
          </div>;
        })}
        {!visibleRows.length ? <p className="py-5 text-center text-[12px] text-text-muted">{search.trim() ? 'По запросу никого не найдено.' : filter === 'attention' ? 'Сейчас нет игроков, которым нужен ответ.' : 'В этой группе пока никого.'}</p> : null}
      </div> : null}
    </section>
  );
}
