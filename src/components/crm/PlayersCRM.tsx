import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Phone,
  Send,
  FileText,
  X,
  ChevronRight,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';
import { api, Player, GameEvening, EveningTable, OrganizerTask } from '../../lib/api.ts';

interface PlayersCRMProps {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  selectedPlayerId?: string | null;
  onClosePlayerCard?: () => void;
}

export const PlayersCRM: React.FC<PlayersCRMProps> = ({
  selectedPlayerId,
  onClosePlayerCard,
}) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [search, setSearch] = useState('');
  const [lifecycleStatus, setLifecycleStatus] = useState<string>('');
  const [activeQuickFilter, setActiveQuickFilter] = useState<'all' | 'newcomers1' | 'never' | 'absent30' | 'absent60' | 'open_tasks'>('all');

  // Player detail drawer state
  const [activePlayerCardId, setActivePlayerCardId] = useState<string | null>(selectedPlayerId || null);
  const [playerDetails, setPlayerDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Add Player Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTgUsername, setNewTgUsername] = useState('');
  const [newSource, setNewSource] = useState('manual');
  const [newNotes, setNewNotes] = useState('');

  // New task modal from player card
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');

  // Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [futureEvenings, setFutureEvenings] = useState<GameEvening[]>([]);
  const [selectedEveningId, setSelectedEveningId] = useState<string>('');
  const [eveningTables, setEveningTables] = useState<EveningTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [createFollowupTask, setCreateFollowupTask] = useState(true);
  const [inviteMessageText, setInviteMessageText] = useState('');
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    loadPlayers();
  }, [search, lifecycleStatus, activeQuickFilter]);

  useEffect(() => {
    if (selectedPlayerId) {
      setActivePlayerCardId(selectedPlayerId);
      loadPlayerDetails(selectedPlayerId);
    }
  }, [selectedPlayerId]);

  const loadPlayers = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (search) params.search = search;
      if (lifecycleStatus) params.lifecycle_status = lifecycleStatus;

      if (activeQuickFilter === 'newcomers1') params.first_visit_only = true;
      if (activeQuickFilter === 'never') params.never_attended = true;
      if (activeQuickFilter === 'absent30') params.inactive_days = 30;
      if (activeQuickFilter === 'absent60') params.inactive_days = 60;
      if (activeQuickFilter === 'open_tasks') params.has_open_tasks = true;

      const data = await api.getPlayers(params);
      setPlayers(data);
    } catch (err: any) {
      console.error('Error loading players:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayerDetails = async (id: string) => {
    setLoadingDetails(true);
    try {
      const data = await api.getPlayer(id);
      setPlayerDetails(data);
    } catch (err: any) {
      alert('Ошибка загрузки карточки игрока');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenCard = (id: string) => {
    setActivePlayerCardId(id);
    loadPlayerDetails(id);
  };

  const handleCloseCard = () => {
    setActivePlayerCardId(null);
    setPlayerDetails(null);
    if (onClosePlayerCard) onClosePlayerCard();
  };

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNickname) return;

    try {
      const created = await api.createPlayer({
        nickname: newNickname,
        full_name: newFullName,
        phone: newPhone,
        telegram_username: newTgUsername.replace('@', ''),
        source: newSource,
        notes: newNotes,
        lifecycle_status: 'newcomer',
      });
      setShowAddModal(false);
      setNewNickname('');
      setNewFullName('');
      setNewPhone('');
      setNewTgUsername('');
      loadPlayers();
      handleOpenCard(created.id);
    } catch (err: any) {
      alert(err.message || 'Ошибка создания игрока');
    }
  };

  const handleUpdatePlayerStatus = async (status: string) => {
    if (!playerDetails) return;
    try {
      const updated = await api.updatePlayer(playerDetails.id, { lifecycle_status: status as any });
      setPlayerDetails((prev: any) => ({ ...prev, lifecycle_status: updated.lifecycle_status }));
      loadPlayers();
    } catch (err: any) {
      alert('Ошибка обновления статуса');
    }
  };

  const handleCreateTask = async () => {
    if (!playerDetails || !taskTitle) return;
    try {
      await api.createTask({
        title: taskTitle,
        player_id: playerDetails.id,
        priority: 'medium',
      });
      setShowTaskModal(false);
      setTaskTitle('');
      loadPlayerDetails(playerDetails.id);
    } catch (err: any) {
      alert(err.message || 'Ошибка создания задачи');
    }
  };

  const updateInviteMessage = (player: any, evening: GameEvening, table: EveningTable | null) => {
    const dateObj = new Date(evening.starts_at);
    const dateFormatted =
      dateObj.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        weekday: 'short',
      }) +
      ' в ' +
      dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const tableName = table ? table.name : 'Без стола';
    const price = table?.default_price ?? evening.default_price ?? 0;
    const priceStr = price > 0 ? `${price} ₽` : 'Бесплатно';
    const venueStr = evening.venue || 'Клуб';

    setInviteMessageText(
      `Привет, ${player.nickname}! 👋\n` +
        `Приглашаем тебя на игровой вечер "${evening.title}"!\n\n` +
        `📅 Дата и время: ${dateFormatted}\n` +
        `📍 Место: ${venueStr}\n` +
        `🪑 Стол: ${tableName}\n` +
        `💰 Стоимость: ${priceStr}\n\n` +
        `Ждём тебя на игре!`
    );
  };

  const handleOpenInviteModal = async () => {
    if (!playerDetails) return;
    setInviteError(null);
    setCopySuccess(false);
    try {
      const allEvenings = await api.getEvenings();
      const nowIso = new Date().toISOString();
      const future = allEvenings.filter(
        (e) => e.status !== 'completed' && e.status !== 'cancelled' && e.starts_at >= nowIso
      );
      setFutureEvenings(future);

      if (future.length > 0) {
        const initialEveningId = future[0].id;
        setSelectedEveningId(initialEveningId);
        const tables = await api.getEveningTables(initialEveningId);
        setEveningTables(tables);
        setSelectedTableId('');
        updateInviteMessage(playerDetails, future[0], null);
      } else {
        setSelectedEveningId('');
        setEveningTables([]);
        setSelectedTableId('');
        setInviteMessageText('');
      }
      setShowInviteModal(true);
    } catch (err: any) {
      alert(err.message || 'Ошибка загрузки вечеров');
    }
  };

  const handleSelectEvening = async (eveningId: string) => {
    setSelectedEveningId(eveningId);
    setSelectedTableId('');
    const ev = futureEvenings.find((e) => e.id === eveningId);
    if (eveningId) {
      try {
        const tables = await api.getEveningTables(eveningId);
        setEveningTables(tables);
        if (ev && playerDetails) {
          updateInviteMessage(playerDetails, ev, null);
        }
      } catch (err: any) {
        console.error('Error fetching tables', err);
      }
    } else {
      setEveningTables([]);
      setInviteMessageText('');
    }
  };

  const handleSelectTable = (tableId: string) => {
    setSelectedTableId(tableId);
    const ev = futureEvenings.find((e) => e.id === selectedEveningId);
    const tbl = eveningTables.find((t) => t.id === tableId) || null;
    if (ev && playerDetails) {
      updateInviteMessage(playerDetails, ev, tbl);
    }
  };

  const handleSendInvite = async () => {
    if (!playerDetails || !selectedEveningId) return;
    setIsSubmittingInvite(true);
    setInviteError(null);
    try {
      await api.invitePlayer(
        playerDetails.id,
        selectedEveningId,
        selectedTableId || null,
        createFollowupTask
      );
      setShowInviteModal(false);
      await loadPlayerDetails(playerDetails.id);
      await loadPlayers();
    } catch (err: any) {
      setInviteError(err.message || 'Ошибка при создании приглашения');
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  const handleCopyMessage = () => {
    if (!inviteMessageText) return;
    navigator.clipboard.writeText(inviteMessageText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const renderHistoryBadge = (h: any) => {
    const isCompleted = h.evening_status === 'completed';

    if (isCompleted) {
      if (h.attendance_status === 'attended') {
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Был
          </span>
        );
      }
      if (h.attendance_status === 'no_show') {
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">
            Не пришёл
          </span>
        );
      }
      if (h.registration_status === 'cancelled') {
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-500/20 text-slate-400 border border-slate-500/30">
            Отменил
          </span>
        );
      }
    }

    // Future or uncompleted evenings (draft, published, active), or fallback
    switch (h.registration_status) {
      case 'invited':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
            Приглашён
          </span>
        );
      case 'registered':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/20 text-sky-400 border border-sky-500/30">
            Записан
          </span>
        );
      case 'confirmed':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Подтверждён
          </span>
        );
      case 'waitlist':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-500/20 text-purple-400 border border-purple-500/30">
            Резерв
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-500/20 text-slate-400 border border-slate-500/30">
            Отменил
          </span>
        );
      default:
        if (h.attendance_status === 'no_show') {
          return (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">
              Не пришёл
            </span>
          );
        }
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-500/20 text-slate-400 border border-slate-500/30">
            {h.registration_status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Filters Bar */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight">База Игроков Клуба</h2>
            <p className="text-xs text-slate-400 mt-0.5">Сегментация участников, повторные визиты, удержание и карточки</p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить Игрока</span>
          </button>
        </div>

        {/* Inputs & Status Dropdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по никнейму, имени, телефону или Telegram..."
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <select
              value={lifecycleStatus}
              onChange={(e) => setLifecycleStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-rose-500 font-medium"
            >
              <option value="">Все статусы жизненного цикла</option>
              <option value="lead">Лид (Заявка)</option>
              <option value="newcomer">Новичок</option>
              <option value="returning">Вернувшийся</option>
              <option value="regular">Постоянный игрок</option>
              <option value="inactive">Неактивный</option>
              <option value="blocked">Заблокирован</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
          <button
            onClick={() => setActiveQuickFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
              activeQuickFilter === 'all' ? 'bg-rose-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            Все
          </button>
          <button
            onClick={() => setActiveQuickFilter('newcomers1')}
            className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
              activeQuickFilter === 'newcomers1' ? 'bg-rose-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            Новички (были 1 раз)
          </button>
          <button
            onClick={() => setActiveQuickFilter('never')}
            className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
              activeQuickFilter === 'never' ? 'bg-rose-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            Ни разу не пришел
          </button>
          <button
            onClick={() => setActiveQuickFilter('absent30')}
            className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
              activeQuickFilter === 'absent30' ? 'bg-rose-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            Отсутствует 30+ дней
          </button>
          <button
            onClick={() => setActiveQuickFilter('absent60')}
            className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
              activeQuickFilter === 'absent60' ? 'bg-rose-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            Отсутствует 60+ дней
          </button>
          <button
            onClick={() => setActiveQuickFilter('open_tasks')}
            className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
              activeQuickFilter === 'open_tasks' ? 'bg-rose-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            Есть задачи
          </button>
        </div>
      </div>

      {/* Players List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-slate-500 text-xs">Загрузка игроков...</div>
        ) : players.length > 0 ? (
          players.map((p) => (
            <div
              key={p.id}
              onClick={() => handleOpenCard(p.id)}
              className="bg-slate-900 border border-slate-800 hover:border-rose-500/50 rounded-3xl p-5 space-y-3 cursor-pointer transition-all hover:shadow-lg hover:shadow-rose-500/5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-white leading-snug">{p.nickname}</h3>
                  {p.full_name && <p className="text-xs text-slate-400">{p.full_name}</p>}
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 font-mono">
                  {p.lifecycle_status}
                </span>
              </div>

              {/* Stats & Last visit */}
              <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-2 rounded-2xl border border-slate-850 text-center font-mono text-xs">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block font-bold">Визиты</span>
                  <span className="font-bold text-white">{p.attendance_count || 0}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block font-bold">No-show</span>
                  <span className="font-bold text-rose-400">{p.no_show_count || 0}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block font-bold">ELO</span>
                  <span className="font-bold text-emerald-400">{p.elo}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>
                  {p.days_since_last_visit !== null && p.days_since_last_visit !== undefined
                    ? `Был ${p.days_since_last_visit} дн. назад`
                    : 'Не был на играх'}
                </span>

                <span className="text-rose-400 font-bold flex items-center gap-1">
                  Карточка <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-12 text-center text-slate-500 text-xs">
            Игроки не найдены по выбранным фильтрам
          </div>
        )}
      </div>

      {/* DRAWER / MODAL: Player Detailed Card */}
      {activePlayerCardId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-slate-900 border-l sm:border border-slate-800 w-full max-w-xl h-full sm:h-auto sm:rounded-3xl p-6 overflow-y-auto space-y-6 text-white relative">
            <button
              onClick={handleCloseCard}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-full bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {loadingDetails || !playerDetails ? (
              <div className="py-20 text-center text-slate-400 text-xs">Загрузка карточки игрока...</div>
            ) : (
              <>
                {/* Header Profile */}
                <div className="space-y-3 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-2xl font-black text-white">{playerDetails.nickname}</h3>
                    {playerDetails.full_name && <p className="text-xs text-slate-400">{playerDetails.full_name}</p>}
                  </div>

                  {/* Lifecycle Selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-bold">Статус:</span>
                    <select
                      value={playerDetails.lifecycle_status}
                      onChange={(e) => handleUpdatePlayerStatus(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-bold text-rose-400 focus:outline-none"
                    >
                      <option value="lead">Лид</option>
                      <option value="newcomer">Новичок</option>
                      <option value="returning">Вернувшийся</option>
                      <option value="regular">Постоянный</option>
                      <option value="inactive">Неактивный</option>
                      <option value="blocked">Заблокирован</option>
                    </select>
                  </div>

                  {/* Quick Contacts Row & TG Button */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      onClick={handleOpenInviteModal}
                      className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-rose-600/20 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Пригласить на игру</span>
                    </button>

                    {playerDetails.telegram_username && (
                      <a
                        href={`https://t.me/${playerDetails.telegram_username.replace('@', '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-sky-600 hover:bg-sky-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Telegram (@{playerDetails.telegram_username})</span>
                      </a>
                    )}

                    {playerDetails.phone && (
                      <a
                        href={`tel:${playerDetails.phone}`}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5"
                      >
                        <Phone className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{playerDetails.phone}</span>
                      </a>
                    )}

                    <button
                      onClick={() => setShowTaskModal(true)}
                      className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Создать задачу</span>
                    </button>
                  </div>
                </div>

                {/* Operational CRM Fields */}
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Операционные настройки CRM</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Предпочитаемый формат</label>
                      <select
                        value={playerDetails.preferred_format || ''}
                        onChange={async (e) => {
                          const val = e.target.value;
                          await api.updatePlayer(playerDetails.id, { preferred_format: val });
                          loadPlayerDetails(playerDetails.id);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white font-medium focus:outline-none"
                      >
                        <option value="">Не указан (Любой)</option>
                        <option value="NOVICE">Новичковый стол</option>
                        <option value="STANDARD">Классическая Мафия</option>
                        <option value="TOURNAMENT">Турнирный стол</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Кто привёл (Реферал)</label>
                      <input
                        type="text"
                        defaultValue={playerDetails.referred_by || ''}
                        onBlur={async (e) => {
                          await api.updatePlayer(playerDetails.id, { referred_by: e.target.value });
                        }}
                        placeholder="Никнейм или имя"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Не беспокоить до</label>
                      <input
                        type="date"
                        defaultValue={playerDetails.do_not_invite_until ? playerDetails.do_not_invite_until.split('T')[0] : ''}
                        onChange={async (e) => {
                          const val = e.target.value ? new Date(e.target.value).toISOString() : null;
                          await api.updatePlayer(playerDetails.id, { do_not_invite_until: val });
                          loadPlayerDetails(playerDetails.id);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white font-mono focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Причина паузы</label>
                      <input
                        type="text"
                        defaultValue={playerDetails.pause_reason || ''}
                        onBlur={async (e) => {
                          await api.updatePlayer(playerDetails.id, { pause_reason: e.target.value });
                        }}
                        placeholder="Отпуск, работа, учёба..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Aggregated Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
                  <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-850">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Визитов</span>
                    <span className="text-lg font-bold text-white">{playerDetails.stats?.attendanceCount || 0}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-850">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">No-show</span>
                    <span className="text-lg font-bold text-rose-400">{playerDetails.stats?.noShowCount || 0}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-850">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Без игр</span>
                    <span className="text-lg font-bold text-amber-400">{playerDetails.stats?.daysSinceLastVisit ?? '—'} дн.</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-850">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">ELO Рейтинг</span>
                    <span className="text-lg font-bold text-emerald-400">{playerDetails.elo}</span>
                  </div>
                </div>

                {/* Attendance History */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">История вечеров</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {playerDetails.eveningHistory && playerDetails.eveningHistory.length > 0 ? (
                      playerDetails.eveningHistory.map((h: any) => (
                        <div
                          key={h.id}
                          className="p-3 bg-slate-950 border border-slate-850 rounded-2xl flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-white block">{h.evening_title}</span>
                            <span className="text-[10px] text-slate-400">📅 {new Date(h.evening_date).toLocaleDateString('ru-RU')}</span>
                          </div>
                          {renderHistoryBadge(h)}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-slate-500 text-xs">История посещений пуста</div>
                    )}
                  </div>
                </div>

                {/* Tasks List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Задачи по игроку</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {playerDetails.tasks && playerDetails.tasks.length > 0 ? (
                      playerDetails.tasks.map((t: OrganizerTask) => (
                        <div key={t.id} className="p-2.5 bg-slate-950 border border-slate-850 rounded-xl text-xs flex items-center justify-between">
                          <span className="text-white font-medium">{t.title}</span>
                          <span className="text-[10px] font-bold text-amber-400 uppercase">{t.status}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-slate-500 text-xs">Нет активных задач</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal: Add New Player */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 relative text-white">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black uppercase tracking-tight">Добавить игрока в картотеку</h3>

            <form onSubmit={handleCreatePlayer} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Никнейм *</label>
                <input
                  type="text"
                  required
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  placeholder="Игровой никнейм"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">ФИО / Настоящее имя</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="Иван Иванов"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Телефон</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+7 (999) 000-00-00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Telegram username</label>
                  <input
                    type="text"
                    value={newTgUsername}
                    onChange={(e) => setNewTgUsername(e.target.value)}
                    placeholder="nickname"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Источник прихода</label>
                  <input
                    type="text"
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    placeholder="Авито / По рекомендации / VK"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Заметки / Пожелания</label>
                  <textarea
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Предпочтения по играм, контактное лицо..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500 text-xs"
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Создать игрока
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="bg-slate-800 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Task creation from Player Card */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 relative text-white">
            <button
              onClick={() => setShowTaskModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black uppercase tracking-tight">Задача по игроку {playerDetails?.nickname}</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Суть задачи</label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Например: Перезвонить и пригласить на пятницу"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreateTask}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Сохранить задачу
                </button>
                <button
                  onClick={() => setShowTaskModal(false)}
                  className="bg-slate-800 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Invite Player to Evening */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg max-h-[90vh] rounded-3xl p-5 sm:p-6 space-y-4 overflow-y-auto relative text-white">
            <button
              onClick={() => setShowInviteModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-full bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <Send className="w-5 h-5 text-rose-500" />
              <h3 className="text-lg font-black uppercase tracking-tight">Пригласить на игру</h3>
            </div>

            {inviteError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2 text-rose-400 text-xs font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{inviteError}</span>
              </div>
            )}

            {futureEvenings.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Нет доступных будущих вечеров для приглашения. Создайте или опубликуйте вечер.
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* Select Evening */}
                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Будущий вечер *</label>
                  <select
                    value={selectedEveningId}
                    onChange={(e) => handleSelectEvening(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none focus:border-rose-500"
                  >
                    {futureEvenings.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} — {new Date(ev.starts_at).toLocaleDateString('ru-RU')} ({ev.venue || 'Клуб'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Select Table */}
                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Игровой стол</label>
                  <select
                    value={selectedTableId}
                    onChange={(e) => handleSelectTable(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none focus:border-rose-500"
                  >
                    <option value="">Без стола (По умолчанию)</option>
                    {eveningTables.map((tbl) => (
                      <option key={tbl.id} value={tbl.id}>
                        {tbl.name} {tbl.default_price ? `(${tbl.default_price} ₽)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Task Checkbox */}
                <div className="flex items-center gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <input
                    type="checkbox"
                    id="createTaskChk"
                    checked={createFollowupTask}
                    onChange={(e) => setCreateFollowupTask(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 text-rose-600 focus:ring-rose-500 bg-slate-900 cursor-pointer"
                  />
                  <label htmlFor="createTaskChk" className="text-slate-300 font-medium cursor-pointer select-none">
                    Создать напоминание в задачах CRM
                  </label>
                </div>

                {/* Message Textarea */}
                <div>
                  <label className="block text-slate-400 font-bold uppercase mb-1">Предварительный текст сообщения</label>
                  <textarea
                    value={inviteMessageText}
                    onChange={(e) => setInviteMessageText(e.target.value)}
                    rows={6}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-sans text-xs focus:outline-none focus:border-rose-500 leading-relaxed"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    onClick={handleSendInvite}
                    disabled={isSubmittingInvite || !selectedEveningId}
                    className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmittingInvite ? 'Отправка...' : 'Создать приглашение'}</span>
                  </button>

                  <button
                    onClick={handleCopyMessage}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2 shrink-0"
                  >
                    {copySuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copySuccess ? 'Скопировано' : 'Скопировать'}</span>
                  </button>

                  {playerDetails?.telegram_username && (
                    <a
                      href={`https://t.me/${playerDetails.telegram_username.replace('@', '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Открыть Telegram</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
