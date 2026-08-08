import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Edit3,
  Filter,
  MessageSquare,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  Upload,
  UserCheck,
  UserRound,
  UserX,
} from 'lucide-react';
import {
  api,
  type EveningTable,
  type GameEvening,
  type Player,
  type PlayerDetails,
  type PlayerGameHistoryItem,
} from '../../lib/api.ts';
import { formatEveningDateTime, getSortedFutureEvenings } from '../../lib/dateUtils.ts';
import {
  getCanInviteStatus,
  getRussianContactStatusLabel,
  getRussianEngagementStageLabel,
  type ContactStatus,
} from '../../lib/playerUtils.ts';
import { preparePlayerAvatar } from '../../lib/playerAvatarImage.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';
import { PlayerProfileContent } from './PlayerProfileContent.tsx';

interface PlayersCRMProps {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  selectedPlayerId?: string | null;
  onClosePlayerCard?: () => void;
  onCrmChanged?: () => void;
}

type QuickFilter = 'all' | 'newcomers1' | 'never' | 'absent30' | 'absent60' | 'open_tasks';
type PlayerSection = 'overview' | 'games' | 'crm';
type GameFilter = 'all' | 'club' | 'tournament';

const QUICK_FILTERS: Array<{ id: QuickFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'newcomers1', label: 'Новички' },
  { id: 'never', label: 'Не приходили' },
  { id: 'absent30', label: '30+ дней' },
  { id: 'absent60', label: '60+ дней' },
  { id: 'open_tasks', label: 'Есть задачи' },
];

const fmtDate = (value?: string | null, withTime = false) => {
  if (!value) return 'Не указано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
};

const roleLabel = (role: PlayerGameHistoryItem['role']) =>
  role === 'don' ? 'Дон' : role === 'mafia' ? 'Мафия' : role === 'sheriff' ? 'Шериф' : role === 'citizen' ? 'Мирный' : 'Роль не указана';

const exitLabel = (exitType: string | null) => {
  if (exitType === 'killed') return 'Убит ночью';
  if (exitType === 'voted_zero_round') return 'Заголосован в 0 круге';
  if (exitType === 'voted_day') return 'Заголосован';
  if (exitType === 'removed') return 'Удалён';
  if (exitType === 'alive') return 'Дожил до конца';
  return exitType || 'Без отметки';
};

const statusTone = (status?: string | null) => {
  if (status === 'blocked') return 'bg-danger-soft text-danger border-danger/20';
  if (status === 'paused') return 'bg-warning-soft text-warning border-warning/20';
  return 'bg-success-soft text-success border-success/20';
};

export const PlayersCRM: React.FC<PlayersCRMProps> = ({
  evenings: _evenings,
  onOpenEvening: _onOpenEvening,
  selectedPlayerId,
  onClosePlayerCard,
  onCrmChanged,
}) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [lifecycleStatus, setLifecycleStatus] = useState('');
  const [contactStatusFilter, setContactStatusFilter] = useState('');
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  const [activePlayerCardId, setActivePlayerCardId] = useState<string | null>(selectedPlayerId || null);
  const [playerDetails, setPlayerDetails] = useState<PlayerDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [playerSection, setPlayerSection] = useState<PlayerSection>('overview');
  const [gameFilter, setGameFilter] = useState<GameFilter>('all');

  const [showAddModal, setShowAddModal] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTgUsername, setNewTgUsername] = useState('');
  const [newSource, setNewSource] = useState('manual');
  const [newNotes, setNewNotes] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingPlayer, setIsSavingPlayer] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    nickname: '',
    full_name: '',
    phone: '',
    telegram_username: '',
    source: '',
    notes: '',
    contact_status: 'normal' as ContactStatus,
    do_not_invite_until: '',
    pause_reason: '',
    preferred_format: '',
    referred_by: '',
  });

  const [showCommModal, setShowCommModal] = useState(false);
  const [commChannel, setCommChannel] = useState<'telegram' | 'phone' | 'in_person' | 'other'>('telegram');
  const [commOutcome, setCommOutcome] = useState<'answered' | 'no_answer' | 'interested' | 'declined' | 'call_later'>('answered');
  const [commComment, setCommComment] = useState('');
  const [commCreateTask, setCommCreateTask] = useState(false);
  const [commTaskDueAt, setCommTaskDueAt] = useState('');
  const [commTaskTitle, setCommTaskTitle] = useState('');
  const [commSaving, setCommSaving] = useState(false);
  const [commError, setCommError] = useState<string | null>(null);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueAtInput, setTaskDueAtInput] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [futureEvenings, setFutureEvenings] = useState<GameEvening[]>([]);
  const [selectedEveningId, setSelectedEveningId] = useState('');
  const [eveningTables, setEveningTables] = useState<EveningTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [createFollowupTask, setCreateFollowupTask] = useState(true);
  const [inviteMessageText, setInviteMessageText] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccessMessage, setInviteSuccessMessage] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [confirmDeleteAvatar, setConfirmDeleteAvatar] = useState(false);

  useEffect(() => {
    void loadPlayers();
  }, [search, lifecycleStatus, contactStatusFilter, activeQuickFilter]);

  useEffect(() => {
    if (selectedPlayerId) {
      setActivePlayerCardId(selectedPlayerId);
      setPlayerSection('overview');
      void loadPlayerDetails(selectedPlayerId);
    }
  }, [selectedPlayerId]);

  const loadPlayers = async () => {
    setLoading(true);
    setListError(null);
    try {
      const params: Record<string, string | number | boolean> = {};
      if (search.trim()) params.search = search.trim();
      if (lifecycleStatus) params.lifecycle_status = lifecycleStatus;
      if (contactStatusFilter) params.contact_status = contactStatusFilter;
      if (activeQuickFilter === 'newcomers1') params.first_visit_only = true;
      if (activeQuickFilter === 'never') params.never_attended = true;
      if (activeQuickFilter === 'absent30') params.inactive_days = 30;
      if (activeQuickFilter === 'absent60') params.inactive_days = 60;
      if (activeQuickFilter === 'open_tasks') params.has_open_tasks = true;
      setPlayers(await api.getPlayers(params));
    } catch (err: any) {
      setListError(err.message || 'Не удалось загрузить игроков');
    } finally {
      setLoading(false);
    }
  };

  const initEditForm = (data: PlayerDetails) => {
    setEditForm({
      nickname: data.nickname || '',
      full_name: data.full_name || '',
      phone: data.phone || '',
      telegram_username: data.telegram_username?.replace('@', '') || '',
      source: data.source || '',
      notes: data.notes || '',
      contact_status: (data.contact_status || 'normal') as ContactStatus,
      do_not_invite_until: data.do_not_invite_until ? data.do_not_invite_until.slice(0, 10) : '',
      pause_reason: data.pause_reason || '',
      preferred_format: data.preferred_format || '',
      referred_by: data.referred_by || '',
    });
    setIsEditMode(false);
  };

  const loadPlayerDetails = async (id: string) => {
    setLoadingDetails(true);
    setDetailError(null);
    try {
      const data = await api.getPlayer(id);
      setPlayerDetails(data);
      initEditForm(data);
    } catch (err: any) {
      setDetailError(err.message || 'Не удалось загрузить профиль игрока');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenCard = (id: string) => {
    setActivePlayerCardId(id);
    setPlayerSection('overview');
    setGameFilter('all');
    setPlayerDetails(null);
    setProfileMessage(null);
    setProfileError(null);
    void loadPlayerDetails(id);
  };

  const handleCloseCard = () => {
    setActivePlayerCardId(null);
    setPlayerDetails(null);
    setPlayerSection('overview');
    setIsEditMode(false);
    onClosePlayerCard?.();
  };

  const refreshPlayer = async () => {
    if (!activePlayerCardId) return;
    await Promise.all([loadPlayerDetails(activePlayerCardId), loadPlayers()]);
    onCrmChanged?.();
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !playerDetails) return;
    setAvatarBusy(true);
    setProfileError(null);
    setProfileMessage('Загрузка фото…');
    try {
      const prepared = await preparePlayerAvatar(file);
      await api.uploadPlayerAvatar(playerDetails.id, prepared);
      setProfileMessage('Фото обновлено');
      await refreshPlayer();
    } catch (err: any) {
      setProfileMessage(null);
      setProfileError(err.message || 'Не удалось загрузить фото');
    } finally {
      setAvatarBusy(false);
      e.target.value = '';
    }
  };

  const handleDeleteAvatar = async () => {
    if (!playerDetails) return;
    setAvatarBusy(true);
    setProfileError(null);
    try {
      await api.deletePlayerAvatar(playerDetails.id);
      setConfirmDeleteAvatar(false);
      setProfileMessage('Фото удалено');
      await refreshPlayer();
    } catch (err: any) {
      setProfileError(err.message || 'Не удалось удалить фото');
      setConfirmDeleteAvatar(false);
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSavePlayerDetails = async () => {
    if (!playerDetails || !editForm.nickname.trim()) return;
    setIsSavingPlayer(true);
    setProfileError(null);
    setProfileMessage(null);
    try {
      await api.updatePlayer(playerDetails.id, {
        nickname: editForm.nickname.trim(),
        full_name: editForm.full_name.trim() || null,
        phone: editForm.phone.trim() || null,
        telegram_username: editForm.telegram_username.trim().replace('@', '') || null,
        source: editForm.source.trim() || null,
        notes: editForm.notes.trim() || null,
        contact_status: editForm.contact_status,
        do_not_invite_until: editForm.do_not_invite_until ? new Date(editForm.do_not_invite_until).toISOString() : null,
        pause_reason: editForm.pause_reason.trim() || null,
        preferred_format: editForm.preferred_format.trim() || null,
        referred_by: editForm.referred_by.trim() || null,
      });
      setIsEditMode(false);
      setProfileMessage('Изменения сохранены');
      await refreshPlayer();
    } catch (err: any) {
      setProfileError(err.message || 'Не удалось сохранить игрока');
    } finally {
      setIsSavingPlayer(false);
    }
  };

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNickname.trim()) return;
    setAddSaving(true);
    setAddError(null);
    try {
      const created = await api.createPlayer({
        nickname: newNickname.trim(),
        full_name: newFullName.trim() || null,
        phone: newPhone.trim() || null,
        telegram_username: newTgUsername.trim().replace('@', '') || null,
        source: newSource.trim() || 'manual',
        notes: newNotes.trim() || null,
        contact_status: 'normal',
      });
      setShowAddModal(false);
      setNewNickname('');
      setNewFullName('');
      setNewPhone('');
      setNewTgUsername('');
      setNewNotes('');
      await loadPlayers();
      handleOpenCard(created.id);
    } catch (err: any) {
      setAddError(err.message || 'Не удалось создать игрока');
    } finally {
      setAddSaving(false);
    }
  };

  const handleRecordCommunication = async () => {
    if (!playerDetails) return;
    setCommSaving(true);
    setCommError(null);
    try {
      await api.recordCommunicationOutcome(playerDetails.id, {
        channel: commChannel,
        outcome: commOutcome,
        comment: commComment.trim() || undefined,
        create_next_task: commCreateTask,
        task_due_at: commTaskDueAt || null,
        task_title: commTaskTitle.trim() || `Перезвонить игроку ${playerDetails.nickname}`,
      });
      setShowCommModal(false);
      setCommComment('');
      setCommCreateTask(false);
      setCommTaskDueAt('');
      setCommTaskTitle('');
      await refreshPlayer();
    } catch (err: any) {
      setCommError(err.message || 'Не удалось сохранить результат общения');
    } finally {
      setCommSaving(false);
    }
  };

  const handleCreateTask = async () => {
    if (!playerDetails || !taskTitle.trim()) return;
    setTaskSaving(true);
    setTaskError(null);
    try {
      await api.createTask({
        title: taskTitle.trim(),
        player_id: playerDetails.id,
        due_at: taskDueAtInput ? new Date(taskDueAtInput).toISOString() : null,
        priority: 'medium',
      });
      setShowTaskModal(false);
      setTaskTitle('');
      setTaskDueAtInput('');
      await refreshPlayer();
    } catch (err: any) {
      setTaskError(err.message || 'Не удалось создать задачу');
    } finally {
      setTaskSaving(false);
    }
  };

  const updateInviteMessage = (player: PlayerDetails, evening: GameEvening, table: EveningTable | null) => {
    const dateFormatted = formatEveningDateTime(evening.starts_at, evening.timezone);
    const tableName = table?.name || 'Без стола';
    const price = table?.default_price ?? (table as any)?.price ?? evening.default_price ?? 0;
    const venue = evening.venue || 'Клуб';
    setInviteMessageText(
      `Привет, ${player.nickname}! 👋\nПриглашаем тебя на игровой вечер «${evening.title}»!\n\n` +
      `📅 ${dateFormatted}\n📍 ${venue}\n🪑 ${tableName}\n💰 ${price > 0 ? `${price} ₽` : 'Бесплатно'}\n\nЖдём тебя на игре!`
    );
  };

  const handleOpenInviteModal = async () => {
    if (!playerDetails) return;
    const inviteCheck = getCanInviteStatus(playerDetails);
    if (!inviteCheck.canInvite) {
      setProfileError(inviteCheck.reason);
      return;
    }
    setShowInviteModal(true);
    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccessMessage(null);
    setCopySuccess(false);
    try {
      const future = getSortedFutureEvenings(await api.getEvenings());
      setFutureEvenings(future);
      if (future[0]) {
        setSelectedEveningId(future[0].id);
        const tables = await api.getEveningTables(future[0].id);
        setEveningTables(tables);
        setSelectedTableId('');
        updateInviteMessage(playerDetails, future[0], null);
      } else {
        setSelectedEveningId('');
        setEveningTables([]);
        setInviteMessageText('');
      }
    } catch (err: any) {
      setInviteError(err.message || 'Не удалось загрузить будущие вечера');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleSelectEvening = async (eveningId: string) => {
    setSelectedEveningId(eveningId);
    setSelectedTableId('');
    setInviteError(null);
    setInviteSuccessMessage(null);
    const evening = futureEvenings.find((item) => item.id === eveningId);
    if (!eveningId || !evening) {
      setEveningTables([]);
      setInviteMessageText('');
      return;
    }
    try {
      const tables = await api.getEveningTables(eveningId);
      setEveningTables(tables);
      if (playerDetails) updateInviteMessage(playerDetails, evening, null);
    } catch (err: any) {
      setInviteError(err.message || 'Не удалось загрузить столы');
    }
  };

  const handleSelectTable = (tableId: string) => {
    setSelectedTableId(tableId);
    const evening = futureEvenings.find((item) => item.id === selectedEveningId);
    const table = eveningTables.find((item) => item.id === tableId) || null;
    if (evening && playerDetails) updateInviteMessage(playerDetails, evening, table);
  };

  const handleSendInvite = async () => {
    if (!playerDetails || !selectedEveningId) return;
    setInviteSaving(true);
    setInviteError(null);
    setInviteSuccessMessage(null);
    try {
      const result = await api.invitePlayer(playerDetails.id, selectedEveningId, selectedTableId || null, createFollowupTask);
      setInviteSuccessMessage(result.message || (result.alreadyParticipant ? 'Игрок уже добавлен на этот вечер' : 'Приглашение сохранено в CRM'));
      await refreshPlayer();
    } catch (err: any) {
      setInviteError(err.message || 'Не удалось создать приглашение');
    } finally {
      setInviteSaving(false);
    }
  };

  const handleCopyMessage = async () => {
    if (!inviteMessageText) return;
    try {
      await navigator.clipboard.writeText(inviteMessageText);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 1800);
    } catch {
      setInviteError('Не удалось скопировать сообщение');
    }
  };

  const allGames = useMemo(() => {
    if (!playerDetails) return [];
    return [...(playerDetails.clubGames || []), ...(playerDetails.tournamentGames || [])]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [playerDetails]);

  const shownGames = useMemo(() => {
    if (gameFilter === 'club') return allGames.filter((game) => game.source === 'club');
    if (gameFilter === 'tournament') return allGames.filter((game) => game.source === 'tournament');
    return allGames;
  }, [allGames, gameFilter]);

  const unifiedFeed = useMemo(() => {
    if (!playerDetails) return [];
    const items: Array<{ id: string; date: string | null; title: string; detail: string; kind: string }> = [];
    for (const activity of playerDetails.activities || []) {
      items.push({
        id: `activity:${activity.id}`,
        date: activity.occurred_at || activity.created_at,
        title: activity.type === 'contact' ? 'Результат общения' : activity.type === 'invite' ? 'Приглашение' : 'CRM-активность',
        detail: activity.description || '',
        kind: activity.outcome || activity.type,
      });
    }
    for (const evening of playerDetails.eveningHistory || []) {
      const attended = evening.attendance_status === 'attended';
      const missed = evening.attendance_status === 'no_show';
      items.push({
        id: `evening:${evening.id}`,
        date: (evening as any).evening_date || null,
        title: (evening as any).evening_title || 'Игровой вечер',
        detail: attended ? 'Был на игре' : missed ? 'Не пришёл' : evening.registration_status === 'cancelled' ? 'Отменил запись' : 'Запись на вечер',
        kind: attended ? 'Посещение' : missed ? 'No-show' : 'Вечер',
      });
    }
    for (const task of playerDetails.tasks || []) {
      items.push({
        id: `task:${task.id}`,
        date: task.created_at,
        title: task.title,
        detail: task.status === 'done' ? 'Задача выполнена' : task.due_at ? `Срок ${fmtDate(task.due_at)}` : 'Задача без срока',
        kind: 'Задача',
      });
    }
    return items.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [playerDetails]);

  const inviteInfo = playerDetails ? getCanInviteStatus(playerDetails) : { canInvite: false, reason: '' };

  const renderGame = (game: PlayerGameHistoryItem) => (
    <article key={game.id} className="rounded-[16px] border border-border-soft bg-surface-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-[14px] font-semibold leading-5 text-text-primary break-words">{game.title}</h4>
          <p className="mt-1 text-[11px] text-text-secondary">
            {fmtDate(game.date)} · Игра #{game.game_number || '—'}{game.table_name ? ` · ${game.table_name}` : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
          game.status !== 'completed' ? 'bg-surface-1 text-text-muted' : game.won ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
        }`}>
          {game.status !== 'completed' ? game.status : game.won ? 'Победа' : 'Поражение'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-[12px] bg-surface-1 p-2.5">
          <span className="block text-[10px] text-text-muted">Роль</span>
          <strong className="mt-0.5 block text-[12px] text-text-primary">{roleLabel(game.role)}</strong>
        </div>
        <div className="rounded-[12px] bg-surface-1 p-2.5">
          <span className="block text-[10px] text-text-muted">Место</span>
          <strong className="mt-0.5 block text-[12px] text-text-primary">#{game.seat_number || '—'}</strong>
        </div>
        <div className="col-span-2 rounded-[12px] bg-surface-1 p-2.5">
          <span className="block text-[10px] text-text-muted">Итог для игрока</span>
          <strong className="mt-0.5 block text-[12px] text-text-primary">{exitLabel(game.exit_type)}</strong>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px] font-semibold">
        {game.best_move && <span className="rounded-full bg-warning-soft px-2.5 py-1 text-warning">Лучший ход</span>}
        {game.first_killed && <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">ПУ</span>}
        {game.zero_round_voted && <span className="rounded-full bg-warning-soft px-2.5 py-1 text-warning">0 круг</span>}
        {game.regular_fouls > 0 && <span className="rounded-full bg-surface-1 px-2.5 py-1 text-text-secondary">Фолы: {game.regular_fouls}</span>}
        {(game.minor_technical_fouls + game.major_technical_fouls) > 0 && (
          <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">Тех: {game.minor_technical_fouls + game.major_technical_fouls}</span>
        )}
      </div>
    </article>
  );

  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Игроки</h2>
            <p className="mt-1 hidden sm:block text-[12px] text-text-secondary">Карточки игроков, история и CRM в одном пространстве.</p>
          </div>
          <button
            type="button"
            onClick={() => { setAddError(null); setShowAddModal(true); }}
            className="min-h-[44px] rounded-[12px] bg-accent px-3.5 text-[13px] font-bold text-white inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Добавить
          </button>
        </div>

        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ник, имя, телефон или Telegram"
              className="mobile-field pl-10"
            />
          </label>
          <button
            type="button"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((value) => !value)}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-[13px] border ${
              showFilters || lifecycleStatus || contactStatusFilter ? 'border-accent bg-accent-soft text-accent' : 'border-border-soft bg-surface-2 text-text-secondary'
            }`}
            title="Фильтры"
          >
            <Filter className="h-5 w-5" />
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 gap-3 rounded-[16px] border border-border-soft bg-surface-2 p-3 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Контакт</span>
              <select value={contactStatusFilter} onChange={(e) => setContactStatusFilter(e.target.value)} className="mobile-field">
                <option value="">Все статусы</option>
                <option value="normal">Можно связываться</option>
                <option value="paused">На паузе</option>
                <option value="blocked">Заблокирован</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Вовлечённость</span>
              <select value={lifecycleStatus} onChange={(e) => setLifecycleStatus(e.target.value)} className="mobile-field">
                <option value="">Все этапы</option>
                <option value="lead">Лид</option>
                <option value="newcomer">Новичок</option>
                <option value="returning">Вернувшийся</option>
                <option value="regular">Постоянный</option>
                <option value="inactive">Неактивный</option>
              </select>
            </label>
          </div>
        )}

        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex w-max min-w-full gap-2">
            {QUICK_FILTERS.map((filter) => (
              <button
                type="button"
                key={filter.id}
                onClick={() => setActiveQuickFilter(filter.id)}
                className={`min-h-[44px] whitespace-nowrap rounded-full border px-4 text-[12px] font-semibold ${
                  activeQuickFilter === filter.id
                    ? 'border-accent bg-accent-soft text-text-primary'
                    : 'border-border-soft bg-surface-2 text-text-secondary'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {listError && (
        <div className="rounded-[16px] border border-danger/30 bg-danger-soft p-3.5 flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-text-primary">{listError}</p>
            <button type="button" onClick={() => void loadPlayers()} className="mt-2 min-h-[40px] text-[12px] font-bold text-danger inline-flex items-center gap-1.5">
              <RotateCcw className="h-4 w-4" /> Повторить
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-[20px] border border-border-soft bg-surface-1 py-16 text-center text-[13px] text-text-secondary">Загрузка игроков…</div>
      ) : players.length === 0 ? (
        <div className="rounded-[20px] border border-border-soft bg-surface-1 py-14 text-center">
          <UserRound className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-3 text-[14px] font-semibold text-text-primary">Игроки не найдены</p>
          <p className="mt-1 text-[12px] text-text-secondary">Измени поиск или фильтры.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {players.map((player) => {
            const canInvite = getCanInviteStatus(player);
            return (
              <button
                type="button"
                key={player.id}
                onClick={() => handleOpenCard(player.id)}
                className="w-full rounded-[18px] border border-border-soft bg-surface-1 p-3.5 text-left transition hover:border-border-strong hover:bg-surface-hover"
              >
                <div className="flex items-start gap-3">
                  <PlayerAvatar playerId={player.id} avatarVersion={player.avatar_updated_at} nickname={player.nickname} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-bold leading-5 text-text-primary break-words">{player.nickname}</h3>
                        <p className="mt-0.5 text-[11px] text-text-secondary">
                          {player.days_since_last_visit !== null && player.days_since_last_visit !== undefined ? `Был ${player.days_since_last_visit} дн. назад` : 'Ещё не был на играх'}
                        </p>
                      </div>
                      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-text-muted" />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone(player.contact_status)}`}>
                        {getRussianContactStatusLabel(player.contact_status)}
                      </span>
                      <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-text-secondary">
                        {getRussianEngagementStageLabel(player.engagement_stage || player.calculated_stage)}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-[10px] bg-surface-2 px-1 py-2">
                        <span className="block text-[10px] text-text-muted">Визиты</span>
                        <strong className="block text-[13px] text-text-primary">{player.attendance_count || 0}</strong>
                      </div>
                      <div className="rounded-[10px] bg-surface-2 px-1 py-2">
                        <span className="block text-[10px] text-text-muted">No-show</span>
                        <strong className="block text-[13px] text-text-primary">{player.no_show_count || 0}</strong>
                      </div>
                      <div className="rounded-[10px] bg-surface-2 px-1 py-2">
                        <span className="block text-[10px] text-text-muted">Задачи</span>
                        <strong className="block text-[13px] text-text-primary">{player.open_tasks_count || 0}</strong>
                      </div>
                    </div>

                    {!canInvite.canInvite && <p className="mt-2 text-[11px] leading-4 text-warning">{canInvite.reason}</p>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <MobileSheet
        open={Boolean(activePlayerCardId)}
        onClose={handleCloseCard}
        title={playerDetails?.nickname || 'Профиль игрока'}
        subtitle={playerDetails ? `${getRussianEngagementStageLabel(playerDetails.engagement_stage || playerDetails.calculated_stage)} · ${getRussianContactStatusLabel(playerDetails.contact_status)}` : 'Загрузка данных'}
        widthClass="sm:max-w-2xl"
        bodyClassName="p-0"
      >
        {loadingDetails ? (
          <div className="p-6 py-20 text-center text-[13px] text-text-secondary">Загрузка профиля…</div>
        ) : detailError ? (
          <div className="p-4">
            <div className="rounded-[16px] border border-danger/30 bg-danger-soft p-4">
              <p className="text-[13px] font-semibold text-text-primary">{detailError}</p>
              <button type="button" onClick={() => activePlayerCardId && void loadPlayerDetails(activePlayerCardId)} className="mt-2 min-h-[44px] text-[12px] font-bold text-danger inline-flex items-center gap-2">
                <RotateCcw className="h-4 w-4" /> Повторить
              </button>
            </div>
          </div>
        ) : playerDetails ? (
          <>
            <div className="sticky top-0 z-10 border-b border-border-soft bg-app-bg/95 px-3 py-2 backdrop-blur-md">
              <div className="grid grid-cols-3 rounded-[13px] bg-surface-1 p-1">
                {([
                  ['overview', 'Обзор'],
                  ['games', 'Игры'],
                  ['crm', 'CRM'],
                ] as Array<[PlayerSection, string]>).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPlayerSection(id)}
                    className={`min-h-[44px] rounded-[10px] text-[12px] font-bold ${
                      playerSection === id ? 'bg-accent text-white' : 'text-text-secondary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 sm:p-4">
              {profileError && <div className="mb-3 rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{profileError}</div>}
              {profileMessage && <div className="mb-3 rounded-[14px] border border-success/30 bg-success-soft p-3 text-[12px] text-success">{profileMessage}</div>}

              {playerSection === 'overview' && (
                <div className="player-overview-embedded">
                  <PlayerProfileContent player={playerDetails} />
                </div>
              )}

              {playerSection === 'games' && (
                <div className="space-y-3">
                  <div className="overflow-x-auto pb-1">
                    <div className="flex w-max min-w-full gap-2">
                      {([
                        ['all', `Все · ${allGames.length}`],
                        ['club', `Клуб · ${playerDetails.clubGames?.length || 0}`],
                        ['tournament', `Турниры · ${playerDetails.tournamentGames?.length || 0}`],
                      ] as Array<[GameFilter, string]>).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setGameFilter(id)}
                          className={`min-h-[44px] whitespace-nowrap rounded-full border px-4 text-[12px] font-semibold ${
                            gameFilter === id ? 'border-accent bg-accent-soft text-text-primary' : 'border-border-soft bg-surface-1 text-text-secondary'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {shownGames.length ? shownGames.map(renderGame) : (
                    <div className="rounded-[16px] border border-border-soft bg-surface-1 py-12 text-center text-[13px] text-text-secondary">В этой категории пока нет игр.</div>
                  )}
                </div>
              )}

              {playerSection === 'crm' && (
                <div className="space-y-4">
                  <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <PlayerAvatar playerId={playerDetails.id} avatarVersion={playerDetails.avatar_updated_at} nickname={playerDetails.nickname} size="lg" />
                        {avatarBusy && <div className="absolute inset-0 grid place-items-center rounded-full bg-black/60 text-[10px] text-white">…</div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[18px] font-bold text-text-primary break-words">{playerDetails.nickname}</h3>
                        {playerDetails.full_name && <p className="mt-0.5 text-[12px] text-text-secondary break-words">{playerDetails.full_name}</p>}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone(playerDetails.contact_status)}`}>{getRussianContactStatusLabel(playerDetails.contact_status)}</span>
                          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-text-secondary">{getRussianEngagementStageLabel(playerDetails.engagement_stage || playerDetails.calculated_stage)}</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => setIsEditMode((value) => !value)} className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft text-text-secondary" aria-label="Редактировать игрока">
                        <Edit3 className="h-4.5 w-4.5" />
                      </button>
                    </div>

                    <input id="player-avatar-upload-input" type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={avatarBusy} onClick={() => document.getElementById('player-avatar-upload-input')?.click()} className="min-h-[44px] rounded-[11px] border border-border-soft bg-surface-2 px-3 text-[11px] font-semibold text-text-secondary inline-flex items-center gap-1.5 disabled:opacity-50">
                        <Upload className="h-4 w-4" /> {playerDetails.avatar_updated_at ? 'Заменить фото' : 'Загрузить фото'}
                      </button>
                      {playerDetails.avatar_updated_at && (
                        <button type="button" disabled={avatarBusy} onClick={() => setConfirmDeleteAvatar(true)} className="min-h-[44px] rounded-[11px] border border-danger/20 bg-danger-soft px-3 text-[11px] font-semibold text-danger inline-flex items-center gap-1.5 disabled:opacity-50">
                          <Trash2 className="h-4 w-4" /> Удалить фото
                        </button>
                      )}
                    </div>
                  </section>

                  <section className={`rounded-[16px] border p-3.5 ${inviteInfo.canInvite ? 'border-success/25 bg-success-soft' : 'border-warning/25 bg-warning-soft'}`}>
                    <div className="flex items-start gap-2.5">
                      {inviteInfo.canInvite ? <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : <UserX className="mt-0.5 h-5 w-5 shrink-0 text-warning" />}
                      <div>
                        <strong className="text-[13px] text-text-primary">{inviteInfo.canInvite ? 'Игрока можно приглашать' : 'Приглашение недоступно'}</strong>
                        <p className="mt-0.5 text-[11px] text-text-secondary">{inviteInfo.reason}</p>
                      </div>
                    </div>
                  </section>

                  <div className="space-y-2">
                    <button type="button" onClick={() => void handleOpenInviteModal()} disabled={!inviteInfo.canInvite} className="min-h-[50px] w-full rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-40">
                      <Send className="h-4.5 w-4.5" /> Пригласить
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setCommError(null); setShowCommModal(true); }} className="min-h-[46px] rounded-[12px] border border-border-soft bg-surface-1 px-2 text-[11px] font-semibold text-text-primary inline-flex items-center justify-center gap-1.5">
                        <MessageSquare className="h-4 w-4 text-accent" /> Общение
                      </button>
                      <button type="button" onClick={() => { setTaskError(null); setShowTaskModal(true); }} className="min-h-[46px] rounded-[12px] border border-border-soft bg-surface-1 px-2 text-[11px] font-semibold text-text-primary inline-flex items-center justify-center gap-1.5">
                        <Clock3 className="h-4 w-4 text-accent" /> Задача
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <a href={playerDetails.telegram_username ? `https://t.me/${playerDetails.telegram_username.replace('@', '')}` : undefined} target="_blank" rel="noreferrer" aria-disabled={!playerDetails.telegram_username} className={`min-h-[46px] rounded-[12px] border border-border-soft bg-surface-1 px-2 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 ${playerDetails.telegram_username ? 'text-text-primary' : 'pointer-events-none text-text-muted opacity-50'}`}>
                        <Send className="h-4 w-4" /> Telegram
                      </a>
                      <a href={playerDetails.phone ? `tel:${playerDetails.phone}` : undefined} aria-disabled={!playerDetails.phone} className={`min-h-[46px] rounded-[12px] border border-border-soft bg-surface-1 px-2 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 ${playerDetails.phone ? 'text-text-primary' : 'pointer-events-none text-text-muted opacity-50'}`}>
                        <Phone className="h-4 w-4" /> Телефон
                      </a>
                    </div>
                  </div>

                  {isEditMode && (
                    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-[14px] font-bold text-text-primary">Данные игрока</h4>
                        <button type="button" onClick={() => initEditForm(playerDetails)} className="min-h-[40px] px-2 text-[11px] font-semibold text-text-secondary">Отмена</button>
                      </div>

                      {([
                        ['nickname', 'Никнейм', 'text'],
                        ['full_name', 'Имя / ФИО', 'text'],
                        ['phone', 'Телефон', 'tel'],
                        ['telegram_username', 'Telegram', 'text'],
                        ['source', 'Источник', 'text'],
                        ['preferred_format', 'Предпочтительный формат', 'text'],
                        ['referred_by', 'Кто пригласил', 'text'],
                        ['pause_reason', 'Причина паузы', 'text'],
                      ] as const).map(([key, label, inputType]) => (
                        <label key={key} className="block">
                          <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">{label}</span>
                          <input type={inputType} value={editForm[key]} onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })} className="mobile-field" />
                        </label>
                      ))}

                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Статус контакта</span>
                        <select value={editForm.contact_status} onChange={(e) => setEditForm({ ...editForm, contact_status: e.target.value as ContactStatus })} className="mobile-field">
                          <option value="normal">Можно связываться</option>
                          <option value="paused">На паузе</option>
                          <option value="blocked">Заблокирован</option>
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Не приглашать до</span>
                        <input type="date" value={editForm.do_not_invite_until} onChange={(e) => setEditForm({ ...editForm, do_not_invite_until: e.target.value })} className="mobile-field" />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Заметки</span>
                        <textarea rows={4} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="mobile-field resize-none" />
                      </label>

                      <button type="button" onClick={() => void handleSavePlayerDetails()} disabled={isSavingPlayer || !editForm.nickname.trim()} className="min-h-[48px] w-full rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white inline-flex items-center justify-center gap-2 disabled:opacity-50">
                        <Save className="h-4 w-4" /> {isSavingPlayer ? 'Сохранение…' : 'Сохранить'}
                      </button>
                    </section>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-[14px] border border-border-soft bg-surface-1 p-3">
                      <span className="text-[10px] text-text-muted">Ближайшая задача</span>
                      {playerDetails.nextTask ? (
                        <>
                          <strong className="mt-1 block text-[12px] leading-4 text-text-primary">{playerDetails.nextTask.title}</strong>
                          <span className="mt-1 block text-[10px] text-text-secondary">{playerDetails.nextTask.due_at ? fmtDate(playerDetails.nextTask.due_at) : 'Без срока'}</span>
                        </>
                      ) : <span className="mt-1 block text-[12px] text-text-secondary">Нет открытых</span>}
                    </div>
                    <div className="rounded-[14px] border border-border-soft bg-surface-1 p-3">
                      <span className="text-[10px] text-text-muted">Ближайшее участие</span>
                      {playerDetails.futureBookings?.[0] ? (
                        <>
                          <strong className="mt-1 block text-[12px] leading-4 text-text-primary">{(playerDetails.futureBookings[0] as any).evening_title || 'Игровой вечер'}</strong>
                          <span className="mt-1 block text-[10px] text-text-secondary">{fmtDate((playerDetails.futureBookings[0] as any).evening_date)}</span>
                        </>
                      ) : <span className="mt-1 block text-[12px] text-text-secondary">Нет записи</span>}
                    </div>
                  </div>

                  <section className="rounded-[18px] border border-border-soft bg-surface-1 p-3.5">
                    <h4 className="text-[13px] font-bold text-text-primary">История посещений и CRM</h4>
                    <div className="mt-3 space-y-2">
                      {unifiedFeed.length ? unifiedFeed.map((item) => (
                        <div key={item.id} className="rounded-[13px] bg-surface-2 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <strong className="text-[12px] leading-4 text-text-primary break-words">{item.title}</strong>
                            <span className="shrink-0 rounded-full bg-surface-1 px-2 py-1 text-[10px] text-text-muted">{item.kind}</span>
                          </div>
                          {item.detail && <p className="mt-1 text-[11px] leading-4 text-text-secondary">{item.detail}</p>}
                          <p className="mt-1 text-[10px] text-text-muted">{fmtDate(item.date, true)}</p>
                        </div>
                      )) : <p className="py-6 text-center text-[12px] text-text-secondary">История пока пуста.</p>}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </>
        ) : null}
      </MobileSheet>

      <MobileSheet
        open={showAddModal}
        onClose={() => !addSaving && setShowAddModal(false)}
        title="Добавить игрока"
        subtitle="Никнейм обязателен, остальные поля можно заполнить позже."
        footer={
          <button form="add-player-form" type="submit" disabled={addSaving || !newNickname.trim()} className="min-h-[48px] w-full rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white disabled:opacity-50">
            {addSaving ? 'Создание…' : 'Добавить игрока'}
          </button>
        }
      >
        <form id="add-player-form" onSubmit={handleCreatePlayer} className="space-y-4">
          {addError && <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{addError}</div>}
          <label className="block"><span className="mobile-label">Никнейм *</span><input value={newNickname} onChange={(e) => setNewNickname(e.target.value)} className="mobile-field" required /></label>
          <label className="block"><span className="mobile-label">Имя / ФИО</span><input value={newFullName} onChange={(e) => setNewFullName(e.target.value)} className="mobile-field" /></label>
          <label className="block"><span className="mobile-label">Телефон</span><input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} type="tel" className="mobile-field" /></label>
          <label className="block"><span className="mobile-label">Telegram</span><input value={newTgUsername} onChange={(e) => setNewTgUsername(e.target.value)} placeholder="username" className="mobile-field" /></label>
          <label className="block"><span className="mobile-label">Источник</span><input value={newSource} onChange={(e) => setNewSource(e.target.value)} className="mobile-field" /></label>
          <label className="block"><span className="mobile-label">Заметки</span><textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={4} className="mobile-field resize-none" /></label>
        </form>
      </MobileSheet>

      <MobileSheet
        open={showCommModal}
        onClose={() => !commSaving && setShowCommModal(false)}
        title="Результат общения"
        footer={
          <button type="button" onClick={() => void handleRecordCommunication()} disabled={commSaving} className="min-h-[48px] w-full rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white disabled:opacity-50">
            {commSaving ? 'Сохранение…' : 'Сохранить результат'}
          </button>
        }
      >
        <div className="space-y-4">
          {commError && <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{commError}</div>}
          <label className="block"><span className="mobile-label">Канал</span>
            <select value={commChannel} onChange={(e) => setCommChannel(e.target.value as typeof commChannel)} className="mobile-field">
              <option value="telegram">Telegram</option><option value="phone">Телефон</option><option value="in_person">Лично</option><option value="other">Другое</option>
            </select>
          </label>
          <label className="block"><span className="mobile-label">Результат</span>
            <select value={commOutcome} onChange={(e) => setCommOutcome(e.target.value as typeof commOutcome)} className="mobile-field">
              <option value="answered">Ответил</option><option value="no_answer">Не ответил</option><option value="interested">Заинтересован</option><option value="declined">Отказался</option><option value="call_later">Связаться позже</option>
            </select>
          </label>
          <label className="block"><span className="mobile-label">Комментарий</span><textarea value={commComment} onChange={(e) => setCommComment(e.target.value)} rows={4} className="mobile-field resize-none" /></label>
          <label className="flex min-h-[44px] items-center gap-3 rounded-[13px] border border-border-soft bg-surface-2 px-3">
            <input type="checkbox" checked={commCreateTask} onChange={(e) => setCommCreateTask(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
            <span className="text-[12px] font-semibold text-text-primary">Создать следующую задачу</span>
          </label>
          {commCreateTask && (
            <>
              <label className="block"><span className="mobile-label">Название задачи</span><input value={commTaskTitle} onChange={(e) => setCommTaskTitle(e.target.value)} className="mobile-field" /></label>
              <label className="block"><span className="mobile-label">Срок</span><input type="datetime-local" value={commTaskDueAt} onChange={(e) => setCommTaskDueAt(e.target.value)} className="mobile-field" /></label>
            </>
          )}
        </div>
      </MobileSheet>

      <MobileSheet
        open={showTaskModal}
        onClose={() => !taskSaving && setShowTaskModal(false)}
        title="Задача игроку"
        subtitle="Если срок не выбран, задача сохранится без даты."
        footer={
          <button type="button" onClick={() => void handleCreateTask()} disabled={taskSaving || !taskTitle.trim()} className="min-h-[48px] w-full rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white disabled:opacity-50">
            {taskSaving ? 'Сохранение…' : 'Создать задачу'}
          </button>
        }
      >
        <div className="space-y-4">
          {taskError && <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{taskError}</div>}
          <label className="block"><span className="mobile-label">Название *</span><input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} className="mobile-field" /></label>
          <label className="block"><span className="mobile-label">Срок</span><input type="date" value={taskDueAtInput} onChange={(e) => setTaskDueAtInput(e.target.value)} className="mobile-field" /></label>
        </div>
      </MobileSheet>

      <MobileSheet
        open={showInviteModal}
        onClose={() => !inviteSaving && setShowInviteModal(false)}
        title="Пригласить игрока"
        subtitle={playerDetails ? playerDetails.nickname : undefined}
        footer={
          <button type="button" onClick={() => void handleSendInvite()} disabled={inviteSaving || inviteLoading || !selectedEveningId} className="min-h-[48px] w-full rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white disabled:opacity-50">
            {inviteSaving ? 'Сохранение…' : 'Сохранить приглашение'}
          </button>
        }
      >
        {inviteLoading ? <div className="py-12 text-center text-[13px] text-text-secondary">Загрузка событий…</div> : (
          <div className="space-y-4">
            {inviteError && <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{inviteError}</div>}
            {inviteSuccessMessage && <div className="rounded-[14px] border border-success/30 bg-success-soft p-3 text-[12px] text-success">{inviteSuccessMessage}</div>}
            {!futureEvenings.length ? (
              <div className="rounded-[16px] border border-border-soft bg-surface-2 p-4 text-[12px] text-text-secondary">Нет будущих игровых вечеров для приглашения.</div>
            ) : (
              <>
                <label className="block"><span className="mobile-label">Игровой вечер</span>
                  <select value={selectedEveningId} onChange={(e) => void handleSelectEvening(e.target.value)} className="mobile-field">
                    {futureEvenings.map((evening) => <option key={evening.id} value={evening.id}>{evening.title} · {fmtDate(evening.starts_at)}</option>)}
                  </select>
                </label>
                <label className="block"><span className="mobile-label">Стол</span>
                  <select value={selectedTableId} onChange={(e) => handleSelectTable(e.target.value)} className="mobile-field">
                    <option value="">Без стола</option>
                    {eveningTables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
                  </select>
                </label>
                <label className="flex min-h-[44px] items-center gap-3 rounded-[13px] border border-border-soft bg-surface-2 px-3">
                  <input type="checkbox" checked={createFollowupTask} onChange={(e) => setCreateFollowupTask(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
                  <span className="text-[12px] font-semibold text-text-primary">Создать задачу на подтверждение</span>
                </label>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-text-secondary">Сообщение</span>
                    <button type="button" onClick={() => void handleCopyMessage()} className="min-h-[40px] rounded-[10px] px-2.5 text-[11px] font-semibold text-accent inline-flex items-center gap-1.5">
                      {copySuccess ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copySuccess ? 'Скопировано' : 'Копировать'}
                    </button>
                  </div>
                  <textarea value={inviteMessageText} onChange={(e) => setInviteMessageText(e.target.value)} rows={8} className="mobile-field resize-none" />
                </div>
              </>
            )}
          </div>
        )}
      </MobileSheet>

      <ConfirmDialog
        open={confirmDeleteAvatar}
        title="Удалить фото игрока?"
        description="Игрок останется в базе, удалится только текущий аватар."
        confirmLabel="Удалить фото"
        tone="danger"
        busy={avatarBusy}
        onCancel={() => setConfirmDeleteAvatar(false)}
        onConfirm={() => void handleDeleteAvatar()}
      />
    </div>
  );
};
