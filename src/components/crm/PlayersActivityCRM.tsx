import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronRight, Filter, Plus, Search, UserRound } from 'lucide-react';
import { api, type GameEvening, type Player } from '../../lib/api.ts';
import { getRussianEngagementStageLabel } from '../../lib/playerUtils.ts';
import { getPlayerActivitySegment, sortPlayersForActivity } from '../../lib/playerActivitySegments.ts';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';
import { PlayersCRM } from './PlayersCRM.tsx';

type QuickFilter = 'active' | 'loyal' | 'attention' | 'lapsed' | 'all';
type AdvancedSegment = '' | 'never' | 'absent60' | 'open_tasks';

const QUICK_FILTERS: Array<{ id: QuickFilter; label: string }> = [
  { id: 'active', label: 'Активные' },
  { id: 'loyal', label: 'Лояльные' },
  { id: 'attention', label: 'Внимание' },
  { id: 'lapsed', label: 'Давно не были' },
  { id: 'all', label: 'Вся база' },
];

interface PlayersActivityCRMProps {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  selectedPlayerId?: string | null;
  onClosePlayerCard?: () => void;
  onCrmChanged?: () => void;
}

const uniquePlayers = (groups: Player[][]): Player[] => {
  const byId = new Map<string, Player>();
  for (const group of groups) for (const player of group) byId.set(player.id, player);
  return [...byId.values()];
};

const playerSegmentLabel = (player: Player) => {
  const segment = getPlayerActivitySegment(player);
  if (segment === 'loyal') return 'Лояльный';
  if (segment === 'active') return getRussianEngagementStageLabel(player.engagement_stage);
  if (segment === 'inactive') return 'Неактивный';
  return 'База';
};

export const PlayersActivityCRM: React.FC<PlayersActivityCRMProps> = ({
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
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilter>('active');
  const [showFilters, setShowFilters] = useState(false);
  const [contactStatusFilter, setContactStatusFilter] = useState('');
  const [lifecycleStatus, setLifecycleStatus] = useState('');
  const [advancedSegment, setAdvancedSegment] = useState<AdvancedSegment>('');
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTgUsername, setNewTgUsername] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const buildParams = useCallback((stage?: string) => {
    const params: Record<string, string | number | boolean> = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (contactStatusFilter) params.contact_status = contactStatusFilter;
    if (stage) params.lifecycle_status = stage;
    else if (lifecycleStatus) params.lifecycle_status = lifecycleStatus;
    if (advancedSegment === 'never') params.never_attended = true;
    if (advancedSegment === 'absent60') params.inactive_days = 60;
    if (advancedSegment === 'open_tasks') params.has_open_tasks = true;
    return params;
  }, [advancedSegment, contactStatusFilter, debouncedSearch, lifecycleStatus]);

  const loadPlayers = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setLoading(true);
    setListError(null);
    try {
      let result: Player[];
      if (lifecycleStatus) {
        result = await api.getPlayers(buildParams());
      } else if (activeQuickFilter === 'active' || activeQuickFilter === 'attention') {
        result = uniquePlayers(await Promise.all([
          api.getPlayers(buildParams('newcomer')),
          api.getPlayers(buildParams('returning')),
          api.getPlayers(buildParams('regular')),
        ]));
      } else if (activeQuickFilter === 'loyal') {
        result = await api.getPlayers(buildParams('regular'));
      } else if (activeQuickFilter === 'lapsed') {
        result = await api.getPlayers(buildParams('inactive'));
      } else {
        result = await api.getPlayers(buildParams());
      }
      if (requestId !== requestSeq.current) return;
      if (activeQuickFilter === 'attention' && !lifecycleStatus) {
        result = result.filter((player) =>
          Number(player.open_tasks_count || 0) > 0 ||
          player.contact_status !== 'normal' ||
          Number(player.outstanding_debt || 0) > 0 ||
          Number(player.attendance_count || 0) === 1 ||
          (player.days_since_last_visit != null && player.days_since_last_visit >= 30)
        );
      }
      setPlayers(sortPlayersForActivity(result));
    } catch (error: any) {
      if (requestId !== requestSeq.current) return;
      setListError(error?.message || 'Не удалось загрузить игроков');
    } finally {
      if (requestId === requestSeq.current) setLoading(false);
    }
  }, [activeQuickFilter, buildParams, lifecycleStatus]);

  useEffect(() => { void loadPlayers(); }, [loadPlayers]);

  const selectedCardPlayerId = selectedPlayerId || localPlayerId;
  const activeFilterCount = Number(Boolean(contactStatusFilter)) + Number(Boolean(lifecycleStatus)) + Number(Boolean(advancedSegment));
  const segmentCaption = useMemo(() => {
    if (lifecycleStatus) return getRussianEngagementStageLabel(lifecycleStatus);
    if (activeQuickFilter === 'active') return 'играют сейчас';
    if (activeQuickFilter === 'loyal') return 'самые постоянные';
    if (activeQuickFilter === 'attention') return 'нужно внимание';
    if (activeQuickFilter === 'lapsed') return 'нужно вернуть';
    return 'вся история';
  }, [activeQuickFilter, lifecycleStatus]);

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
      setNewNickname('');
      setNewFullName('');
      setNewPhone('');
      setNewTgUsername('');
      setLocalPlayerId(created.id);
      onCrmChanged?.();
    } catch (error: any) {
      setAddError(error?.message || 'Не удалось создать игрока');
    } finally {
      setAddSaving(false);
    }
  };

  const handleCardClose = () => {
    setLocalPlayerId(null);
    onClosePlayerCard?.();
  };

  return (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[21px] font-semibold tracking-tight text-text-primary sm:text-[24px]">Игроки</h2>
          <p className="mt-0.5 text-[11px] text-text-muted sm:text-[13px] sm:text-text-secondary">{loading ? 'Загружаем список…' : `${players.length} человек · ${segmentCaption}`}</p>
        </div>
        <button type="button" onClick={() => { setAddError(null); setShowAddModal(true); }} className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[12px] bg-white px-3 text-[12px] font-semibold text-[#090a0d]"><Plus className="h-4 w-4" /> Добавить</button>
      </div>

      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ник, имя, телефон или Telegram" className="mobile-field pl-10" /></label>
        <button type="button" onClick={() => setShowFilters(true)} className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-[13px] border ${activeFilterCount ? 'border-accent bg-accent-soft text-accent' : 'border-border-soft bg-surface-1 text-text-secondary'}`} aria-label="Фильтры"><Filter className="h-5 w-5" />{activeFilterCount ? <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">{activeFilterCount}</span> : null}</button>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-1"><div className="flex w-max min-w-full gap-2">{QUICK_FILTERS.map((item) => <button key={item.id} type="button" onClick={() => setActiveQuickFilter(item.id)} className={`min-h-[44px] whitespace-nowrap rounded-full border px-4 text-[12px] font-semibold ${activeQuickFilter === item.id ? 'border-white/16 bg-white/[0.09] text-text-primary' : 'border-border-soft bg-surface-1 text-text-secondary'}`}>{item.label}</button>)}</div></div>

      {listError ? <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger"><AlertCircle className="mr-1 inline h-4 w-4" /> {listError}<button type="button" onClick={() => void loadPlayers()} className="ml-2 font-bold underline">Повторить</button></div> : null}

      {loading ? <div className="py-16 text-center text-[13px] text-text-secondary">Загрузка игроков…</div> : players.length === 0 ? (
        <div className="rounded-[18px] border border-border-soft bg-surface-1 py-14 text-center"><UserRound className="mx-auto h-8 w-8 text-text-muted" /><p className="mt-3 text-[14px] font-semibold text-text-primary">В этом сегменте игроков нет</p></div>
      ) : (
        <div data-testid="crm-active-player-list" className="overflow-hidden rounded-[18px] border border-border-soft bg-surface-1">
          {players.map((player, index) => {
            const visits = Number(player.attendance_count || 0);
            const visitText = player.days_since_last_visit == null ? 'Нет визитов' : player.days_since_last_visit === 0 ? 'Был сегодня' : `Был ${player.days_since_last_visit} дн. назад`;
            const taskText = Number(player.open_tasks_count || 0) > 0 ? ` · задач ${player.open_tasks_count}` : '';
            const segment = getPlayerActivitySegment(player);
            return <button key={player.id} type="button" onClick={() => setLocalPlayerId(player.id)} className={`flex min-h-[76px] w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors active:bg-surface-hover ${index ? 'border-t border-border-soft' : ''}`}>
              <PlayerAvatar playerId={player.id} avatarVersion={player.avatar_updated_at} nickname={player.nickname} size="md" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2"><strong className="min-w-0 truncate text-[14px] font-semibold leading-5 text-text-primary">{player.nickname}</strong><span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${segment === 'loyal' ? 'bg-success-soft text-success' : segment === 'inactive' ? 'bg-warning-soft text-warning' : 'bg-white/[0.07] text-text-secondary'}`}>{playerSegmentLabel(player)}</span></span>
                {player.full_name ? <span className="mt-0.5 block truncate text-[11px] text-text-secondary">{player.full_name}</span> : null}
                <span className="mt-1 block text-[11px] text-text-muted">{visitText} · визитов {visits}{taskText}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" />
            </button>;
          })}
        </div>
      )}

      <MobileSheet open={showFilters} onClose={() => setShowFilters(false)} title="Фильтры игроков" widthClass="sm:max-w-md">
        <div className="space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Контакт</span><select value={contactStatusFilter} onChange={(event) => setContactStatusFilter(event.target.value)} className="mobile-field"><option value="">Все статусы</option><option value="normal">Можно связываться</option><option value="paused">На паузе</option><option value="blocked">Заблокирован</option></select></label>
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Активность</span><select value={lifecycleStatus} onChange={(event) => setLifecycleStatus(event.target.value)} className="mobile-field"><option value="">По быстрому сегменту</option><option value="newcomer">Новичок</option><option value="returning">Вернувшийся</option><option value="regular">Постоянный</option><option value="inactive">Неактивный</option><option value="lead">Ещё не играл</option></select></label>
          <div><span className="mb-2 block text-[11px] font-semibold text-text-secondary">Дополнительно</span><div className="grid grid-cols-2 gap-2">{([['', 'Без уточнения'], ['never', 'Не приходили'], ['absent60', '60+ дней'], ['open_tasks', 'Есть задачи']] as Array<[AdvancedSegment, string]>).map(([id, label]) => <button key={id || 'all'} type="button" onClick={() => setAdvancedSegment(id)} className={`min-h-[44px] rounded-[11px] border px-3 text-[12px] font-semibold ${advancedSegment === id ? 'border-accent bg-accent-soft text-text-primary' : 'border-border-soft bg-surface-2 text-text-secondary'}`}>{label}</button>)}</div></div>
          <div className="rounded-[12px] border border-border-soft bg-surface-2 p-3 text-[11px] leading-5 text-text-muted">Активные — игроки с визитом за последние 45 дней. Лояльные — постоянные игроки с 4+ посещениями за этот же актуальный период.</div>
          <button type="button" onClick={() => { setContactStatusFilter(''); setLifecycleStatus(''); setAdvancedSegment(''); }} className="min-h-[44px] w-full rounded-[12px] border border-border-soft bg-surface-2 text-[12px] font-bold text-text-secondary">Сбросить точные фильтры</button>
        </div>
      </MobileSheet>

      <MobileSheet open={showAddModal} onClose={() => setShowAddModal(false)} title="Новый игрок" subtitle="Для начала достаточно никнейма. Остальное можно заполнить позже." widthClass="sm:max-w-md" footer={<button type="submit" form="focused-new-player-form" disabled={!newNickname.trim() || addSaving} className="min-h-[48px] w-full rounded-[13px] bg-accent text-[13px] font-bold text-white disabled:opacity-40">{addSaving ? 'Сохраняем…' : 'Добавить игрока'}</button>}>
        <form id="focused-new-player-form" onSubmit={handleCreatePlayer} className="space-y-3">{addError ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{addError}</div> : null}<input value={newNickname} onChange={(event) => setNewNickname(event.target.value)} placeholder="Никнейм *" className="mobile-field" /><input value={newFullName} onChange={(event) => setNewFullName(event.target.value)} placeholder="Имя — необязательно" className="mobile-field" /><input value={newTgUsername} onChange={(event) => setNewTgUsername(event.target.value)} placeholder="Telegram" className="mobile-field" /><input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="Телефон" className="mobile-field" /></form>
      </MobileSheet>

      {selectedCardPlayerId ? <div className="hidden" aria-hidden="true"><PlayersCRM evenings={evenings} onOpenEvening={onOpenEvening} selectedPlayerId={selectedCardPlayerId} onClosePlayerCard={handleCardClose} onCrmChanged={() => { void loadPlayers(); onCrmChanged?.(); }} /></div> : null}
    </div>
  );
};

export default PlayersActivityCRM;
