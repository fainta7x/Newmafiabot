import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, MessageSquare, Plus, RefreshCw, Search } from 'lucide-react';
import { api, type EveningParticipant, type GameEvening, type Player } from '../../lib/api.ts';
import { getEveningResponse, getEveningRosterResponseLabel } from '../../lib/eveningResponse.ts';
import { isInOrganizerWorkingRoster as isActiveEveningParticipant } from '../../lib/eveningParticipantView.ts';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';

import EveningListControls from './EveningListControls.tsx';
import { guestContactHref, guestContactLabel, type GuestContactKind } from '../../lib/guestContact.ts';
import { EMPTY_GUEST, GuestFields, type GuestDraft } from './GuestFields.tsx';

type EveningData = GameEvening & { participants: EveningParticipant[] };
type AddMode = 'players' | 'guest';

const inactiveLabel = (participant: EveningParticipant) => (
  participant.attendance_status === 'no_show'
    ? 'Отмечен «не пришёл»'
    : `Ответил «${getEveningRosterResponseLabel(participant)}»`
);

export default function EveningActiveRosterView({
  eveningId,
  initialAddOpen = false,
  onInitialAddHandled,
  onOpenPlayerCard,
}: {
  eveningId: string;
  initialAddOpen?: boolean;
  onInitialAddHandled?: () => void;
  onOpenPlayerCard?: (id: string) => void;
}) {
  const [evening, setEvening] = useState<EveningData | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [showAdd, setShowAdd] = useState(initialAddOpen);
  const [addMode, setAddMode] = useState<AddMode>('players');
  const [addSearch, setAddSearch] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [guest, setGuest] = useState<GuestDraft>({ ...EMPTY_GUEST });
  const [editingGuest, setEditingGuest] = useState<{ id: string; draft: GuestDraft; companion?: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'expected' | 'arrived'>('all');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [eveningData, players] = await Promise.all([
        api.getEvening(eveningId),
        api.getPlayers(),
      ]);
      setEvening(eveningData as EveningData);
      setAllPlayers(players);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить состав вечера');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [eveningId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!initialAddOpen) return;
    setShowAdd(true);
    onInitialAddHandled?.();
  }, [initialAddOpen, onInitialAddHandled]);

  const participants = useMemo(
    () => (evening?.participants || []).filter(isActiveEveningParticipant),
    [evening],
  );
  // A guest's «+N» are rows of their own («Иван +1», linked by companion_of), so the counters just count rows.
  const totalSeats = participants.length;
  const arrivedCount = participants.filter((participant) => participant.attendance_status === 'attended').length;
  const hostName = (participant: any) => (evening?.participants || []).find((item: any) => String(item.id) === String(participant.companion_of))?.nickname;
  const matchingParticipants = participants.filter((participant) => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    if (query) return participant.nickname.toLocaleLowerCase('ru-RU').includes(query);
    if (filter === 'arrived') return participant.attendance_status === 'attended';
    if (filter === 'expected') return participant.attendance_status !== 'attended';
    return true;
  });
  // The people who come with a guest stand right under that guest, as a linked part of the same group.
  const visibleParticipants = (() => {
    const companionsOf = new Map<string, any[]>();
    const rest: any[] = [];
    for (const participant of matchingParticipants as any[]) {
      if (participant.companion_of && matchingParticipants.some((item: any) => String(item.id) === String(participant.companion_of))) {
        companionsOf.set(String(participant.companion_of), [...(companionsOf.get(String(participant.companion_of)) || []), participant]);
      } else rest.push(participant);
    }
    return rest.flatMap((participant) => [participant, ...(companionsOf.get(String(participant.id)) || [])]) as EveningParticipant[];
  })();
  // Only people who are in the working roster are hidden from the picker. Those who answered
  // «Не буду»/«Пока думаю» or were marked «не пришёл» stay addable and are brought back to the roster.
  const existingPlayerIds = useMemo(
    () => new Set(participants.map((participant) => String(participant.player_id))),
    [participants],
  );
  const inactiveByPlayerId = useMemo(() => {
    const map = new Map<string, EveningParticipant>();
    (evening?.participants || []).filter((participant) => !isActiveEveningParticipant(participant))
      .forEach((participant) => map.set(String(participant.player_id), participant));
    return map;
  }, [evening]);
  const availablePlayers = useMemo(() => {
    const query = addSearch.trim().toLocaleLowerCase('ru-RU');
    return allPlayers
      .filter((player) => !existingPlayerIds.has(String(player.id)))
      .filter((player) => !query
        || player.nickname.toLocaleLowerCase('ru-RU').includes(query)
        || (player.full_name || '').toLocaleLowerCase('ru-RU').includes(query))
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru'));
  }, [addSearch, allPlayers, existingPlayerIds]);

  const markAttended = async (participant: EveningParticipant) => {
    if (busyIds.has(participant.id) || participant.attendance_status === 'attended') return;
    setBusyIds((current) => new Set(current).add(participant.id));
    setError('');
    const optimistic = { ...participant, attendance_status: 'attended' } as EveningParticipant;
    setEvening((current) => current ? {
      ...current,
      participants: current.participants.map((item) => item.id === participant.id ? optimistic : item),
    } : current);
    try {
      const updated = await api.updateParticipant(participant.id, { attendance_status: 'attended' });
      setEvening((current) => current ? {
        ...current,
        participants: current.participants.map((item) => item.id === updated.id ? updated : item),
      } : current);
    } catch (err: any) {
      setEvening((current) => current ? {
        ...current,
        participants: current.participants.map((item) => item.id === participant.id ? participant : item),
      } : current);
      setError(err?.message || 'Не удалось отметить игрока');
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(participant.id);
        return next;
      });
    }
  };

  /** «Ушёл» / «Вернулся»: a player who left drops out of the seating pickers but stays in the evening's history. */
  const toggleLeft = async (participant: EveningParticipant) => {
    if (busyIds.has(participant.id)) return;
    setBusyIds((current) => new Set(current).add(participant.id));
    setError('');
    try {
      const updated = await api.updateParticipant(participant.id, { left: !participant.left_at });
      setEvening((current) => current ? {
        ...current,
        participants: current.participants.map((item) => item.id === updated.id ? updated : item),
      } : current);
    } catch (err: any) {
      setError(err?.message || 'Не удалось отметить уход игрока');
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(participant.id);
        return next;
      });
    }
  };

  const addSelectedPlayers = async () => {
    if (!evening || !selectedPlayerIds.length || adding) return;
    setAdding(true);
    setError('');
    try {
      const revived = selectedPlayerIds.map((id) => inactiveByPlayerId.get(String(id))).filter(Boolean) as EveningParticipant[];
      const freshIds = selectedPlayerIds.filter((id) => !inactiveByPlayerId.has(String(id)));
      if (freshIds.length) {
        const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/participants/bulk`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            player_ids: freshIds,
            table_id: null,
            response_status: 'unanswered',
            registration_status: 'invited',
            amount_due: evening.default_price,
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || body?.details || 'Не удалось добавить игроков');
      }
      if (revived.length) {
        // A positive answer survives a mistaken «не пришёл»; only declined/thinking go back to «Нет ответа».
        await api.bulkUpdateParticipants(eveningId, revived.map((participant) => {
          const answer = getEveningResponse(participant);
          return {
            id: participant.id,
            response_status: answer === 'going' || answer === 'late' ? answer : 'unanswered',
            attendance_fact: 'pending',
          } as Partial<EveningParticipant>;
        }));
      }
      setSelectedPlayerIds([]);
      setAddSearch('');
      setShowAdd(false);
      await load(true);
    } catch (err: any) {
      setError(err?.message || 'Не удалось добавить игроков');
    } finally {
      setAdding(false);
    }
  };

  const guestPayload = (draft: GuestDraft) => ({
    contact_kind: draft.contact.trim() ? draft.kind : undefined,
    contact_value: draft.contact.trim() || undefined,
    plus_count: draft.plus,
    // «Записать гостя заранее» (owner, 2026-10-13): by default the guest is signed up as «Иду».
    response_status: draft.going ? 'going' as const : 'unanswered' as const,
  });

  const addGuest = async () => {
    if (!evening || !guest.name.trim() || adding) return;
    setAdding(true);
    setError('');
    try {
      await api.addParticipant(eveningId, {
        nickname: guest.name.trim(),
        ...guestPayload(guest),
        table_id: null,
        registration_status: guest.going ? 'going' : 'invited',
        amount_due: evening.default_price,
      });
      setGuest({ ...EMPTY_GUEST });
      setShowAdd(false);
      await load(true);
    } catch (err: any) {
      setError(err?.message || 'Не удалось добавить гостя');
    } finally {
      setAdding(false);
    }
  };

  const saveGuest = async () => {
    if (!editingGuest || adding) return;
    setAdding(true);
    setError('');
    try {
      if (editingGuest.companion) {
        // The person who comes with a guest: only their name (and answer) can change.
        await api.updateParticipant(editingGuest.id, { nickname: editingGuest.draft.name.trim() || undefined, response_status: editingGuest.draft.going ? 'going' : 'declined' } as any);
      } else {
        const { contact_kind, contact_value, plus_count, response_status } = guestPayload(editingGuest.draft);
        await api.updateParticipant(editingGuest.id, { contact_kind: contact_kind || null, contact_value: contact_value || null, plus_count, response_status } as any);
      }
      setEditingGuest(null);
      await load(true);
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить гостя');
    } finally {
      setAdding(false);
    }
  };

  if (loading && !evening) {
    return <div className="rounded-[16px] border border-border-soft bg-surface-1 py-12 text-center text-[12px] text-text-muted">Загрузка состава…</div>;
  }

  return <section data-testid="evening-active-roster" className="space-y-3">
    <div className="flex items-center gap-2">
      <h3 className="min-w-0 flex-1 text-[15px] font-semibold text-text-primary">Участники вечера</h3>
      <button type="button" onClick={() => setShowAdd(true)} aria-label="Добавить игрока на вечер" className="flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] bg-white px-3 text-[14px] font-semibold text-black">
        <Plus className="h-4 w-4" /> Добавить
      </button>
      <button type="button" onClick={() => void load()} disabled={loading || busyIds.size > 0} aria-label="Обновить" className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px] bg-surface-2 text-text-secondary disabled:opacity-40">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
    {error ? <div role="alert" className="rounded-[12px] bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</div> : null}

    <EveningListControls search={search} onSearch={setSearch} filter={filter} onFilter={setFilter}
      searchLabel="Найти участника вечера"
      filters={[{ id: 'all', label: 'Все', count: totalSeats }, { id: 'expected', label: 'Ожидаем', count: totalSeats - arrivedCount }, { id: 'arrived', label: 'Пришли', count: arrivedCount }]} />

    <div className="overflow-hidden rounded-[16px] border border-border-soft bg-surface-1">
      {visibleParticipants.map((participant, index) => {
        const arrived = participant.attendance_status === 'attended';
        const rowBusy = busyIds.has(participant.id);
        return <div key={participant.id} data-testid={`evening-active-row-${participant.id}`} className={`${index && !(participant as any).companion_of ? 'border-t border-border-soft' : ''} ${(participant as any).companion_of ? 'ml-5 border-l-2 border-accent/50 bg-surface-2/40 min-h-[60px]' : 'min-h-[72px]'} flex items-center gap-2 px-3 py-2`}>
          <button type="button" onClick={() => (participant as any).is_guest ? setEditingGuest({ id: participant.id, companion: Boolean((participant as any).companion_of), draft: { name: participant.nickname, kind: ((participant as any).contact_kind || 'vk') as GuestContactKind, contact: (participant as any).contact_value || '', going: ['going', 'late'].includes(String(getEveningResponse(participant))), plus: Number((participant as any).plus_count || 0) } }) : onOpenPlayerCard?.(participant.player_id)} aria-label={`Открыть карточку ${participant.nickname}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[10px] text-left active:bg-surface-2">
            <PlayerAvatar playerId={participant.player_id} nickname={participant.nickname} size="xs" />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[14px] text-text-primary">{(participant as any).companion_of ? <span aria-hidden className="mr-1 text-accent">↳</span> : null}{participant.nickname}</strong>
              <span className="mt-1 flex flex-wrap gap-1 text-[12px] leading-4">
                {(participant as any).is_guest ? <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-text-secondary">{(participant as any).companion_of ? `Идёт с гостем: ${hostName(participant) || '—'}` : <>Гость без профиля{Number((participant as any).plus_count) ? ` +${(participant as any).plus_count}` : ''}{(participant as any).contact_value ? ` · ${guestContactLabel((participant as any).contact_kind)}: ${(participant as any).contact_value}` : ''}</>}</span> : null}
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-text-secondary">В составе</span>
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-text-secondary">Ответ: {getEveningRosterResponseLabel(participant)}</span>
                <span className={`rounded-md px-1.5 py-0.5 ${arrived ? 'bg-success-soft text-success' : 'bg-surface-2 text-text-secondary'}`}>Явка: {participant.left_at ? 'ушёл' : arrived ? 'на месте' : 'не отмечена'}</span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
          </button>
          {guestContactHref((participant as any).contact_kind, (participant as any).contact_value) ? <a data-testid="guest-contact-link" href={guestContactHref((participant as any).contact_kind, (participant as any).contact_value) || undefined} target="_blank" rel="noreferrer" aria-label={`Написать гостю ${participant.nickname}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-border-soft bg-surface-2 text-text-secondary"><MessageSquare className="h-4 w-4" /></a> : null}
          {arrived ? <button type="button" data-testid={`evening-left-toggle-${participant.id}`} disabled={rowBusy} onClick={() => void toggleLeft(participant)} className="min-h-11 shrink-0 rounded-[10px] bg-surface-2 px-3 text-[13px] font-bold text-text-secondary disabled:opacity-40">{rowBusy ? '…' : participant.left_at ? 'Вернулся' : 'Ушёл'}</button> : null}
          {!arrived ? <button type="button" disabled={rowBusy} onClick={() => void markAttended(participant)} className="min-h-11 shrink-0 rounded-[10px] bg-success-soft px-3 text-[13px] font-bold text-success disabled:opacity-40">{rowBusy ? '…' : 'Пришёл'}</button> : null}
        </div>;
      })}
      {!visibleParticipants.length ? <div className="p-6 text-center text-[12px] text-text-muted">{search.trim() ? 'Участник не найден в составе вечера.' : !participants.length ? 'Пока нет участников в рабочем составе. Добавь игрока вручную или дождись ответа.' : filter === 'expected' ? 'Все участники уже пришли.' : 'Приход ещё не отмечен.'}</div> : null}
    </div>

    <MobileSheet
      open={showAdd}
      onClose={() => setShowAdd(false)}
      title="Добавить в состав вечера"
      subtitle={addMode === 'guest' ? 'Гость записывается без профиля: имя и способ связи с ним сохраняются на этом вечере.' : 'Добавление в состав не ставит ответ «Иду». Ответ игрока останется «Нет ответа», пока он сам не ответит.'}
      widthClass="sm:max-w-lg"
      footer={addMode === 'players'
        ? <button type="button" disabled={!selectedPlayerIds.length || adding} onClick={() => void addSelectedPlayers()} className="min-h-12 w-full rounded-[13px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">{adding ? 'Добавляем…' : `Добавить в состав${selectedPlayerIds.length ? ` · ${selectedPlayerIds.length}` : ''}`}</button>
        : <button type="button" disabled={!guest.name.trim() || adding} onClick={() => void addGuest()} className="min-h-12 w-full rounded-[13px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">{adding ? 'Добавляем…' : 'Добавить гостя'}</button>}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-surface-2 p-1">
          <button type="button" onClick={() => setAddMode('players')} className={`min-h-11 rounded-[10px] text-[14px] font-bold ${addMode === 'players' ? 'bg-surface-1 text-text-primary' : 'text-text-secondary'}`}>Игроки</button>
          <button type="button" onClick={() => setAddMode('guest')} className={`min-h-11 rounded-[10px] text-[14px] font-bold ${addMode === 'guest' ? 'bg-surface-1 text-text-primary' : 'text-text-secondary'}`}>Гость без профиля</button>
        </div>
        {addMode === 'players' ? <>
          <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input value={addSearch} onChange={(event) => setAddSearch(event.target.value)} placeholder="Найти игрока" className="mobile-field !pl-12" /></div>
          <div className="max-h-[48dvh] overflow-y-auto rounded-[14px] border border-border-soft bg-surface-1">
            {availablePlayers.map((player, index) => {
              const selected = selectedPlayerIds.includes(player.id);
              return <button key={player.id} type="button" onClick={() => setSelectedPlayerIds((current) => selected ? current.filter((id) => id !== player.id) : [...current, player.id])} className={`${index ? 'border-t border-border-soft' : ''} flex min-h-[56px] w-full items-center gap-3 px-3 text-left`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${selected ? 'border-accent bg-accent text-white' : 'border-border-soft bg-surface-2'}`}>{selected ? '✓' : ''}</span>
                <PlayerAvatar playerId={player.id} nickname={player.nickname} size="xs" />
                <span className="min-w-0"><strong className="block truncate text-[14px] text-text-primary">{player.nickname}</strong>{inactiveByPlayerId.has(String(player.id)) ? <span className="block truncate text-[12px] text-warning">{inactiveLabel(inactiveByPlayerId.get(String(player.id))!)} · вернуть в состав</span> : player.full_name ? <span className="block truncate text-[12px] text-text-muted">{player.full_name}</span> : null}</span>
              </button>;
            })}
            {!availablePlayers.length ? <div className="p-5 text-center text-[12px] text-text-muted">Никого не найдено или все уже добавлены в событие.</div> : null}
          </div>
        </> : <GuestFields draft={guest} onChange={setGuest} />}
      </div>
    </MobileSheet>

    <MobileSheet open={Boolean(editingGuest)} onClose={() => !adding && setEditingGuest(null)} title={editingGuest?.draft.name || 'Гость без профиля'} subtitle={editingGuest?.companion ? 'Человек, который идёт с гостем: впиши имя, когда узнаешь его.' : 'Гость без профиля — лид: имя, способ связи и сколько человек с ним.'} widthClass="sm:max-w-lg"
      footer={<button type="button" disabled={adding} onClick={() => void saveGuest()} className="min-h-12 w-full rounded-[13px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">{adding ? 'Сохраняем…' : 'Сохранить'}</button>}>
      {editingGuest?.companion ? <div className="space-y-3"><label className="block"><span className="mobile-label">Имя</span><input value={editingGuest.draft.name} onChange={(event) => setEditingGuest({ ...editingGuest, draft: { ...editingGuest.draft, name: event.target.value } })} className="mobile-field mt-1" /></label><div className="grid grid-cols-2 gap-1 rounded-[12px] bg-surface-2 p-1"><button type="button" onClick={() => setEditingGuest({ ...editingGuest, draft: { ...editingGuest.draft, going: true } })} className={`min-h-11 rounded-[10px] text-[13px] font-bold ${editingGuest.draft.going ? 'bg-surface-1 text-text-primary' : 'text-text-secondary'}`}>Идёт</button><button type="button" onClick={() => setEditingGuest({ ...editingGuest, draft: { ...editingGuest.draft, going: false } })} className={`min-h-11 rounded-[10px] text-[13px] font-bold ${!editingGuest.draft.going ? 'bg-surface-1 text-text-primary' : 'text-text-secondary'}`}>Не идёт</button></div></div> : editingGuest ? <GuestFields withName={false} draft={editingGuest.draft} onChange={(draft) => setEditingGuest({ ...editingGuest, draft })} /> : null}
    </MobileSheet>
  </section>;
}
