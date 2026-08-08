import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardCopy,
  MoreHorizontal,
  Search,
  Trash2,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { api, type EveningParticipant, type EveningTable, type GameEvening, type Player } from '../../lib/api.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';

interface EveningParticipantsViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
  initialAddOpen?: boolean;
  onInitialAddHandled?: () => void;
}

type EveningData = GameEvening & { tables: EveningTable[]; participants: EveningParticipant[] };
type RosterFilter = 'all' | 'waiting' | 'confirmed' | 'waitlist';
type AddMode = 'players' | 'guest';

const registrationLabel = (value: EveningParticipant['registration_status']) => {
  if (value === 'confirmed') return 'Подтверждён';
  if (value === 'waitlist') return 'Резерв';
  if (value === 'cancelled') return 'Отменил';
  if (value === 'invited') return 'Ждём ответа';
  return 'Ждём подтверждения';
};

const paymentLabel = (participant: EveningParticipant) => {
  if (participant.payment_status === 'waived') return 'Без оплаты';
  if (participant.payment_status === 'paid') return 'Оплачено';
  if (participant.payment_status === 'partial') return `Оплачено ${participant.amount_paid}/${participant.amount_due} ₽`;
  return `Не оплачено ${Math.max(0, participant.amount_due - participant.amount_paid)} ₽`;
};

export const EveningParticipantsView: React.FC<EveningParticipantsViewProps> = ({
  eveningId,
  onBack,
  onOpenPlayerCard,
  initialAddOpen = false,
  onInitialAddHandled,
}) => {
  const [evening, setEvening] = useState<EveningData | null>(null);
  const [participants, setParticipants] = useState<EveningParticipant[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [search, setSearch] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<{ key: string; message: string } | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('players');
  const [addSearch, setAddSearch] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [guestNickname, setGuestNickname] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  const [activeParticipant, setActiveParticipant] = useState<EveningParticipant | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EveningParticipant | null>(null);

  const [showEventMenu, setShowEventMenu] = useState(false);
  const [showSettleConfirm, setShowSettleConfirm] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const [data, players] = await Promise.all([api.getEvening(eveningId), api.getPlayers()]);
      const normalized = data as EveningData;
      setEvening(normalized);
      setParticipants(normalized.participants || []);
      setAllPlayers(players);
    } catch (err: any) {
      setLoadError(err?.message || 'Не удалось загрузить состав вечера');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [eveningId]);

  useEffect(() => {
    if (!initialAddOpen) return;
    setShowAdd(true);
    setAddMode('players');
    onInitialAddHandled?.();
  }, [initialAddOpen, onInitialAddHandled]);

  const isReadonly = evening?.status === 'completed' || Boolean(evening?.settled_at);
  const activeParticipants = participants.filter((item) => item.registration_status !== 'cancelled');
  const confirmedCount = activeParticipants.filter((item) => item.registration_status === 'confirmed').length;
  const waitingCount = activeParticipants.filter((item) => item.registration_status === 'registered' || item.registration_status === 'invited').length;
  const waitlistCount = activeParticipants.filter((item) => item.registration_status === 'waitlist').length;
  const occupiedCount = activeParticipants.filter((item) => item.registration_status === 'registered' || item.registration_status === 'confirmed').length;
  const freeSpots = Math.max(0, Number(evening?.capacity || 0) - occupiedCount);

  const visibleParticipants = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    return participants.filter((participant) => {
      if (filter === 'waiting' && !['registered', 'invited'].includes(participant.registration_status)) return false;
      if (filter === 'confirmed' && participant.registration_status !== 'confirmed') return false;
      if (filter === 'waitlist' && participant.registration_status !== 'waitlist') return false;
      if (query && !participant.nickname.toLocaleLowerCase('ru-RU').includes(query) && !(participant.phone || '').includes(query)) return false;
      return true;
    });
  }, [participants, filter, search]);

  const existingPlayerIds = useMemo(() => new Set(participants.map((item) => item.player_id)), [participants]);
  const availablePlayers = useMemo(() => {
    const query = addSearch.trim().toLocaleLowerCase('ru-RU');
    return allPlayers
      .filter((player) => !existingPlayerIds.has(player.id))
      .filter((player) => !query || player.nickname.toLocaleLowerCase('ru-RU').includes(query) || (player.full_name || '').toLocaleLowerCase('ru-RU').includes(query) || (player.telegram_username || '').toLocaleLowerCase('ru-RU').includes(query))
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru'));
  }, [addSearch, allPlayers, existingPlayerIds]);

  const openParticipantSheet = (participant: EveningParticipant) => {
    setActiveParticipant(participant);
    setPaymentAmount(Number(participant.amount_paid || 0));
    setTaskTitle('');
    setTaskDueAt('');
    setParticipantError(null);
  };

  const patchParticipant = async (participant: EveningParticipant, patch: Partial<EveningParticipant>, key: string) => {
    if (busyAction) return;
    setBusyAction(key);
    setInlineError(null);
    setParticipantError(null);
    try {
      const updated = await api.updateParticipant(participant.id, patch);
      setParticipants((current) => current.map((item) => item.id === updated.id ? updated : item));
      setActiveParticipant((current) => current?.id === updated.id ? updated : current);
      if (updated.id === activeParticipant?.id) setPaymentAmount(Number(updated.amount_paid || 0));
    } catch (err: any) {
      const message = err?.message || 'Не удалось обновить участника';
      if (activeParticipant?.id === participant.id) setParticipantError(message);
      else setInlineError({ key: participant.id, message });
    } finally {
      setBusyAction(null);
    }
  };

  const confirmParticipant = async (participant: EveningParticipant) => {
    await patchParticipant(participant, { registration_status: 'confirmed' }, `confirm:${participant.id}`);
  };

  const markPaid = async (participant: EveningParticipant) => {
    await patchParticipant(participant, { amount_paid: participant.amount_due, payment_status: 'paid' }, `paid:${participant.id}`);
  };

  const moveTable = async (participant: EveningParticipant, tableId: string) => {
    if (busyAction) return;
    setBusyAction(`table:${participant.id}`);
    setParticipantError(null);
    try {
      const updated = await api.moveParticipantTable(participant.id, tableId || null);
      setParticipants((current) => current.map((item) => item.id === updated.id ? updated : item));
      setActiveParticipant(updated);
    } catch (err: any) {
      setParticipantError(err?.message || 'Не удалось изменить стол');
    } finally {
      setBusyAction(null);
    }
  };

  const savePayment = async () => {
    if (!activeParticipant) return;
    const amount = Math.max(0, Math.min(Number(activeParticipant.amount_due || 0), Number(paymentAmount || 0)));
    const status: EveningParticipant['payment_status'] = amount <= 0 ? 'unpaid' : amount >= activeParticipant.amount_due ? 'paid' : 'partial';
    await patchParticipant(activeParticipant, { amount_paid: amount, payment_status: status }, `payment:${activeParticipant.id}`);
  };

  const createTask = async () => {
    if (!activeParticipant || !taskTitle.trim() || busyAction) return;
    setBusyAction(`task:${activeParticipant.id}`);
    setParticipantError(null);
    try {
      await api.createTask({
        title: taskTitle.trim(),
        player_id: activeParticipant.player_id,
        evening_id: eveningId,
        due_at: taskDueAt ? new Date(taskDueAt).toISOString() : null,
        priority: 'medium',
      });
      setTaskTitle('');
      setTaskDueAt('');
    } catch (err: any) {
      setParticipantError(err?.message || 'Не удалось создать задачу');
    } finally {
      setBusyAction(null);
    }
  };

  const addSelectedPlayers = async () => {
    if (!selectedPlayerIds.length || adding || !evening) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.bulkAddParticipants(eveningId, selectedPlayerIds, null, 'registered', evening.default_price);
      setSelectedPlayerIds([]);
      setAddSearch('');
      setShowAdd(false);
      await load(true);
    } catch (err: any) {
      setAddError(err?.message || 'Не удалось добавить игроков');
    } finally {
      setAdding(false);
    }
  };

  const addGuest = async () => {
    if (!guestNickname.trim() || adding || !evening) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.addParticipant(eveningId, {
        nickname: guestNickname.trim(),
        phone: guestPhone.trim() || undefined,
        table_id: null,
        registration_status: 'registered',
        amount_due: evening.default_price,
      });
      setGuestNickname('');
      setGuestPhone('');
      setShowAdd(false);
      await load(true);
    } catch (err: any) {
      setAddError(err?.message || 'Не удалось добавить гостя');
    } finally {
      setAdding(false);
    }
  };

  const deleteParticipant = async () => {
    if (!pendingDelete || busyAction) return;
    setBusyAction(`delete:${pendingDelete.id}`);
    try {
      await api.deleteParticipant(pendingDelete.id);
      setParticipants((current) => current.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null);
      setActiveParticipant(null);
    } catch (err: any) {
      setParticipantError(err?.message || 'Не удалось убрать игрока с вечера');
      setPendingDelete(null);
    } finally {
      setBusyAction(null);
    }
  };

  const settleEvening = async () => {
    if (busyAction) return;
    setBusyAction('settle');
    try {
      await api.settleEvening(eveningId);
      setShowSettleConfirm(false);
      setShowEventMenu(false);
      await load(true);
    } catch (err: any) {
      setLoadError(err?.message || 'Не удалось рассчитать вечер');
      setShowSettleConfirm(false);
    } finally {
      setBusyAction(null);
    }
  };

  const copyJoinLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${eveningId}`);
      setShowEventMenu(false);
    } catch {
      setLoadError('Не удалось скопировать ссылку на регистрацию');
    }
  };

  if (loading) return <div className="py-16 text-center text-[13px] text-text-secondary">Загрузка состава…</div>;
  if (!evening) {
    return (
      <div className="rounded-[18px] border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger">
        {loadError || 'Вечер не найден'}
        <button type="button" onClick={() => void load()} className="ml-2 font-bold underline">Повторить</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-start gap-3">
          <button type="button" aria-label="Назад" onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft bg-surface-2 text-text-secondary">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-[18px] font-black leading-tight text-text-primary">{evening.title}</h2>
            <p className="mt-1 text-[12px] leading-4 text-text-secondary">{new Date(evening.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}{evening.venue ? ` · ${evening.venue}` : ''}</p>
          </div>
          {!isReadonly ? (
            <button type="button" aria-label="Ещё действия" onClick={() => setShowEventMenu(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft bg-surface-2 text-text-secondary">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-5">
          {[
            ['Участники', activeParticipants.length],
            ['Подтверждены', confirmedCount],
            ['Ждём', waitingCount],
            ['Резерв', waitlistCount],
            ['Свободно', freeSpots],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <span className="block text-[11px] text-text-muted">{label}</span>
              <strong className="mt-0.5 block text-[17px] font-black text-text-primary">{value}</strong>
            </div>
          ))}
        </div>

        {!isReadonly ? (
          <button type="button" onClick={() => { setAddMode('players'); setAddError(null); setShowAdd(true); }} className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white sm:w-auto">
            <UserPlus className="h-4 w-4" /> Добавить
          </button>
        ) : null}
      </section>

      {loadError ? (
        <div className="flex items-start gap-2 rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {loadError}
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти игрока" className="mobile-field pl-10" />
        </div>

        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex w-max min-w-full gap-2">
            {([
              ['all', `Все ${activeParticipants.length}`],
              ['waiting', `Ждём ${waitingCount}`],
              ['confirmed', `Подтверждены ${confirmedCount}`],
              ['waitlist', `Резерв ${waitlistCount}`],
            ] as Array<[RosterFilter, string]>).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} className={`min-h-[44px] whitespace-nowrap rounded-full border px-4 text-[12px] font-semibold ${filter === id ? 'border-accent bg-accent-soft text-text-primary' : 'border-border-soft bg-surface-1 text-text-secondary'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-[18px] border border-border-soft bg-surface-1">
          {visibleParticipants.map((participant, index) => {
            const tableName = evening.tables?.find((table) => table.id === participant.table_id)?.name || 'Без стола';
            const needsConfirmation = ['registered', 'invited'].includes(participant.registration_status);
            const needsPayment = participant.registration_status === 'confirmed' && participant.payment_status !== 'paid' && participant.payment_status !== 'waived' && participant.amount_due > participant.amount_paid;
            const rowBusy = busyAction === `confirm:${participant.id}` || busyAction === `paid:${participant.id}`;
            return (
              <div key={participant.id} className={`${index ? 'border-t border-border-soft' : ''} px-3 py-3`}>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => onOpenPlayerCard?.(participant.player_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <PlayerAvatar nickname={participant.nickname} playerId={participant.player_id} forceStoredLookup size="md" />
                    <span className="min-w-0 flex-1">
                      <strong className="block break-words text-[14px] font-bold leading-5 text-text-primary">{participant.nickname}</strong>
                      <span className="mt-0.5 block text-[11px] text-text-secondary">{tableName} · {registrationLabel(participant.registration_status)}</span>
                      <span className={`mt-0.5 block text-[11px] ${participant.payment_status === 'paid' || participant.payment_status === 'waived' ? 'text-success' : participant.payment_status === 'partial' ? 'text-warning' : 'text-text-muted'}`}>{paymentLabel(participant)}</span>
                    </span>
                  </button>

                  {!isReadonly && needsConfirmation ? (
                    <button type="button" disabled={Boolean(busyAction)} onClick={() => void confirmParticipant(participant)} className="min-h-[44px] shrink-0 rounded-[11px] bg-accent px-3 text-[12px] font-bold text-white disabled:opacity-50">
                      {rowBusy ? '…' : 'Подтвердить'}
                    </button>
                  ) : !isReadonly && needsPayment ? (
                    <button type="button" disabled={Boolean(busyAction)} onClick={() => void markPaid(participant)} className="min-h-[44px] shrink-0 rounded-[11px] border border-border-soft bg-surface-2 px-3 text-[12px] font-bold text-text-primary disabled:opacity-50">
                      {rowBusy ? '…' : 'Оплачено'}
                    </button>
                  ) : (
                    <button type="button" onClick={() => openParticipantSheet(participant)} className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px] text-text-muted hover:bg-surface-hover hover:text-text-primary" aria-label="Действия участника">
                      {participant.registration_status === 'confirmed' && (participant.payment_status === 'paid' || participant.payment_status === 'waived') ? <CheckCircle2 className="h-5 w-5 text-success" /> : <MoreHorizontal className="h-5 w-5" />}
                    </button>
                  )}
                </div>
                {inlineError?.key === participant.id ? <p className="mt-2 text-[11px] text-danger">{inlineError.message}</p> : null}
              </div>
            );
          })}
          {visibleParticipants.length === 0 ? <div className="py-12 text-center text-[13px] text-text-secondary">Никого не найдено</div> : null}
        </div>
      </section>

      <MobileSheet
        open={showAdd && !isReadonly}
        onClose={() => setShowAdd(false)}
        title="Добавить на вечер"
        subtitle="Текущий вечер уже выбран. По умолчанию — обычная запись и стандартная стоимость."
        widthClass="sm:max-w-xl"
        footer={addMode === 'players' ? (
          <button type="button" disabled={!selectedPlayerIds.length || adding} onClick={() => void addSelectedPlayers()} className="min-h-[48px] w-full rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white disabled:opacity-40">
            {adding ? 'Добавляем…' : selectedPlayerIds.length ? `Добавить выбранных · ${selectedPlayerIds.length}` : 'Выберите игроков'}
          </button>
        ) : (
          <button type="button" disabled={!guestNickname.trim() || adding} onClick={() => void addGuest()} className="min-h-[48px] w-full rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white disabled:opacity-40">
            {adding ? 'Добавляем…' : 'Добавить гостя'}
          </button>
        )}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-[13px] bg-surface-2 p-1">
            <button type="button" onClick={() => setAddMode('players')} className={`min-h-[44px] rounded-[10px] text-[12px] font-bold ${addMode === 'players' ? 'bg-accent text-white' : 'text-text-secondary'}`}>Игроки</button>
            <button type="button" onClick={() => setAddMode('guest')} className={`min-h-[44px] rounded-[10px] text-[12px] font-bold ${addMode === 'guest' ? 'bg-accent text-white' : 'text-text-secondary'}`}>Быстрый гость</button>
          </div>

          {addError ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{addError}</div> : null}

          {addMode === 'players' ? (
            <>
              <label className="relative block">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input value={addSearch} onChange={(event) => setAddSearch(event.target.value)} placeholder="Ник, имя или Telegram" className="mobile-field pl-10" />
              </label>
              <div className="space-y-1">
                {availablePlayers.map((player) => {
                  const selected = selectedPlayerIds.includes(player.id);
                  return (
                    <button key={player.id} type="button" onClick={() => setSelectedPlayerIds((current) => selected ? current.filter((id) => id !== player.id) : [...current, player.id])} className={`flex min-h-[56px] w-full items-center gap-3 rounded-[13px] border px-3 text-left ${selected ? 'border-accent bg-accent-soft' : 'border-border-soft bg-surface-1'}`}>
                      <PlayerAvatar nickname={player.nickname} playerId={player.id} avatarVersion={player.avatar_updated_at} size="sm" />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-[13px] text-text-primary">{player.nickname}</strong>
                        {player.full_name ? <span className="mt-0.5 block truncate text-[11px] text-text-muted">{player.full_name}</span> : null}
                      </span>
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selected ? 'border-accent bg-accent text-white' : 'border-border-strong text-transparent'}`}><Check className="h-3.5 w-3.5" /></span>
                    </button>
                  );
                })}
                {availablePlayers.length === 0 ? <div className="py-10 text-center text-[12px] text-text-muted">Все подходящие игроки уже добавлены или ничего не найдено.</div> : null}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <input value={guestNickname} onChange={(event) => setGuestNickname(event.target.value)} placeholder="Никнейм" className="mobile-field" />
              <input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} placeholder="Телефон — необязательно" className="mobile-field" />
              <div className="rounded-[13px] bg-surface-2 p-3 text-[12px] leading-relaxed text-text-secondary">Стоимость: {evening.default_price} ₽ · Стол можно выбрать позже · Статус: записан.</div>
            </div>
          )}
        </div>
      </MobileSheet>

      <MobileSheet
        open={Boolean(activeParticipant)}
        onClose={() => setActiveParticipant(null)}
        title={activeParticipant?.nickname || 'Участник'}
        subtitle={activeParticipant ? `${registrationLabel(activeParticipant.registration_status)} · ${paymentLabel(activeParticipant)}` : undefined}
        widthClass="sm:max-w-md"
      >
        {activeParticipant ? (
          <div className="space-y-5">
            {participantError ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{participantError}</div> : null}

            <button type="button" onClick={() => { const id = activeParticipant.player_id; setActiveParticipant(null); onOpenPlayerCard?.(id); }} className="min-h-[48px] w-full rounded-[13px] border border-border-soft bg-surface-2 px-4 text-[13px] font-bold text-text-primary">Открыть профиль игрока</button>

            {!isReadonly ? (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Статус записи</span>
                  <select value={activeParticipant.registration_status} disabled={Boolean(busyAction)} onChange={(event) => void patchParticipant(activeParticipant, { registration_status: event.target.value as EveningParticipant['registration_status'] }, `status:${activeParticipant.id}`)} className="mobile-field">
                    <option value="invited">Приглашён</option>
                    <option value="registered">Записан</option>
                    <option value="confirmed">Подтверждён</option>
                    <option value="waitlist">Резерв</option>
                    <option value="cancelled">Отменил</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Стол</span>
                  <select value={activeParticipant.table_id || ''} disabled={Boolean(busyAction)} onChange={(event) => void moveTable(activeParticipant, event.target.value)} className="mobile-field">
                    <option value="">Без стола</option>
                    {(evening.tables || []).map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
                  </select>
                </label>

                <div>
                  <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Оплата</span>
                  <div className="flex gap-2">
                    <label className="relative min-w-0 flex-1">
                      <Wallet className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                      <input type="number" min={0} max={activeParticipant.amount_due} value={paymentAmount} onChange={(event) => setPaymentAmount(Number(event.target.value) || 0)} className="mobile-field pl-10" />
                    </label>
                    <button type="button" disabled={Boolean(busyAction)} onClick={() => void savePayment()} className="min-h-[48px] rounded-[12px] bg-accent px-4 text-[12px] font-bold text-white disabled:opacity-50">Сохранить</button>
                  </div>
                  <p className="mt-1 text-[11px] text-text-muted">К оплате: {activeParticipant.amount_due} ₽</p>
                </div>

                <div className="border-t border-border-soft pt-4">
                  <span className="mb-2 block text-[11px] font-semibold text-text-secondary">Создать задачу</span>
                  <div className="space-y-2">
                    <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Например: уточнить участие" className="mobile-field" />
                    <input type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} className="mobile-field" />
                    <button type="button" disabled={!taskTitle.trim() || Boolean(busyAction)} onClick={() => void createTask()} className="min-h-[44px] w-full rounded-[12px] border border-border-soft bg-surface-2 text-[12px] font-bold text-text-primary disabled:opacity-40">Создать задачу</button>
                  </div>
                </div>

                <button type="button" onClick={() => setPendingDelete(activeParticipant)} className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-danger/25 bg-danger-soft px-4 text-[12px] font-bold text-danger">
                  <Trash2 className="h-4 w-4" /> Удалить из вечера
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </MobileSheet>

      <MobileSheet open={showEventMenu} onClose={() => setShowEventMenu(false)} title="Действия вечера" subtitle="Редкие операции вынесены из основного состава." widthClass="sm:max-w-sm">
        <div className="space-y-2">
          <button type="button" onClick={() => void copyJoinLink()} className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[12px] border border-border-soft bg-surface-2 px-4 text-[13px] font-bold text-text-primary"><ClipboardCopy className="h-4 w-4" /> Скопировать ссылку записи</button>
          {!isReadonly ? <button type="button" onClick={() => setShowSettleConfirm(true)} className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[12px] border border-border-soft bg-surface-2 px-4 text-[13px] font-bold text-text-primary"><CheckCircle2 className="h-4 w-4 text-success" /> Рассчитать и закрыть вечер</button> : null}
        </div>
      </MobileSheet>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Убрать игрока с вечера?"
        description={pendingDelete ? `${pendingDelete.nickname} будет удалён из состава этого вечера.` : undefined}
        confirmLabel="Удалить"
        tone="danger"
        busy={Boolean(busyAction)}
        onCancel={() => setPendingDelete(null)}
        onConfirm={deleteParticipant}
      />

      <ConfirmDialog
        open={showSettleConfirm}
        title="Рассчитать и закрыть вечер?"
        description="Финансовый расчёт вечера останется по существующим правилам. Это действие не меняет их."
        confirmLabel="Рассчитать"
        busy={busyAction === 'settle'}
        onCancel={() => setShowSettleConfirm(false)}
        onConfirm={settleEvening}
      />
    </div>
  );
};

export default EveningParticipantsView;
