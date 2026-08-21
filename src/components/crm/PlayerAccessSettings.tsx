import { useEffect, useState } from 'react';
import { ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { PlayerDetails } from '../../lib/api.ts';
import { MobileSheet } from '../ui/MobileSheet.tsx';

type GameLevel = 'novice' | 'club' | 'tournament';
type ClubRole = 'guest' | 'member' | 'team' | 'organizer';
type JudgeLevel = 'none' | 'trainee' | 'host' | 'judge';

type PlayerWithAccess = PlayerDetails & {
  game_level?: GameLevel | null;
  club_role?: ClubRole | null;
  judge_level?: JudgeLevel | null;
};

type Draft = {
  game_level: GameLevel;
  club_role: ClubRole;
  judge_level: JudgeLevel;
};

const GAME_LEVELS: Array<{ value: GameLevel; label: string; hint: string }> = [
  { value: 'novice', label: 'Новичок', hint: 'Новичковые игры и школа' },
  { value: 'club', label: 'Игрок клуба', hint: 'Обычные клубные игры' },
  { value: 'tournament', label: 'Турнирный игрок', hint: 'Рейтинговые игры и турниры' },
];

const CLUB_ROLES: Array<{ value: ClubRole; label: string; hint: string }> = [
  { value: 'guest', label: 'Гость', hint: 'Не входит в постоянный состав клуба' },
  { value: 'member', label: 'Участник клуба', hint: 'Постоянный участник клуба' },
  { value: 'team', label: 'Команда клуба', hint: 'Входит в команду 2LA noire' },
  { value: 'organizer', label: 'Организатор', hint: 'Организационная роль в клубе' },
];

const JUDGE_LEVELS: Array<{ value: JudgeLevel; label: string; hint: string }> = [
  { value: 'none', label: 'Нет', hint: 'Без полномочий ведущего' },
  { value: 'trainee', label: 'Стажёр', hint: 'Стажировка на ведение игр' },
  { value: 'host', label: 'Ведущий', hint: 'Может вести клубные игры' },
  { value: 'judge', label: 'Судья', hint: 'Полные судейские полномочия' },
];

const normalize = (player: PlayerWithAccess): Draft => ({
  game_level: player.game_level === 'novice' || player.game_level === 'tournament' ? player.game_level : 'club',
  club_role: player.club_role === 'guest' || player.club_role === 'team' || player.club_role === 'organizer' ? player.club_role : 'member',
  judge_level: player.judge_level === 'trainee' || player.judge_level === 'host' || player.judge_level === 'judge' ? player.judge_level : 'none',
});

const labelFor = <T extends string>(items: Array<{ value: T; label: string }>, value: T) => items.find((item) => item.value === value)?.label || value;

export function PlayerAccessSettings({ player, onSaved }: { player: PlayerDetails; onSaved?: () => void | Promise<void> }) {
  const accessPlayer = player as PlayerWithAccess;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => normalize(accessPlayer));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(normalize(accessPlayer)), [player]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(player.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || body?.message || 'Не удалось сохранить игровой статус');
      setOpen(false);
      await onSaved?.();
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить игровой статус');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section data-testid="crm-player-access-summary" className="rounded-[17px] border border-border-soft bg-surface-1 p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent"><ShieldCheck className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-text-primary">Игровой статус</div>
            <div className="mt-0.5 text-[9px] text-text-muted">Допуск, роль в клубе и полномочия</div>
          </div>
          <button data-testid="crm-player-access-edit" type="button" onClick={() => { setDraft(normalize(accessPlayer)); setError(null); setOpen(true); }} className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[11px] border border-border-soft bg-surface-2 px-3 text-[10px] font-semibold text-text-primary"><SlidersHorizontal className="h-3.5 w-3.5" /> Настроить</button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <div className="min-w-0 rounded-[11px] bg-black/20 px-1.5 py-2"><span className="block text-[8px] text-text-muted">Допуск</span><strong className="mt-1 block truncate text-[10px] font-semibold text-text-primary">{labelFor(GAME_LEVELS, draft.game_level)}</strong></div>
          <div className="min-w-0 rounded-[11px] bg-black/20 px-1.5 py-2"><span className="block text-[8px] text-text-muted">Клуб</span><strong className="mt-1 block truncate text-[10px] font-semibold text-text-primary">{labelFor(CLUB_ROLES, draft.club_role)}</strong></div>
          <div className="min-w-0 rounded-[11px] bg-black/20 px-1.5 py-2"><span className="block text-[8px] text-text-muted">Ведение</span><strong className="mt-1 block truncate text-[10px] font-semibold text-text-primary">{labelFor(JUDGE_LEVELS, draft.judge_level)}</strong></div>
        </div>
      </section>

      <MobileSheet open={open} onClose={() => setOpen(false)} title="Игровой статус" subtitle={player.nickname} widthClass="sm:max-w-lg" footer={<button type="button" disabled={saving} onClick={() => void save()} className="min-h-[48px] w-full rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white disabled:opacity-40">{saving ? 'Сохраняем…' : 'Сохранить'}</button>}>
        <div data-testid="crm-player-access-sheet" className="space-y-4">
          {error ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{error}</div> : null}
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Игровой допуск</span><select value={draft.game_level} onChange={(event) => setDraft((value) => ({ ...value, game_level: event.target.value as GameLevel }))} className="mobile-field">{GAME_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Роль в клубе</span><select value={draft.club_role} onChange={(event) => setDraft((value) => ({ ...value, club_role: event.target.value as ClubRole }))} className="mobile-field">{CLUB_ROLES.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Ведущий / судья</span><select value={draft.judge_level} onChange={(event) => setDraft((value) => ({ ...value, judge_level: event.target.value as JudgeLevel }))} className="mobile-field">{JUDGE_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}</select></label>
          <div className="rounded-[13px] bg-surface-2 p-3 text-[10px] leading-4 text-text-muted">Статус связи, пауза, контакты и заметки редактируются отдельно в «Настройках профиля». Здесь только игровые права человека.</div>
        </div>
      </MobileSheet>
    </>
  );
}

export default PlayerAccessSettings;
