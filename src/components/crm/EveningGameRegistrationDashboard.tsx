import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { api, type EveningParticipant } from '../../lib/api.ts';

type RegistrationState = 'games' | 'coming' | 'thinking' | 'declined' | 'unknown';
type Filter = 'all' | RegistrationState;
type AudiencePlayer = {
  id: string;
  nickname: string;
  eligible_now?: boolean;
  response_status?: string;
  attention_status?: string;
};
type Slot = {
  id: string;
  slot_number: number;
  starts_at: string;
  price?: number;
  participants?: Array<{ id: string; nickname: string }>;
};
type Row = {
  playerId: string;
  nickname: string;
  participant: EveningParticipant | null;
  responseStatus: string;
  slots: Slot[];
  state: RegistrationState;
};

const STATE_LABELS: Record<RegistrationState, string> = {
  games: 'Игры выбраны',
  coming: 'Будет, игры не выбраны',
  thinking: 'Думает',
  declined: 'Не будет',
  unknown: 'Нет информации',
};

const stateFor = (responseStatus: string, slots: Slot[]): RegistrationState => {
  if (slots.length) return 'games';
  if (responseStatus === 'going' || responseStatus === 'late') return 'coming';
  if (responseStatus === 'thinking') return 'thinking';
  if (responseStatus === 'declined') return 'declined';
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
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
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
      const slotBody = slotResponse.ok ? await slotResponse.json().catch(() => ({})) : {};
      const audiencePlayers: AudiencePlayer[] = Array.isArray(audienceBody?.players) ? audienceBody.players : [];
      const slots: Slot[] = Array.isArray(slotBody?.slots) ? slotBody.slots : [];
      const participants = (evening.participants || []) as EveningParticipant[];
      const participantByPlayer = new Map(participants.map((participant) => [String(participant.player_id), participant]));
      const audienceByPlayer = new Map(audiencePlayers.map((player) => [String(player.id), player]));
      const slotByPlayer = new Map<string, Slot[]>();
      for (const slot of slots) {
        for (const person of slot.participants || []) {
          const current = slotByPlayer.get(String(person.id)) || [];
          current.push(slot);
          slotByPlayer.set(String(person.id), current);
        }
      }

      const candidateIds = new Set<string>();
      audiencePlayers.filter((player) => Boolean(player.eligible_now)).forEach((player) => candidateIds.add(String(player.id)));
      participants.forEach((participant) => candidateIds.add(String(participant.player_id)));

      const nextRows: Row[] = Array.from(candidateIds).map((playerId) => {
        const participant = participantByPlayer.get(playerId) || null;
        const audience = audienceByPlayer.get(playerId);
        const playerSlots = (slotByPlayer.get(playerId) || []).sort((a, b) => a.slot_number - b.slot_number);
        const responseStatus = String((participant as any)?.response_status || (participant as any)?.registration_status || audience?.response_status || 'unanswered');
        return {
          playerId,
          nickname: String(participant?.nickname || audience?.nickname || 'Игрок'),
          participant,
          responseStatus,
          slots: playerSlots,
          state: stateFor(responseStatus, playerSlots),
        };
      }).sort((a, b) => {
        const priority: Record<RegistrationState, number> = { unknown: 0, coming: 1, thinking: 2, games: 3, declined: 4 };
        return priority[a.state] - priority[b.state] || a.nickname.localeCompare(b.nickname, 'ru');
      });

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
    coming: rows.filter((row) => row.state === 'coming').length,
    thinking: rows.filter((row) => row.state === 'thinking').length,
    declined: rows.filter((row) => row.state === 'declined').length,
    unknown: rows.filter((row) => row.state === 'unknown').length,
  }), [rows]);

  const visibleRows = useMemo(() => filter === 'all' ? rows : rows.filter((row) => row.state === filter), [filter, rows]);

  const setStatus = async (row: Row, status: 'going' | 'thinking' | 'declined') => {
    if (savingId || readonly) return;
    setSavingId(row.playerId);
    setError('');
    try {
      if (row.participant) {
        await api.updateParticipant(row.participant.id, { response_status: status } as any);
      } else {
        // A legacy organizer insert with status "going" intentionally means "whole evening"
        // and auto-selects every open game. Create an unanswered participant first, then
        // patch the known attendance decision so "Будет" can stay separate from slot choice.
        const created = await api.addParticipant(eveningId, {
          player_id: row.playerId,
          table_id: null,
          registration_status: 'unanswered' as any,
          amount_due: 0,
        });
        await api.updateParticipant(created.id, { response_status: status } as any);
      }
      await load(true);
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить решение игрока');
    } finally {
      setSavingId(null);
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
    { id: 'all', label: 'Все', count: rows.length },
    { id: 'unknown', label: 'Нет информации', count: counts.unknown },
    { id: 'coming', label: 'Будут без игр', count: counts.coming },
    { id: 'thinking', label: 'Думают', count: counts.thinking },
    { id: 'games', label: 'Игры выбраны', count: counts.games },
    { id: 'declined', label: 'Не будут', count: counts.declined },
  ];

  return (
    <section className="rounded-[16px] border border-border-soft bg-surface-1 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong className="block text-[13px] text-text-primary">Запись на игры</strong>
          <span className="mt-0.5 block text-[10px] leading-4 text-text-muted">В рассылке этого вечера: {audienceCount}. Здесь видно, по кому уже всё понятно, а кого ещё нужно уточнить.</span>
        </div>
        <button type="button" disabled={loading} onClick={() => void load()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-border-soft bg-surface-2 text-text-secondary disabled:opacity-40" aria-label="Обновить">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button type="button" onClick={() => setFilter('games')} className="rounded-[11px] bg-surface-2 p-2 text-left"><span className="block text-[18px] font-bold text-text-primary">{counts.games}</span><span className="text-[9px] text-text-muted">Игры выбраны</span></button>
        <button type="button" onClick={() => setFilter('coming')} className="rounded-[11px] bg-surface-2 p-2 text-left"><span className="block text-[18px] font-bold text-text-primary">{counts.coming}</span><span className="text-[9px] text-text-muted">Будут, без игр</span></button>
        <button type="button" onClick={() => setFilter('thinking')} className="rounded-[11px] bg-surface-2 p-2 text-left"><span className="block text-[18px] font-bold text-text-primary">{counts.thinking}</span><span className="text-[9px] text-text-muted">Думают</span></button>
        <button type="button" onClick={() => setFilter('declined')} className="rounded-[11px] bg-surface-2 p-2 text-left"><span className="block text-[18px] font-bold text-text-primary">{counts.declined}</span><span className="text-[9px] text-text-muted">Не будут</span></button>
        <button type="button" onClick={() => setFilter('unknown')} className="col-span-2 rounded-[11px] border border-accent/30 bg-accent-soft p-2 text-left sm:col-span-1"><span className="block text-[18px] font-bold text-text-primary">{counts.unknown}</span><span className="text-[9px] text-text-muted">Нет информации</span></button>
      </div>

      <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
        {filterItems.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-[9px] font-bold ${filter === item.id ? 'bg-accent text-white' : 'bg-surface-2 text-text-secondary'}`}>{item.label} · {item.count}</button>)}
      </div>

      {error ? <div className="mt-3 rounded-[11px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</div> : null}
      {readonly ? <div className="mt-3 rounded-[11px] bg-surface-2 px-3 py-2 text-[10px] text-text-muted">Вечер завершён — запись доступна только для просмотра.</div> : null}
      {loading ? <p className="py-5 text-center text-[11px] text-text-secondary">Загружаю запись…</p> : null}

      {!loading ? <div className="mt-2 space-y-1.5">
        {visibleRows.map((row) => {
          const busy = savingId === row.playerId;
          const editing = editingPlayerId === row.playerId;
          const slotText = row.slots.length
            ? row.slots.map((slot) => `${slot.slot_number} (${slotTime(slot.starts_at)})`).join(' · ')
            : STATE_LABELS[row.state];
          return <div key={row.playerId} className="rounded-[11px] bg-surface-2 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-[11px] text-text-primary">{row.nickname}</strong>
                <span className="mt-0.5 block text-[9px] leading-4 text-text-muted">{row.slots.length ? `Игры: ${slotText}` : slotText}</span>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" disabled={busy} onClick={() => openSlotEditor(row)} className={`flex min-h-[32px] items-center gap-1 rounded-[8px] px-2 text-[9px] font-bold disabled:opacity-40 ${editing ? 'bg-accent text-white' : 'bg-surface-1 text-text-secondary'}`}>
                  Игры {editing ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {row.state !== 'games' && !editing ? <>
                  <button type="button" disabled={busy || readonly} onClick={() => void setStatus(row, 'going')} className={`min-h-[32px] rounded-[8px] px-2 text-[9px] font-bold disabled:opacity-40 ${row.state === 'coming' ? 'bg-accent text-white' : 'bg-surface-1 text-text-secondary'}`}>Будет</button>
                  <button type="button" disabled={busy || readonly} onClick={() => void setStatus(row, 'thinking')} className={`min-h-[32px] rounded-[8px] px-2 text-[9px] font-bold disabled:opacity-40 ${row.state === 'thinking' ? 'bg-accent text-white' : 'bg-surface-1 text-text-secondary'}`}>Думает</button>
                  <button type="button" disabled={busy || readonly} onClick={() => void setStatus(row, 'declined')} className={`min-h-[32px] rounded-[8px] px-2 text-[9px] font-bold disabled:opacity-40 ${row.state === 'declined' ? 'bg-accent text-white' : 'bg-surface-1 text-text-secondary'}`}>Не будет</button>
                </> : null}
              </div>
            </div>

            {editing ? <div className="mt-2 border-t border-border-soft pt-2">
              <div className="mb-2 flex items-center justify-between gap-2 text-[9px] text-text-muted">
                <span>Выбери точные игры</span>
                <span>{editingSlotIds.length} игр · {editTotal} ₽</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {allSlots.map((slot) => {
                  const selected = editingSlotIds.includes(slot.id);
                  return <button
                    key={slot.id}
                    type="button"
                    disabled={busy || readonly}
                    onClick={() => toggleEditingSlot(slot.id)}
                    className={`min-h-[44px] rounded-[9px] border px-2 text-left disabled:opacity-40 ${selected ? 'border-accent bg-accent-soft text-text-primary' : 'border-border-soft bg-surface-1 text-text-secondary'}`}
                  >
                    <strong className="block text-[10px]">Игра {slot.slot_number} · {slotTime(slot.starts_at)}</strong>
                    <span className="mt-0.5 block text-[8px] text-text-muted">{Number(slot.price || 0)} ₽ {selected ? '· ✓' : ''}</span>
                  </button>;
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={busy} onClick={() => { setEditingPlayerId(null); setEditingSlotIds([]); }} className="min-h-[38px] flex-1 rounded-[9px] border border-border-soft bg-surface-1 px-3 text-[10px] font-bold text-text-secondary disabled:opacity-40">Отмена</button>
                <button type="button" disabled={busy || readonly} onClick={() => void saveInlineSlots(row)} className="min-h-[38px] flex-[1.4] rounded-[9px] bg-accent px-3 text-[10px] font-bold text-white disabled:opacity-40">{busy ? 'Сохраняю…' : editingSlotIds.length ? 'Сохранить игры' : 'Снять со всех игр'}</button>
              </div>
            </div> : null}
          </div>;
        })}
        {!visibleRows.length ? <p className="py-5 text-center text-[11px] text-text-muted">В этой группе пока никого.</p> : null}
      </div> : null}
    </section>
  );
}
