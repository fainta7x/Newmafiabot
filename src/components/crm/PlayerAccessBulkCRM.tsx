import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { api, type Player } from '../../lib/api.ts';
import {
  CLUB_MEMBERSHIPS, CLUB_ORGANIZATION, GAME_LEVELS, PLAYER_ACTIVITY, STOPPED_REASON, accessLabel, membershipOf,
  normalizeClubRole, normalizeGameLevel, organizationOf,
  type ClubOrganization, type GameLevel, type PlayerActivity,
} from '../../lib/playerAccess.ts';
import { HOST_FORMATS, HOST_FORMAT_OPTIONS, hostFormatsOf, hostFormatsSummary, type HostFormat } from '../../lib/hostFormats.ts';
import { useClubOwner } from './useClubOwner.ts';
import { ORGANIZE_FORMATS, ORGANIZE_FORMAT_OPTIONS, normalizeOrganizeFormats, organizeFormatsSummary, type OrganizeFormat } from '../../lib/organizeFormats.ts';

type HostChoice = '' | 'yes' | 'no';

type Row = Player & { organize_formats?: string | null; last_visit?: string | null; created_at?: string | null; host_formats?: string | null; game_level?: string | null; club_role?: string | null; judge_level?: string | null; attendance_count?: number | null; contact_status?: string | null; pause_reason?: string | null };

const stopped = (row: Row) => row.contact_status === 'paused' && row.pause_reason === STOPPED_REASON;
type LevelFilter = GameLevel | 'all';
// Quick filters and sorting (owner, 2026-09-29: find and set up any player fast).
type RoleFilter = 'all' | 'organizer' | 'team' | 'hosts' | 'organizes' | 'regular' | 'sometimes' | 'stopped' | 'paused';
const ROLE_FILTERS: Array<{ value: Exclude<RoleFilter, 'all'>; label: string }> = [
  { value: 'regular', label: 'Ходят постоянно' },
  { value: 'sometimes', label: 'Ходят иногда' },
  { value: 'stopped', label: 'Перестали ходить' },
  { value: 'paused', label: 'Рассылка на паузе' },
  { value: 'organizer', label: 'Организаторы' },
  { value: 'team', label: 'Помогают клубу' },
  { value: 'hosts', label: 'Ведут игры' },
  { value: 'organizes', label: 'Проводят вечера' },
];
const pausedOther = (row: Row) => (row.contact_status === 'paused' && !stopped(row)) || row.contact_status === 'blocked';
const role = (row: Row) => organizationOf(normalizeClubRole(row.club_role));
const matchesRoleFilter = (row: Row, filter: RoleFilter) => {
  if (filter === 'organizer') return role(row) === 'organizer';
  if (filter === 'team') return role(row) === 'team';
  if (filter === 'hosts') return hostFormatsOf(row).length > 0;
  if (filter === 'organizes') return normalizeOrganizeFormats(row.organize_formats).length > 0;
  if (filter === 'regular') return !stopped(row) && membershipOf(normalizeClubRole(row.club_role)) === 'member';
  if (filter === 'sometimes') return !stopped(row) && membershipOf(normalizeClubRole(row.club_role)) === 'guest';
  if (filter === 'stopped') return stopped(row);
  if (filter === 'paused') return pausedOther(row);
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

// One choice in the bottom panel; the line under it says what the picked option changes.
const Select = <T extends string>({ label, about, value, onChange, options }: {
  label: string; about: string; value: T | ''; onChange: (value: T | '') => void; options: Array<{ value: T; label: string; hint: string }>;
}) => (
  <label className="block min-w-0">
    <span className="block text-[11px] font-semibold text-white/70">{label}</span>
    <span className="mb-1 block text-[10px] leading-[13px] text-white/40">{about}</span>
    <select value={value} onChange={(event) => onChange(event.target.value as T | '')}
      className="min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-2 text-[13px] text-white">
      <option value="">Не менять</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    <span className="mt-1 block min-h-[28px] text-[10px] leading-[14px] text-white/45">
      {value ? options.find((option) => option.value === value)?.hint : 'У каждого остаётся как было'}
    </span>
  </label>
);

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
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  // «Может проводить» (owner only): per kind — add, remove, or leave as is.
  const [organizing, setOrganizing] = useState<Record<OrganizeFormat, HostChoice>>({ NOVICE: '', CASUAL: '', RATING: '', CUSTOM: '' });
  const organizeAdd = ORGANIZE_FORMATS.filter((format) => organizing[format] === 'yes');
  const organizeRemove = ORGANIZE_FORMATS.filter((format) => organizing[format] === 'no');
  const organizeChanged = organizeAdd.length + organizeRemove.length > 0;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gameLevel, setGameLevel] = useState<GameLevel | ''>('');
  const [activity, setActivity] = useState<PlayerActivity | ''>('');
  const [organization, setOrganization] = useState<ClubOrganization | ''>('');
  // «Может вести»: per evening type — add the mark, remove it, or leave each player as is.
  const [hosting, setHosting] = useState<Record<HostFormat, HostChoice>>({ NOVICE: '', CASUAL: '', RATING: '' });
  const hostAdd = HOST_FORMATS.filter((format) => hosting[format] === 'yes');
  const hostRemove = HOST_FORMATS.filter((format) => hosting[format] === 'no');
  const hostChanged = hostAdd.length + hostRemove.length > 0;
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
    const matchesRole = (row: Row) => matchesRoleFilter(row, roleFilter);
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
  }, [rows, query, level, roleFilter, sortBy]);

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

  // Plain summary of what «Применить» will change, so nothing is picked by mistake.
  const optionLabel = <T extends string>(options: Array<{ value: T; label: string; hint: string }>, value: T | '') => {
    const option = options.find((item) => item.value === value);
    return option ? `${option.label} (${option.hint.toLocaleLowerCase('ru-RU')})` : '';
  };
  const changes = [
    gameLevel ? `уровень игры: ${optionLabel(GAME_LEVELS, gameLevel)}` : '',
    activity ? `как часто ходит: ${optionLabel(PLAYER_ACTIVITY, activity)}` : '',
    organization ? `роль в клубе: ${optionLabel(CLUB_ORGANIZATION, organization)}` : '',
    ...HOST_FORMAT_OPTIONS.filter((option) => hosting[option.value]).map((option) => `${hosting[option.value] === 'yes' ? 'может' : 'не может'} вести: ${option.label.toLocaleLowerCase('ru-RU')}`),
    ...ORGANIZE_FORMAT_OPTIONS.filter((option) => organizing[option.value]).map((option) => `${organizing[option.value] === 'yes' ? 'может' : 'не может'} проводить: ${option.label.toLocaleLowerCase('ru-RU')}`),
  ].filter(Boolean);

  const apply = async () => {
    if (saving || !selected.size || !(gameLevel || activity || organization || hostChanged || organizeChanged)) return;
    setSaving(true);
    setError('');
    setMessage('');
    setWarnings([]);
    try {
      const body = await api.bulkUpdatePlayerAccess({
        player_ids: Array.from(selected),
        ...(gameLevel ? { game_level: gameLevel } : {}),
        ...(activity ? { activity } : {}),
        ...(organization ? { organization } : {}),
        ...(hostAdd.length ? { host_formats_add: hostAdd } : {}),
        ...(hostRemove.length ? { host_formats_remove: hostRemove } : {}),
        ...(organizeAdd.length ? { organize_formats_add: organizeAdd } : {}),
        ...(organizeRemove.length ? { organize_formats_remove: organizeRemove } : {}),
      });
      setMessage(`Сохранено. Изменено игроков: ${body.updated}.`);
      setWarnings(body.warnings || []);
      setSelected(new Set());
      setGameLevel('');
      setActivity('');
      setOrganization('');
      setHosting({ NOVICE: '', CASUAL: '', RATING: '' });
      setOrganizing({ NOVICE: '', CASUAL: '', RATING: '', CUSTOM: '' });
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 pb-[560px]" data-testid="crm-access-bulk">
      <section className="rounded-[20px] border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-white">Уровни и роли</h3>
            <p className="mt-0.5 text-[12px] leading-5 text-white/50">Отметь игроков и выбери, что поменять, — сразу всем. Под каждым выбором написано, на что он влияет. Доступ в кабинет организатора выдаётся только в карточке игрока.</p>
          </div>
          <button type="button" onClick={() => void load()} aria-label="Обновить" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 text-white/60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </section>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти игрока по нику"
          className="min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[15px] text-white outline-none placeholder:text-white/30" />
      </label>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Уровень игры">
        <Chip active={level === 'all'} onClick={() => setLevel('all')}>Все · {rows.length}</Chip>
        {GAME_LEVELS.map((item) => <Chip key={item.value} active={level === item.value} onClick={() => setLevel(item.value)}>{item.label} · {counts[item.value] ?? 0}</Chip>)}
      </div>

      {/* Quick filters as chips with counts, like the level chips above (owner, 2026-09-29). Tap again to clear. */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Кто">
        {ROLE_FILTERS.map((item) => (
          <Chip key={item.value} active={roleFilter === item.value} onClick={() => setRoleFilter((current) => (current === item.value ? 'all' : item.value))}>
            {item.label} · {rows.filter((row) => matchesRoleFilter(row, item.value)).length}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="block min-w-0"><span className="sr-only">Порядок</span>
          <select aria-label="Порядок" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-2 text-[13px] text-white">
            {SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      {error ? <div className="rounded-2xl bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200">{error}</div> : null}
      {message ? <div className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-200">{message}</div> : null}

      <div className="flex items-center justify-between px-1 text-[12px] text-white/50">
        <span data-testid="crm-access-bulk-count">{loading ? 'Загружаем…' : `Игроков: ${visible.length}`}</span>
        {visible.length ? <button type="button" onClick={toggleVisible} className="min-h-9 px-2 font-semibold text-white/80">{allVisibleSelected ? 'Снять отметки' : 'Отметить всех в списке'}</button> : null}
      </div>

      <div className="space-y-1.5">
        {visible.map((row) => {
          const checked = selected.has(row.id);
          return (
            <button key={row.id} type="button" data-testid="crm-access-bulk-row" aria-pressed={checked} onClick={() => toggle(row.id)}
              className={`flex min-h-[58px] w-full items-center gap-3 rounded-[16px] border px-3 py-2 text-left ${checked ? 'border-white/50 bg-white/[0.09]' : 'border-white/10 bg-white/[0.035]'}`}>
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[13px] font-bold ${checked ? 'border-white bg-white text-black' : 'border-white/30 text-transparent'}`}>✓</span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[14px] text-white">{row.nickname}</strong>
                <span className="mt-0.5 block truncate text-[11px] text-white/50">
                  {accessLabel(GAME_LEVELS, normalizeGameLevel(row.game_level))} · {stopped(row) ? 'Перестал ходить' : accessLabel(CLUB_MEMBERSHIPS, membershipOf(normalizeClubRole(row.club_role)))}
                  {organizationOf(normalizeClubRole(row.club_role)) !== 'none' ? ` · ${accessLabel(CLUB_ORGANIZATION, organizationOf(normalizeClubRole(row.club_role)))}` : ''}
                  {hostFormatsOf(row).length ? ` · ${hostFormatsSummary(hostFormatsOf(row))}` : ''}
                  {normalizeOrganizeFormats(row.organize_formats).length ? ` · ${organizeFormatsSummary(normalizeOrganizeFormats(row.organize_formats))}` : ''}
                  {row.contact_status === 'blocked' ? ' · Заблокирован' : pausedOther(row) ? ` · Рассылка на паузе${row.pause_reason ? `: ${row.pause_reason}` : ''}` : ''}
                  {Number(row.attendance_count || 0) ? ` · вечеров: ${Number(row.attendance_count)}` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selected.size ? (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[85vh] w-full max-w-[520px] overflow-y-auto rounded-t-[22px] border border-white/15 bg-[#111217] px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-2xl" data-testid="crm-access-bulk-panel">
          <p className="text-[13px] font-semibold text-white">Отмечено: {selected.size}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Select label="Уровень игры" about="На какие вечера зовём" value={gameLevel} onChange={setGameLevel} options={GAME_LEVELS} />
            <Select label="Как часто ходит" about="Пишет ли бот ему лично" value={activity} onChange={setActivity} options={PLAYER_ACTIVITY} />
            <Select label="Роль в клубе" about="«Организатор клуба» — полный кабинет" value={organization} onChange={setOrganization} options={clubOwner === false ? CLUB_ORGANIZATION.filter((item) => item.value !== 'organizer') : CLUB_ORGANIZATION} />
          </div>
          <div className="mt-1">
            <span className="block text-[11px] font-semibold text-white/70">Может вести</span>
            <span className="mb-1 block text-[10px] leading-[13px] text-white/40">Может быть ведущим (судьёй) игр на таких вечерах. Вечер сам не создаёт.</span>
            <div className="grid grid-cols-3 gap-2">
              {HOST_FORMAT_OPTIONS.map((option) => (
                <label key={option.value} className="block min-w-0">
                  <span className="mb-1 block truncate text-[10px] text-white/50">{option.label}</span>
                  <select value={hosting[option.value]} aria-label={`Может вести: ${option.label}`}
                    onChange={(event) => setHosting((current) => ({ ...current, [option.value]: event.target.value as HostChoice }))}
                    className="min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-1 text-[12px] text-white">
                    <option value="">Не менять</option>
                    <option value="yes">Может</option>
                    <option value="no">Не может</option>
                  </select>
                </label>
              ))}
            </div>
          </div>
          {clubOwner !== false ? (
            <div className="mt-1">
              <span className="block text-[11px] font-semibold text-white/70">Может проводить</span>
              <span className="mb-1 block text-[10px] leading-[13px] text-white/40">Сам создаёт такие вечера в календаре и проводит их в своём кабинете: приход, оплата, столы, закрытие. Ставит только владелец.</span>
              <div className="grid grid-cols-2 gap-2">
                {ORGANIZE_FORMAT_OPTIONS.map((option) => (
                  <label key={option.value} className="block min-w-0">
                    <span className="mb-1 block truncate text-[10px] text-white/50">{option.label}</span>
                    <select value={organizing[option.value]} aria-label={`Может проводить: ${option.label}`}
                      onChange={(event) => setOrganizing((current) => ({ ...current, [option.value]: event.target.value as HostChoice }))}
                      className="min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-1 text-[12px] text-white">
                      <option value="">Не менять</option>
                      <option value="yes">Может</option>
                      <option value="no">Не может</option>
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {changes.length ? (
            <div className="mt-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2" data-testid="crm-access-bulk-summary">
              <p className="text-[11px] font-semibold text-white/70">Что изменится у {selected.size === 1 ? 'игрока' : `${selected.size} игроков`}:</p>
              <ul className="mt-1 space-y-0.5 text-[11px] leading-4 text-white/60">{changes.map((line) => <li key={line}>• {line}</li>)}</ul>
            </div>
          ) : <p className="mt-2 text-[11px] text-white/40">Выберите, что поменять, — здесь появится итог перед сохранением.</p>}
          {/* The result shows right by the button: the list above may be scrolled far away. */}
          {error ? <p className="mt-2 rounded-xl bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200" data-testid="crm-access-bulk-error">{error}</p> : null}
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={() => setSelected(new Set())} className="min-h-12 rounded-xl border border-white/15 px-3 text-[13px] text-white/70">Отмена</button>
            <button type="button" disabled={saving || !(gameLevel || activity || organization || hostChanged || organizeChanged)} onClick={() => void apply()}
              className="min-h-12 rounded-xl bg-white px-3 text-[13px] font-bold text-black disabled:opacity-40">{saving ? 'Сохраняем…' : `Применить к ${selected.size}`}</button>
          </div>
        </div>
      ) : message ? (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[520px] px-4 pb-[calc(12px+env(safe-area-inset-bottom))]" data-testid="crm-access-bulk-toast">
          <button type="button" onClick={() => { setMessage(''); setWarnings([]); }} className={`max-h-[calc(100dvh-24px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full overflow-y-auto rounded-2xl px-4 py-3 text-left text-[13px] font-semibold text-white shadow-2xl ${warnings.length ? 'bg-amber-700' : 'bg-emerald-600'}`}>
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
