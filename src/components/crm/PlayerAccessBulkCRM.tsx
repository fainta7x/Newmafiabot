import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { api, type Player } from '../../lib/api.ts';
import {
  CLUB_MEMBERSHIPS, CLUB_ORGANIZATION, GAME_LEVELS, JUDGE_LEVELS, accessLabel, membershipOf, normalizeClubRole, normalizeGameLevel,
  normalizeJudgeLevel, organizationOf, type ClubMembership, type ClubOrganization, type GameLevel, type JudgeLevel,
} from '../../lib/playerAccess.ts';

type Row = Player & { game_level?: string | null; club_role?: string | null; judge_level?: string | null; attendance_count?: number | null };
type LevelFilter = GameLevel | 'all';

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" aria-pressed={active} onClick={onClick}
    className={`min-h-9 shrink-0 rounded-full px-3 text-[12px] font-semibold ${active ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.04] text-white/65'}`}>{children}</button>
);

const Select = <T extends string>({ label, value, onChange, options }: {
  label: string; value: T | ''; onChange: (value: T | '') => void; options: Array<{ value: T; label: string }>;
}) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-[11px] text-white/50">{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value as T | '')}
      className="min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-2 text-[13px] text-white">
      <option value="">Не менять</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>
);

/**
 * «Уровни и роли»: go through all players and set the playing level, the club role and the judge level
 * for many at once. The organizer cabinet access is not here on purpose — it stays a per-player action.
 */
export function PlayerAccessBulkCRM() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<LevelFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gameLevel, setGameLevel] = useState<GameLevel | ''>('');
  const [membership, setMembership] = useState<ClubMembership | ''>('');
  const [organization, setOrganization] = useState<ClubOrganization | ''>('');
  const [judgeLevel, setJudgeLevel] = useState<JudgeLevel | ''>('');
  const [saving, setSaving] = useState(false);

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
    return rows
      .filter((row) => (!needle || String(row.nickname || '').toLocaleLowerCase('ru-RU').includes(needle))
        && (level === 'all' || normalizeGameLevel(row.game_level) === level))
      .sort((a, b) => String(a.nickname || '').localeCompare(String(b.nickname || ''), 'ru'));
  }, [rows, query, level]);

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

  const apply = async () => {
    if (saving || !selected.size || !(gameLevel || membership || organization || judgeLevel)) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const body = await api.bulkUpdatePlayerAccess({
        player_ids: Array.from(selected),
        ...(gameLevel ? { game_level: gameLevel } : {}),
        ...(membership ? { membership } : {}),
        ...(organization ? { organization } : {}),
        ...(judgeLevel ? { judge_level: judgeLevel } : {}),
      });
      setMessage(`Сохранено. Изменено игроков: ${body.updated}.`);
      setSelected(new Set());
      setGameLevel('');
      setMembership('');
      setOrganization('');
      setJudgeLevel('');
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 pb-56" data-testid="crm-access-bulk">
      <section className="rounded-[20px] border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-white">Уровни и роли</h3>
            <p className="mt-0.5 text-[12px] leading-5 text-white/50">Отметь игроков и поставь им уровень, участие в клубе, роль в клубе или ведение игр — сразу всем. Что не выбрано, у каждого остаётся как было. Доступ к кабинету организатора выдаётся только в карточке игрока.</p>
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
                  {accessLabel(GAME_LEVELS, normalizeGameLevel(row.game_level))} · {accessLabel(CLUB_MEMBERSHIPS, membershipOf(normalizeClubRole(row.club_role)))}
                  {organizationOf(normalizeClubRole(row.club_role)) !== 'none' ? ` · ${accessLabel(CLUB_ORGANIZATION, organizationOf(normalizeClubRole(row.club_role)))}` : ''}
                  {normalizeJudgeLevel(row.judge_level) !== 'none' ? ` · ${accessLabel(JUDGE_LEVELS, normalizeJudgeLevel(row.judge_level))}` : ''}
                  {Number(row.attendance_count || 0) ? ` · вечеров: ${Number(row.attendance_count)}` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selected.size ? (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[520px] rounded-t-[22px] border border-white/15 bg-[#111217] px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-2xl" data-testid="crm-access-bulk-panel">
          <p className="text-[13px] font-semibold text-white">Отмечено: {selected.size}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Select label="Уровень" value={gameLevel} onChange={setGameLevel} options={GAME_LEVELS} />
            <Select label="В клубе" value={membership} onChange={setMembership} options={CLUB_MEMBERSHIPS} />
            <Select label="Роль в клубе" value={organization} onChange={setOrganization} options={CLUB_ORGANIZATION} />
            <Select label="Ведение игр" value={judgeLevel} onChange={setJudgeLevel} options={JUDGE_LEVELS} />
          </div>
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={() => setSelected(new Set())} className="min-h-12 rounded-xl border border-white/15 px-3 text-[13px] text-white/70">Отмена</button>
            <button type="button" disabled={saving || !(gameLevel || membership || organization || judgeLevel)} onClick={() => void apply()}
              className="min-h-12 rounded-xl bg-white px-3 text-[13px] font-bold text-black disabled:opacity-40">{saving ? 'Сохраняем…' : `Применить к ${selected.size}`}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default PlayerAccessBulkCRM;
