import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { PlayerDetails } from '../../lib/api.ts';
import {
  accessLabel,
  CLUB_ROLES,
  GAME_LEVELS,
  JUDGE_LEVELS,
  normalizeClubRole,
  normalizeGameLevel,
  normalizeJudgeLevel,
  type ClubRole,
  type GameLevel,
  type JudgeLevel,
} from '../../lib/playerAccess.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { usePlayerEveningQuickAdd } from './PlayerEveningQuickAdd.tsx';

type PlayerWithAccess = PlayerDetails & {
  game_level?: GameLevel | null;
  club_role?: ClubRole | null;
  judge_level?: JudgeLevel | null;
  organizer_player_access?: boolean;
};

type Draft = {
  game_level: GameLevel;
  club_role: ClubRole;
  judge_level: JudgeLevel;
};

type Confirmation =
  | { kind: 'close' }
  | { kind: 'crm-access'; enabled: boolean }
  | null;

const normalize = (player: PlayerWithAccess): Draft => ({
  game_level: normalizeGameLevel(player.game_level),
  club_role: normalizeClubRole(player.club_role),
  judge_level: normalizeJudgeLevel(player.judge_level),
});

const equalDraft = (left: Draft, right: Draft) =>
  left.game_level === right.game_level
  && left.club_role === right.club_role
  && left.judge_level === right.judge_level;

export function PlayerAccessSettings({ player, onSaved }: { player: PlayerDetails; onSaved?: () => void | Promise<void> }) {
  const accessPlayer = player as PlayerWithAccess;
  const quickAdd = usePlayerEveningQuickAdd();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => normalize(accessPlayer));
  const [baseline, setBaseline] = useState<Draft>(() => normalize(accessPlayer));
  const [organizerAccess, setOrganizerAccess] = useState(Boolean(accessPlayer.organizer_player_access));
  const [saving, setSaving] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const saveSequence = useRef(0);
  const syncedPlayerId = useRef(player.id);
  const openRef = useRef(open);
  const dirtyRef = useRef(false);

  const dirty = useMemo(() => !equalDraft(draft, baseline), [baseline, draft]);
  openRef.current = open;
  dirtyRef.current = dirty;

  useEffect(() => {
    const normalized = normalize(accessPlayer);
    setOrganizerAccess(Boolean(accessPlayer.organizer_player_access));

    const samePlayer = syncedPlayerId.current === player.id;
    if (samePlayer && openRef.current && dirtyRef.current) return;

    syncedPlayerId.current = player.id;
    setDraft(normalized);
    setBaseline(normalized);
  }, [player]);

  const requestClose = () => {
    if (saving || accessSaving) return;
    if (dirty) {
      setConfirmation({ kind: 'close' });
      return;
    }
    setOpen(false);
  };

  const readJson = async (response: Response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || 'Не удалось выполнить действие');
    return body;
  };

  const save = async (openSignup = false) => {
    if (saving) return;
    const sequence = ++saveSequence.current;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(player.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      await readJson(response);

      const readbackResponse = await fetch(`/api/players/${encodeURIComponent(player.id)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const readback = await readJson(readbackResponse) as PlayerWithAccess;
      if (sequence !== saveSequence.current) return;

      const persisted = normalize(readback);
      if (!equalDraft(persisted, draft)) {
        throw new Error('Сервер ответил успешно, но повторное чтение вернуло другие значения. Изменения не считаются сохранёнными.');
      }

      setDraft(persisted);
      setBaseline(persisted);
      setOrganizerAccess(Boolean(readback.organizer_player_access));
      setSuccess('Игровой статус и полномочия сохранены и подтверждены повторным чтением.');
      setOpen(false);
      await onSaved?.();
      if (openSignup && quickAdd) quickAdd.openForPlayer(readback as PlayerDetails);
    } catch (saveError: any) {
      if (sequence === saveSequence.current) {
        setError(saveError?.message || 'Не удалось сохранить игровой статус и полномочия');
        setOpen(true);
      }
    } finally {
      if (sequence === saveSequence.current) setSaving(false);
    }
  };

  const changeOrganizerAccess = async (enabled: boolean) => {
    if (accessSaving) return;
    setAccessSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(player.id)}/organizer-access`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const body = await readJson(response);
      if (Boolean(body.organizer_player_access) !== enabled) {
        throw new Error('Сервер не подтвердил новое состояние доступа к CRM организатора.');
      }
      setOrganizerAccess(enabled);
      setSuccess(enabled ? 'Доступ к CRM организатора выдан.' : 'Доступ к CRM организатора отозван.');
      if (!dirty) await onSaved?.();
    } catch (accessError: any) {
      setError(accessError?.message || 'Не удалось изменить доступ к CRM организатора');
      setOpen(true);
    } finally {
      setAccessSaving(false);
      setConfirmation(null);
    }
  };

  const footer = quickAdd ? (
    <div className="grid grid-cols-2 gap-2 pb-[env(safe-area-inset-bottom)]">
      <button type="button" disabled={saving || !dirty} onClick={() => void save(false)} className="min-h-[48px] rounded-[13px] border border-border-soft bg-surface-2 px-3 text-[12px] font-bold text-text-primary disabled:opacity-40">{saving ? 'Сохраняем…' : 'Сохранить'}</button>
      <button type="button" disabled={saving} onClick={() => void save(true)} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[13px] bg-accent px-3 text-[12px] font-bold text-white disabled:opacity-40"><CalendarPlus className="h-4 w-4" /> Сохранить и записать</button>
    </div>
  ) : (
    <button type="button" disabled={saving || !dirty} onClick={() => void save(false)} className="min-h-[48px] w-full rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white disabled:opacity-40">{saving ? 'Сохраняем…' : 'Сохранить изменения'}</button>
  );

  return (
    <>
      <section data-testid="crm-player-access-summary" className="rounded-[17px] border border-border-soft bg-surface-1 p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent"><ShieldCheck className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-text-primary">Игровой статус и полномочия</div>
            <div className="mt-0.5 text-[9px] text-text-muted">Уровень игры, статус в клубе, ведение и отдельный доступ к CRM</div>
          </div>
          <button data-testid="crm-player-access-edit" type="button" onClick={() => { const normalized = normalize(accessPlayer); setDraft(normalized); setBaseline(normalized); setOrganizerAccess(Boolean(accessPlayer.organizer_player_access)); setError(null); setSuccess(null); setOpen(true); }} className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[11px] border border-border-soft bg-surface-2 px-3 text-[10px] font-semibold text-text-primary"><SlidersHorizontal className="h-3.5 w-3.5" /> Изменить</button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5 text-center sm:grid-cols-4">
          <div className="min-w-0 rounded-[11px] bg-black/20 px-1.5 py-2"><span className="block text-[8px] text-text-muted">Игровой уровень</span><strong className="mt-1 block truncate text-[10px] font-semibold text-text-primary">{accessLabel(GAME_LEVELS, draft.game_level)}</strong></div>
          <div className="min-w-0 rounded-[11px] bg-black/20 px-1.5 py-2"><span className="block text-[8px] text-text-muted">Статус в клубе</span><strong className="mt-1 block truncate text-[10px] font-semibold text-text-primary">{accessLabel(CLUB_ROLES, draft.club_role)}</strong></div>
          <div className="min-w-0 rounded-[11px] bg-black/20 px-1.5 py-2"><span className="block text-[8px] text-text-muted">Полномочия ведущего</span><strong className="mt-1 block truncate text-[10px] font-semibold text-text-primary">{accessLabel(JUDGE_LEVELS, draft.judge_level)}</strong></div>
          <div className="min-w-0 rounded-[11px] bg-black/20 px-1.5 py-2"><span className="block text-[8px] text-text-muted">CRM организатора</span><strong className="mt-1 block truncate text-[10px] font-semibold text-text-primary">{organizerAccess ? 'Есть доступ' : 'Нет доступа'}</strong></div>
        </div>
        {success ? <div data-testid="crm-player-access-success" className="mt-2 rounded-[11px] bg-success-soft px-3 py-2 text-[10px] text-success">{success}</div> : null}
        {quickAdd ? <button data-testid="crm-player-signup" type="button" onClick={() => quickAdd.openForPlayer(player)} className="mt-2.5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[11px] border border-accent/25 bg-accent-soft px-3 text-[11px] font-semibold text-accent"><CalendarPlus className="h-4 w-4" /> Добавить на игровой вечер</button> : null}
      </section>

      <MobileSheet open={open} onClose={requestClose} title="Игровой статус и полномочия" subtitle={player.nickname} widthClass="sm:max-w-lg" footer={footer}>
        <div data-testid="crm-player-access-sheet" className="space-y-4 overflow-x-hidden pb-2">
          {error ? <div data-testid="crm-player-access-error" className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{error}</div> : null}

          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Игровой уровень</span><span className="mb-2 block text-[10px] leading-4 text-text-muted">Определяет уровень игры человека. Не даёт клубных или административных прав.</span><select value={draft.game_level} onChange={(event) => setDraft((value) => ({ ...value, game_level: event.target.value as GameLevel }))} className="mobile-field w-full max-w-full">{GAME_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}</select></label>

          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Статус в клубе</span><span className="mb-2 block text-[10px] leading-4 text-text-muted">Показывает отношение человека к клубу. Статус «Организатор» сам по себе не открывает CRM.</span><select value={draft.club_role} onChange={(event) => setDraft((value) => ({ ...value, club_role: event.target.value as ClubRole }))} className="mobile-field w-full max-w-full">{CLUB_ROLES.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}</select></label>

          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Полномочия ведущего</span><span className="mb-2 block text-[10px] leading-4 text-text-muted">Определяет возможность вести или судить игры в разрешённых форматах. Не открывает CRM.</span><select value={draft.judge_level} onChange={(event) => setDraft((value) => ({ ...value, judge_level: event.target.value as JudgeLevel }))} className="mobile-field w-full max-w-full">{JUDGE_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}</select></label>

          <div className="rounded-[13px] border border-border-soft bg-surface-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-text-primary">Доступ к CRM организатора</div>
                <div className="mt-1 text-[10px] leading-4 text-text-muted">Отдельное административное право. Оно не меняется вместе со статусом в клубе, игровым уровнем или полномочиями ведущего.</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${organizerAccess ? 'bg-success-soft text-success' : 'bg-black/20 text-text-muted'}`}>{organizerAccess ? 'Есть доступ' : 'Нет доступа'}</span>
            </div>
            <button type="button" disabled={accessSaving} onClick={() => setConfirmation({ kind: 'crm-access', enabled: !organizerAccess })} className={`mt-3 min-h-[44px] w-full rounded-[11px] border px-3 text-[11px] font-semibold disabled:opacity-40 ${organizerAccess ? 'border-danger/30 bg-danger-soft text-danger' : 'border-accent/25 bg-accent-soft text-accent'}`}>{accessSaving ? 'Сохраняем…' : organizerAccess ? 'Отозвать доступ к CRM' : 'Выдать доступ к CRM'}</button>
          </div>

          <div className="rounded-[13px] bg-surface-2 p-3 text-[10px] leading-4 text-text-muted">Контактный статус, пауза приглашений, контакты и заметки редактируются отдельно в настройках профиля. Изменение этих полей не меняет игровые или административные права.</div>
        </div>
      </MobileSheet>

      <ConfirmDialog
        open={confirmation?.kind === 'close'}
        title="Закрыть без сохранения?"
        description="Вы изменили игровой статус или полномочия. Несохранённые значения будут потеряны."
        confirmLabel="Закрыть без сохранения"
        tone="warning"
        onCancel={() => setConfirmation(null)}
        onConfirm={() => { setConfirmation(null); setDraft(baseline); setOpen(false); }}
      />

      <ConfirmDialog
        open={confirmation?.kind === 'crm-access'}
        title={confirmation?.kind === 'crm-access' && confirmation.enabled ? 'Выдать доступ к CRM организатора?' : 'Отозвать доступ к CRM организатора?'}
        description={confirmation?.kind === 'crm-access' && confirmation.enabled
          ? 'Игрок сможет открывать Organizer CRM после подтверждённой авторизации своего канонического аккаунта. Это не меняет его статус в клубе.'
          : 'Игрок потеряет административный доступ к Organizer CRM. Игровой уровень, статус в клубе и полномочия ведущего не изменятся.'}
        confirmLabel={confirmation?.kind === 'crm-access' && confirmation.enabled ? 'Выдать доступ' : 'Отозвать доступ'}
        tone={confirmation?.kind === 'crm-access' && confirmation.enabled ? 'warning' : 'danger'}
        busy={accessSaving}
        onCancel={() => { if (!accessSaving) setConfirmation(null); }}
        onConfirm={() => confirmation?.kind === 'crm-access' ? changeOrganizerAccess(confirmation.enabled) : undefined}
      />
    </>
  );
}

export default PlayerAccessSettings;
