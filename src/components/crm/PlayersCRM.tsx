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
  Edit2,
  MessageSquare,
  Clock,
  UserCheck,
  UserX,
  AlertTriangle,
  Save,
} from 'lucide-react';
import { api, Player, GameEvening, EveningTable, OrganizerTask } from '../../lib/api.ts';
import { formatEveningDateTime, getSortedFutureEvenings } from '../../lib/dateUtils.ts';
import {
  getCanInviteStatus,
  getRussianContactStatusLabel,
  getRussianEngagementStageLabel,
  ContactStatus,
} from '../../lib/playerUtils.ts';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';

interface PlayersCRMProps {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  selectedPlayerId?: string | null;
  onClosePlayerCard?: () => void;
  onCrmChanged?: () => void;
}

export const PlayersCRM: React.FC<PlayersCRMProps> = ({
  evenings: _evenings,
  onOpenEvening: _onOpenEvening,
  selectedPlayerId,
  onClosePlayerCard,
  onCrmChanged,
}) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [search, setSearch] = useState('');
  const [lifecycleStatus, setLifecycleStatus] = useState<string>('');
  const [contactStatusFilter, setContactStatusFilter] = useState<string>('');
  const [activeQuickFilter, setActiveQuickFilter] = useState<'all' | 'newcomers1' | 'never' | 'absent30' | 'absent60' | 'open_tasks'>('all');

  // Player detail drawer state
  const [activePlayerCardId, setActivePlayerCardId] = useState<string | null>(selectedPlayerId || null);
  const [playerDetails, setPlayerDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Edit Mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingPlayer, setIsSavingPlayer] = useState(false);
  const [saveStatusMessage, setSaveStatusMessage] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    nickname: string;
    full_name: string;
    phone: string;
    telegram_username: string;
    source: string;
    notes: string;
    contact_status: ContactStatus;
    do_not_invite_until: string;
    pause_reason: string;
    preferred_format: string;
    referred_by: string;
  }>({
    nickname: '',
    full_name: '',
    phone: '',
    telegram_username: '',
    source: '',
    notes: '',
    contact_status: 'normal',
    do_not_invite_until: '',
    pause_reason: '',
    preferred_format: '',
    referred_by: '',
  });

  // Communication Result Modal state
  const [showCommModal, setShowCommModal] = useState(false);
  const [commChannel, setCommChannel] = useState<'telegram' | 'phone' | 'in_person' | 'other'>('telegram');
  const [commOutcome, setCommOutcome] = useState<'answered' | 'no_answer' | 'interested' | 'declined' | 'call_later'>('answered');
  const [commComment, setCommComment] = useState('');
  const [commCreateTask, setCommCreateTask] = useState(false);
  const [commTaskDueAt, setCommTaskDueAt] = useState('');
  const [commTaskTitle, setCommTaskTitle] = useState('');
  const [isSubmittingComm, setIsSubmittingComm] = useState(false);
  const [commError, setCommError] = useState<string | null>(null);

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
  const [taskDueAtInput, setTaskDueAtInput] = useState('');

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
  const [inviteSuccessMessage, setInviteSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadPlayers();
  }, [search, lifecycleStatus, contactStatusFilter, activeQuickFilter]);

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
      if (contactStatusFilter) params.contact_status = contactStatusFilter;

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
      initEditForm(data);
    } catch (err: any) {
      alert('Ошибка загрузки карточки игрока');
    } finally {
      setLoadingDetails(false);
    }
  };

  const initEditForm = (data: any) => {
    setEditForm({
      nickname: data.nickname || '',
      full_name: data.full_name || '',
      phone: data.phone || '',
      telegram_username: data.telegram_username ? data.telegram_username.replace('@', '') : '',
      source: data.source || '',
      notes: data.notes || '',
      contact_status: (data.contact_status || 'normal') as ContactStatus,
      do_not_invite_until: data.do_not_invite_until ? data.do_not_invite_until.split('T')[0] : '',
      pause_reason: data.pause_reason || '',
      preferred_format: data.preferred_format || '',
      referred_by: data.referred_by || '',
    });
    setIsEditMode(false);
    setSaveStatusMessage(null);
  };

  const handleOpenCard = (id: string) => {
    setActivePlayerCardId(id);
    loadPlayerDetails(id);
  };

  const handleCloseCard = () => {
    setActivePlayerCardId(null);
    setPlayerDetails(null);
    setIsEditMode(false);
    if (onClosePlayerCard) onClosePlayerCard();
  };

  const handleSavePlayerDetails = async () => {
    if (!playerDetails) return;
    setIsSavingPlayer(true);
    setSaveStatusMessage('Сохранение...');
    try {
      const isoPauseDate = editForm.do_not_invite_until
        ? new Date(editForm.do_not_invite_until).toISOString()
        : null;

      await api.updatePlayer(playerDetails.id, {
        nickname: editForm.nickname,
        full_name: editForm.full_name || null,
        phone: editForm.phone || null,
        telegram_username: editForm.telegram_username ? editForm.telegram_username.replace('@', '') : null,
        source: editForm.source || null,
        notes: editForm.notes || null,
        contact_status: editForm.contact_status,
        do_not_invite_until: isoPauseDate,
        pause_reason: editForm.pause_reason || null,
        preferred_format: editForm.preferred_format || null,
        referred_by: editForm.referred_by || null,
      });

      setSaveStatusMessage('Сохранено!');
      setTimeout(() => setSaveStatusMessage(null), 2500);
      setIsEditMode(false);
      await loadPlayerDetails(playerDetails.id);
      await loadPlayers();
      if (onCrmChanged) onCrmChanged();
    } catch (err: any) {
      setSaveStatusMessage(`Ошибка: ${err.message || 'Не удалось сохранить'}`);
    } finally {
      setIsSavingPlayer(false);
    }
  };

  const handleRecordCommunication = async () => {
    if (!playerDetails) return;
    setIsSubmittingComm(true);
    setCommError(null);

    try {
      await api.recordCommunicationOutcome(playerDetails.id, {
        channel: commChannel,
        outcome: commOutcome,
        comment: commComment,
        create_next_task: commCreateTask,
        task_due_at: commTaskDueAt ? commTaskDueAt : null,
        task_title: commTaskTitle || `Перезвонить игроку ${playerDetails.nickname}`,
      });

      setShowCommModal(false);
      setCommComment('');
      setCommTaskTitle('');
      setCommTaskDueAt('');
      setCommCreateTask(false);

      await loadPlayerDetails(playerDetails.id);
      await loadPlayers();
      if (onCrmChanged) onCrmChanged();
    } catch (err: any) {
      setCommError(err.message || 'Ошибка при сохранении результата');
    } finally {
      setIsSubmittingComm(false);
    }
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
        contact_status: 'normal',
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

  const handleCreateTask = async () => {
    if (!playerDetails || !taskTitle) return;
    try {
      let dueAt: string | null = null;
      if (taskDueAtInput && taskDueAtInput.trim() !== '') {
        const d = new Date(taskDueAtInput);
        if (!isNaN(d.getTime())) {
          dueAt = d.toISOString();
        }
      }

      await api.createTask({
        title: taskTitle,
        player_id: playerDetails.id,
        due_at: dueAt,
        priority: 'medium',
      });
      setShowTaskModal(false);
      setTaskTitle('');
      setTaskDueAtInput('');
      loadPlayerDetails(playerDetails.id);
    } catch (err: any) {
      alert(err.message || 'Ошибка создания задачи');
    }
  };

  const updateInviteMessage = (player: any, evening: GameEvening, table: EveningTable | null) => {
    const dateFormatted = formatEveningDateTime(evening.starts_at, evening.timezone);
    const tableName = table ? table.name : 'Без стола';
    const price = table?.default_price ?? (table as any)?.price ?? evening.default_price ?? 0;
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

    const inviteCheck = getCanInviteStatus(playerDetails);
    if (!inviteCheck.canInvite) {
      alert(`Невозможно пригласить: ${inviteCheck.reason}`);
      return;
    }

    setInviteError(null);
    setInviteSuccessMessage(null);
    setCopySuccess(false);
    try {
      const allEvenings = await api.getEvenings();
      const future = getSortedFutureEvenings(allEvenings);
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
    setInviteSuccessMessage(null);
    setInviteError(null);
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
    setInviteSuccessMessage(null);
    setInviteError(null);
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
    setInviteSuccessMessage(null);
    try {
      const res = await api.invitePlayer(
        playerDetails.id,
        selectedEveningId,
        selectedTableId || null,
        createFollowupTask
      );

      if (res.alreadyParticipant) {
        setInviteSuccessMessage(res.message || 'Игрок уже добавлен на этот вечер');
      } else {
        setInviteSuccessMessage('Приглашение сохранено в CRM');
      }

      if (onCrmChanged) {
        onCrmChanged();
      }

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

  // Build unified chronological history feed
  const buildUnifiedFeed = () => {
    if (!playerDetails) return [];
    const items: any[] = [];

    // 1. Activities (contacts, notes, invites)
    if (playerDetails.activities) {
      playerDetails.activities.forEach((a: any) => {
        items.push({
          id: `act_${a.id}`,
          occurred_at: a.occurred_at || a.created_at,
          category: 'activity',
          title: a.type === 'contact' ? 'Результат общения' : a.type === 'invite' ? 'Отправлено приглашение' : 'Активность',
          description: a.description || '',
          outcome: a.outcome || null,
          badgeLabel: a.outcome ? (a.outcome === 'answered' ? 'Ответил' : a.outcome === 'no_answer' ? 'Не ответил' : a.outcome === 'interested' ? 'Заинтересован' : a.outcome === 'declined' ? 'Отказался' : 'Связь позже') : 'Контакт',
          badgeStyle: a.outcome === 'answered' || a.outcome === 'interested' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : a.outcome === 'declined' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-sky-500/20 text-sky-400 border-sky-500/30',
        });
      });
    }

    // 2. Evening History
    if (playerDetails.eveningHistory) {
      playerDetails.eveningHistory.forEach((h: any) => {
        const isCompleted = h.evening_status === 'completed';
        if (isCompleted) {
          if (h.attendance_status === 'attended') {
            items.push({
              id: `ev_att_${h.id}`,
              occurred_at: h.evening_date,
              category: 'attendance',
              title: `Посещение вечера: ${h.evening_title}`,
              description: `Игровой стол: ${h.table_name || 'Основной'}`,
              badgeLabel: 'Был на игре',
              badgeStyle: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
            });
          } else if (h.attendance_status === 'no_show') {
            items.push({
              id: `ev_ns_${h.id}`,
              occurred_at: h.evening_date,
              category: 'no_show',
              title: `Пропуск вечера: ${h.evening_title}`,
              description: `Игрок был записан, но не пришёл`,
              badgeLabel: 'Не пришёл (No-Show)',
              badgeStyle: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
            });
          } else if (h.registration_status === 'cancelled') {
            items.push({
              id: `ev_canc_${h.id}`,
              occurred_at: h.evening_date,
              category: 'cancellation',
              title: `Отмена записи: ${h.evening_title}`,
              description: `Запись была отменена`,
              badgeLabel: 'Отменил',
              badgeStyle: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
            });
          }
        } else {
          // Future or uncompleted bookings
          const statusMap: Record<string, { label: string; style: string }> = {
            invited: { label: 'Приглашён', style: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
            registered: { label: 'Записан', style: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
            confirmed: { label: 'Подтверждён', style: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
            waitlist: { label: 'В резерве', style: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
            cancelled: { label: 'Отменил', style: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
          };
          const info = statusMap[h.registration_status] || { label: h.registration_status, style: 'bg-slate-500/20 text-slate-400' };

          items.push({
            id: `ev_booking_${h.id}`,
            occurred_at: h.evening_date,
            category: 'future_booking',
            title: `Будущее участие: ${h.evening_title}`,
            description: `Дата игры: ${new Date(h.evening_date).toLocaleDateString('ru-RU')}`,
            badgeLabel: info.label,
            badgeStyle: info.style,
          });
        }
      });
    }

    // 3. Tasks
    if (playerDetails.tasks) {
      playerDetails.tasks.forEach((t: OrganizerTask) => {
        items.push({
          id: `task_${t.id}`,
          occurred_at: t.created_at,
          category: 'task',
          title: `Задача CRM: ${t.title}`,
          description: t.due_at ? `Срок: ${new Date(t.due_at).toLocaleDateString('ru-RU')}` : 'Без точной даты',
          badgeLabel: t.status === 'done' ? 'Выполнена' : 'В работе',
          badgeStyle: t.status === 'done' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        });
      });
    }

    // Sort descending by date
    items.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
    return items;
  };

  const inviteStatusInfo = playerDetails ? getCanInviteStatus(playerDetails) : { canInvite: true, reason: '' };

  return (
    <div className="space-y-6">
      {/* Search & Filters Bar */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight">База Игроков Клуба</h2>
            <p className="text-xs text-slate-400 mt-0.5">Оперативные карточки, статусы контакта и жизненного цикла</p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить Игрока</span>
          </button>
        </div>

        {/* Inputs & Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
              value={contactStatusFilter}
              onChange={(e) => setContactStatusFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-rose-500 font-medium"
            >
              <option value="">Все статусы контакта</option>
              <option value="normal">Можно связываться</option>
              <option value="paused">На паузе</option>
              <option value="blocked">Заблокирован</option>
            </select>
          </div>

          <div>
            <select
              value={lifecycleStatus}
              onChange={(e) => setLifecycleStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-rose-500 font-medium"
            >
              <option value="">Все этапы (вовлеченность)</option>
              <option value="lead">Лид (0 визитов)</option>
              <option value="newcomer">Новичок (1 визит)</option>
              <option value="returning">Вернувшийся (2-3)</option>
              <option value="regular">Постоянный (4+)</option>
              <option value="inactive">Неактивный (&gt;45 дн.)</option>
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
            Новички (1 визит)
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
          players.map((p) => {
            const canInv = getCanInviteStatus(p);
            return (
              <div
                key={p.id}
                onClick={() => handleOpenCard(p.id)}
                className="bg-slate-900 border border-slate-800 hover:border-rose-500/50 rounded-3xl p-5 space-y-3 cursor-pointer transition-all hover:shadow-lg hover:shadow-rose-500/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerAvatar nickname={p.nickname} size="md" />
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-white leading-snug truncate">{p.nickname}</h3>
                      {p.full_name && <p className="text-xs text-slate-400 truncate">{p.full_name}</p>}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {/* Contact status badge */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        p.contact_status === 'blocked'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : p.contact_status === 'paused'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {getRussianContactStatusLabel(p.contact_status)}
                    </span>

                    {/* Engagement stage badge */}
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300">
                      {getRussianEngagementStageLabel(p.engagement_stage || p.calculated_stage)}
                    </span>
                  </div>
                </div>

                {/* Invite Warning callout if restricted */}
                {!canInv.canInvite && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-2.5 py-1 text-[11px] text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{canInv.reason}</span>
                  </div>
                )}

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
            );
          })
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
                {/* Header Profile & Status */}
                <div className="space-y-3 border-b border-slate-800 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <PlayerAvatar nickname={playerDetails.nickname} size="lg" />
                      <div className="min-w-0">
                        <h3 className="text-2xl font-black text-white truncate">{playerDetails.nickname}</h3>
                        {playerDetails.full_name && <p className="text-xs text-slate-400 truncate">{playerDetails.full_name}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {saveStatusMessage && (
                        <span className="text-xs font-bold text-amber-400">{saveStatusMessage}</span>
                      )}
                      <button
                        onClick={() => {
                          if (isEditMode) {
                            handleSavePlayerDetails();
                          } else {
                            setIsEditMode(true);
                          }
                        }}
                        disabled={isSavingPlayer}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                          isEditMode
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {isEditMode ? (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>Сохранить</span>
                          </>
                        ) : (
                          <>
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Редактировать</span>
                          </>
                        )}
                      </button>

                      {isEditMode && (
                        <button
                          onClick={() => initEditForm(playerDetails)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                        >
                          Отмена
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Status Badges Row */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Статус контакта:</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                          playerDetails.contact_status === 'blocked'
                            ? 'bg-rose-500/20 text-rose-400'
                            : playerDetails.contact_status === 'paused'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {getRussianContactStatusLabel(playerDetails.contact_status)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Этап вовлечения:</span>
                      <span className="font-bold text-sky-400 uppercase text-[10px]">
                        {getRussianEngagementStageLabel(playerDetails.engagement_stage || playerDetails.calculated_stage)}
                      </span>
                    </div>
                  </div>

                  {/* Invite Readiness Indicator */}
                  <div
                    className={`p-3 rounded-2xl border flex items-center justify-between text-xs font-medium ${
                      inviteStatusInfo.canInvite
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {inviteStatusInfo.canInvite ? (
                        <UserCheck className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <UserX className="w-4 h-4 text-amber-400" />
                      )}
                      <span>{inviteStatusInfo.reason}</span>
                    </div>
                  </div>

                  {/* Operational Quick Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      onClick={handleOpenInviteModal}
                      disabled={!inviteStatusInfo.canInvite}
                      className="bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-rose-600/20 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Пригласить на игру</span>
                    </button>

                    <button
                      onClick={() => setShowCommModal(true)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Записать результат общения</span>
                    </button>

                    <button
                      onClick={() => setShowTaskModal(true)}
                      className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Создать задачу</span>
                    </button>

                    {playerDetails.telegram_username && (
                      <a
                        href={`https://t.me/${playerDetails.telegram_username.replace('@', '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-sky-600 hover:bg-sky-500 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5"
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
                  </div>
                </div>

                {/* Edit Form OR View Details */}
                {isEditMode ? (
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-4">
                    <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Редактирование карточки игрока</h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Никнейм *</label>
                        <input
                          type="text"
                          value={editForm.nickname}
                          onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white focus:outline-none focus:border-rose-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">ФИО / Настоящее имя</label>
                        <input
                          type="text"
                          value={editForm.full_name}
                          onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                          placeholder="Иван Иванов"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white focus:outline-none focus:border-rose-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Телефон</label>
                        <input
                          type="text"
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          placeholder="+7 (999) 000-00-00"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-rose-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Telegram Username</label>
                        <input
                          type="text"
                          value={editForm.telegram_username}
                          onChange={(e) => setEditForm({ ...editForm, telegram_username: e.target.value })}
                          placeholder="username"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white focus:outline-none focus:border-rose-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Статус контакта (Ручной)</label>
                        <select
                          value={editForm.contact_status}
                          onChange={(e) => setEditForm({ ...editForm, contact_status: e.target.value as ContactStatus })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white font-bold focus:outline-none"
                        >
                          <option value="normal">Можно связываться (Normal)</option>
                          <option value="paused">На паузе (Paused)</option>
                          <option value="blocked">Заблокирован (Blocked)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Не беспокоить до</label>
                        <input
                          type="date"
                          value={editForm.do_not_invite_until}
                          onChange={(e) => setEditForm({ ...editForm, do_not_invite_until: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white font-mono focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Причина паузы</label>
                        <input
                          type="text"
                          value={editForm.pause_reason}
                          onChange={(e) => setEditForm({ ...editForm, pause_reason: e.target.value })}
                          placeholder="Отпуск, учеба, личное..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Источник прихода</label>
                        <input
                          type="text"
                          value={editForm.source}
                          onChange={(e) => setEditForm({ ...editForm, source: e.target.value })}
                          placeholder="VK, Авито, Рекомендация..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Заметки по игроку</label>
                      <textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        rows={3}
                        placeholder="Особенности, предпочтения по играм, комментарии..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleSavePlayerDetails}
                        disabled={isSavingPlayer}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs uppercase tracking-wider transition-all"
                      >
                        {isSavingPlayer ? 'Сохранение...' : 'Сохранить изменения'}
                      </button>
                      <button
                        onClick={() => initEditForm(playerDetails)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Header Key Metrics Grid */}
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
                    <span className="text-lg font-bold text-amber-400">
                      {playerDetails.stats?.daysSinceLastVisit !== null && playerDetails.stats?.daysSinceLastVisit !== undefined
                        ? `${playerDetails.stats.daysSinceLastVisit} дн.`
                        : '—'}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-850">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">ELO Рейтинг</span>
                    <span className="text-lg font-bold text-emerald-400">{playerDetails.elo}</span>
                  </div>
                </div>

                {/* Next Task & Upcoming Booking Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-850 space-y-1 text-xs">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Ближайшая задача</span>
                    {playerDetails.nextTask ? (
                      <div>
                        <p className="font-bold text-white">{playerDetails.nextTask.title}</p>
                        <p className="text-[10px] text-amber-400">
                          {playerDetails.nextTask.due_at
                            ? `До ${new Date(playerDetails.nextTask.due_at).toLocaleDateString('ru-RU')}`
                            : 'Срок не указан'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-slate-500 italic">Нет открытых задач</p>
                    )}
                  </div>

                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-850 space-y-1 text-xs">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Ближайшее участие</span>
                    {playerDetails.futureBookings && playerDetails.futureBookings.length > 0 ? (
                      <div>
                        <p className="font-bold text-white">{playerDetails.futureBookings[0].evening_title}</p>
                        <p className="text-[10px] text-sky-400">
                          📅 {new Date(playerDetails.futureBookings[0].evening_date).toLocaleDateString('ru-RU')}
                        </p>
                      </div>
                    ) : (
                      <p className="text-slate-500 italic">Нет предстоящих записей</p>
                    )}
                  </div>
                </div>

                {/* Unified Chronological History Feed */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-rose-500" />
                      <span>Единая лента истории (Хронология)</span>
                    </h4>
                  </div>

                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {buildUnifiedFeed().length > 0 ? (
                      buildUnifiedFeed().map((item: any) => (
                        <div
                          key={item.id}
                          className="p-3 bg-slate-950 border border-slate-850 rounded-2xl flex items-start justify-between text-xs space-x-3"
                        >
                          <div className="space-y-0.5">
                            <span className="font-bold text-white block">{item.title}</span>
                            {item.description && <p className="text-slate-400 text-[11px]">{item.description}</p>}
                            <span className="text-[10px] text-slate-500 block">
                              🕒 {new Date(item.occurred_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border shrink-0 ${item.badgeStyle}`}>
                            {item.badgeLabel}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-slate-500 text-xs">Лента событий пуста</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal: Record Communication Outcome */}
      {showCommModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 relative text-white">
            <button
              onClick={() => setShowCommModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-black uppercase tracking-tight">Результат общения</h3>
            </div>

            {commError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 text-xs font-medium">
                {commError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Канал связи</label>
                <select
                  value={commChannel}
                  onChange={(e) => setCommChannel(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-indigo-500"
                >
                  <option value="telegram">Telegram</option>
                  <option value="phone">Телефонный звонок</option>
                  <option value="in_person">Личная встреча в клубе</option>
                  <option value="other">Другое</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Результат контакта</label>
                <select
                  value={commOutcome}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setCommOutcome(val);
                    if (val === 'call_later' || val === 'interested') {
                      setCommCreateTask(true);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-indigo-500"
                >
                  <option value="answered">Ответил / Связались</option>
                  <option value="no_answer">Не ответил / Недоступен</option>
                  <option value="interested">Заинтересован (Хочет прийти)</option>
                  <option value="declined">Отказался</option>
                  <option value="call_later">Просил связаться позже</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Комментарий / Детали</label>
                <textarea
                  value={commComment}
                  onChange={(e) => setCommComment(e.target.value)}
                  placeholder="О чём договорились, когда планирует играть..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-2 pt-1 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="commTaskChk"
                    checked={commCreateTask}
                    onChange={(e) => setCommCreateTask(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-950 cursor-pointer"
                  />
                  <label htmlFor="commTaskChk" className="text-slate-300 font-bold cursor-pointer select-none">
                    Создать следующую задачу по игроку
                  </label>
                </div>

                {commCreateTask && (
                  <div className="space-y-2 pl-6 pt-1">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Название задачи</label>
                      <input
                        type="text"
                        value={commTaskTitle}
                        onChange={(e) => setCommTaskTitle(e.target.value)}
                        placeholder={`Перезвонить игроку ${playerDetails?.nickname || ''}`}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Срок выполнения (необязательно)</label>
                      <input
                        type="date"
                        value={commTaskDueAt}
                        onChange={(e) => setCommTaskDueAt(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white font-mono focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500 mt-0.5">Если дату не выбрать, срок сохранится как NULL.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  onClick={handleRecordCommunication}
                  disabled={isSubmittingComm}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
                >
                  {isSubmittingComm ? 'Сохранение...' : 'Записать результат'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCommModal(false)}
                  className="bg-slate-800 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
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

              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">Срок выполнения (Due Date)</label>
                <input
                  type="date"
                  value={taskDueAtInput}
                  onChange={(e) => setTaskDueAtInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-rose-500"
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

            {inviteSuccessMessage && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-2 text-emerald-400 text-xs font-medium">
                <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{inviteSuccessMessage}</span>
              </div>
            )}

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
                        {ev.title} — {formatEveningDateTime(ev.starts_at, ev.timezone)} ({ev.venue || 'Клуб'})
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
                    {eveningTables.map((tbl) => {
                      const price = tbl.default_price ?? (tbl as any).price;
                      const priceText = price === 0 ? 'Бесплатно' : price ? `${price} ₽` : 'Бесплатно';
                      return (
                        <option key={tbl.id} value={tbl.id}>
                          {tbl.name} ({priceText})
                        </option>
                      );
                    })}
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
                    <span>{isSubmittingInvite ? 'Создание...' : 'Создать приглашение'}</span>
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
