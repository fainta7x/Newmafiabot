import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { api, type EveningParticipant, type GameEvening, type Player } from '../../lib/api.ts';
import { getEveningResponse } from '../../lib/eveningResponse.ts';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';

type EveningData = GameEvening & { participants: EveningParticipant[] };
type AddMode = 'players' | 'guest';

const isActiveEveningParticipant = (participant: EveningParticipant) => {
  if (participant.attendance_status === 'no_show') return false;
  if (participant.attendance_status === 'attended') return true;
  const response = getEveningResponse(participant);
  return response === 'going' || response === 'late';
};

const responseLabel = (participant: EveningParticipant) => {
  if (participant.attendance_status === 'attended') return 'Пришёл';
  return getEveningResponse(participant) === 'late' ? 'Придёт позже' : 'Идёт';
};

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
  const [guestNickname, setGuestNickname] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [adding, setAdding] = useState(false);

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
  const arrivedCount = participants.filter((participant) => participant.attendance_status === 'attended').length;
  const lateCount = participants.filter((participant) => participant.attendance_status !== 'attended' && getEveningResponse(participant) === 'late').length;
  const existingPlayerIds = useMemo(
    () => new Set((evening?.participants || []).map((participant) => String(participant.player_id))),
    [evening],
  );
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

  const addSelectedPlayers = async () => {
    if (!evening || !selectedPlayerIds.length || adding) return;
    setAdding(true);
    setError('');
    try {
      await api.bulkAddParticipants(eveningId, selectedPlayerIds, null, 'going', evening.default_price);
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

  const addGuest = async () => {
    if (!evening || !guestNickname.trim() || adding) return;
    setAdding(true);
    setError('');
    try {
      await api.addParticipant(eveningId, {
        nickname: guestNickname.trim(),
        phone: guestPhone.trim() || undefined,
        table_id: null,
        response_status: 'going',
        amount_due: evening.default_price,
      });
      setGuestNickname('');
      setGuestPhone('');
      setShowAdd(false);
      await load(true);
    } catch (err: any) {
      setError(err?.message || 'Не удалось добавить гостя');
    } finally {
      setAdding(false);
    }
  };

  if (loading && !evening) {
    return <div className="rounded-[16px] border border-border-soft bg-surface-1 py-12 text-center text-[12px] text-text-muted">Загрузка состава…</div>;
  }

  return <section className="space-y-3">
    <div className="rounded-[16px] border border-border-soft bg-surface-1 p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-black text-text-primary">Участники вечера</h3>
          <p className="mt-1 text-[10px] leading-4 text-text-muted">Только те, кто подтвердил участие или уже пришёл. Думающие, отказавшиеся и неответившие остаются на этапе «Ответы».</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || busyIds.size > 0} aria-label="Обновить" className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px] bg-surface-2 text-text-secondary disabled:opacity-40">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-[11px] bg-surface-2 px-2 py-2"><strong className="block text-[17px] text-text-primary">{participants.length}</strong><span className="text-[9px] text-text-muted">подтвердили</span></div>
        <div className="rounded-[11px] bg-success-soft px-2 py-2"><strong className="block text-[17px] text-success">{arrivedCount}</strong><span className="text-[9px] text-text-muted">пришли</span></div>
        <div className="rounded-[11px] bg-surface-2 px-2 py-2"><strong className="block text-[17px] text-text-primary">{lateCount}</strong><span className="text-[9px] text-text-muted">позже</span></div>
      </div>
    </div>

    {error ? <div className="rounded-[12px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</div> : null}

    <button type="button" onClick={() => setShowAdd(true)} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] bg-accent px-4 text-[12px] font-black text-white">
      <Plus className="h-4 w-4" /> Добавить игрока на вечер
    </button>

    <div className="overflow-hidden rounded-[16px] border border-border-soft bg-surface-1">
      {participants.map((participant, index) => {
        const arrived = participant.attendance_status === 'attended';
        const rowBusy = busyIds.has(participant.id);
        return <div key={participant.id} className={`${index ? 'border-t border-border-soft' : ''} flex min-h-[62px] items-center gap-2.5 px-3 py-2`}>
          <button type="button" onClick={() => onOpenPlayerCard?.(participant.player_id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <PlayerAvatar playerId={participant.player_id} nickname={participant.nickname} size="xs" />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[12px] text-text-primary">{participant.nickname}</strong>
              <span className={`mt-0.5 block text-[9px] ${arrived ? 'text-success' : 'text-text-muted'}`}>{responseLabel(participant)}</span>
            </span>
          </button>
          {!arrived ? <button type="button" disabled={rowBusy} onClick={() => void markAttended(participant)} className="min-h-[42px] shrink-0 rounded-[10px] bg-success-soft px-3 text-[10px] font-bold text-success disabled:opacity-40">{rowBusy ? '…' : 'Пришёл'}</button> : <span className="shrink-0 rounded-full bg-success-soft px-2.5 py-1 text-[9px] font-bold text-success">На месте</span>}
        </div>;
      })}
      {!participants.length ? <div className="p-6 text-center text-[11px] text-text-muted">Пока нет подтверждённых участников. Добавь игрока вручную или дождись ответа.</div> : null}
    </div>

    <MobileSheet
      open={showAdd}
      onClose={() => setShowAdd(false)}
      title="Добавить на вечер"
      subtitle="Игрок сразу считается подтвердившим участие."
      widthClass="sm:max-w-lg"
      footer={addMode === 'players'
        ? <button type="button" disabled={!selectedPlayerIds.length || adding} onClick={() => void addSelectedPlayers()} className="min-h-[48px] w-full rounded-[13px] bg-accent text-[12px] font-bold text-white disabled:opacity-40">{adding ? 'Добавляем…' : `Добавить${selectedPlayerIds.length ? ` · ${selectedPlayerIds.length}` : ''}`}</button>
        : <button type="button" disabled={!guestNickname.trim() || adding} onClick={() => void addGuest()} className="min-h-[48px] w-full rounded-[13px] bg-accent text-[12px] font-bold text-white disabled:opacity-40">{adding ? 'Добавляем…' : 'Добавить гостя'}</button>}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-surface-2 p-1">
          <button type="button" onClick={() => setAddMode('players')} className={`min-h-[44px] rounded-[10px] text-[11px] font-bold ${addMode === 'players' ? 'bg-surface-1 text-text-primary' : 'text-text-secondary'}`}>Игроки</button>
          <button type="button" onClick={() => setAddMode('guest')} className={`min-h-[44px] rounded-[10px] text-[11px] font-bold ${addMode === 'guest' ? 'bg-surface-1 text-text-primary' : 'text-text-secondary'}`}>Гость</button>
        </div>
        {addMode === 'players' ? <>
          <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input value={addSearch} onChange={(event) => setAddSearch(event.target.value)} placeholder="Найти игрока" className="mobile-field pl-10" /></div>
          <div className="max-h-[48dvh] overflow-y-auto rounded-[14px] border border-border-soft bg-surface-1">
            {availablePlayers.map((player, index) => {
              const selected = selectedPlayerIds.includes(player.id);
              return <button key={player.id} type="button" onClick={() => setSelectedPlayerIds((current) => selected ? current.filter((id) => id !== player.id) : [...current, player.id])} className={`${index ? 'border-t border-border-soft' : ''} flex min-h-[56px] w-full items-center gap-3 px-3 text-left`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${selected ? 'border-accent bg-accent text-white' : 'border-border-soft bg-surface-2'}`}>{selected ? '✓' : ''}</span>
                <PlayerAvatar playerId={player.id} nickname={player.nickname} size="xs" />
                <span className="min-w-0"><strong className="block truncate text-[12px] text-text-primary">{player.nickname}</strong>{player.full_name ? <span className="block truncate text-[10px] text-text-muted">{player.full_name}</span> : null}</span>
              </button>;
            })}
            {!availablePlayers.length ? <div className="p-5 text-center text-[11px] text-text-muted">Никого не найдено или все уже добавлены в событие.</div> : null}
          </div>
        </> : <div className="space-y-2"><input value={guestNickname} onChange={(event) => setGuestNickname(event.target.value)} placeholder="Никнейм гостя" className="mobile-field" /><input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} placeholder="Телефон — необязательно" className="mobile-field" /></div>}
      </div>
    </MobileSheet>
  </section>;
}
