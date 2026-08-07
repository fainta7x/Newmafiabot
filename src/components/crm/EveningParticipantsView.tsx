import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Plus,
  Search,
  Trash2,
  UserPlus,
  UserX,
  Wallet,
  X,
} from 'lucide-react';
import { api, type EveningParticipant, type GameEvening, type Player } from '../../lib/api';
import { PlayerAvatar } from '../ui/PlayerAvatar';

interface EveningParticipantsViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
}

type RosterFilter = 'all' | 'attended' | 'expected' | 'waitlist';

const registrationLabel = (value: EveningParticipant['registration_status']) => {
  if (value === 'confirmed') return 'Подтверждён';
  if (value === 'waitlist') return 'Резерв';
  if (value === 'cancelled') return 'Отменил';
  if (value === 'invited') return 'Приглашён';
  return 'Записан';
};

const attendanceLabel = (participant: EveningParticipant) => {
  if (participant.attendance_status === 'no_show') return 'Не пришёл';
  if (participant.attendance_status === 'attended') return participant.arrival_status === 'late' ? 'Опоздал' : 'Пришёл';
  return 'Ожидаем';
};

export const EveningParticipantsView: React.FC<EveningParticipantsViewProps> = ({ eveningId, onBack, onOpenPlayerCard }) => {
  const [evening, setEvening] = useState<GameEvening | null>(null);
  const [participants, setParticipants] = useState<EveningParticipant[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [search, setSearch] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [addStatus, setAddStatus] = useState<'registered' | 'confirmed' | 'waitlist' | 'invited'>('registered');
  const [addPrice, setAddPrice] = useState(500);
  const [adding, setAdding] = useState(false);

  const [showGuest, setShowGuest] = useState(false);
  const [guestNickname, setGuestNickname] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestPrice, setGuestPrice] = useState(500);
  const [guestStatus, setGuestStatus] = useState<'registered' | 'confirmed' | 'waitlist' | 'invited'>('registered');

  const [activeParticipant, setActiveParticipant] = useState<EveningParticipant | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EveningParticipant | null>(null);
  const [showSettleConfirm, setShowSettleConfirm] = useState(false);
  const [savingParticipant, setSavingParticipant] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [data, players] = await Promise.all([api.getEvening(eveningId), api.getPlayers()]);
      setEvening(data);
      setParticipants(data.participants || []);
      setAllPlayers(players);
      setAddPrice(data.default_price ?? 500);
      setGuestPrice(data.default_price ?? 500);
    } catch (err: any) {
      alert(err.message || 'Не удалось загрузить состав вечера');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [eveningId]);

  const isReadonly = evening?.status === 'completed' || Boolean(evening?.settled_at);
  const activeParticipants = participants.filter((p) => p.registration_status !== 'cancelled');
  const attendedCount = participants.filter((p) => p.attendance_status === 'attended').length;
  const confirmedCount = participants.filter((p) => p.registration_status === 'confirmed').length;
  const paidTotal = participants.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
  const dueTotal = participants.reduce((sum, p) => sum + (p.amount_due || 0), 0);

  const visibleParticipants = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('ru-RU');
    return participants.filter((p) => {
      if (filter === 'attended' && p.attendance_status !== 'attended') return false;
      if (filter === 'expected' && (p.attendance_status !== 'pending' || p.registration_status === 'cancelled' || p.registration_status === 'waitlist')) return false;
      if (filter === 'waitlist' && p.registration_status !== 'waitlist') return false;
      if (q && !p.nickname.toLocaleLowerCase('ru-RU').includes(q) && !(p.phone || '').includes(q)) return false;
      return true;
    });
  }, [participants, filter, search]);

  const existingPlayerIds = useMemo(() => new Set(participants.map((p) => p.player_id)), [participants]);
  const availablePlayers = useMemo(() => {
    const q = addSearch.trim().toLocaleLowerCase('ru-RU');
    return allPlayers
      .filter((p) => !existingPlayerIds.has(p.id))
      .filter((p) => !q || p.nickname.toLocaleLowerCase('ru-RU').includes(q) || (p.telegram_username || '').toLocaleLowerCase('ru-RU').includes(q))
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru'));
  }, [allPlayers, existingPlayerIds, addSearch]);

  const updateParticipant = async (participant: EveningParticipant, patch: Partial<EveningParticipant>) => {
    if (savingParticipant) return;

    const previous = participant;
    const optimistic = { ...participant, ...patch };
    setSavingParticipant(true);
    setParticipants((prev) => prev.map((item) => item.id === participant.id ? optimistic : item));
    setActiveParticipant((current) => current?.id === participant.id ? optimistic : current);

    try {
      const updated = await api.updateParticipant(participant.id, patch);
      setParticipants((prev) => prev.map((item) => item.id === updated.id ? updated : item));
      setActiveParticipant((current) => current?.id === updated.id ? updated : current);
    } catch (err: any) {
      setParticipants((prev) => prev.map((item) => item.id === previous.id ? previous : item));
      setActiveParticipant((current) => current?.id === previous.id ? previous : current);
      alert(err.message || 'Не удалось обновить игрока');
    } finally {
      setSavingParticipant(false);
    }
  };

  const addSelectedPlayers = async () => {
    if (!selectedPlayerIds.length || adding) return;
    setAdding(true);
    try {
      await api.bulkAddParticipants(eveningId, selectedPlayerIds, null, addStatus, addPrice);
      setSelectedPlayerIds([]);
      setAddSearch('');
      setShowAdd(false);
      await load();
    } catch (err: any) {
      alert(err.message || 'Не удалось добавить игроков');
    } finally {
      setAdding(false);
    }
  };

  const addGuest = async () => {
    if (!guestNickname.trim()) return;
    try {
      await api.addParticipant(eveningId, {
        nickname: guestNickname.trim(),
        phone: guestPhone.trim() || undefined,
        table_id: null,
        registration_status: guestStatus,
        amount_due: guestPrice,
      });
      setGuestNickname('');
      setGuestPhone('');
      setGuestStatus('registered');
      setShowGuest(false);
      await load();
    } catch (err: any) {
      alert(err.message || 'Не удалось добавить гостя');
    }
  };

  const deleteParticipant = async () => {
    if (!pendingDelete) return;
    try {
      await api.deleteParticipant(pendingDelete.id);
      setParticipants((prev) => prev.filter((p) => p.id !== pendingDelete.id));
      setActiveParticipant(null);
      setPendingDelete(null);
    } catch (err: any) {
      alert(err.message || 'Не удалось убрать игрока с вечера');
    }
  };

  const settleEvening = async () => {
    try {
      await api.settleEvening(eveningId);
      setShowSettleConfirm(false);
      await load();
    } catch (err: any) {
      alert(err.message || 'Не удалось рассчитать вечер');
    }
  };

  const copyJoinLink = async () => {
    const joinUrl = `${window.location.origin}/join/${eveningId}`;
    await navigator.clipboard.writeText(joinUrl);
  };

  if (loading || !evening) {
    return <div className="py-16 text-center text-sm text-slate-400">Загрузка состава…</div>;
  }

  return (
    <div className="space-y-3 pb-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5 space-y-3">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onBack} className="w-10 h-10 rounded-xl border border-slate-800 bg-slate-950 text-slate-300 flex items-center justify-center shrink-0"><ArrowLeft className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-white truncate">{evening.title}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{new Date(evening.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}{evening.venue ? ` · ${evening.venue}` : ''}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5 text-center">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2"><span className="block text-[8px] uppercase text-slate-500">На вечер</span><strong className="text-sm text-white">{activeParticipants.length}</strong></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2"><span className="block text-[8px] uppercase text-slate-500">Подтв.</span><strong className="text-sm text-emerald-400">{confirmedCount}</strong></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2"><span className="block text-[8px] uppercase text-slate-500">Пришли</span><strong className="text-sm text-amber-400">{attendedCount}</strong></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2"><span className="block text-[8px] uppercase text-slate-500">Касса</span><strong className="text-sm text-emerald-400">{paidTotal}₽</strong></div>
        </div>

        {!isReadonly && (
          <div className="grid grid-cols-4 gap-2">
            <button type="button" onClick={copyJoinLink} className="min-h-14 rounded-xl border border-slate-800 bg-slate-950 text-slate-300 flex flex-col items-center justify-center gap-1"><Copy className="w-4 h-4" /><span className="text-[9px] font-bold">Ссылка</span></button>
            <button type="button" onClick={() => setShowAdd(true)} className="min-h-14 rounded-xl bg-rose-600 text-white flex flex-col items-center justify-center gap-1"><UserPlus className="w-4 h-4" /><span className="text-[9px] font-black">Игроки</span></button>
            <button type="button" onClick={() => setShowGuest(true)} className="min-h-14 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 flex flex-col items-center justify-center gap-1"><Plus className="w-4 h-4 text-emerald-400" /><span className="text-[9px] font-bold">Гость</span></button>
            <button type="button" onClick={() => setShowSettleConfirm(true)} className="min-h-14 rounded-xl bg-emerald-600 text-white flex flex-col items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4" /><span className="text-[9px] font-black">Расчёт</span></button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти игрока" className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none" />
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-950 p-1 border border-slate-800">
          {([
            ['all', `Все ${participants.length}`],
            ['attended', `Пришли ${attendedCount}`],
            ['expected', 'Ждём'],
            ['waitlist', 'Резерв'],
          ] as Array<[RosterFilter, string]>).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFilter(id)} className={`min-h-9 rounded-lg text-[9px] font-black ${filter === id ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>

        <div className="space-y-2">
          {visibleParticipants.map((participant) => (
            <button key={participant.id} type="button" onClick={() => setActiveParticipant(participant)} className="w-full rounded-2xl border border-slate-800 bg-slate-950 p-3 text-left flex items-center gap-3 active:scale-[0.99] transition-transform">
              <PlayerAvatar nickname={participant.nickname} playerId={participant.player_id} forceStoredLookup size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0"><strong className="text-sm text-white truncate">{participant.nickname}</strong>{participant.registration_status === 'waitlist' && <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">РЕЗЕРВ</span>}</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span className="text-[9px] text-slate-400">{registrationLabel(participant.registration_status)}</span>
                  <span className={`text-[9px] ${participant.attendance_status === 'attended' ? 'text-emerald-400' : participant.attendance_status === 'no_show' ? 'text-rose-400' : 'text-slate-500'}`}>· {attendanceLabel(participant)}</span>
                  <span className={`text-[9px] ${participant.payment_status === 'paid' || participant.payment_status === 'waived' ? 'text-emerald-400' : participant.payment_status === 'partial' ? 'text-amber-400' : 'text-rose-400'}`}>· {participant.amount_paid}/{participant.amount_due}₽</span>
                </div>
              </div>
              <span className="text-slate-600 text-lg">›</span>
            </button>
          ))}
          {visibleParticipants.length === 0 && <div className="py-10 text-center text-xs text-slate-500">Никого не найдено</div>}
        </div>
      </section>

      {showAdd && !isReadonly && (
        <div className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-xl max-h-[88dvh] bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between"><div><h3 className="text-base font-black text-white">Добавить игроков</h3><p className="text-[10px] text-slate-400">Игрок добавляется на вечер. Стол выбирается только при создании игры.</p></div><button type="button" onClick={() => setShowAdd(false)} className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center"><X className="w-4 h-4" /></button></div>
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" /><input value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="Поиск по нику" className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none" /></div>
            <div className="grid grid-cols-2 gap-2">
              <select value={addStatus} onChange={(e) => setAddStatus(e.target.value as typeof addStatus)} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"><option value="registered">Записан</option><option value="confirmed">Подтверждён</option><option value="waitlist">Резерв</option><option value="invited">Приглашён</option></select>
              <label className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 flex items-center gap-2"><Wallet className="w-4 h-4 text-slate-500" /><input type="number" value={addPrice} onChange={(e) => setAddPrice(Number(e.target.value) || 0)} className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none" /></label>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {availablePlayers.map((player) => {
                const selected = selectedPlayerIds.includes(player.id);
                return <button key={player.id} type="button" onClick={() => setSelectedPlayerIds((prev) => selected ? prev.filter((id) => id !== player.id) : [...prev, player.id])} className={`w-full rounded-xl border p-2.5 flex items-center gap-3 text-left ${selected ? 'border-rose-500 bg-rose-500/10' : 'border-slate-800 bg-slate-950'}`}><PlayerAvatar nickname={player.nickname} playerId={player.id} avatarVersion={player.avatar_updated_at} forceStoredLookup size="sm" /><div className="min-w-0 flex-1"><strong className="text-xs text-white block truncate">{player.nickname}</strong><span className="text-[9px] text-slate-500">ELO {player.elo}</span></div><span className={`w-6 h-6 rounded-full border flex items-center justify-center ${selected ? 'bg-rose-600 border-rose-500 text-white' : 'border-slate-700 text-transparent'}`}><Check className="w-3.5 h-3.5" /></span></button>;
              })}
              {availablePlayers.length === 0 && <div className="py-8 text-center text-xs text-slate-500">Все игроки уже добавлены или ничего не найдено</div>}
            </div>
            <button type="button" disabled={!selectedPlayerIds.length || adding} onClick={addSelectedPlayers} className="min-h-12 rounded-xl bg-rose-600 disabled:opacity-40 text-white text-sm font-black">{adding ? 'Добавляем…' : `Добавить ${selectedPlayerIds.length || ''}`}</button>
          </div>
        </div>
      )}

      {showGuest && !isReadonly && (
        <div className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl p-4 space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-base font-black text-white">Быстрый гость</h3><button type="button" onClick={() => setShowGuest(false)} className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center"><X className="w-4 h-4" /></button></div>
            <input value={guestNickname} onChange={(e) => setGuestNickname(e.target.value)} placeholder="Никнейм" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-sm text-white outline-none" />
            <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="Телефон — необязательно" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-sm text-white outline-none" />
            <div className="grid grid-cols-2 gap-2"><select value={guestStatus} onChange={(e) => setGuestStatus(e.target.value as typeof guestStatus)} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-xs text-white"><option value="registered">Записан</option><option value="confirmed">Подтверждён</option><option value="waitlist">Резерв</option><option value="invited">Приглашён</option></select><input type="number" value={guestPrice} onChange={(e) => setGuestPrice(Number(e.target.value) || 0)} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-xs text-white" /></div>
            <button type="button" disabled={!guestNickname.trim()} onClick={addGuest} className="w-full min-h-12 rounded-xl bg-rose-600 disabled:opacity-40 text-white font-black">Добавить на вечер</button>
          </div>
        </div>
      )}

      {activeParticipant && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center touch-manipulation"
          role="dialog"
          aria-modal="true"
          aria-label={`Управление игроком ${activeParticipant.nickname}`}
          onClick={() => setActiveParticipant(null)}
        >
          <div
            className="w-full sm:max-w-md bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl p-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <PlayerAvatar nickname={activeParticipant.nickname} playerId={activeParticipant.player_id} forceStoredLookup size="lg" />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-black text-white truncate">{activeParticipant.nickname}</h3>
                <button
                  type="button"
                  onClick={() => {
                    const playerId = activeParticipant.player_id;
                    setActiveParticipant(null);
                    onOpenPlayerCard?.(playerId);
                  }}
                  className="text-[10px] text-rose-400 font-bold touch-manipulation"
                >
                  Открыть карточку игрока
                </button>
              </div>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setActiveParticipant(null)}
                className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center touch-manipulation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!isReadonly && <>
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-black text-slate-500">Запись</span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button type="button" disabled={savingParticipant} onClick={() => updateParticipant(activeParticipant, { registration_status: 'confirmed' })} className={`min-h-10 rounded-xl text-[10px] font-black border touch-manipulation disabled:opacity-60 ${activeParticipant.registration_status === 'confirmed' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>Подтвердить</button>
                  <button type="button" disabled={savingParticipant} onClick={() => updateParticipant(activeParticipant, { registration_status: 'waitlist' })} className={`min-h-10 rounded-xl text-[10px] font-black border touch-manipulation disabled:opacity-60 ${activeParticipant.registration_status === 'waitlist' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>Резерв</button>
                  <button type="button" disabled={savingParticipant} onClick={() => updateParticipant(activeParticipant, { registration_status: 'cancelled' })} className={`min-h-10 rounded-xl text-[10px] font-black border touch-manipulation disabled:opacity-60 ${activeParticipant.registration_status === 'cancelled' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>Отменил</button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-black text-slate-500">Явка</span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button type="button" disabled={savingParticipant} onClick={() => updateParticipant(activeParticipant, { attendance_status: 'attended', arrival_status: 'on_time' })} className={`min-h-11 rounded-xl border text-[10px] font-black flex items-center justify-center gap-1 touch-manipulation disabled:opacity-60 ${activeParticipant.attendance_status === 'attended' && activeParticipant.arrival_status !== 'late' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-emerald-600/15 border-emerald-500/30 text-emerald-300'}`}><Check className="w-3.5 h-3.5" />Пришёл</button>
                  <button type="button" disabled={savingParticipant} onClick={() => updateParticipant(activeParticipant, { attendance_status: 'attended', arrival_status: 'late' })} className={`min-h-11 rounded-xl border text-[10px] font-black flex items-center justify-center gap-1 touch-manipulation disabled:opacity-60 ${activeParticipant.attendance_status === 'attended' && activeParticipant.arrival_status === 'late' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-amber-600/15 border-amber-500/30 text-amber-300'}`}><Clock className="w-3.5 h-3.5" />Опоздал</button>
                  <button type="button" disabled={savingParticipant} onClick={() => updateParticipant(activeParticipant, { attendance_status: 'no_show', arrival_status: 'unknown' })} className={`min-h-11 rounded-xl border text-[10px] font-black flex items-center justify-center gap-1 touch-manipulation disabled:opacity-60 ${activeParticipant.attendance_status === 'no_show' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-rose-600/15 border-rose-500/30 text-rose-300'}`}><UserX className="w-3.5 h-3.5" />Не пришёл</button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-black text-slate-500">Оплата</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" disabled={savingParticipant} onClick={() => updateParticipant(activeParticipant, { payment_status: 'paid', amount_paid: activeParticipant.amount_due })} className={`min-h-11 rounded-xl border text-[10px] font-black touch-manipulation disabled:opacity-60 ${activeParticipant.payment_status === 'paid' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-emerald-600/15 border-emerald-500/30 text-emerald-300'}`}>100%</button>
                  <button type="button" disabled={savingParticipant} onClick={() => updateParticipant(activeParticipant, { payment_status: 'waived', amount_paid: 0 })} className={`min-h-11 rounded-xl border text-[10px] font-black touch-manipulation disabled:opacity-60 ${activeParticipant.payment_status === 'waived' ? 'bg-slate-600 border-slate-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>Бесплатно</button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPendingDelete(activeParticipant);
                  setActiveParticipant(null);
                }}
                className="w-full min-h-11 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs font-black flex items-center justify-center gap-2 touch-manipulation"
              >
                <Trash2 className="w-4 h-4" />Убрать с вечера
              </button>
            </>}
          </div>
        </div>,
        document.body
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"><div className="w-full max-w-sm rounded-2xl border border-rose-800 bg-slate-900 p-4 space-y-4"><div><h3 className="text-base font-black text-white">Убрать {pendingDelete.nickname} с вечера?</h3><p className="text-xs text-slate-400 mt-1">Это удалит только запись на этот вечер, сам игрок останется в CRM.</p></div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setPendingDelete(null)} className="min-h-11 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-xs font-black">Отмена</button><button type="button" onClick={deleteParticipant} className="min-h-11 rounded-xl bg-rose-600 text-white text-xs font-black">Убрать</button></div></div></div>
      )}

      {showSettleConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"><div className="w-full max-w-sm rounded-2xl border border-emerald-800 bg-slate-900 p-4 space-y-4"><div><h3 className="text-base font-black text-white">Рассчитать вечер?</h3><p className="text-xs text-slate-400 mt-1">Оплачено {paidTotal}₽ · долг {Math.max(0, dueTotal - paidTotal)}₽. После расчёта вечер станет доступен только для просмотра.</p></div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setShowSettleConfirm(false)} className="min-h-11 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-xs font-black">Отмена</button><button type="button" onClick={settleEvening} className="min-h-11 rounded-xl bg-emerald-600 text-white text-xs font-black">Рассчитать</button></div></div></div>
      )}
    </div>
  );
};
