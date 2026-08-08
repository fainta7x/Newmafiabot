import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Award,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Edit3,
  Filter,
  History,
  ImagePlus,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  api,
  type EveningTable,
  type GameEvening,
  type Player,
  type PlayerDetails,
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
import { PlayerGameCard } from './PlayerGameCard.tsx';
import { PlayerProfileContent } from './PlayerProfileContent.tsx';

interface PlayersCRMProps {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  selectedPlayerId?: string | null;
  onClosePlayerCard?: () => void;
  onCrmChanged?: () => void;
}

type QuickFilter = 'all' | 'attention' | 'newcomers' | 'lapsed';
type AdvancedSegment = '' | 'never' | 'absent60' | 'open_tasks';

const QUICK_FILTERS: Array<{ id: QuickFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'attention', label: 'Требуют внимания' },
  { id: 'newcomers', label: 'Новички' },
  { id: 'lapsed', label: 'Давно не были' },
];

const fmtDate = (value?: string | null, withTime = false) => {
  if (!value) return 'Не указано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusTone = (status?: string | null) => {
  if (status === 'blocked') return 'text-danger';
  if (status === 'paused') return 'text-warning';
  return 'text-success';
};

export const PlayersCRM: React.FC<PlayersCRMProps> = ({
  evenings,
  onOpenEvening,
  selectedPlayerId,
  onClosePlayerCard,
  onCrmChanged,
}) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const requestSeq = useRef(0);
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [contactStatusFilter, setContactStatusFilter] = useState('');
  const [lifecycleStatus, setLifecycleStatus] = useState('');
  const [advancedSegment, setAdvancedSegment] = useState<AdvancedSegment>('');

  const [activePlayerCardId, setActivePlayerCardId] = useState<string | null>(selectedPlayerId || null);
  const [playerDetails, setPlayerDetails] = useState<PlayerDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [primaryBusy, setPrimaryBusy] = useState(false);
  const [showPlayerMenu, setShowPlayerMenu] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTgUsername, setNewTgUsername] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [showEditSheet, setShowEditSheet] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    nickname: '', full_name: '', phone: '', telegram_username: '', source: '', notes: '',
    contact_status: 'normal' as ContactStatus,
    do_not_invite_until: '', pause_reason: '', preferred_format: '', referred_by: '',
  });

  const [showTaskSheet, setShowTaskSheet] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  const [showCommSheet, setShowCommSheet] = useState(false);
  const [commChannel, setCommChannel] = useState<'telegram' | 'phone' | 'in_person' | 'other'>('telegram');
  const [commOutcome, setCommOutcome] = useState<'answered' | 'no_answer' | 'interested' | 'declined' | 'call_later'>('answered');
  const [commComment, setCommComment] = useState('');
  const [commSaving, setCommSaving] = useState(false);
  const [commError, setCommError] = useState<string | null>(null);

  const [showInviteSheet, setShowInviteSheet] = useState(false);
  const [futureEvenings, setFutureEvenings] = useState<GameEvening[]>([]);
  const [selectedEveningId, setSelectedEveningId] = useState('');
  const [eveningTables, setEveningTables] = useState<EveningTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [createFollowupTask, setCreateFollowupTask] = useState(true);
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [confirmDeleteAvatar, setConfirmDeleteAvatar] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadPlayers = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setLoading(true);
    setListError(null);
    try {
      const params: Record<string, string | number | boolean> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (contactStatusFilter) params.contact_status = contactStatusFilter;
      if (lifecycleStatus) params.lifecycle_status = lifecycleStatus;
      if (activeQuickFilter === 'newcomers') params.first_visit_only = true;
      if (activeQuickFilter === 'lapsed') params.inactive_days = 30;
      if (advancedSegment === 'never') params.never_attended = true;
      if (advancedSegment === 'absent60') params.inactive_days = 60;
      if (advancedSegment === 'open_tasks') params.has_open_tasks = true;
      const result = await api.getPlayers(params);
      if (requestId !== requestSeq.current) return;
      setPlayers(result);
    } catch (err: any) {
      if (requestId !== requestSeq.current) return;
      setListError(err?.message || 'Не удалось загрузить игроков');
    } finally {
      if (requestId === requestSeq.current) setLoading(false);
    }
  }, [activeQuickFilter, advancedSegment, contactStatusFilter, debouncedSearch, lifecycleStatus]);

  useEffect(() => { void loadPlayers(); }, [loadPlayers]);

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
  };

  const loadPlayerDetails = async (id: string) => {
    setLoadingDetails(true);
    setDetailError(null);
    try {
      const data = await api.getPlayer(id);
      setPlayerDetails(data);
      initEditForm(data);
    } catch (err: any) {
      setDetailError(err?.message || 'Не удалось загрузить профиль игрока');
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (!selectedPlayerId) return;
    setActivePlayerCardId(selectedPlayerId);
    setPlayerDetails(null);
    setProfileMessage(null);
    setProfileError(null);
    void loadPlayerDetails(selectedPlayerId);
  }, [selectedPlayerId]);

  const handleOpenCard = (id: string) => {
    setActivePlayerCardId(id);
    setPlayerDetails(null);
    setProfileMessage(null);
    setProfileError(null);
    void loadPlayerDetails(id);
  };

  const handleCloseCard = () => {
    setActivePlayerCardId(null);
    setPlayerDetails(null);
    setShowPlayerMenu(false);
    setShowEditSheet(false);
    setShowTaskSheet(false);
    setShowCommSheet(false);
    setShowInviteSheet(false);
    onClosePlayerCard?.();
  };

  const refreshPlayer = async () => {
    if (!activePlayerCardId) return;
    await Promise.all([loadPlayerDetails(activePlayerCardId), loadPlayers()]);
    onCrmChanged?.();
  };

  const visiblePlayers = useMemo(() => {
    if (activeQuickFilter !== 'attention') return players;
    return players.filter((player) =>
      Number(player.open_tasks_count || 0) > 0 ||
      player.contact_status !== 'normal' ||
      (player.days_since_last_visit !== null && player.days_since_last_visit !== undefined && player.days_since_last_visit >= 30) ||
      Number(player.attendance_count || 0) === 1
    );
  }, [activeQuickFilter, players]);

  const futureSorted = useMemo(() => getSortedFutureEvenings(evenings), [evenings]);
  const nextEvening = futureSorted[0] || null;
  const booking = useMemo(() => {
    if (!playerDetails) return null;
    const futureIds = new Set(futureSorted.map((item) => item.id));
    return (playerDetails.futureBookings || []).find((item) => futureIds.has(item.evening_id) && item.registration_status !== 'cancelled') || null;
  }, [futureSorted, playerDetails]);
  const bookingEvening = booking ? futureSorted.find((item) => item.id === booking.evening_id) || null : null;
  const inviteInfo = playerDetails ? getCanInviteStatus(playerDetails) : { canInvite: false, reason: '' };

  const allGames = useMemo(() => {
    if (!playerDetails) return [];
    return [...(playerDetails.clubGames || []), ...(playerDetails.tournamentGames || [])]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [playerDetails]);

  const unifiedTimeline = useMemo(() => {
    if (!playerDetails) return [];
    const items: Array<{ id: string; date: string | null; title: string; detail: string; kind: string }> = [];
    for (const activity of playerDetails.activities || []) {
      items.push({ id: `activity:${activity.id}`, date: activity.occurred_at || activity.created_at, title: activity.type === 'contact' ? 'Общение' : activity.type === 'invite' ? 'Приглашение' : 'CRM', detail: activity.description || activity.outcome || '', kind: activity.outcome || activity.type });
    }
    for (const evening of playerDetails.eveningHistory || []) {
      items.push({ id: `evening:${evening.id}`, date: (evening as any).evening_date || evening.created_at, title: (evening as any).evening_title || 'Игровой вечер', detail: evening.attendance_status === 'attended' ? 'Посещение' : evening.attendance_status === 'no_show' ? 'Не пришёл' : evening.registration_status === 'cancelled' ? 'Отменил запись' : registrationTimelineLabel(evening.registration_status), kind: 'Вечер' });
    }
    for (const task of playerDetails.tasks || []) {
      items.push({ id: `task:${task.id}`, date: task.completed_at || task.due_at || task.created_at, title: task.title, detail: task.status === 'done' ? 'Задача выполнена' : task.due_at ? `Срок ${fmtDate(task.due_at)}` : 'Задача без срока', kind: 'Задача' });
    }
    for (const game of allGames) {
      items.push({ id: `game:${game.id}`, date: game.date, title: `${game.source === 'tournament' ? 'Турнир' : 'Клуб'} · игра №${game.game_number}`, detail: game.won === true ? 'Победа' : game.won === false ? 'Поражение' : 'Игра', kind: 'Игра' });
    }
    return items.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [allGames, playerDetails]);

  const handlePrimaryAction = async () => {
    if (!playerDetails || primaryBusy) return;
    setPrimaryBusy(true);
    setProfileError(null);
    setProfileMessage(null);
    try {
      if (booking) {
        if (booking.registration_status === 'registered' || booking.registration_status === 'invited') {
          await api.updateParticipant(booking.id, { registration_status: 'confirmed' });
          setProfileMessage('Участие подтверждено');
          await refreshPlayer();
        } else if (bookingEvening) {
          setActivePlayerCardId(null);
          setPlayerDetails(null);
          onOpenEvening(bookingEvening.id);
        }
      } else if (inviteInfo.canInvite && nextEvening) {
        const result = await api.invitePlayer(playerDetails.id, nextEvening.id, null, true);
        setProfileMessage(result.message || 'Игрок добавлен в приглашения ближайшего вечера');
        await refreshPlayer();
      }
    } catch (err: any) {
      setProfileError(err?.message || 'Не удалось выполнить действие');
    } finally {
      setPrimaryBusy(false);
    }
  };

  const handleCreatePlayer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newNickname.trim() || addSaving) return;
    setAddSaving(true);
    setAddError(null);
    try {
      const created = await api.createPlayer({
        nickname: newNickname.trim(),
        full_name: newFullName.trim() || null,
        phone: newPhone.trim() || null,
        telegram_username: newTgUsername.trim().replace('@', '') || null,
        source: 'manual',
        contact_status: 'normal',
      });
      setShowAddModal(false);
      setNewNickname(''); setNewFullName(''); setNewPhone(''); setNewTgUsername('');
      await loadPlayers();
      handleOpenCard(created.id);
    } catch (err: any) {
      setAddError(err?.message || 'Не удалось создать игрока');
    } finally {
      setAddSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!playerDetails || !editForm.nickname.trim() || editSaving) return;
    setEditSaving(true);
    setEditError(null);
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
      setShowEditSheet(false);
      setProfileMessage('Данные игрока обновлены');
      await refreshPlayer();
    } catch (err: any) {
      setEditError(err?.message || 'Не удалось сохранить данные');
    } finally {
      setEditSaving(false);
    }
  };

  const handleCreateTask = async () => {
    if (!playerDetails || !taskTitle.trim() || taskSaving) return;
    setTaskSaving(true);
    setTaskError(null);
    try {
      await api.createTask({ title: taskTitle.trim(), player_id: playerDetails.id, due_at: taskDueAt ? new Date(taskDueAt).toISOString() : null, priority: 'medium' });
      setTaskTitle(''); setTaskDueAt(''); setShowTaskSheet(false);
      setProfileMessage('Задача создана');
      await refreshPlayer();
    } catch (err: any) {
      setTaskError(err?.message || 'Не удалось создать задачу');
    } finally {
      setTaskSaving(false);
    }
  };

  const handleRecordCommunication = async () => {
    if (!playerDetails || commSaving) return;
    setCommSaving(true);
    setCommError(null);
    try {
      await api.recordCommunicationOutcome(playerDetails.id, { channel: commChannel, outcome: commOutcome, comment: commComment.trim() || undefined });
      setCommComment(''); setShowCommSheet(false);
      setProfileMessage('Результат общения сохранён');
      await refreshPlayer();
    } catch (err: any) {
      setCommError(err?.message || 'Не удалось сохранить результат общения');
    } finally {
      setCommSaving(false);
    }
  };

  const updateInviteMessage = (player: PlayerDetails, evening: GameEvening, table: EveningTable | null) => {
    const when = formatEveningDateTime(evening.starts_at, evening.timezone);
    const tableName = table?.name || 'без предварительного стола';
    const price = table?.default_price ?? evening.default_price ?? 0;
    setInviteMessage(`Привет, ${player.nickname}! 👋\nПриглашаем тебя на «${evening.title}».\n\n📅 ${when}\n📍 ${evening.venue || 'Клуб'}\n🪑 ${tableName}\n💰 ${price > 0 ? `${price} ₽` : 'Бесплатно'}\n\nЖдём тебя на игре!`);
  };

  const openInviteSheet = async () => {
    if (!playerDetails) return;
    setShowPlayerMenu(false);
    setShowInviteSheet(true);
    setInviteLoading(true);
    setInviteError(null);
    try {
      const future = getSortedFutureEvenings(await api.getEvenings());
      setFutureEvenings(future);
      const first = future[0];
      if (first) {
        setSelectedEveningId(first.id);
        const tables = await api.getEveningTables(first.id);
        setEveningTables(tables);
        setSelectedTableId('');
        updateInviteMessage(playerDetails, first, null);
      } else {
        setSelectedEveningId(''); setEveningTables([]); setInviteMessage('');
      }
    } catch (err: any) {
      setInviteError(err?.message || 'Не удалось загрузить будущие вечера');
    } finally {
      setInviteLoading(false);
    }
  };

  const selectInviteEvening = async (id: string) => {
    setSelectedEveningId(id); setSelectedTableId(''); setInviteError(null);
    const evening = futureEvenings.find((item) => item.id === id);
    if (!evening || !playerDetails) return;
    try {
      const tables = await api.getEveningTables(id);
      setEveningTables(tables);
      updateInviteMessage(playerDetails, evening, null);
    } catch (err: any) {
      setInviteError(err?.message || 'Не удалось загрузить столы');
    }
  };

  const selectInviteTable = (id: string) => {
    setSelectedTableId(id);
    const evening = futureEvenings.find((item) => item.id === selectedEveningId);
    const table = eveningTables.find((item) => item.id === id) || null;
    if (evening && playerDetails) updateInviteMessage(playerDetails, evening, table);
  };

  const sendDetailedInvite = async () => {
    if (!playerDetails || !selectedEveningId || inviteSaving) return;
    setInviteSaving(true); setInviteError(null);
    try {
      const result = await api.invitePlayer(playerDetails.id, selectedEveningId, selectedTableId || null, createFollowupTask);
      setProfileMessage(result.message || 'Приглашение сохранено');
      setShowInviteSheet(false);
      await refreshPlayer();
    } catch (err: any) {
      setInviteError(err?.message || 'Не удалось сохранить приглашение');
    } finally {
      setInviteSaving(false);
    }
  };

  const handleAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !playerDetails) return;
    setAvatarBusy(true); setProfileError(null); setShowPlayerMenu(false);
    try {
      const prepared = await preparePlayerAvatar(file);
      await api.uploadPlayerAvatar(playerDetails.id, prepared);
      setProfileMessage('Фото обновлено');
      await refreshPlayer();
    } catch (err: any) {
      setProfileError(err?.message || 'Не удалось загрузить фото');
    } finally {
      setAvatarBusy(false);
      event.target.value = '';
    }
  };

  const deleteAvatar = async () => {
    if (!playerDetails) return;
    setAvatarBusy(true);
    try {
      await api.deletePlayerAvatar(playerDetails.id);
      setConfirmDeleteAvatar(false);
      setProfileMessage('Фото удалено');
      await refreshPlayer();
    } catch (err: any) {
      setProfileError(err?.message || 'Не удалось удалить фото');
      setConfirmDeleteAvatar(false);
    } finally {
      setAvatarBusy(false);
    }
  };

  const primaryLabel = booking
    ? (booking.registration_status === 'registered' || booking.registration_status === 'invited' ? 'Получить подтверждение' : 'Открыть в вечере')
    : inviteInfo.canInvite && nextEvening
      ? 'Пригласить на ближайший вечер'
      : 'Приглашение недоступно';

  const nextTask = playerDetails?.nextTask || null;
  const contactHref = playerDetails?.telegram_username
    ? `https://t.me/${playerDetails.telegram_username.replace('@', '')}`
    : playerDetails?.phone
      ? `tel:${playerDetails.phone}`
      : undefined;

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[24px] font-black tracking-tight text-text-primary">Игроки</h2>
          <p className="mt-1 text-[13px] text-text-secondary">Найди человека и сразу переходи к следующему действию.</p>
        </div>
        <button type="button" onClick={() => { setAddError(null); setShowAddModal(true); }} className="inline-flex min-h-[44px] items-center gap-2 rounded-[12px] bg-accent px-3.5 text-[13px] font-bold text-white"><Plus className="h-4 w-4" /> Добавить</button>
      </div>

      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ник, имя, телефон или Telegram" className="mobile-field pl-10" /></label>
        <button type="button" onClick={() => setShowFilters(true)} className={`grid h-12 w-12 shrink-0 place-items-center rounded-[13px] border ${contactStatusFilter || lifecycleStatus || advancedSegment ? 'border-accent bg-accent-soft text-accent' : 'border-border-soft bg-surface-1 text-text-secondary'}`} aria-label="Фильтры"><Filter className="h-5 w-5" /></button>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-1"><div className="flex w-max min-w-full gap-2">
        {QUICK_FILTERS.map((item) => <button key={item.id} type="button" onClick={() => setActiveQuickFilter(item.id)} className={`min-h-[44px] whitespace-nowrap rounded-full border px-4 text-[12px] font-semibold ${activeQuickFilter === item.id ? 'border-accent bg-accent-soft text-text-primary' : 'border-border-soft bg-surface-1 text-text-secondary'}`}>{item.label}</button>)}
      </div></div>

      {listError ? <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger"><AlertCircle className="mr-1 inline h-4 w-4" /> {listError}<button type="button" onClick={() => void loadPlayers()} className="ml-2 font-bold underline">Повторить</button></div> : null}

      {loading ? (
        <div className="py-16 text-center text-[13px] text-text-secondary">Загрузка игроков…</div>
      ) : visiblePlayers.length === 0 ? (
        <div className="rounded-[18px] border border-border-soft bg-surface-1 py-14 text-center"><UserRound className="mx-auto h-8 w-8 text-text-muted" /><p className="mt-3 text-[14px] font-semibold text-text-primary">Игроки не найдены</p></div>
      ) : (
        <div className="overflow-hidden rounded-[18px] border border-border-soft bg-surface-1">
          {visiblePlayers.map((player, index) => {
            const lastVisit = player.days_since_last_visit !== null && player.days_since_last_visit !== undefined ? `Был ${player.days_since_last_visit} дн. назад` : 'Ещё не был';
            const nextStep = Number(player.open_tasks_count || 0) > 0 ? `Задач: ${player.open_tasks_count}` : getCanInviteStatus(player).canInvite ? 'Можно пригласить' : getCanInviteStatus(player).reason;
            return (
              <button key={player.id} type="button" onClick={() => handleOpenCard(player.id)} className={`flex min-h-[72px] w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-hover ${index ? 'border-t border-border-soft' : ''}`}>
                <PlayerAvatar playerId={player.id} avatarVersion={player.avatar_updated_at} nickname={player.nickname} size="md" />
                <span className="min-w-0 flex-1">
                  <strong className="block break-words text-[14px] font-bold leading-5 text-text-primary">{player.nickname}</strong>
                  {player.full_name ? <span className="mt-0.5 block truncate text-[11px] text-text-secondary">{player.full_name}</span> : null}
                  <span className="mt-1 block text-[11px] text-text-muted">{lastVisit} · {nextStep}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" />
              </button>
            );
          })}
        </div>
      )}

      <MobileSheet open={Boolean(activePlayerCardId)} onClose={handleCloseCard} title={playerDetails ? (
        <div className="flex min-w-0 items-center gap-2.5"><PlayerAvatar playerId={playerDetails.id} avatarVersion={playerDetails.avatar_updated_at} nickname={playerDetails.nickname} size="sm" /><div className="min-w-0"><div className="break-words text-[15px] font-bold text-text-primary">{playerDetails.nickname}</div>{playerDetails.full_name ? <div className="truncate text-[11px] text-text-secondary">{playerDetails.full_name}</div> : null}</div></div>
      ) : 'Профиль игрока'} subtitle={playerDetails ? `${getRussianContactStatusLabel(playerDetails.contact_status)} · ${getRussianEngagementStageLabel(playerDetails.engagement_stage || playerDetails.calculated_stage)}` : 'Загрузка'} widthClass="sm:max-w-2xl" bodyClassName="p-0">
        {loadingDetails ? <div className="py-20 text-center text-[13px] text-text-secondary">Загрузка профиля…</div> : detailError ? (
          <div className="p-4"><div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{detailError}<button type="button" onClick={() => activePlayerCardId && void loadPlayerDetails(activePlayerCardId)} className="ml-2 font-bold underline">Повторить</button></div></div>
        ) : playerDetails ? (
          <div className="space-y-5 p-3.5 sm:p-4">
            {profileError ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{profileError}</div> : null}
            {profileMessage ? <div className="rounded-[13px] border border-success/30 bg-success-soft p-3 text-[12px] text-success">{profileMessage}</div> : null}

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <button type="button" disabled={primaryBusy || (!booking && (!inviteInfo.canInvite || !nextEvening))} onClick={() => void handlePrimaryAction()} className="min-h-[50px] min-w-0 flex-1 rounded-[13px] bg-accent px-3 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">{primaryBusy ? '…' : primaryLabel}</button>
                <button type="button" onClick={() => setShowPlayerMenu(true)} className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-[13px] border border-border-soft bg-surface-2 text-text-secondary" aria-label="Ещё действия"><MoreHorizontal className="h-5 w-5" /></button>
              </div>
              {!booking && (!inviteInfo.canInvite || !nextEvening) ? <p className="text-[11px] leading-4 text-warning">{!nextEvening ? 'Нет ближайшего вечера для приглашения.' : inviteInfo.reason}</p> : null}
              {contactHref ? <a href={contactHref} target={playerDetails.telegram_username ? '_blank' : undefined} rel="noreferrer" className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-border-soft bg-surface-1 text-[12px] font-bold text-text-primary"><MessageSquare className="h-4 w-4 text-accent" /> Связаться</a> : null}
            </section>

            <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[17px] border border-border-soft bg-surface-1 p-3.5 sm:grid-cols-4">
              {[
                ['Последний визит', playerDetails.last_visit ? fmtDate(playerDetails.last_visit) : 'Не был'],
                ['Игры', playerDetails.gameStats?.totalGames || 0],
                ['Победы', playerDetails.gameStats?.wins || 0],
                ['Следующее', bookingEvening ? fmtDate(bookingEvening.starts_at, true) : nextTask ? fmtDate(nextTask.due_at || nextTask.created_at, true) : 'Нет'],
              ].map(([label, value]) => <div key={String(label)} className="min-w-0"><span className="block text-[10px] font-medium text-text-muted">{label}</span><strong className="mt-1 block break-words text-[13px] font-bold text-text-primary">{value}</strong></div>)}
            </section>

            <section className="space-y-2 rounded-[17px] border border-border-soft bg-surface-1 p-3.5">
              <div className="flex items-center justify-between gap-3"><span className="text-[12px] text-text-secondary">Статус</span><strong className={`text-[12px] ${statusTone(playerDetails.contact_status)}`}>{getRussianContactStatusLabel(playerDetails.contact_status)}</strong></div>
              <div className="flex items-start justify-between gap-3"><span className="text-[12px] text-text-secondary">Контакт</span><strong className="text-right text-[12px] text-text-primary">{playerDetails.telegram_username ? `@${playerDetails.telegram_username.replace('@', '')}` : playerDetails.phone || 'Не указан'}</strong></div>
              {playerDetails.notes ? <div className="border-t border-border-soft pt-2"><span className="text-[11px] text-text-muted">Важная заметка</span><p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-text-primary">{playerDetails.notes}</p></div> : null}
              {playerDetails.do_not_invite_until ? <div className="rounded-[11px] bg-warning-soft p-2.5 text-[11px] text-warning">Не приглашать до {fmtDate(playerDetails.do_not_invite_until)}{playerDetails.pause_reason ? ` · ${playerDetails.pause_reason}` : ''}</div> : null}
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-2"><History className="h-4 w-4 text-accent" /><h3 className="text-[14px] font-black text-text-primary">История</h3></div>
              <div className="overflow-hidden rounded-[17px] border border-border-soft bg-surface-1">
                {unifiedTimeline.slice(0, 10).map((item, index) => <div key={item.id} className={`${index ? 'border-t border-border-soft' : ''} px-3.5 py-3`}><div className="flex items-baseline justify-between gap-3"><strong className="min-w-0 break-words text-[12px] text-text-primary">{item.title}</strong><span className="shrink-0 text-[10px] text-text-muted">{fmtDate(item.date)}</span></div><p className="mt-0.5 text-[11px] leading-4 text-text-secondary">{item.detail || item.kind}</p></div>)}
                {unifiedTimeline.length === 0 ? <div className="py-8 text-center text-[12px] text-text-muted">История пока пустая</div> : null}
              </div>
            </section>

            <details className="group rounded-[17px] border border-border-soft bg-surface-1">
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2 px-3.5 text-[13px] font-bold text-text-primary"><ChevronDown className="h-4 w-4 text-text-muted transition-transform group-open:rotate-180" /> Игры и статистика <span className="ml-auto text-[11px] font-medium text-text-muted">{allGames.length}</span></summary>
              <div className="space-y-2 border-t border-border-soft p-3">{allGames.length ? allGames.map((game) => <PlayerGameCard key={game.id} game={game} />) : <div className="py-6 text-center text-[12px] text-text-muted">Игр пока нет</div>}</div>
            </details>

            <details className="group rounded-[17px] border border-border-soft bg-surface-1">
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2 px-3.5 text-[13px] font-bold text-text-primary"><Award className="h-4 w-4 text-warning" /> Турнирные места и награды <ChevronDown className="ml-auto h-4 w-4 text-text-muted transition-transform group-open:rotate-180" /></summary>
              <div className="border-t border-border-soft p-3"><PlayerProfileContent player={playerDetails} /></div>
            </details>

            <details className="group rounded-[17px] border border-border-soft bg-surface-1">
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2 px-3.5 text-[13px] font-bold text-text-primary"><ChevronDown className="h-4 w-4 text-text-muted transition-transform group-open:rotate-180" /> Полные данные CRM</summary>
              <div className="space-y-3 border-t border-border-soft p-3 text-[12px]">
                {[
                  ['Телефон', playerDetails.phone || '—'],
                  ['Telegram', playerDetails.telegram_username ? `@${playerDetails.telegram_username.replace('@', '')}` : '—'],
                  ['Источник', playerDetails.source || '—'],
                  ['Предпочтительный формат', playerDetails.preferred_format || '—'],
                  ['Кто пригласил', playerDetails.referred_by || '—'],
                  ['Посещений', playerDetails.attendance_count ?? playerDetails.stats?.attendanceCount ?? 0],
                  ['No-show', playerDetails.no_show_count || 0],
                  ['Открытых задач', playerDetails.tasks?.filter((task) => !['done', 'cancelled'].includes(task.status)).length || 0],
                ].map(([label, value]) => <div key={String(label)} className="flex items-start justify-between gap-3"><span className="text-text-muted">{label}</span><strong className="max-w-[62%] break-words text-right text-text-primary">{value}</strong></div>)}
              </div>
            </details>
          </div>
        ) : null}
      </MobileSheet>

      <MobileSheet open={showFilters} onClose={() => setShowFilters(false)} title="Фильтры игроков" subtitle="Точные сегменты сохранены, но не занимают основной экран." widthClass="sm:max-w-md">
        <div className="space-y-4">
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Контакт</span><select value={contactStatusFilter} onChange={(event) => setContactStatusFilter(event.target.value)} className="mobile-field"><option value="">Все статусы</option><option value="normal">Можно связываться</option><option value="paused">На паузе</option><option value="blocked">Заблокирован</option></select></label>
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Вовлечённость</span><select value={lifecycleStatus} onChange={(event) => setLifecycleStatus(event.target.value)} className="mobile-field"><option value="">Все этапы</option><option value="lead">Лид</option><option value="newcomer">Новичок</option><option value="returning">Вернувшийся</option><option value="regular">Постоянный</option><option value="inactive">Неактивный</option></select></label>
          <div><span className="mb-2 block text-[11px] font-semibold text-text-secondary">Дополнительно</span><div className="grid grid-cols-2 gap-2">{([['', 'Без уточнения'], ['never', 'Не приходили'], ['absent60', '60+ дней'], ['open_tasks', 'Есть задачи']] as Array<[AdvancedSegment, string]>).map(([id, label]) => <button key={id || 'all'} type="button" onClick={() => setAdvancedSegment(id)} className={`min-h-[44px] rounded-[11px] border px-3 text-[12px] font-semibold ${advancedSegment === id ? 'border-accent bg-accent-soft text-text-primary' : 'border-border-soft bg-surface-2 text-text-secondary'}`}>{label}</button>)}</div></div>
          <button type="button" onClick={() => { setContactStatusFilter(''); setLifecycleStatus(''); setAdvancedSegment(''); }} className="min-h-[44px] w-full rounded-[12px] border border-border-soft bg-surface-2 text-[12px] font-bold text-text-secondary">Сбросить фильтры</button>
        </div>
      </MobileSheet>

      <MobileSheet open={showAddModal} onClose={() => setShowAddModal(false)} title="Новый игрок" subtitle="Для начала достаточно никнейма. Остальное можно заполнить позже." widthClass="sm:max-w-md" footer={<button type="submit" form="new-player-form" disabled={!newNickname.trim() || addSaving} className="min-h-[48px] w-full rounded-[13px] bg-accent text-[13px] font-bold text-white disabled:opacity-40">{addSaving ? 'Сохраняем…' : 'Добавить игрока'}</button>}>
        <form id="new-player-form" onSubmit={handleCreatePlayer} className="space-y-3">{addError ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{addError}</div> : null}<input value={newNickname} onChange={(event) => setNewNickname(event.target.value)} placeholder="Никнейм *" className="mobile-field" /><input value={newFullName} onChange={(event) => setNewFullName(event.target.value)} placeholder="Имя — необязательно" className="mobile-field" /><input value={newTgUsername} onChange={(event) => setNewTgUsername(event.target.value)} placeholder="Telegram" className="mobile-field" /><input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="Телефон" className="mobile-field" /></form>
      </MobileSheet>

      <input id="player-avatar-file" type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />

      <MobileSheet open={showPlayerMenu} onClose={() => setShowPlayerMenu(false)} title="Действия с игроком" widthClass="sm:max-w-sm">
        <div className="space-y-2">
          <MenuButton icon={Edit3} label="Редактировать данные" onClick={() => { setShowPlayerMenu(false); setEditError(null); setShowEditSheet(true); }} />
          <MenuButton icon={ImagePlus} label={playerDetails?.avatar_updated_at ? 'Заменить фото' : 'Добавить фото'} onClick={() => document.getElementById('player-avatar-file')?.click()} disabled={avatarBusy} />
          <MenuButton icon={Clock3} label="Создать задачу" onClick={() => { setShowPlayerMenu(false); setTaskError(null); setShowTaskSheet(true); }} />
          <MenuButton icon={MessageSquare} label="Записать результат общения" onClick={() => { setShowPlayerMenu(false); setCommError(null); setShowCommSheet(true); }} />
          <MenuButton icon={Send} label="Пригласить на другой вечер" onClick={() => void openInviteSheet()} disabled={!inviteInfo.canInvite} />
          {playerDetails?.avatar_updated_at ? <MenuButton icon={Trash2} label="Удалить фото" tone="danger" onClick={() => { setShowPlayerMenu(false); setConfirmDeleteAvatar(true); }} disabled={avatarBusy} /> : null}
        </div>
      </MobileSheet>

      <MobileSheet open={showEditSheet} onClose={() => setShowEditSheet(false)} title="Редактировать игрока" widthClass="sm:max-w-lg" footer={<button type="button" disabled={editSaving || !editForm.nickname.trim()} onClick={() => void handleSaveEdit()} className="min-h-[48px] w-full rounded-[13px] bg-accent text-[13px] font-bold text-white disabled:opacity-40">{editSaving ? 'Сохраняем…' : 'Сохранить'}</button>}>
        <div className="space-y-3">{editError ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{editError}</div> : null}<input value={editForm.nickname} onChange={(e) => setEditForm((v) => ({ ...v, nickname: e.target.value }))} placeholder="Никнейм" className="mobile-field" /><input value={editForm.full_name} onChange={(e) => setEditForm((v) => ({ ...v, full_name: e.target.value }))} placeholder="Имя" className="mobile-field" /><input value={editForm.telegram_username} onChange={(e) => setEditForm((v) => ({ ...v, telegram_username: e.target.value }))} placeholder="Telegram" className="mobile-field" /><input value={editForm.phone} onChange={(e) => setEditForm((v) => ({ ...v, phone: e.target.value }))} placeholder="Телефон" className="mobile-field" /><select value={editForm.contact_status} onChange={(e) => setEditForm((v) => ({ ...v, contact_status: e.target.value as ContactStatus }))} className="mobile-field"><option value="normal">Можно связываться</option><option value="paused">На паузе</option><option value="blocked">Заблокирован</option></select><input type="date" value={editForm.do_not_invite_until} onChange={(e) => setEditForm((v) => ({ ...v, do_not_invite_until: e.target.value }))} className="mobile-field" /><input value={editForm.pause_reason} onChange={(e) => setEditForm((v) => ({ ...v, pause_reason: e.target.value }))} placeholder="Причина паузы" className="mobile-field" /><input value={editForm.preferred_format} onChange={(e) => setEditForm((v) => ({ ...v, preferred_format: e.target.value }))} placeholder="Предпочтительный формат" className="mobile-field" /><input value={editForm.referred_by} onChange={(e) => setEditForm((v) => ({ ...v, referred_by: e.target.value }))} placeholder="Кто пригласил" className="mobile-field" /><input value={editForm.source} onChange={(e) => setEditForm((v) => ({ ...v, source: e.target.value }))} placeholder="Источник" className="mobile-field" /><textarea value={editForm.notes} onChange={(e) => setEditForm((v) => ({ ...v, notes: e.target.value }))} placeholder="Заметки" className="mobile-field min-h-[96px] resize-y" /></div>
      </MobileSheet>

      <MobileSheet open={showTaskSheet} onClose={() => setShowTaskSheet(false)} title="Новая задача" widthClass="sm:max-w-md" footer={<button type="button" disabled={!taskTitle.trim() || taskSaving} onClick={() => void handleCreateTask()} className="min-h-[48px] w-full rounded-[13px] bg-accent text-[13px] font-bold text-white disabled:opacity-40">{taskSaving ? 'Создаём…' : 'Создать задачу'}</button>}>
        <div className="space-y-3">{taskError ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{taskError}</div> : null}<input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Что сделать" className="mobile-field" /><input type="datetime-local" value={taskDueAt} onChange={(e) => setTaskDueAt(e.target.value)} className="mobile-field" /></div>
      </MobileSheet>

      <MobileSheet open={showCommSheet} onClose={() => setShowCommSheet(false)} title="Результат общения" widthClass="sm:max-w-md" footer={<button type="button" disabled={commSaving} onClick={() => void handleRecordCommunication()} className="min-h-[48px] w-full rounded-[13px] bg-accent text-[13px] font-bold text-white disabled:opacity-40">{commSaving ? 'Сохраняем…' : 'Сохранить'}</button>}>
        <div className="space-y-3">{commError ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{commError}</div> : null}<select value={commChannel} onChange={(e) => setCommChannel(e.target.value as typeof commChannel)} className="mobile-field"><option value="telegram">Telegram</option><option value="phone">Телефон</option><option value="in_person">Лично</option><option value="other">Другое</option></select><select value={commOutcome} onChange={(e) => setCommOutcome(e.target.value as typeof commOutcome)} className="mobile-field"><option value="answered">Ответил</option><option value="no_answer">Не ответил</option><option value="interested">Заинтересован</option><option value="declined">Отказался</option><option value="call_later">Связаться позже</option></select><textarea value={commComment} onChange={(e) => setCommComment(e.target.value)} placeholder="Комментарий — необязательно" className="mobile-field min-h-[96px] resize-y" /></div>
      </MobileSheet>

      <MobileSheet open={showInviteSheet} onClose={() => setShowInviteSheet(false)} title="Приглашение" subtitle="Подробный сценарий для выбора другого вечера, стола и текста сообщения." widthClass="sm:max-w-lg" footer={<button type="button" disabled={!selectedEveningId || inviteSaving || inviteLoading} onClick={() => void sendDetailedInvite()} className="min-h-[48px] w-full rounded-[13px] bg-accent text-[13px] font-bold text-white disabled:opacity-40">{inviteSaving ? 'Сохраняем…' : 'Добавить приглашение в CRM'}</button>}>
        <div className="space-y-3">{inviteError ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{inviteError}</div> : null}{inviteLoading ? <div className="py-8 text-center text-[12px] text-text-secondary">Загрузка вечеров…</div> : <><select value={selectedEveningId} onChange={(e) => void selectInviteEvening(e.target.value)} className="mobile-field"><option value="">Выберите вечер</option>{futureEvenings.map((evening) => <option key={evening.id} value={evening.id}>{evening.title} · {fmtDate(evening.starts_at, true)}</option>)}</select><select value={selectedTableId} onChange={(e) => selectInviteTable(e.target.value)} className="mobile-field"><option value="">Без предварительного стола</option>{eveningTables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select><label className="flex min-h-[44px] items-center gap-3 rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[12px] text-text-primary"><input type="checkbox" checked={createFollowupTask} onChange={(e) => setCreateFollowupTask(e.target.checked)} /> Создать follow-up задачу</label><textarea value={inviteMessage} onChange={(e) => setInviteMessage(e.target.value)} className="mobile-field min-h-[150px] resize-y" /><button type="button" disabled={!inviteMessage} onClick={async () => { try { await navigator.clipboard.writeText(inviteMessage); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { setInviteError('Не удалось скопировать сообщение'); } }} className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-border-soft bg-surface-2 text-[12px] font-bold text-text-primary"><Copy className="h-4 w-4" /> {copied ? 'Скопировано' : 'Скопировать текст'}</button></>}</div>
      </MobileSheet>

      <ConfirmDialog open={confirmDeleteAvatar} title="Удалить фото игрока?" description="Будет использоваться инициала никнейма. Остальные данные игрока не изменятся." tone="danger" busy={avatarBusy} confirmLabel="Удалить фото" onCancel={() => setConfirmDeleteAvatar(false)} onConfirm={deleteAvatar} />
    </div>
  );
};

const registrationTimelineLabel = (status: string) => status === 'confirmed' ? 'Подтвердил участие' : status === 'waitlist' ? 'Резерв' : status === 'invited' ? 'Приглашение' : 'Запись на вечер';

const MenuButton: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; disabled?: boolean; tone?: 'default' | 'danger' }> = ({ icon: Icon, label, onClick, disabled, tone = 'default' }) => (
  <button type="button" disabled={disabled} onClick={onClick} className={`inline-flex min-h-[48px] w-full items-center gap-3 rounded-[12px] border px-3 text-left text-[13px] font-semibold disabled:opacity-40 ${tone === 'danger' ? 'border-danger/25 bg-danger-soft text-danger' : 'border-border-soft bg-surface-2 text-text-primary'}`}><Icon className="h-4.5 w-4.5 shrink-0" /> {label}</button>
);

export default PlayersCRM;
