import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  UserPlus,
  Search,
  CheckCircle2,
  Plus,
  Trash2,
  FileText,
  Lock,
  X,
  CheckSquare,
  Square,
  ShieldCheck,
} from 'lucide-react';
import { api, GameEvening, EveningParticipant, Player } from '../../lib/api.ts';

interface EveningDetailViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
}

export const EveningDetailView: React.FC<EveningDetailViewProps> = ({
  eveningId,
  onBack,
  onOpenPlayerCard,
}) => {
  const [evening, setEvening] = useState<GameEvening | null>(null);
  const [participants, setParticipants] = useState<EveningParticipant[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Bulk add modal states
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [bulkAmountDue, setBulkAmountDue] = useState(400);

  // Quick guest modal
  const [showQuickGuestModal, setShowQuickGuestModal] = useState(false);
  const [guestNickname, setGuestNickname] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  // Settlement modal
  const [showSettleModal, setShowSettleModal] = useState(false);

  // Participant selection for bulk actions
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  // Task creation modal for participant
  const [taskTargetParticipant, setTaskTargetParticipant] = useState<EveningParticipant | null>(null);
  const [taskTitle, setTaskTitle] = useState('');

  useEffect(() => {
    loadData();
  }, [eveningId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getEvening(eveningId);
      setEvening(data);
      setParticipants(data.participants || []);

      const players = await api.getPlayers();
      setAllPlayers(players);
    } catch (err: any) {
      alert(err.message || 'Ошибка загрузки вечера');
    } finally {
      setLoading(false);
    }
  };

  // 1. Bulk Add Players Execution
  const handleBulkAdd = async () => {
    if (selectedPlayerIds.length === 0) return;
    try {
      const res = await api.bulkAddParticipants(eveningId, selectedPlayerIds, bulkAmountDue);
      alert(`Успешно добавлено: ${res.addedCount} игрок(ов). Пропущено дублей: ${res.skippedCount}`);
      setShowBulkAddModal(false);
      setSelectedPlayerIds([]);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Ошибка массового добавления');
    }
  };

  // 2. Add Quick Guest Execution
  const handleAddQuickGuest = async () => {
    if (!guestNickname) return;
    try {
      await api.addParticipant(eveningId, {
        nickname: guestNickname,
        phone: guestPhone,
        amount_due: evening?.default_price || 400,
      });
      setShowQuickGuestModal(false);
      setGuestNickname('');
      setGuestPhone('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Ошибка добавления гостя');
    }
  };

  // 3. Update Participant Field
  const handleUpdateParticipant = async (id: string, data: Partial<EveningParticipant>) => {
    try {
      const updated = await api.updateParticipant(id, data);
      setParticipants((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err: any) {
      alert(err.message || 'Ошибка обновления записи');
    }
  };

  // 4. Delete Participant
  const handleDeleteParticipant = async (id: string) => {
    if (!confirm('Удалить участника из вечера?')) return;
    try {
      await api.deleteParticipant(id);
      setParticipants((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      alert(err.message || 'Ошибка удаления');
    }
  };

  // 5. Settlement Execution (Idempotent)
  const handleSettleEvening = async () => {
    try {
      const res = await api.settleEvening(eveningId);
      alert(res.message);
      setShowSettleModal(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Ошибка расчёта вечера');
    }
  };

  // 6. Create Task for Participant
  const handleCreateTaskForParticipant = async () => {
    if (!taskTargetParticipant || !taskTitle) return;
    try {
      await api.createTask({
        title: taskTitle,
        player_id: taskTargetParticipant.player_id,
        evening_id: eveningId,
        priority: 'medium',
      });
      alert('Задача успешно создана');
      setTaskTargetParticipant(null);
      setTaskTitle('');
    } catch (err: any) {
      alert(err.message || 'Ошибка создания задачи');
    }
  };

  // Bulk actions on selected participants
  const toggleSelectAllParticipants = () => {
    if (selectedParticipantIds.length === participants.length) {
      setSelectedParticipantIds([]);
    } else {
      setSelectedParticipantIds(participants.map((p) => p.id));
    }
  };

  const toggleSelectParticipant = (id: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const applyBulkActionToParticipants = async (action: 'confirm' | 'attend' | 'unpaid') => {
    if (selectedParticipantIds.length === 0) return;
    try {
      for (const id of selectedParticipantIds) {
        if (action === 'confirm') {
          await api.updateParticipant(id, { registration_status: 'confirmed' });
        } else if (action === 'attend') {
          await api.updateParticipant(id, { attendance_status: 'attended' });
        } else if (action === 'unpaid') {
          await api.updateParticipant(id, { payment_status: 'unpaid', amount_paid: 0 });
        }
      }
      setSelectedParticipantIds([]);
      loadData();
    } catch (err: any) {
      alert('Ошибка применения массового действия');
    }
  };

  if (loading || !evening) {
    return <div className="p-8 text-center text-slate-400 text-sm">Загрузка данных вечера...</div>;
  }

  const registeredCount = participants.filter((p) => p.registration_status !== 'cancelled').length;
  const confirmedCount = participants.filter((p) => p.registration_status === 'confirmed').length;
  const attendedCount = participants.filter((p) => p.attendance_status === 'attended').length;
  const totalRevenue = participants.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
  const totalDue = participants.reduce((sum, p) => sum + (p.amount_due || 0), 0);

  // Available players for bulk adding (excluding already registered)
  const existingPlayerIds = new Set(participants.map((p) => p.player_id));
  const availablePlayers = allPlayers.filter((p) => {
    if (existingPlayerIds.has(p.id)) return false;
    if (playerSearchQuery.trim()) {
      const q = playerSearchQuery.toLowerCase().trim();
      return (
        p.nickname.toLowerCase().includes(q) ||
        p.phone?.toLowerCase().includes(q) ||
        p.telegram_username?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl text-slate-300 hover:text-white cursor-pointer transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white">{evening.title}</h2>
                {evening.settled_at && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-400" /> Рассчитан
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                📅 {new Date(evening.starts_at).toLocaleString('ru-RU', { dateStyle: 'full', timeStyle: 'short' })}
                {evening.venue && ` • 📍 ${evening.venue}`}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                const joinUrl = `${window.location.origin}/join/${evening.id}`;
                navigator.clipboard.writeText(joinUrl);
                alert(`Ссылка для записи скопирована:\n${joinUrl}`);
              }}
              className="bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 font-bold px-3.5 py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>🔗 Ссылка для игроков</span>
            </button>

            <button
              onClick={() => setShowBulkAddModal(true)}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20"
            >
              <UserPlus className="w-4 h-4" />
              <span>Добавить игроков (Массово)</span>
            </button>

            <button
              onClick={() => setShowQuickGuestModal(true)}
              className="bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-bold px-3.5 py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Быстрый Гость</span>
            </button>

            {!evening.settled_at ? (
              <button
                onClick={() => setShowSettleModal(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Закрыть и Рассчитать Вечер</span>
              </button>
            ) : (
              <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-slate-400 font-mono">
                Расчёт закрыт: {new Date(evening.settled_at).toLocaleDateString('ru-RU')}
              </div>
            )}
          </div>
        </div>

        {/* Counters Header */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center font-mono pt-2 border-t border-slate-800/80">
          <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-850">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Запись</span>
            <span className="text-base font-bold text-white">{registeredCount} / {evening.capacity}</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-850">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Подтверждено</span>
            <span className="text-base font-bold text-emerald-400">{confirmedCount}</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-850">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Пришло</span>
            <span className="text-base font-bold text-amber-400">{attendedCount}</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-850">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Оплачено</span>
            <span className="text-base font-bold text-emerald-400">{totalRevenue} ₽</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-850">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Ожидается долг</span>
            <span className="text-base font-bold text-rose-400">{Math.max(0, totalDue - totalRevenue)} ₽</span>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar if items selected */}
      {selectedParticipantIds.length > 0 && (
        <div className="bg-rose-950/40 border border-rose-500/30 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 font-bold text-rose-300">
            <span>Выбрано участников: {selectedParticipantIds.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => applyBulkActionToParticipants('confirm')}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl font-bold cursor-pointer hover:bg-emerald-500"
            >
              Подтвердить выбранных
            </button>
            <button
              onClick={() => applyBulkActionToParticipants('attend')}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-xl font-bold cursor-pointer hover:bg-amber-500"
            >
              Отметить пришедшими
            </button>
            <button
              onClick={() => setSelectedParticipantIds([])}
              className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl font-bold cursor-pointer hover:bg-slate-700"
            >
              Сбросить выбор
            </button>
          </div>
        </div>
      )}

      {/* Main Table of Participants (Mobile optimized cards & list) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={toggleSelectAllParticipants} className="text-slate-400 hover:text-white cursor-pointer">
              {selectedParticipantIds.length === participants.length && participants.length > 0 ? (
                <CheckSquare className="w-5 h-5 text-rose-400" />
              ) : (
                <Square className="w-5 h-5" />
              )}
            </button>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Список Участников ({participants.length})
            </h3>
          </div>
        </div>

        {/* List Items */}
        <div className="space-y-3">
          {participants.length > 0 ? (
            participants.map((p, idx) => {
              const isSelected = selectedParticipantIds.includes(p.id);

              return (
                <div
                  key={p.id}
                  className={`p-4 bg-slate-950 border rounded-2xl space-y-3 transition-all ${
                    isSelected ? 'border-rose-500/50 bg-rose-950/10' : 'border-slate-850 hover:border-slate-700'
                  }`}
                >
                  {/* Participant Header & Info */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => toggleSelectParticipant(p.id)}
                        className="text-slate-500 hover:text-white cursor-pointer shrink-0"
                      >
                        {isSelected ? <CheckSquare className="w-4 h-4 text-rose-400" /> : <Square className="w-4 h-4" />}
                      </button>

                      <span className="font-mono text-xs font-bold text-slate-500 shrink-0">#{idx + 1}</span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            onClick={() => onOpenPlayerCard && onOpenPlayerCard(p.player_id)}
                            className="font-bold text-white text-sm hover:text-rose-400 cursor-pointer truncate"
                          >
                            {p.nickname}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 font-mono">
                            ELO {p.elo}
                          </span>
                        </div>
                        {p.phone && <p className="text-[11px] text-slate-400 font-mono mt-0.5">📱 {p.phone}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setTaskTargetParticipant(p)}
                        className="p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-amber-400 cursor-pointer"
                        title="Создать задачу по участнику"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteParticipant(p.id)}
                        className="p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-rose-400 cursor-pointer"
                        title="Удалить из вечера"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Touch-friendly Status Controls Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-2 border-t border-slate-850">
                    {/* 1. Registration Status */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Запись</span>
                      <select
                        value={p.registration_status}
                        onChange={(e) => handleUpdateParticipant(p.id, { registration_status: e.target.value as any })}
                        className={`w-full bg-slate-900 border rounded-xl px-2 py-1.5 text-xs font-bold focus:outline-none ${
                          p.registration_status === 'confirmed'
                            ? 'border-emerald-500/50 text-emerald-400'
                            : p.registration_status === 'cancelled'
                            ? 'border-rose-500/50 text-rose-400'
                            : 'border-slate-800 text-slate-300'
                        }`}
                      >
                        <option value="registered">Записан</option>
                        <option value="confirmed">Подтвержден</option>
                        <option value="invited">Приглашен</option>
                        <option value="waitlist">Резерв</option>
                        <option value="cancelled">Отменил</option>
                      </select>
                    </div>

                    {/* 2. Attendance Status */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Явка</span>
                      <select
                        value={p.attendance_status}
                        onChange={(e) => handleUpdateParticipant(p.id, { attendance_status: e.target.value as any })}
                        className={`w-full bg-slate-900 border rounded-xl px-2 py-1.5 text-xs font-bold focus:outline-none ${
                          p.attendance_status === 'attended'
                            ? 'border-amber-500/50 text-amber-400'
                            : p.attendance_status === 'no_show'
                            ? 'border-rose-500/50 text-rose-400'
                            : 'border-slate-800 text-slate-300'
                        }`}
                      >
                        <option value="pending">Ожидается</option>
                        <option value="attended">Пришёл</option>
                        <option value="no_show">Не пришёл (No-show)</option>
                      </select>
                    </div>

                    {/* 3. Arrival Status */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Прибытие</span>
                      <select
                        value={p.arrival_status}
                        onChange={(e) => handleUpdateParticipant(p.id, { arrival_status: e.target.value as any })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-300 focus:outline-none"
                      >
                        <option value="unknown">Неизвестно</option>
                        <option value="on_time">Вовремя</option>
                        <option value="late">Опоздал</option>
                      </select>
                    </div>

                    {/* 4. Payment Status & Amounts */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Оплата (К оплате / Оплачено)</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={p.amount_due}
                          onChange={(e) => handleUpdateParticipant(p.id, { amount_due: parseInt(e.target.value) || 0 })}
                          className="w-1/2 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-xs text-white font-mono text-center"
                          title="Сумма к оплате"
                        />
                        <span className="text-slate-500 font-mono">/</span>
                        <input
                          type="number"
                          value={p.amount_paid}
                          onChange={(e) => handleUpdateParticipant(p.id, { amount_paid: parseInt(e.target.value) || 0 })}
                          className={`w-1/2 bg-slate-900 border rounded-xl px-2 py-1 text-xs font-mono text-center font-bold ${
                            p.amount_paid >= p.amount_due && p.amount_due > 0 ? 'text-emerald-400 border-emerald-500/30' : 'text-rose-400 border-rose-500/30'
                          }`}
                          title="Фактически оплачено"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Notes input */}
                  <div>
                    <input
                      type="text"
                      value={p.notes || ''}
                      onChange={(e) => handleUpdateParticipant(p.id, { notes: e.target.value })}
                      placeholder="Заметка по участнику (например, оплатит на месте / со своим чаем)..."
                      className="w-full bg-slate-900 border border-slate-800/80 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-slate-700"
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 text-slate-500 text-xs">
              В этот вечер пока нет записанных участников. Нажмите «Добавить игроков» выше.
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: Bulk Add Players Modal */}
      {showBulkAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 relative text-white max-h-[90vh] flex flex-col">
            <button
              onClick={() => setShowBulkAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-lg font-black uppercase tracking-tight">Массовое добавление игроков</h3>
              <p className="text-xs text-slate-400">Выберите список игроков клубов для мгновенной записи на вечер</p>
            </div>

            {/* Controls Row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={playerSearchQuery}
                  onChange={(e) => setPlayerSearchQuery(e.target.value)}
                  placeholder="Поиск игрока по нику или телефону..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Цена к оплате:</span>
                <input
                  type="number"
                  value={bulkAmountDue}
                  onChange={(e) => setBulkAmountDue(parseInt(e.target.value) || 0)}
                  className="w-24 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white font-mono text-center"
                />
              </div>
            </div>

            {/* Players List with Multi-select */}
            <div className="flex-1 overflow-y-auto border border-slate-800 rounded-2xl bg-slate-950 p-3 space-y-2">
              {availablePlayers.length > 0 ? (
                availablePlayers.map((p) => {
                  const isChecked = selectedPlayerIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() =>
                        setSelectedPlayerIds((prev) =>
                          isChecked ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                        )
                      }
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-rose-950/30 border-rose-500/50 text-white'
                          : 'bg-slate-900 border-slate-850 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isChecked ? <CheckSquare className="w-4 h-4 text-rose-400" /> : <Square className="w-4 h-4 text-slate-500" />}
                        <div>
                          <span className="font-bold text-xs block text-white">{p.nickname}</span>
                          <span className="text-[10px] text-slate-400">ELO {p.elo} • {p.lifecycle_status}</span>
                        </div>
                      </div>
                      {p.phone && <span className="text-[10px] font-mono text-slate-400">📱 {p.phone}</span>}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-slate-500 text-xs">Все доступные игроки уже записаны или не найдены</div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-xs text-slate-400 font-bold">Выбрано: {selectedPlayerIds.length} чел.</span>

              <div className="flex gap-2">
                <button
                  onClick={handleBulkAdd}
                  disabled={selectedPlayerIds.length === 0}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Добавить выбранных ({selectedPlayerIds.length})
                </button>
                <button
                  onClick={() => setShowBulkAddModal(false)}
                  className="bg-slate-800 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Quick Guest Modal */}
      {showQuickGuestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 relative text-white">
            <button
              onClick={() => setShowQuickGuestModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black uppercase tracking-tight">Добавить быстрого гостя</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Никнейм или Имя гостя</label>
                <input
                  type="text"
                  required
                  value={guestNickname}
                  onChange={(e) => setGuestNickname(e.target.value)}
                  placeholder="Например: Гость Богдана"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Телефон (опционально)</label>
                <input
                  type="text"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="+7 (999) 000-00-00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500 font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleAddQuickGuest}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Записать гостя
                </button>
                <button
                  onClick={() => setShowQuickGuestModal(false)}
                  className="bg-slate-800 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Settlement Confirmation Modal */}
      {showSettleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl max-w-lg w-full p-6 space-y-5 relative text-white">
            <button
              onClick={() => setShowSettleModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/30 text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Закрыть и рассчитать вечер</h3>
                <p className="text-xs text-slate-400">Фиксация финансовых транзакций и начислений</p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs space-y-2 text-slate-300">
              <p>• <strong>Финансовый итог:</strong> Будет зафиксирована оплаченная выручка ({totalRevenue} ₽) и неоплаченные задолженности ({Math.max(0, totalDue - totalRevenue)} ₽).</p>
              <p>• <strong>Защита от повторного списания:</strong> Данная операция <u>идемпотентна</u>. Повторный клик не создаст дублирующие долги.</p>
              <p>• <strong>Сохранность данных:</strong> Участники и истории посещений останутся сохраненными в базе.</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSettleEvening}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-emerald-600/20"
              >
                Подтвердить закрытие
              </button>
              <button
                onClick={() => setShowSettleModal(false)}
                className="bg-slate-800 text-slate-300 font-bold px-4 py-3 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Create Task for Participant Modal */}
      {taskTargetParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 relative text-white">
            <button
              onClick={() => setTaskTargetParticipant(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black uppercase tracking-tight">Задача по игроку {taskTargetParticipant.nickname}</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Текст задачи</label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Например: Позвонить и узнать впечатление о первой игре"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreateTaskForParticipant}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Создать задачу
                </button>
                <button
                  onClick={() => setTaskTargetParticipant(null)}
                  className="bg-slate-800 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
