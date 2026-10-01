import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { api, type Player } from '../../lib/api.ts';
import {
  CLUB_ORGANIZATION, GAME_LEVELS, PLAYER_ACTIVITY, STOPPED_REASON, accessLabel, membershipOfPlayer,
  normalizeClubRole, normalizeGameLevel, organizationOf,
  type ClubOrganization, type GameLevel, type PlayerActivity,
} from '../../lib/playerAccess.ts';
import { HOST_FORMATS, HOST_FORMAT_OPTIONS, hostFormatsOf, hostFormatsSummary, type HostFormat } from '../../lib/hostFormats.ts';
import { useClubOwner } from './useClubOwner.ts';
import { ORGANIZE_FORMATS, ORGANIZE_FORMAT_OPTIONS, normalizeOrganizeFormats, organizeFormatsSummary, type OrganizeFormat } from '../../lib/organizeFormats.ts';
import { CURATOR_AREAS, CURATOR_AREA_OPTIONS, curatorAreasSummary, normalizeCuratorAreas, type CuratorArea } from '../../lib/curatorAreas.ts';

type HostChoice = '' | 'yes' | 'no';

type Row = Player & { organize_formats?: string | null; curator_areas?: string | null; last_visit?: string | null; created_at?: string | null; host_formats?: string | null; game_level?: string | null; club_role?: string | null; judge_level?: string | null; attendance_count?: number | null; contact_status?: string | null; pause_reason?: string | null; stopped_attending?: number | null; from_other_city?: number | null; attends_sometimes?: number | null };

const stopped = (row: Row) => Number(row.stopped_attending || 0) === 1 || (row.contact_status === 'paused' && row.pause_reason === STOPPED_REASON);
const activityOf = (row: Row): PlayerActivity => (stopped(row) ? 'stopped'
  : Number(row.from_other_city || 0) === 1 ? 'other_city'
    : membershipOfPlayer(row) === 'member' ? 'regular' : 'sometimes');
type LevelFilter = GameLevel | 'all';
// Quick filters and sorting (owner, 2026-09-29: find and set up any player fast).
type RoleFilter = 'all' | 'organizer' | 'team' | 'hosts' | 'organizes' | 'curators' | 'regular' | 'sometimes' | 'stopped' | 'other_city';
// Two separate rows (owner, 2026-09-30): how the player comes, and what they do in the club; they combine.
const ACTIVITY_FILTERS: Array<{ value: Exclude<RoleFilter, 'all'>; label: string }> = [
  { value: 'regular', label: 'Ходят постоянно' },
  { value: 'sometimes', label: 'Ходят иногда' },
  { value: 'stopped', label: 'Перестали ходить' },
  { value: 'other_city', label: 'Из других городов' },
];
// «Рассылка на паузе» was removed as a filter (owner, 2026-10-01): it repeated «Перестали ходить».
const ROLE_FILTERS: Array<{ value: Exclude<RoleFilter, 'all'>; label: string }> = [
  { value: 'organizer', label: 'Организаторы' },
  { value: 'team', label: 'Помогают клубу' },
  { value: 'hosts', label: 'Ведут игры' },
  { value: 'organizes', label: 'Проводят вечера' },
  { value: 'curators', label: 'Кураторы' },
];
const pausedOther = (row: Row) => (row.contact_status === 'paused' && row.pause_reason !== STOPPED_REASON) || row.contact_status === 'blocked';
const role = (row: Row) => organizationOf(normalizeClubRole(row.club_role));
const matchesRoleFilter = (row: Row, filter: RoleFilter) => {
  if (filter === 'organizer') return role(row) === 'organizer';
  if (filter === 'team') return role(row) === 'team';
  if (filter === 'hosts') return hostFormatsOf(row).length > 0;
  if (filter === 'organizes') return normalizeOrganizeFormats(row.organize_formats).length > 0;
  if (filter === 'curators') return normalizeCuratorAreas(row.curator_areas).length > 0;
  if (filter === 'regular') return activityOf(row) === 'regular';
  if (filter === 'sometimes') return activityOf(row) === 'sometimes';
  if (filter === 'stopped') return stopped(row);
  if (filter === 'other_city') return activityOf(row) === 'other_city';
  return true;
};
type SortBy = 'name' | 'visits' | 'recent' | 'new';
const SORTS: Array<{ value: SortBy; label: string }> = [
  { value: 'name', label: 'По нику' },
  { value: 'visits', label: 'Больше вечеров' },
  { value: 'recent', label: 'Недавно были' },
  { value: 'new', label: 'Новые сначала' },
];

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" aria-pressed={active} onClick={onClick}
    className={`min-h-9 shrink-0 rounded-full px-3 text-[12px] font-semibold ${active ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.04] text-white/65'}`}>{children}</button>
);

// The editing panel uses tap targets instead of dropdowns (owner, 2026-10-01: «много неудобных полей»).
// A section shows what the marked players have now; only a different pick is a change and gets a ring.
const Section = ({ title, about, children }: { title: string; about?: string; children: ReactNode }) => (
  <section className="rounded-[16px] border border-white/[0.08] bg-white/[0.03] p-3">
    <h4 className="text-[13px] font-semibold text-white">{title}</h4>
    {about ? <p className="mt-0.5 text-[11px] leading-4 text-white/45">{about}</p> : null}
    <div className="mt-2">{children}</div>
  </section>
);

// One answer out of several (level, how often, club role).
const Choice = <T extends string>({ label, value, current, onChange, options }: {
  label: string; value: T | ''; current: T | null; onChange: (value: T | '') => void; options: Array<{ value: T; label: string; hint: string; disabled?: boolean }>;
}) => {
  const shown = value || current || '';
  const hint = shown ? options.find((option) => option.value === shown)?.hint : 'У отмеченных по-разному — останется как было';
  return (
    <div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = shown === option.value;
          const changed = active && Boolean(value) && value !== current;
          return (
            <button key={option.value} type="button" aria-pressed={active} disabled={option.disabled}
              onClick={() => onChange(option.value === current ? '' : option.value)}
              className={`min-h-10 rounded-full px-3 text-[12px] font-semibold transition disabled:opacity-35 ${active ? 'bg-white text-black' : 'border border-white/12 bg-white/[0.04] text-white/70'} ${changed ? 'outline outline-2 outline-offset-2 outline-[#e63261]' : ''}`}>
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-white/45">{current ? null : <span className="font-semibold text-white/60">Сейчас по-разному. </span>}{hint}</p>
    </div>
  );
};

// A yes/no mark as a switch chip: on, off, or «Разное» (dashed) when the marked players differ.
// Tap: from «Разное» to «Может», then «Не может», then back to «как есть».
const Mark = ({ label, ariaLabel, value, current, onChange }: {
  label: string; ariaLabel: string; value: HostChoice; current: 'yes' | 'no' | null; onChange: (value: HostChoice) => void;
}) => {
  const shown = value || current;
  const next = (): HostChoice => {
    if (current === null) return value === '' ? 'yes' : value === 'yes' ? 'no' : '';
    return value ? '' : current === 'yes' ? 'no' : 'yes';
  };
  const changed = Boolean(value) && value !== current;
  return (
    <button type="button" aria-label={ariaLabel} aria-pressed={shown === 'yes' ? true : shown === 'no' ? false : 'mixed'} onClick={() => onChange(next())}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition ${shown === 'yes' ? 'bg-white text-black' : shown === 'no' ? 'border border-white/12 bg-white/[0.04] text-white/55' : 'border border-dashed border-white/30 text-white/60'} ${changed ? 'outline outline-2 outline-offset-2 outline-[#e63261]' : ''}`}>
      <span aria-hidden="true">{shown === 'yes' ? '✓' : shown === 'no' ? '–' : '≈'}</span>{label}
    </button>
  );
};

// Small coloured tags on a player row instead of one long line of text.
const ACTIVITY_TAG: Record<PlayerActivity, string> = {
  regular: 'bg-success-soft text-success', sometimes: 'bg-sky-400/10 text-sky-200', other_city: 'bg-violet-400/10 text-violet-200', stopped: 'bg-white/[0.05] text-text-muted',
};
const Tag = ({ className = 'bg-white/[0.06] text-white/65', children }: { className?: string; children: ReactNode }) => (
  <span className={`inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}>{children}</span>
);

/** The one value every marked player shares, or null when they differ. */
const common = <T,>(values: T[]): T | null => (values.length && values.every((value) => value === values[0]) ? values[0] : null);


/**
 * «Уровни и роли»: go through all players and set the playing level, how often they come, the club role
 * and whether they host games — for many at once. The organizer cabinet access is not here on purpose — it stays a per-player action.
 */
export function PlayerAccessBulkCRM() {
  // Only the owner gives «Организатор клуба» (it opens the cabinet).
  const clubOwner = useClubOwner();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<LevelFilter>('all');
  const [activityFilter, setActivityFilter] = useState<RoleFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  // «Может проводить» (owner only): per kind — add, remove, or leave as is.
  const [organizing, setOrganizing] = useState<Record<OrganizeFormat, HostChoice>>({ NOVICE: '', CASUAL: '', RATING: '', TOURNAMENT: '', CUSTOM: '' });
  const [curating, setCurating] = useState<Record<CuratorArea, HostChoice>>({ NOVICES: '', LEARNING: '', EVENTS: '', TOURNAMENTS: '', DISCIPLINE: '', SMM: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gameLevel, setGameLevel] = useState<GameLevel | ''>('');
  const [activity, setActivity] = useState<PlayerActivity | ''>('');
  const [organization, setOrganization] = useState<ClubOrganization | ''>('');
  // «Может вести»: per evening type — add the mark, remove it, or leave each player as is.
  const [hosting, setHosting] = useState<Record<HostFormat, HostChoice>>({ NOVICE: '', CASUAL: '', RATING: '' });
  const [saving, setSaving] = useState(false);
  // What the server could not change (for example a pause set for another reason), shown until closed.
  const [warnings, setWarnings] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Migrated guest placeholders are not real profiles and cannot be edited.
      setRows((await api.getPlayers() as Row[]).filter((row) => (row as any).source !== 'legacy_guest_migrated'));
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить игроков');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    const matchesRole = (row: Row) => matchesRoleFilter(row, activityFilter) && matchesRoleFilter(row, roleFilter);
    const time = (value?: string | null) => (value ? new Date(value).getTime() || 0 : 0);
    const byName = (a: Row, b: Row) => String(a.nickname || '').localeCompare(String(b.nickname || ''), 'ru');
    return rows
      .filter((row) => (!needle || String(row.nickname || '').toLocaleLowerCase('ru-RU').includes(needle))
        && (level === 'all' || normalizeGameLevel(row.game_level) === level)
        && matchesRole(row))
      .sort((a, b) => {
        if (sortBy === 'visits') return Number(b.attendance_count || 0) - Number(a.attendance_count || 0) || byName(a, b);
        if (sortBy === 'recent') return time(b.last_visit) - time(a.last_visit) || byName(a, b);
        if (sortBy === 'new') return time(b.created_at) - time(a.created_at) || byName(a, b);
        return byName(a, b);
      });
  }, [rows, query, level, activityFilter, roleFilter, sortBy]);

  const counts = useMemo(() => Object.fromEntries(GAME_LEVELS.map((item) => [item.value, rows.filter((row) => normalizeGameLevel(row.game_level) === item.value).length])), [rows]);
  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.has(row.id));
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleVisible = () => setSelected((current) => {
    const next = new Set(current);
    visible.forEach((row) => (allVisibleSelected ? next.delete(row.id) : next.add(row.id)));
    return next;
  });

  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.id)), [rows, selected]);
  const currentLevel = common(selectedRows.map((row) => normalizeGameLevel(row.game_level) as GameLevel));
  const currentActivity = common(selectedRows.map(activityOf));
  const currentOrganization = common(selectedRows.map((row) => organizationOf(normalizeClubRole(row.club_role))));
  const currentHosting = (format: HostFormat) => common(selectedRows.map((row) => (hostFormatsOf(row).includes(format) ? 'yes' as const : 'no' as const)));
  const currentCurating = (area: CuratorArea) => common(selectedRows.map((row) => (normalizeCuratorAreas(row.curator_areas).includes(area) ? 'yes' as const : 'no' as const)));
  const currentOrganizing = (format: OrganizeFormat) => common(selectedRows.map((row) => (normalizeOrganizeFormats(row.organize_formats).includes(format) ? 'yes' as const : 'no' as const)));
  // Every marked player is (or is being made) «Из другого города»: only the level and rating/tournament judging stay.
  const otherCityPanel = (activity || currentActivity) === 'other_city';
  // Only a pick that differs from what the marked players already have is a change.
  const levelPick = gameLevel && gameLevel !== currentLevel ? gameLevel : '';
  const activityPick = activity && activity !== currentActivity ? activity : '';
  const organizationPick = organization && organization !== currentOrganization && !otherCityPanel ? organization : '';
  const hostAdd = HOST_FORMATS.filter((format) => hosting[format] === 'yes' && currentHosting(format) !== 'yes' && (!otherCityPanel || format === 'RATING'));
  const hostRemove = HOST_FORMATS.filter((format) => hosting[format] === 'no' && currentHosting(format) !== 'no');
  const hostChanged = hostAdd.length + hostRemove.length > 0;
  const organizeAdd = ORGANIZE_FORMATS.filter((format) => organizing[format] === 'yes' && currentOrganizing(format) !== 'yes' && !otherCityPanel);
  const organizeRemove = ORGANIZE_FORMATS.filter((format) => organizing[format] === 'no' && currentOrganizing(format) !== 'no');
  const organizeChanged = organizeAdd.length + organizeRemove.length > 0;
  const curatorAdd = CURATOR_AREAS.filter((area) => curating[area] === 'yes' && currentCurating(area) !== 'yes' && !otherCityPanel);
  const curatorRemove = CURATOR_AREAS.filter((area) => curating[area] === 'no' && currentCurating(area) !== 'no');
  const curatorChanged = curatorAdd.length + curatorRemove.length > 0;

  // With nobody marked the picks are dropped, so the next players start from what they have now.
  const nobodyMarked = selected.size === 0;
  useEffect(() => {
    if (!nobodyMarked) return;
    setGameLevel(''); setActivity(''); setOrganization('');
    setHosting({ NOVICE: '', CASUAL: '', RATING: '' });
    setOrganizing({ NOVICE: '', CASUAL: '', RATING: '', TOURNAMENT: '', CUSTOM: '' }); setCurating({ NOVICES: '', LEARNING: '', EVENTS: '', TOURNAMENTS: '', DISCIPLINE: '', SMM: '' });
  }, [nobodyMarked]);

  // Plain summary of what «Применить» will change, so nothing is picked by mistake.
  const optionLabel = <T extends string>(options: Array<{ value: T; label: string; hint: string }>, value: T | '') => {
    const option = options.find((item) => item.value === value);
    return option ? `${option.label} (${option.hint.toLocaleLowerCase('ru-RU')})` : '';
  };
  const changes = [
    levelPick ? `уровень игры: ${optionLabel(GAME_LEVELS, levelPick)}` : '',
    activityPick ? `как часто ходит: ${optionLabel(PLAYER_ACTIVITY, activityPick)}` : '',
    organizationPick ? `роль в клубе: ${optionLabel(CLUB_ORGANIZATION, organizationPick)}` : '',
    ...HOST_FORMAT_OPTIONS.filter((option) => hostAdd.includes(option.value) || hostRemove.includes(option.value)).map((option) => `${hosting[option.value] === 'yes' ? 'может' : 'не может'} вести: ${option.label.toLocaleLowerCase('ru-RU')}`),
    ...ORGANIZE_FORMAT_OPTIONS.filter((option) => organizeAdd.includes(option.value) || organizeRemove.includes(option.value)).map((option) => `${organizing[option.value] === 'yes' ? 'может' : 'не может'} проводить: ${option.label.toLocaleLowerCase('ru-RU')}`),
    ...CURATOR_AREA_OPTIONS.filter((option) => curatorAdd.includes(option.value) || curatorRemove.includes(option.value)).map((option) => `${curating[option.value] === 'yes' ? 'куратор' : 'больше не куратор'}: ${option.label.toLocaleLowerCase('ru-RU')}`),
  ].filter(Boolean);

  const apply = async () => {
    if (saving || !selected.size || !(levelPick || activityPick || organizationPick || hostChanged || organizeChanged || curatorChanged)) return;
    setSaving(true);
    setError('');
    setMessage('');
    setWarnings([]);
    try {
      const body = await api.bulkUpdatePlayerAccess({
        player_ids: Array.from(selected),
        ...(levelPick ? { game_level: levelPick } : {}),
        ...(activityPick ? { activity: activityPick } : {}),
        ...(organizationPick ? { organization: organizationPick } : {}),
        ...(hostAdd.length ? { host_formats_add: hostAdd } : {}),
        ...(hostRemove.length ? { host_formats_remove: hostRemove } : {}),
        ...(organizeAdd.length ? { organize_formats_add: organizeAdd } : {}),
        ...(organizeRemove.length ? { organize_formats_remove: organizeRemove } : {}),
        ...(curatorAdd.length ? { curator_areas_add: curatorAdd } : {}),
        ...(curatorRemove.length ? { curator_areas_remove: curatorRemove } : {}),
      });
      setMessage(`Сохранено. Изменено игроков: ${body.updated}.`);
      setWarnings(body.warnings || []);
      setSelected(new Set());
      setGameLevel('');
      setActivity('');
      setOrganization('');
      setHosting({ NOVICE: '', CASUAL: '', RATING: '' });
      setOrganizing({ NOVICE: '', CASUAL: '', RATING: '', TOURNAMENT: '', CUSTOM: '' }); setCurating({ NOVICES: '', LEARNING: '', EVENTS: '', TOURNAMENTS: '', DISCIPLINE: '', SMM: '' });
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

  const dropPicks = () => {
    setSelected(new Set());
  };

  return (
    <div className={`space-y-3 ${selected.size ? 'pb-[78dvh]' : 'pb-6'}`} data-testid="crm-access-bulk">
      <div className="flex items-start gap-2 px-0.5">
        <p className="min-w-0 flex-1 text-[12px] leading-5 text-white/50">Отметь игроков — внизу появится панель, где всё меняется сразу у всех. Кабинет организатора выдаётся только в карточке игрока.</p>
        <button type="button" onClick={() => void load()} aria-label="Обновить" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 text-white/60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти игрока по нику"
          className="min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[15px] text-white outline-none placeholder:text-white/30" />
      </label>

      <div className="space-y-2 rounded-[18px] border border-white/[0.08] bg-white/[0.025] p-2.5">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1" aria-label="Уровень игры">
          {GAME_LEVELS.map((item) => <Chip key={item.value} active={level === item.value} onClick={() => setLevel(item.value)}>{item.label} · {counts[item.value] ?? 0}</Chip>)}
          {/* «Все» last: the levels of the active base come first (owner, 2026-09-30). */}
          <Chip active={level === 'all'} onClick={() => setLevel('all')}>Все · {rows.length}</Chip>
        </div>
        {/* Quick filters as chips with counts (owner, 2026-09-29). Tap again to clear. */}
        {([
          ['Как ходят', ACTIVITY_FILTERS, activityFilter, setActivityFilter],
          ['Роль в клубе', ROLE_FILTERS, roleFilter, setRoleFilter],
        ] as const).map(([title, filters, value, setValue]) => (
          <div key={title} className="flex items-center gap-2">
            <span className="w-[62px] shrink-0 text-[10px] font-semibold uppercase leading-3 tracking-[0.08em] text-white/35">{title}</span>
            <div className="-mr-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto pr-1" aria-label={title}>
              {filters.map((item) => (
                <Chip key={item.value} active={value === item.value} onClick={() => setValue((current: RoleFilter) => (current === item.value ? 'all' : item.value))}>
                  {item.label} · {rows.filter((row) => matchesRoleFilter(row, item.value)).length}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && !selected.size ? <div className="rounded-2xl bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200">{error}</div> : null}

      <div className="flex items-center gap-2 px-0.5 text-[12px] text-white/50">
        <span data-testid="crm-access-bulk-count" className="min-w-0 flex-1 whitespace-nowrap">{loading ? 'Загружаем…' : `Игроков: ${visible.length}`}</span>
        <label className="shrink-0"><span className="sr-only">Порядок</span>
          <select aria-label="Порядок" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}
            className="min-h-9 max-w-[150px] rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[12px] text-white/80">
            {SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        {visible.length ? <button type="button" onClick={toggleVisible} className="min-h-9 shrink-0 px-1 font-semibold text-white/80">{allVisibleSelected ? 'Снять все' : 'Отметить всех'}</button> : null}
      </div>

      <div className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-white/[0.025]">
        {visible.map((row, index) => {
          const checked = selected.has(row.id);
          const rowActivity = activityOf(row);
          const organization = organizationOf(normalizeClubRole(row.club_role));
          const hosts = hostFormatsOf(row);
          const organizes = normalizeOrganizeFormats(row.organize_formats);
          const curates = normalizeCuratorAreas(row.curator_areas);
          return (
            <button key={row.id} type="button" data-testid="crm-access-bulk-row" aria-pressed={checked} onClick={() => toggle(row.id)}
              className={`flex min-h-[64px] w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${index ? 'border-t border-white/[0.06]' : ''} ${checked ? 'bg-white/[0.08]' : 'active:bg-white/[0.04]'}`}>
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[13px] font-bold ${checked ? 'border-white bg-white text-black' : 'border-white/30 text-transparent'}`}>✓</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <strong className="min-w-0 flex-1 truncate text-[14px] text-white">{row.nickname}</strong>
                  {Number(row.attendance_count || 0) ? <span className="shrink-0 text-[11px] tabular-nums text-white/40">{Number(row.attendance_count)} веч.</span> : null}
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <Tag>{accessLabel(GAME_LEVELS, normalizeGameLevel(row.game_level))}</Tag>
                  <Tag className={ACTIVITY_TAG[rowActivity]}>{accessLabel(PLAYER_ACTIVITY, rowActivity)}</Tag>
                  {organization !== 'none' ? <Tag className="bg-accent-soft text-accent">{accessLabel(CLUB_ORGANIZATION, organization)}</Tag> : null}
                  {hosts.length ? <Tag className="bg-amber-300/10 text-amber-100">{hostFormatsSummary(hosts)}</Tag> : null}
                  {organizes.length ? <Tag className="bg-amber-300/10 text-amber-100">{organizeFormatsSummary(organizes)}</Tag> : null}
                  {curates.length ? <Tag className="bg-emerald-300/10 text-emerald-100">Куратор: {curatorAreasSummary(curates)}</Tag> : null}
                  {row.contact_status === 'blocked' ? <Tag className="bg-danger-soft text-danger">Заблокирован</Tag> : pausedOther(row) ? <Tag>{`Рассылка на паузе${row.pause_reason ? `: ${row.pause_reason}` : ''}`}</Tag> : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selected.size ? (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[78dvh] w-full max-w-[520px] flex-col rounded-t-[22px] border border-white/15 bg-[#111217] shadow-2xl" data-testid="crm-access-bulk-panel">
          <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 pb-2.5 pt-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-white">Отмечено: {selected.size}</p>
              <p className="truncate text-[11px] text-white/45">{selectedRows.map((row) => row.nickname).join(', ')}</p>
            </div>
            <button type="button" onClick={dropPicks} className="min-h-10 shrink-0 rounded-xl border border-white/15 px-3 text-[12px] text-white/70">Отмена</button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {otherCityPanel ? <p className="rounded-xl border border-violet-300/20 bg-violet-400/[0.08] px-3 py-2 text-[11px] leading-4 text-violet-100/80" data-testid="crm-access-bulk-other-city">Игрок из другого города: ставится только уровень игры, вести может рейтинг и турниры. Роли в клубе и «Может проводить» ему не ставятся.</p> : null}
            <Section title="Уровень игры" about="На какие вечера зовём">
              <Choice label="Поставить уровень игры" value={gameLevel} current={currentLevel} onChange={setGameLevel} options={GAME_LEVELS} />
            </Section>
            <Section title="Как часто ходит" about="Пишет ли бот ему лично">
              <Choice label="Поставить, как часто ходит" value={activity} current={currentActivity} onChange={setActivity} options={PLAYER_ACTIVITY} />
            </Section>
            {otherCityPanel ? null : (
              <Section title="Роль в клубе" about="«Организатор клуба» — полный кабинет; ставит только владелец">
                <Choice label="Поставить роль в клубе" value={organization} current={currentOrganization} onChange={setOrganization} options={clubOwner === false ? CLUB_ORGANIZATION.map((item) => (item.value === 'organizer' ? { ...item, disabled: true } : item)) : CLUB_ORGANIZATION} />
              </Section>
            )}
            <Section title="Может вести" about="Ведущий (судья) игр на таких вечерах. Вечер сам не создаёт.">
              <div className="flex flex-wrap gap-1.5">
                {HOST_FORMAT_OPTIONS.filter((option) => !otherCityPanel || option.value === 'RATING').map((option) => (
                  <Mark key={option.value} label={option.label} ariaLabel={`Может вести: ${option.label}`} value={hosting[option.value]} current={currentHosting(option.value)}
                    onChange={(next) => setHosting((current) => ({ ...current, [option.value]: next }))} />
                ))}
              </div>
            </Section>
            {clubOwner !== false && !otherCityPanel ? (
              <Section title="Может проводить" about="Сам создаёт такие вечера и проводит их в своём кабинете. Ставит только владелец.">
                <div className="flex flex-wrap gap-1.5">
                  {ORGANIZE_FORMAT_OPTIONS.map((option) => (
                    <Mark key={option.value} label={option.label} ariaLabel={`Может проводить: ${option.label}`} value={organizing[option.value]} current={currentOrganizing(option.value)}
                      onChange={(next) => setOrganizing((current) => ({ ...current, [option.value]: next }))} />
                  ))}
                </div>
              </Section>
            ) : null}
            {otherCityPanel ? null : (
              <Section title="Куратор направления" about="За что отвечает. Прав не даёт; если направление давно без дел — напоминание в «Делах».">
                <div className="flex flex-wrap gap-1.5">
                  {CURATOR_AREA_OPTIONS.map((option) => (
                    <Mark key={option.value} label={option.label} ariaLabel={`Куратор: ${option.label}`} value={curating[option.value]} current={currentCurating(option.value)}
                      onChange={(next) => setCurating((current) => ({ ...current, [option.value]: next }))} />
                  ))}
                </div>
              </Section>
            )}
            <p className="px-1 text-[11px] leading-4 text-white/40">✓ — может, – — не может, ≈ — у отмеченных по-разному. Изменённое выделено рамкой.</p>
          </div>

          <div className="border-t border-white/[0.08] px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5">
            {changes.length ? (
              <div className="mb-2 max-h-[18dvh] overflow-y-auto rounded-xl border border-white/10 bg-black/30 px-3 py-2" data-testid="crm-access-bulk-summary">
                <p className="text-[11px] font-semibold text-white/70">Что изменится у {selected.size === 1 ? 'игрока' : `${selected.size} игроков`}:</p>
                <ul className="mt-1 space-y-0.5 text-[11px] leading-4 text-white/60">{changes.map((line) => <li key={line}>• {line}</li>)}</ul>
              </div>
            ) : <p className="mb-2 text-center text-[11px] text-white/40">Сейчас показано то, что стоит у игроков. Поменяй нужное.</p>}
            {/* The result shows right by the button: the list above may be scrolled far away. */}
            {error ? <p className="mb-2 rounded-xl bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200" data-testid="crm-access-bulk-error">{error}</p> : null}
            <button type="button" disabled={saving || !(levelPick || activityPick || organizationPick || hostChanged || organizeChanged || curatorChanged)} onClick={() => void apply()}
              className="min-h-12 w-full rounded-xl bg-white px-3 text-[14px] font-bold text-black disabled:opacity-40">{saving ? 'Сохраняем…' : `Применить к ${selected.size}`}</button>
          </div>
        </div>
      ) : message ? (
        <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-50 mx-auto w-full max-w-[520px] px-4" data-testid="crm-access-bulk-toast">
          <button type="button" onClick={() => { setMessage(''); setWarnings([]); }} className={`max-h-[60dvh] w-full overflow-y-auto rounded-2xl px-4 py-3 text-left text-[13px] font-semibold text-white shadow-2xl ${warnings.length ? 'bg-amber-700' : 'bg-emerald-600'}`}>
            {message}
            {warnings.length ? <ul className="mt-1 space-y-1 text-[12px] font-normal">{warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul> : null}
            <span className="mt-1 block text-[11px] font-normal text-white/70">Нажмите, чтобы закрыть</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default PlayerAccessBulkCRM;
