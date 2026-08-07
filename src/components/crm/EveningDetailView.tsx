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
  Edit,
  Sliders,
  Check,
  Clock
} from 'lucide-react';
import { api, GameEvening, EveningParticipant, Player, EveningTable } from '../../lib/api.ts';

interface EveningDetailViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
  view?: 'participants' | 'tables';
}

export const EveningDetailView: React.FC<EveningDetailViewProps> = ({
  eveningId,
  onBack,
  onOpenPlayerCard,
  view = 'participants',
}) => {
  const [evening, setEvening] = useState<GameEvening | null>(null);
  const [participants, setParticipants] = useState<EveningParticipant[]>([]);
  const [tables, setTables] = useState<EveningTable[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Modes
  const [mode, setMode] = useState<'rsvp' | 'active'>('rsvp');
  const [tableFilter, setTableFilter] = useState<string>('all');

  // Bulk add modal states
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [bulkAmountDue, setBulkAmountDue] = useState<number>(500);
  const [bulkTableId, setBulkTableId] = useState<string>('');
  const [bulkRegStatus, setBulkRegStatus] = useState<string>('registered');

  // Table modal states
  const [showTableModal, setShowTableModal] = useState(false);
  const [editingTable, setEditingTable] = useState<EveningTable | null>(null);
  const [tableForm, setTableForm] = useState({
    name: '',
    format: 'STANDARD',
    capacity: 10,
    host_name: '',
    default_price: 500,
    notes: '',
  });

  // Quick guest modal
  const [showQuickGuestModal, setShowQuickGuestModal] = useState(false);
  const [guestNickname, setGuestNickname] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestTableId, setGuestTableId] = useState<string>('');
  const [guestRegStatus, setGuestRegStatus] = useState<string>('registered');
  const [guestAmountDue, setGuestAmountDue] = useState<number>(500);

  // Settlement modal
  const [showSettleModal, setShowSettleModal] = useState(false);

  // Participant selection for bulk actions
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  // Task creation modal for participant
  const [taskTargetParticipant, setTaskTargetParticipant] = useState<EveningParticipant | null>(null);
  const [taskTitle, setTaskTitle] = useState('');

  // Local editing states for notes, custom amounts, etc.
  const [editStates, setEditStates] = useState<Record<string, { amountPaid: string; amountDue: string; notes: string; status: 'idle' | 'saving' | 'saved' | 'error' }>>({});
  const [expandedEdits, setExpandedEdits] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadData();
  }, [eveningId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getEvening(eveningId);
      setEvening(data);
      setParticipants(data.participants || []);
      setTables(data.tables || []);

      const defaultPrice = data.default_price ?? 500;
      setBulkAmountDue(defaultPrice);
      setGuestAmountDue(defaultPrice);

      const players = await api.getPlayers();
      setAllPlayers(players);
    } catch (err: any) {
      alert(err.message || 'Ошибка загрузки вечера');
    } finally {
      setLoading(false);
    }
  };

  const isReadonly = evening?.status === 'completed' || !!evening?.settled_at;

  const formatTableFormat = (format: string) => {
    switch (format) {
      case 'NOVICE':
        return 'Стол для новичков';
      case 'TOURNAMENT':
        return 'Турнирный стол';
      case 'STANDARD':
      default:
        return 'Обычный стол';
    }
  };

  // 1. Bulk Add Players Execution
  const handleBulkAdd = async () => {
    if (selectedPlayerIds.length === 0) return;
    if (isReadonly) {
      alert('Запрещено изменять завершённые вечера');
      return;
    }
    try {
      const res = await api.bulkAddParticipants(
        eveningId,
        selectedPlayerIds,
        bulkTableId || null,
        bulkRegStatus,
        bulkAmountDue
      );
      alert(`Успешно добавлено: ${res.addedCount} игрок(ов). Пропущено дублей: ${res.skippedCount}`);
      setShowBulkAddModal(false);
      setSelectedPlayerIds([]);
      setBulkTableId('');
      setBulkRegStatus('registered');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Ошибка массового добавления');
    }
  };

  // 2. Add Quick Guest Execution
  const handleAddQuickGuest = async () => {
    if (!guestNickname) return;
    if (isReadonly) {
      alert('Запрещено изменять завершённые вечера');
      return;
    }
    try {
      await api.addParticipant(eveningId, {
        nickname: guestNickname,
        phone: guestPhone,
        table_id: guestTableId || null,
        registration_status: guestRegStatus as any,
        amount_due: guestAmountDue ?? evening?.default_price ?? 500,
      });
      setShowQuickGuestModal(false);
      setGuestNickname('');
      setGuestPhone('');
      setGuestTableId('');
      setGuestRegStatus('registered');
      setGuestAmountDue(evening?.default_price ?? 500);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Ошибка добавления гостя');
    }
  };

  const handleGuestTableChange = (tId: string) => {
    setGuestTableId(tId);
    if (tId) {
      const selectedTable = tables.find((t) => t.id === tId);
      setGuestAmountDue(selectedTable?.default_price ?? evening?.default_price ?? 500);
    } else {
      setGuestAmountDue(evening?.default_price ?? 500);
    }
  };

  const handleBulkTableChange = (tId: string) => {
    setBulkTableId(tId);
    if (tId) {
      const selectedTable = tables.find((t) => t.id === tId);
      setBulkAmountDue(selectedTable?.default_price ?? evening?.default_price ?? 500);
    } else {
      setBulkAmountDue(evening?.default_price ?? 500);
    }
  };

  // 3. Move Participant Table (Unified Assignment Logic)
  const handleMoveParticipantTable = async (participantId: string, targetTableId: string | null) => {
    if (isReadonly) {
      alert('Запрещено изменять завершённые вечера');
      return;
    }
    try {
      const updated = await api.moveParticipantTable(participantId, targetTableId);
      setParticipants((prev) => prev.map((p) => (p.id === participantId ? updated : p)));
      loadData();
    } catch (err: any) {
      alert(err.message || 'Ошибка смены стола');
    }
  };

  // Update Participant Field
  const handleUpdateParticipant = async (id: string, data: Partial<EveningParticipant>) => {
    if (isReadonly) {
      alert('Запрещено изменять завершённые вечера');
      return;
    }
    try {
      const updated = await api.updateParticipant(id, data);
      setParticipants((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err: any) {
      alert(err.message || 'Ошибка обновления записи');
    }
  };

  // 4. Delete Participant
  const handleDeleteParticipant = async (id: string) => {
    if (isReadonly) {
      alert('Запрещено изменять завершённые вечера');
      return;
    }
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
    const filtered = getFilteredParticipants();
    if (selectedParticipantIds.length === filtered.length) {
      setSelectedParticipantIds([]);
    } else {
      setSelectedParticipantIds(filtered.map((p) => p.id));
    }
  };

  const toggleSelectParticipant = (id: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const applyBulkActionToParticipants = async (action: 'confirm' | 'attend' | 'assign_table' | 'unassign_table', targetTableId?: string) => {
    if (selectedParticipantIds.length === 0) return;
    if (isReadonly) {
      alert('Запрещено изменять завершённые вечера');
      return;
    }
    try {
      const updates = selectedParticipantIds.map((id) => {
        const update: any = { id };
        if (action === 'confirm') {
          update.registration_status = 'confirmed';
        } else if (action === 'attend') {
          update.attendance_status = 'attended';
        } else if (action === 'assign_table') {
          update.table_id = targetTableId || null;
        } else if (action === 'unassign_table') {
          update.table_id = null;
        }
        return update;
      });

      await api.bulkUpdateParticipants(eveningId, updates);
      setSelectedParticipantIds([]);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Ошибка применения массового действия');
    }
  };

  // Table Management Helpers
  const handleOpenCreateTable = () => {
    if (isReadonly) return;
    setEditingTable(null);
    setTableForm({
      name: 'Новый стол',
      format: 'STANDARD',
      capacity: 10,
      host_name: '',
      default_price: evening?.default_price ?? 500,
      notes: '',
    });
    setShowTableModal(true);
  };

  const handleOpenEditTable = (table: EveningTable) => {
    if (isReadonly) return;
    setEditingTable(table);
    setTableForm({
      name: table.name,
      format: table.format,
      capacity: table.capacity,
      host_name: table.host_name || '',
      default_price: table.default_price ?? evening?.default_price ?? 500,
      notes: table.notes || '',
    });
    setShowTableModal(true);
  };

  const handleSaveTable = async () => {
    try {
      if (editingTable) {
        await api.updateEveningTable(editingTable.id, {
          name: tableForm.name,
          format: tableForm.format,
          capacity: tableForm.capacity,
          host_name: tableForm.host_name || null,
          default_price: tableForm.default_price,
          notes: tableForm.notes || null,
        });
      } else {
        await api.createEveningTable(eveningId, {
          name: tableForm.name,
          format: tableForm.format,
          capacity: tableForm.capacity,
          host_name: tableForm.host_name || null,
          default_price: tableForm.default_price,
          notes: tableForm.notes || null,
        });
      }
      setShowTableModal(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Ошибка сохранения стола');
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    if (isReadonly) {
      alert('Запрещено удалять столы завершённого вечера');
      return;
    }
    if (!confirm('Вы действительно хотите удалить этот стол? Все назначенные игроки будут переведены в статус "Стол не назначен".')) return;
    try {
      await api.deleteEveningTable(tableId);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Ошибка удаления стола');
    }
  };

  // Local editing inputs state
  const getEditState = (p: EveningParticipant) => {
    return editStates[p.id] || {
      amountPaid: String(p.amount_paid ?? 0),
      amountDue: String(p.amount_due ?? evening?.default_price ?? 500),
      notes: p.notes || '',
      status: 'idle'
    };
  };

  const updateLocalEditField = (pId: string, field: 'amountPaid' | 'amountDue' | 'notes', value: string) => {
    setEditStates(prev => {
      const current = prev[pId] || {
        amountPaid: '',
        amountDue: '',
        notes: '',
        status: 'idle'
      };
      return {
        ...prev,
        [pId]: {
          ...current,
          [field]: value,
          status: 'idle'
        }
      };
    });
  };

  const handleSaveLocalEdits = async (p: EveningParticipant) => {
    if (isReadonly) {
      alert('Запрещено изменять завершённые вечера');
      return;
    }
    const state = getEditState(p);
    setEditStates(prev => ({
      ...prev,
      [p.id]: { ...prev[p.id] || state, status: 'saving' }
    }));

    try {
      const updated = await api.updateParticipant(p.id, {
        amount_paid: parseInt(state.amountPaid, 10) || 0,
        amount_due: parseInt(state.amountDue, 10) || 0,
        notes: state.notes
      });

      setParticipants((prev) => prev.map((item) => (item.id === p.id ? updated : item)));

      setEditStates(prev => ({
        ...prev,
        [p.id]: {
          amountPaid: String(updated.amount_paid),
          amountDue: String(updated.amount_due),
          notes: updated.notes || '',
          status: 'saved'
        }
      }));

      setTimeout(() => {
        setEditStates(prev => {
          if (!prev[p.id]) return prev;
          return {
            ...prev,
            [p.id]: { ...prev[p.id], status: 'idle' }
          };
        });
      }, 2000);

    } catch (err) {
      setEditStates(prev => ({
        ...prev,
        [p.id]: { ...prev[p.id] || state, status: 'error' }
      }));
    }
  };

  if (loading || !evening) {
    return <div className="p-8 text-center text-slate-400 text-sm">Загрузка данных вечера...</div>;
  }

  // Counters
  const registeredCount = participants.filter((p) => p.registration_status !== 'cancelled' && p.registration_status !== 'waitlist').length;
  const confirmedCount = participants.filter((p) => p.registration_status === 'confirmed').length;
  const attendedCount = participants.filter((p) => p.attendance_status === 'attended').length;
  const totalRevenue = participants.reduce((sum, p) => sum + (p.amount_paid ?? 0), 0);
  const totalDue = participants.reduce((sum, p) => sum + (p.amount_due ?? 0), 0);

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

  // Filter participants based on selected tab filter
  const getFilteredParticipants = () => {
    return participants.filter((p) => {
      if (tableFilter === 'all') return true;
      if (tableFilter === 'none') return !p.table_id;
      return p.table_id === tableFilter;
    });
  };

  const filteredParticipants = getFilteredParticipants();

  return (
    <div className="space-y-6">
      {/* Compact mobile-first evening summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 space-y-3">
        <div className="flex items-start gap-3 min-w-0">
          <button
            onClick={onBack}
            className="w-10 h-10 shrink-0 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-300 hover:text-white flex items-center justify-center"
            aria-label="Назад к вечерам"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-lg sm:text-xl font-black text-white truncate">{evening.title}</h2>
              {isReadonly && (
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Закрыт
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
              {new Date(evening.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}
              {evening.venue && ` · ${evening.venue}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          <div className="rounded-xl bg-slate-950 border border-slate-850 px-1 py-2 text-center min-w-0">
            <span className="text-[8px] uppercase text-slate-500 font-bold block truncate">Запись</span>
            <strong className="text-[13px] text-white">{registeredCount}/{evening.capacity}</strong>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-850 px-1 py-2 text-center min-w-0">
            <span className="text-[8px] uppercase text-slate-500 font-bold block truncate">Подтв.</span>
            <strong className="text-[13px] text-emerald-400">{confirmedCount}</strong>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-850 px-1 py-2 text-center min-w-0">
            <span className="text-[8px] uppercase text-slate-500 font-bold block truncate">Пришли</span>
            <strong className="text-[13px] text-amber-400">{attendedCount}</strong>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-850 px-1 py-2 text-center min-w-0">
            <span className="text-[8px] uppercase text-slate-500 font-bold block truncate">Оплач.</span>
            <strong className="text-[13px] text-emerald-400">{totalRevenue}₽</strong>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-850 px-1 py-2 text-center min-w-0">
            <span className="text-[8px] uppercase text-slate-500 font-bold block truncate">Долг</span>
            <strong className="text-[13px] text-rose-400">{Math.max(0, totalDue - totalRevenue)}₽</strong>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => {
              const joinUrl = `${window.location.origin}/join/${evening.id}`;
              navigator.clipboard.writeText(joinUrl);
              alert(`Ссылка для записи скопирована:\n${joinUrl}`);
            }}
            className="min-h-[58px] rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 flex flex-col items-center justify-center gap-1"
          >
            <span className="text-lg leading-none">🔗</span>
            <span className="text-[9px] font-bold">Ссылка</span>
          </button>

          {!isReadonly && (
            <button
              onClick={() => setShowBulkAddModal(true)}
              className="min-h-[58px] rounded-xl bg-rose-600 text-white flex flex-col items-center justify-center gap-1 shadow-lg shadow-rose-600/15"
            >
              <UserPlus className="w-4 h-4" />
              <span className="text-[9px] font-black">Игроки</span>
            </button>
          )}

          {!isReadonly && (
            <button
              onClick={() => setShowQuickGuestModal(true)}
              className="min-h-[58px] rounded-xl bg-slate-800 border border-slate-700 text-slate-200 flex flex-col items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span className="text-[9px] font-bold">Гость</span>
            </button>
          )}

          {!isReadonly && !evening.settled_at ? (
            <button
              onClick={() => setShowSettleModal(true)}
              className="min-h-[58px] rounded-xl bg-emerald-600 text-white flex flex-col items-center justify-center gap-1 shadow-lg shadow-emerald-600/15"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-[9px] font-black">Расчёт</span>
            </button>
          ) : (
            <div className="min-h-[58px] rounded-xl bg-slate-950 border border-slate-800 text-slate-500 flex flex-col items-center justify-center gap-1">
              <Lock className="w-4 h-4" />
              <span className="text-[9px] font-bold">Закрыт</span>
            </div>
          )}
        </div>
      </div>

      {/* Compact participant workflow switch */}
      {view === 'participants' && !isReadonly && (
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
          <button
            onClick={() => setMode('rsvp')}
            className={`min-h-[38px] rounded-lg text-[11px] font-black transition-all ${
              mode === 'rsvp' ? 'bg-rose-600 text-white' : 'text-slate-500 hover:text-white hover:bg-slate-900'
            }`}
          >
            Запись
          </button>
          <button
            onClick={() => setMode('active')}
            className={`min-h-[38px] rounded-lg text-[11px] font-black transition-all ${
              mode === 'active' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-white hover:bg-slate-900'
            }`}
          >
            Вечер идёт
          </button>
        </div>
      )}

      {/* 3. Table UI: Display cards for each table */}
      {view === 'tables' && (
        <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-rose-400" /> Игровые Столы вечера
          </h3>
          {!isReadonly && (
            <button
              onClick={handleOpenCreateTable}
              className="text-xs font-bold bg-slate-900 border border-slate-800 hover:border-slate-700 text-rose-300 px-3 py-1.5 rounded-xl cursor-pointer transition-all flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Создать стол
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tables.map((table) => {
            const occupiedCount = participants.filter((p) => p.table_id === table.id && (p.registration_status === 'registered' || p.registration_status === 'confirmed')).length;
            const freeSeats = Math.max(0, table.capacity - occupiedCount);
            const waitlistInTable = participants.filter((p) => p.table_id === table.id && p.registration_status === 'waitlist').length;

            return (
              <div key={table.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 relative overflow-hidden">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-white flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      {table.name}
                    </h4>
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-850 border border-slate-800 text-slate-300 font-mono shrink-0">
                      {formatTableFormat(table.format)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-400 pt-1">
                    <div>Ведущий: <strong className="text-white">{table.host_name || 'Не назначен'}</strong></div>
                    <div>Тариф: <strong className="text-emerald-400">{table.default_price ?? evening.default_price} ₽</strong></div>
                  </div>
                </div>

                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-850 text-xs font-mono grid grid-cols-3 gap-1 text-center">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Занято</span>
                    <span className="font-bold text-white">{occupiedCount} / {table.capacity}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Свободно</span>
                    <span className="font-bold text-emerald-400">{freeSeats}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Резерв</span>
                    <span className="font-bold text-amber-500">{waitlistInTable}</span>
                  </div>
                </div>

                {!isReadonly && (
                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-850/80">
                    <button
                      onClick={() => handleOpenEditTable(table)}
                      className="p-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-400 hover:text-white cursor-pointer transition-all"
                      title="Редактировать параметры стола"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteTable(table.id)}
                      className="p-1.5 bg-slate-950 border border-slate-800 hover:border-rose-900/50 rounded-lg text-slate-400 hover:text-rose-400 cursor-pointer transition-all"
                      title="Удалить стол"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {tables.length === 0 && (
            <div className="md:col-span-3 bg-slate-900/30 border border-dashed border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-500">
              На этот вечер столы пока не добавлены. Будут автоматически развернуты стандартные столы.
            </div>
          )}
        </div>
      </div>

        </>
      )}

      {/* 4. Filter Tabs per Table & Participant List Selection */}
      {view === 'participants' && (
        <>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Table Filters tabs */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setTableFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                tableFilter === 'all'
                  ? 'bg-slate-950 border border-slate-800 text-rose-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Все ({participants.length})
            </button>
            <button
              onClick={() => setTableFilter('none')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                tableFilter === 'none'
                  ? 'bg-slate-950 border border-slate-800 text-rose-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Без стола ({participants.filter((p) => !p.table_id).length})
            </button>
            {tables.map((t) => (
              <button
                key={t.id}
                onClick={() => setTableFilter(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  tableFilter === t.id
                    ? 'bg-slate-950 border border-slate-800 text-rose-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.name} ({participants.filter((p) => p.table_id === t.id).length})
              </button>
            ))}
          </div>

          {!isReadonly && (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAllParticipants}
                className="text-slate-400 hover:text-white cursor-pointer p-1 rounded-lg hover:bg-slate-800 shrink-0"
                title="Выбрать всех на текущем фильтре"
              >
                {selectedParticipantIds.length === filteredParticipants.length && filteredParticipants.length > 0 ? (
                  <CheckSquare className="w-5 h-5 text-rose-400" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
              </button>
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Выбрать все
              </span>
            </div>
          )}
        </div>

        {/* 5. Mass Actions Toolbar when items are selected */}
        {!isReadonly && selectedParticipantIds.length > 0 && (
          <div className="bg-slate-950 border border-rose-500/25 p-3.5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-300">
                👉 Массовое действие для выбранных игроков ({selectedParticipantIds.length}):
              </span>
              <button
                onClick={() => setSelectedParticipantIds([])}
                className="text-[10px] uppercase font-bold text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                Сбросить
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => applyBulkActionToParticipants('confirm')}
                className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/20 text-xs font-bold rounded-xl cursor-pointer transition-all"
              >
                ✅ Подтвердить запись
              </button>
              <button
                onClick={() => applyBulkActionToParticipants('attend')}
                className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600 text-amber-400 hover:text-white border border-amber-500/20 text-xs font-bold rounded-xl cursor-pointer transition-all"
              >
                🏃 Отметить «Пришёл»
              </button>
              <button
                onClick={() => applyBulkActionToParticipants('unassign_table')}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 text-xs font-bold rounded-xl cursor-pointer transition-all"
              >
                🚫 Убрать со стола
              </button>

              {tables.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyBulkActionToParticipants('assign_table', t.id)}
                  className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/20 text-xs font-bold rounded-xl cursor-pointer transition-all"
                >
                  📥 На стол: {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 6. Participant Cards (Interactive view states) */}
        <div className="space-y-3.5">
          {filteredParticipants.length > 0 ? (
            filteredParticipants.map((p, idx) => {
              const isSelected = selectedParticipantIds.includes(p.id);
              const editState = getEditState(p);
              const isExpanded = !!expandedEdits[p.id];

              return (
                <div
                  key={p.id}
                  className={`p-3 sm:p-4 bg-slate-950 border rounded-2xl space-y-3 transition-all relative ${
                    isSelected ? 'border-rose-500/50 bg-rose-950/10' : 'border-slate-850 hover:border-slate-800'
                  }`}
                >
                  {/* Card Header & Metadata */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {!isReadonly && (
                        <button
                          onClick={() => toggleSelectParticipant(p.id)}
                          className="text-slate-500 hover:text-white cursor-pointer shrink-0"
                        >
                          {isSelected ? <CheckSquare className="w-4 h-4 text-rose-400" /> : <Square className="w-4 h-4" />}
                        </button>
                      )}

                      <span className="font-mono text-xs font-bold text-slate-500 shrink-0">#{idx + 1}</span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            onClick={() => onOpenPlayerCard && onOpenPlayerCard(p.player_id)}
                            className="font-bold text-white text-sm hover:text-rose-400 cursor-pointer truncate"
                          >
                            {p.nickname}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-900 border border-slate-850 text-slate-300 font-mono">
                            ELO {p.elo}
                          </span>

                          {p.table_id && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-900 text-rose-400 border border-rose-500/10 font-sans">
                              {tables.find((t) => t.id === p.table_id)?.name || 'Стол'}
                            </span>
                          )}

                          {p.registration_status === 'waitlist' && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Резерв
                            </span>
                          )}
                        </div>
                        {p.phone && <p className="text-[11px] text-slate-400 font-mono mt-0.5">📱 {p.phone}</p>}
                      </div>
                    </div>

                    {/* Quick helper buttons for tasks/deletes */}
                    {!isReadonly && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setTaskTargetParticipant(p)}
                          className="p-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-400 hover:text-amber-400 cursor-pointer"
                          title="Создать задачу"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteParticipant(p.id)}
                          className="p-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-400 hover:text-rose-400 cursor-pointer"
                          title="Удалить участника"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Text status badges for completed/read-only evenings vs interactive controls */}
                  {isReadonly ? (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2.5 border-t border-slate-850 font-mono text-xs">
                      <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-sans font-bold uppercase block">Стол</span>
                        <span className="font-bold text-slate-200 truncate block">
                          {tables.find((t) => t.id === p.table_id)?.name || 'Без стола'}
                        </span>
                      </div>
                      <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-sans font-bold uppercase block">Запись</span>
                        <span className="font-bold text-slate-200">
                          {p.registration_status === 'confirmed' ? 'Подтверждён' :
                           p.registration_status === 'registered' ? 'Зарегистрирован' :
                           p.registration_status === 'waitlist' ? 'Резерв' :
                           p.registration_status === 'cancelled' ? 'Отменён' :
                           p.registration_status === 'invited' ? 'Приглашён' : p.registration_status}
                        </span>
                      </div>
                      <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-sans font-bold uppercase block">Явка</span>
                        <span className="font-bold text-slate-200">
                          {p.attendance_status === 'attended'
                            ? (p.arrival_status === 'late' ? 'Опоздал' : 'Пришел вовремя')
                            : p.attendance_status === 'no_show'
                            ? 'Не пришел'
                            : 'Не указана'}
                        </span>
                      </div>
                      <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-sans font-bold uppercase block">Оплата</span>
                        <span className="font-bold text-slate-200">
                          {p.payment_status === 'paid' ? 'Оплачено' :
                           p.payment_status === 'partial' ? 'Частично' :
                           p.payment_status === 'waived' ? 'Бесплатно' : 'Не оплачено'}
                        </span>
                      </div>
                      <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-sans font-bold uppercase block">Сумма</span>
                        <span className="font-bold text-emerald-400">
                          {p.amount_paid ?? 0} / {p.amount_due ?? evening.default_price} ₽
                        </span>
                      </div>
                    </div>
                  ) : mode === 'rsvp' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-850">
                      {/* Table assignment selector */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Игровой стол</span>
                        <select
                          value={p.table_id || ''}
                          onChange={(e) => handleMoveParticipantTable(p.id, e.target.value || null)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-200 focus:outline-none"
                        >
                          <option value="">Без стола (Свободный слот)</option>
                          {tables.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({formatTableFormat(t.format)})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Registration status switcher */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Запись</span>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            onClick={() => handleUpdateParticipant(p.id, { registration_status: 'confirmed' })}
                            className={`py-1.5 rounded-xl text-[10px] uppercase font-bold tracking-wider cursor-pointer border transition-all ${
                              p.registration_status === 'confirmed'
                                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 font-black'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            Подтвердить
                          </button>
                          <button
                            onClick={() => handleUpdateParticipant(p.id, { registration_status: 'waitlist' })}
                            className={`py-1.5 rounded-xl text-[10px] uppercase font-bold tracking-wider cursor-pointer border transition-all ${
                              p.registration_status === 'waitlist'
                                ? 'bg-amber-600/20 border-amber-500 text-amber-400 font-black'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            Резерв
                          </button>
                          <button
                            onClick={() => handleUpdateParticipant(p.id, { registration_status: 'cancelled' })}
                            className={`py-1.5 rounded-xl text-[10px] uppercase font-bold tracking-wider cursor-pointer border transition-all ${
                              p.registration_status === 'cancelled'
                                ? 'bg-rose-600/20 border-rose-500 text-rose-400 font-black'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            Отменил
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* MODE B: Active Evening Controls */
                    <div className="space-y-3 pt-2.5 border-t border-slate-850">
                      {/* Attendance Buttons Grid */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Присутствие (Явка)</span>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            disabled={isReadonly}
                            onClick={() => handleUpdateParticipant(p.id, { attendance_status: 'attended', arrival_status: 'on_time' })}
                            className={`min-h-[44px] rounded-xl text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-1 cursor-pointer border transition-all disabled:opacity-60 ${
                              p.attendance_status === 'attended' && p.arrival_status === 'on_time'
                                ? 'bg-emerald-600 border-emerald-500 text-white font-black'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <Check className="w-4 h-4" /> Пришёл вовремя
                          </button>
                          <button
                            disabled={isReadonly}
                            onClick={() => handleUpdateParticipant(p.id, { attendance_status: 'attended', arrival_status: 'late' })}
                            className={`min-h-[44px] rounded-xl text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-1 cursor-pointer border transition-all disabled:opacity-60 ${
                              p.attendance_status === 'attended' && p.arrival_status === 'late'
                                ? 'bg-amber-600 border-amber-500 text-white font-black'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <Clock className="w-4 h-4" /> Опоздал
                          </button>
                          <button
                            disabled={isReadonly}
                            onClick={() => handleUpdateParticipant(p.id, { attendance_status: 'no_show', arrival_status: 'unknown' })}
                            className={`min-h-[44px] rounded-xl text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-1 cursor-pointer border transition-all disabled:opacity-60 ${
                              p.attendance_status === 'no_show'
                                ? 'bg-rose-600 border-rose-500 text-white font-black'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <X className="w-4 h-4" /> Не пришёл
                          </button>
                        </div>
                      </div>

                      {/* Payment Shortcuts Grid */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Кассовая операция</span>
                        <div className="grid grid-cols-4 gap-1.5">
                          <button
                            disabled={isReadonly}
                            onClick={() => {
                              const targetPrice = p.amount_due ?? evening.default_price;
                              handleUpdateParticipant(p.id, { payment_status: 'paid', amount_paid: targetPrice });
                              updateLocalEditField(p.id, 'amountPaid', String(targetPrice));
                            }}
                            className={`min-h-[44px] rounded-xl text-[10px] uppercase font-bold tracking-wider flex flex-col items-center justify-center cursor-pointer border transition-all disabled:opacity-60 ${
                              p.payment_status === 'paid' && p.amount_paid >= p.amount_due && p.amount_due > 0
                                ? 'bg-emerald-600 border-emerald-500 text-white font-black'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <span className="font-bold">100% Оплата</span>
                            <span className="text-[9px] font-mono opacity-80">{p.amount_due ?? evening.default_price} ₽</span>
                          </button>
                          <button
                            disabled={isReadonly}
                            onClick={() => {
                              const targetPrice = p.amount_due ?? evening.default_price;
                              const half = Math.round(targetPrice / 2);
                              handleUpdateParticipant(p.id, { payment_status: 'partial', amount_paid: half });
                              updateLocalEditField(p.id, 'amountPaid', String(half));
                            }}
                            className={`min-h-[44px] rounded-xl text-[10px] uppercase font-bold tracking-wider flex flex-col items-center justify-center cursor-pointer border transition-all disabled:opacity-60 ${
                              p.payment_status === 'partial'
                                ? 'bg-amber-600 border-amber-500 text-white font-black'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <span className="font-bold">Половина</span>
                            <span className="text-[9px] font-mono opacity-80">{Math.round((p.amount_due ?? evening.default_price) / 2)} ₽</span>
                          </button>
                          <button
                            disabled={isReadonly}
                            onClick={() => {
                              handleUpdateParticipant(p.id, { payment_status: 'waived', amount_paid: 0 });
                              updateLocalEditField(p.id, 'amountPaid', '0');
                            }}
                            className={`min-h-[44px] rounded-xl text-[10px] uppercase font-bold tracking-wider flex flex-col items-center justify-center cursor-pointer border transition-all disabled:opacity-60 ${
                              p.payment_status === 'waived'
                                ? 'bg-slate-700 border-slate-600 text-white font-black'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <span className="font-bold">Бесплатно</span>
                            <span className="text-[9px] font-mono opacity-80">0 ₽</span>
                          </button>
                          <button
                            onClick={() => setExpandedEdits(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                            className={`min-h-[44px] rounded-xl text-[10px] uppercase font-bold tracking-wider flex flex-col items-center justify-center cursor-pointer border transition-all ${
                              isExpanded
                                ? 'bg-rose-600/20 border-rose-500 text-rose-400'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <span className="font-bold">Калькулятор</span>
                            <span className="text-[9px] opacity-80">Изменить сумму</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expanded Custom editing panel for billing parameters */}
                  {!isReadonly && (isExpanded || mode === 'rsvp') && (
                    <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-850 space-y-3 pt-3 mt-1.5">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {/* Cost Input */}
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase">Цена вечера (₽)</label>
                          <input
                            disabled={isReadonly}
                            type="number"
                            value={editState.amountDue}
                            onChange={(e) => updateLocalEditField(p.id, 'amountDue', e.target.value)}
                            placeholder="500"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-mono disabled:opacity-60"
                          />
                        </div>

                        {/* Paid Input */}
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-400 font-bold uppercase">Фактически внесено (₽)</label>
                          <input
                            disabled={isReadonly}
                            type="number"
                            value={editState.amountPaid}
                            onChange={(e) => updateLocalEditField(p.id, 'amountPaid', e.target.value)}
                            placeholder="0"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-mono disabled:opacity-60"
                          />
                        </div>
                      </div>

                      {/* Participant Notes */}
                      <div className="space-y-1 text-xs">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase">Заметки организатора</label>
                        <input
                          disabled={isReadonly}
                          type="text"
                          value={editState.notes}
                          onChange={(e) => updateLocalEditField(p.id, 'notes', e.target.value)}
                          placeholder="Пример: оплатит переводом после игры..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white focus:outline-none focus:border-slate-700 disabled:opacity-60"
                        />
                      </div>

                      {/* Save Status buttons */}
                      {!isReadonly && (
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-slate-500 font-mono">
                            {p.payment_status === 'paid' ? '✅ Оплачено' : p.payment_status === 'partial' ? '⚠️ Частично' : '❌ Долг'}
                          </span>
                          <button
                            onClick={() => handleSaveLocalEdits(p)}
                            disabled={editState.status === 'saving'}
                            className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer text-white transition-all ${
                              editState.status === 'saving'
                                ? 'bg-slate-800 text-slate-500 cursor-wait'
                                : editState.status === 'saved'
                                ? 'bg-emerald-600'
                                : editState.status === 'error'
                                ? 'bg-rose-600'
                                : 'bg-rose-600 hover:bg-rose-500 shadow shadow-rose-600/10'
                            }`}
                          >
                            {editState.status === 'saving'
                              ? 'Сохранение...'
                              : editState.status === 'saved'
                              ? '✓ Успешно'
                              : editState.status === 'error'
                              ? '⚠ Ошибка'
                              : 'Сохранить кассу'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 text-slate-500 text-xs">
              На выбранном фильтре стола записанных участников не обнаружено.
            </div>
          )}
        </div>
      </div>

        </>
      )}

      {/* MODAL 1: Bulk Add Players Modal */}
      {showBulkAddModal && !isReadonly && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-t-[28px] sm:rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-3 sm:space-y-5 relative text-white max-h-[92dvh] flex flex-col">
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
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="relative col-span-2">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={playerSearchQuery}
                  onChange={(e) => setPlayerSearchQuery(e.target.value)}
                  placeholder="Поиск игрока..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Table assignment selector inside bulk modal */}
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Стол:</label>
                <select
                  value={bulkTableId}
                  onChange={(e) => handleBulkTableChange(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white font-bold focus:outline-none"
                >
                  <option value="">Без стола</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({formatTableFormat(t.format)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Registration status selector inside bulk modal */}
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Статус:</label>
                <select
                  value={bulkRegStatus}
                  onChange={(e) => setBulkRegStatus(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white font-bold focus:outline-none"
                >
                  <option value="registered">Записан</option>
                  <option value="confirmed">Подтверждён</option>
                  <option value="waitlist">Резерв</option>
                  <option value="invited">Приглашён</option>
                </select>
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Цена к оплате:</label>
                <input
                  type="number"
                  value={bulkAmountDue}
                  onChange={(e) => setBulkAmountDue(parseInt(e.target.value) || 0)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white font-mono text-center"
                />
              </div>
            </div>

            {/* Players List with Multi-select */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border border-slate-800 rounded-2xl bg-slate-950 p-2 space-y-1.5">
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
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-400 font-bold">Выбрано: {selectedPlayerIds.length} чел.</span>

              <div className="flex gap-2">
                <button
                  onClick={handleBulkAdd}
                  disabled={selectedPlayerIds.length === 0}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black px-3 min-h-[44px] rounded-xl text-[10px] cursor-pointer flex-1"
                >
                  Добавить выбранных ({selectedPlayerIds.length})
                </button>
                <button
                  onClick={() => setShowBulkAddModal(false)}
                  className="bg-slate-800 text-slate-300 font-bold px-3 min-h-[44px] rounded-xl text-[10px] cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Create / Edit Table Modal */}
      {showTableModal && !isReadonly && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-t-[28px] sm:rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-4 relative text-white max-h-[92dvh] overflow-y-auto">
            <button
              onClick={() => setShowTableModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black uppercase tracking-tight">
              {editingTable ? 'Редактировать стол' : 'Создать новый игровой стол'}
            </h3>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Название стола</label>
                <input
                  type="text"
                  required
                  value={tableForm.name}
                  onChange={(e) => setTableForm({ ...tableForm, name: e.target.value })}
                  placeholder="Например: Новичковый стол"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Формат игр</label>
                  <select
                    value={tableForm.format}
                    onChange={(e) => setTableForm({ ...tableForm, format: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                  >
                    <option value="STANDARD">Обычный стол</option>
                    <option value="NOVICE">Стол для новичков</option>
                    <option value="TOURNAMENT">Турнирный стол</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Вместимость (чел.)</label>
                  <input
                    type="number"
                    value={tableForm.capacity}
                    onChange={(e) => setTableForm({ ...tableForm, capacity: parseInt(e.target.value) || 10 })}
                    placeholder="10"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Имя Ведущего</label>
                  <input
                    type="text"
                    value={tableForm.host_name}
                    onChange={(e) => setTableForm({ ...tableForm, host_name: e.target.value })}
                    placeholder="Например: Богдан"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Цена за участие (₽)</label>
                  <input
                    type="number"
                    value={tableForm.default_price}
                    onChange={(e) => setTableForm({ ...tableForm, default_price: parseInt(e.target.value) || 0 })}
                    placeholder="500"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Заметки по столу</label>
                <input
                  type="text"
                  value={tableForm.notes}
                  onChange={(e) => setTableForm({ ...tableForm, notes: e.target.value })}
                  placeholder="Дополнительная информация..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveTable}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  {editingTable ? 'Сохранить изменения' : 'Создать стол'}
                </button>
                <button
                  onClick={() => setShowTableModal(false)}
                  className="bg-slate-800 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Quick Guest Modal */}
      {showQuickGuestModal && !isReadonly && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-t-[28px] sm:rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-4 relative text-white max-h-[92dvh] overflow-y-auto">
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Игровой стол</label>
                  <select
                    value={guestTableId}
                    onChange={(e) => handleGuestTableChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                  >
                    <option value="">Без стола</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({formatTableFormat(t.format)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Статус записи</label>
                  <select
                    value={guestRegStatus}
                    onChange={(e) => setGuestRegStatus(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                  >
                    <option value="registered">Записан</option>
                    <option value="confirmed">Подтверждён</option>
                    <option value="waitlist">Резерв</option>
                    <option value="invited">Приглашён</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Тариф / К оплате (₽)</label>
                <input
                  type="number"
                  value={guestAmountDue}
                  onChange={(e) => setGuestAmountDue(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
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

      {/* MODAL 4: Settlement Confirmation Modal */}
      {showSettleModal && !isReadonly && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-t-[28px] sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 space-y-5 relative text-white max-h-[92dvh] overflow-y-auto">
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

      {/* MODAL 5: Create Task for Participant Modal */}
      {taskTargetParticipant && !isReadonly && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-t-[28px] sm:rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-4 relative text-white max-h-[92dvh] overflow-y-auto">
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
