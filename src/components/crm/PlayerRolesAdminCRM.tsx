import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Search, ShieldCheck, UserCog, UsersRound } from 'lucide-react';
import { api, type Player } from '../../lib/api.ts';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';
import PlayerCareerProfile from '../player/PlayerCareerProfile.tsx';

type GameLevel = 'novice' | 'club' | 'tournament';
type ClubRole = 'guest' | 'member' | 'team' | 'organizer';
type JudgeLevel = 'none' | 'trainee' | 'host' | 'judge';
type ContactStatus = 'normal' | 'paused' | 'blocked';

type EditablePlayer = Player & {
  game_level?: GameLevel | null;
  club_role?: ClubRole | null;
  judge_level?: JudgeLevel | null;
};

type Draft = {
  game_level: GameLevel;
  club_role: ClubRole;
  judge_level: JudgeLevel;
  contact_status: ContactStatus;
};

const GAME_LEVELS: Array<{ value: GameLevel; label: string; hint: string }> = [
  { value: 'novice', label: 'Новичок', hint: 'Только школа / новичковые игры' },
  { value: 'club', label: 'Игрок клуба', hint: 'Обычные клубные игры' },
  { value: 'tournament', label: 'Турнирный игрок', hint: 'Рейтинговые и турниры' },
];

const CLUB_ROLES: Array<{ value: ClubRole; label: string; hint: string }> = [
  { value: 'guest', label: 'Гость', hint: 'Играет у клуба, но не относится к постоянному составу' },
  { value: 'member', label: 'Участник клуба', hint: 'Обычный постоянный участник клуба' },
  { value: 'team', label: 'Команда клуба', hint: 'Человек входит в команду 2LA noire' },
  { value: 'organizer', label: 'Организатор', hint: 'Организационная роль в клубе' },
];

const JUDGE_LEVELS: Array<{ value: JudgeLevel; label: string; hint: string }> = [
  { value: 'none', label: 'Без полномочий', hint: 'Обычный игрок' },
  { value: 'trainee', label: 'Стажёр ведущего', hint: 'Новичковые игры' },
  { value: 'host', label: 'Ведущий', hint: 'Клубные игры + личный плейлист' },
  { value: 'judge', label: 'Судья', hint: 'Все форматы + турниры + личный плейлист' },
];

const CONTACT_STATUSES: Array<{ value: ContactStatus; label: string }> = [
  { value: 'normal', label: 'Активен' },
  { value: 'paused', label: 'На паузе' },
  { value: 'blocked', label: 'Заблокирован' },
];

const normalizeDraft = (player: EditablePlayer): Draft => ({
  game_level: player.game_level === 'novice' || player.game_level === 'tournament' ? player.game_level : 'club',
  club_role: player.club_role === 'guest' || player.club_role === 'team' || player.club_role === 'organizer' ? player.club_role : 'member',
  judge_level: player.judge_level === 'trainee' || player.judge_level === 'host' || player.judge_level === 'judge' ? player.judge_level : 'none',
  contact_status: player.contact_status === 'paused' || player.contact_status === 'blocked' ? player.contact_status : 'normal',
});

const gameLabel = (value: GameLevel) => GAME_LEVELS.find((item) => item.value === value)?.label || value;
const clubRoleLabel = (value: ClubRole) => CLUB_ROLES.find((item) => item.value === value)?.label || value;
const judgeLabel = (value: JudgeLevel) => JUDGE_LEVELS.find((item) => item.value === value)?.label || value;
const contactLabel = (value: ContactStatus) => CONTACT_STATUSES.find((item) => item.value === value)?.label || value;

export function PlayerRolesAdminCRM() {
  const [players, setPlayers] = useState<EditablePlayer[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profilePreviewId, setProfilePreviewId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.getPlayers();
      setPlayers(rows as EditablePlayer[]);
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить игроков');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((player) => [player.nickname, player.full_name, player.telegram_username]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q)));
  }, [players, search]);

  const selected = players.find((player) => player.id === selectedId) || null;
  const originalDraft = selected ? normalizeDraft(selected) : null;
  const dirty = Boolean(draft && originalDraft && (
    draft.game_level !== originalDraft.game_level ||
    draft.club_role !== originalDraft.club_role ||
    draft.judge_level !== originalDraft.judge_level ||
    draft.contact_status !== originalDraft.contact_status
  ));

  const openPlayer = (player: EditablePlayer) => {
    setSelectedId(player.id);
    setDraft(normalizeDraft(player));
    setError(null);
    setMessage(null);
  };

  const save = async () => {
    if (!selected || !draft || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || body?.message || 'Не удалось сохранить роли игрока');
      setPlayers((previous) => previous.map((player) => player.id === selected.id ? { ...player, ...body } : player));
      setDraft(normalizeDraft({ ...selected, ...body }));
      setMessage('Статусы и роли сохранены');
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить роли игрока');
    } finally {
      setSaving(false);
    }
  };

  if (profilePreviewId) {
    return (
      <div className="fixed inset-0 z-[160] overflow-y-auto bg-[#090a0d]">
        <PlayerCareerProfile playerId={profilePreviewId} onBack={() => setProfilePreviewId(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div>
        <div className="flex items-center gap-2 text-accent"><UserCog className="h-5 w-5" /><span className="text-[11px] font-black uppercase tracking-[0.14em]">Управление клубом</span></div>
        <h2 className="mt-1 text-[24px] font-black tracking-tight text-text-primary">Статусы и роли игроков</h2>
        <p className="mt-1 text-[13px] leading-5 text-text-secondary">Игровой допуск, отношение к клубу и полномочия — отдельные независимые параметры.</p>
      </div>

      <div className="rounded-[16px] border border-accent/20 bg-accent-soft p-3 text-[12px] leading-5 text-text-secondary">
        <strong className="text-text-primary">Разделяем смысл:</strong> роль в клубе пока только описывает отношение человека к 2LA noire. Права на ведение игр определяются отдельно через «Ведущий / Судья».
      </div>

      <label className="relative block">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти игрока" className="mobile-field pl-10" />
      </label>

      {error && <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger"><AlertCircle className="mr-1 inline h-4 w-4" />{error}</div>}
      {message && <div className="rounded-[14px] border border-success/30 bg-success-soft p-3 text-[12px] text-success"><Check className="mr-1 inline h-4 w-4" />{message}</div>}

      {selected && draft ? (
        <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
          <div className="flex items-center gap-3">
            <PlayerAvatar playerId={selected.id} avatarVersion={selected.avatar_updated_at} nickname={selected.nickname} size="md" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-black text-text-primary">{selected.nickname}</div>
              <div className="mt-0.5 truncate text-[11px] text-text-secondary">{selected.full_name || selected.telegram_username || 'Профиль игрока'}</div>
            </div>
            <button type="button" onClick={() => { setSelectedId(null); setDraft(null); setMessage(null); setError(null); }} className="min-h-9 rounded-[10px] border border-border-soft bg-surface-2 px-3 text-[11px] font-bold text-text-secondary">Закрыть</button>
          </div>

          <button type="button" onClick={() => setProfilePreviewId(selected.id)} className="mt-3 min-h-11 w-full rounded-[12px] border border-accent/30 bg-accent-soft px-3 text-[12px] font-bold text-accent">
            Открыть игровой профиль игрока
          </button>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-text-secondary">Игровой допуск</span>
              <select value={draft.game_level} onChange={(event) => setDraft((value) => value ? { ...value, game_level: event.target.value as GameLevel } : value)} className="mobile-field">
                {GAME_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-text-secondary">Роль в клубе</span>
              <select value={draft.club_role} onChange={(event) => setDraft((value) => value ? { ...value, club_role: event.target.value as ClubRole } : value)} className="mobile-field">
                {CLUB_ROLES.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-text-secondary">Полномочия ведущего / судьи</span>
              <select value={draft.judge_level} onChange={(event) => setDraft((value) => value ? { ...value, judge_level: event.target.value as JudgeLevel } : value)} className="mobile-field">
                {JUDGE_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-text-secondary">Статус взаимодействия с клубом</span>
              <select value={draft.contact_status} onChange={(event) => setDraft((value) => value ? { ...value, contact_status: event.target.value as ContactStatus } : value)} className="mobile-field">
                {CONTACT_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-[14px] border border-border-soft bg-surface-2 p-2.5 text-center sm:grid-cols-4">
            <div><div className="text-[9px] uppercase text-text-muted">Допуск</div><div className="mt-1 text-[11px] font-bold text-text-primary">{gameLabel(draft.game_level)}</div></div>
            <div><div className="text-[9px] uppercase text-text-muted">Клуб</div><div className="mt-1 text-[11px] font-bold text-text-primary">{clubRoleLabel(draft.club_role)}</div></div>
            <div><div className="text-[9px] uppercase text-text-muted">Полномочия</div><div className="mt-1 text-[11px] font-bold text-text-primary">{judgeLabel(draft.judge_level)}</div></div>
            <div><div className="text-[9px] uppercase text-text-muted">Статус</div><div className="mt-1 text-[11px] font-bold text-text-primary">{contactLabel(draft.contact_status)}</div></div>
          </div>

          <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="mt-4 min-h-[50px] w-full rounded-[13px] bg-accent px-4 text-[13px] font-black text-white disabled:opacity-35">
            {saving ? 'Сохраняем…' : dirty ? 'Сохранить изменения' : 'Изменений нет'}
          </button>
        </section>
      ) : null}

      <div className="overflow-hidden rounded-[18px] border border-border-soft bg-surface-1">
        {loading ? <div className="py-12 text-center text-[12px] text-text-secondary">Загрузка игроков…</div> : filtered.length === 0 ? <div className="py-12 text-center text-[12px] text-text-secondary">Игроки не найдены</div> : filtered.map((player, index) => {
          const current = normalizeDraft(player);
          return (
            <button key={player.id} type="button" onClick={() => openPlayer(player)} className={`flex min-h-[76px] w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-hover ${index ? 'border-t border-border-soft' : ''}`}>
              <PlayerAvatar playerId={player.id} avatarVersion={player.avatar_updated_at} nickname={player.nickname} size="sm" />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[13px] font-bold text-text-primary">{player.nickname}</strong>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[9px] font-bold text-text-secondary">{clubRoleLabel(current.club_role)}</span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[9px] font-bold text-text-secondary">{gameLabel(current.game_level)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${current.judge_level === 'judge' || current.judge_level === 'host' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-text-secondary'}`}>{judgeLabel(current.judge_level)}</span>
                  {current.contact_status !== 'normal' ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[9px] font-bold text-warning">{contactLabel(current.contact_status)}</span> : null}
                </span>
              </span>
              {current.judge_level === 'judge' ? <ShieldCheck className="h-5 w-5 shrink-0 text-accent" /> : current.judge_level === 'host' ? <UsersRound className="h-5 w-5 shrink-0 text-accent" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default PlayerRolesAdminCRM;
