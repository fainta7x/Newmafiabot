import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { PlayerDetails } from '../../lib/api.ts';
import {
  accessLabel,
  CLUB_MEMBERSHIPS,
  CLUB_ORGANIZATION,
  clubRoleFrom,
  clubStageNote,
  GAME_LEVELS,
  membershipOfPlayer,
  normalizeClubRole,
  normalizeGameLevel,
  organizationOf,
  PLAYER_ACTIVITY,
  type PlayerActivity,
  type ClubOrganization,
  type ClubRole,
  type GameLevel,
} from '../../lib/playerAccess.ts';
import { HOST_FORMATS, HOST_FORMAT_OPTIONS, hostFormatsOf, hostFormatsSummary, type HostFormat } from '../../lib/hostFormats.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { usePlayerEveningQuickAdd } from './PlayerEveningQuickAdd.tsx';
import { useClubOwner } from './useClubOwner.ts';
import { ORGANIZE_FORMATS, ORGANIZE_FORMAT_OPTIONS, normalizeOrganizeFormats, organizeFormatsSummary, type OrganizeFormat } from '../../lib/organizeFormats.ts';
import { CURATOR_AREAS, CURATOR_AREA_OPTIONS, curatorAreasSummary, normalizeCuratorAreas, type CuratorArea } from '../../lib/curatorAreas.ts';
import { countVisits } from '../../lib/russianPlural';

const visitDate = (value: string) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' });

type PlayerWithAccess = PlayerDetails & {
  from_other_city?: number | null;
  stopped_attending?: number | null;
  game_level?: GameLevel | null;
  club_role?: ClubRole | null;
  attends_sometimes?: number | null;
  judge_level?: string | null;
  host_formats?: string | null;
  organize_formats?: string | null;
  curator_areas?: string | null;
  organizer_player_access?: boolean;
};

type Draft = {
  game_level: GameLevel;
  activity: PlayerActivity;
  club_role: ClubRole;
  attends_sometimes: boolean;
  host_formats: HostFormat[];
  organize_formats: OrganizeFormat[];
  curator_areas: CuratorArea[];
};

type Confirmation =
  | { kind: 'close' }
  | { kind: 'crm-access'; enabled: boolean }
  | null;

// Same four answers as «Ещё → Уровни и роли» (owner, 2026-10-01: the card must offer «Из другого города» too).
const activityOf = (player: PlayerWithAccess): PlayerActivity => (
  Number(player.from_other_city || 0) === 1 ? 'other_city'
    : Number(player.stopped_attending || 0) === 1 ? 'stopped'
      : membershipOfPlayer(player) === 'guest' ? 'sometimes' : 'regular'
);

const normalize = (player: PlayerWithAccess): Draft => ({
  game_level: normalizeGameLevel(player.game_level),
  activity: activityOf(player),
  club_role: normalizeClubRole(player.club_role),
  attends_sometimes: membershipOfPlayer(player) === 'guest',
  host_formats: hostFormatsOf(player),
  organize_formats: normalizeOrganizeFormats(player.organize_formats),
  curator_areas: normalizeCuratorAreas(player.curator_areas),
});

const equalDraft = (left: Draft, right: Draft) =>
  left.game_level === right.game_level
  && left.activity === right.activity
  && left.club_role === right.club_role
  && left.attends_sometimes === right.attends_sometimes
  && left.host_formats.join(',') === right.host_formats.join(',')
  && left.organize_formats.join(',') === right.organize_formats.join(',')
  && left.curator_areas.join(',') === right.curator_areas.join(',');

export function PlayerAccessSettings({ player, onSaved }: { player: PlayerDetails; onSaved?: () => void | Promise<void> }) {
  const accessPlayer = player as PlayerWithAccess;
  const quickAdd = usePlayerEveningQuickAdd();
  // Only the owner gives or takes «Организатор клуба» (= the cabinet); false hides those controls.
  const clubOwner = useClubOwner();
  const ownerOnlyLocked = clubOwner === false;
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
      const { activity, ...fields } = draft;
      const response = await fetch(`/api/players/${encodeURIComponent(player.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // «Может проводить вечера» is sent only when changed: only the owner may change it.
        body: JSON.stringify(draft.organize_formats.join(',') === baseline.organize_formats.join(',')
          ? { game_level: draft.game_level, club_role: draft.club_role, attends_sometimes: draft.attends_sometimes, host_formats: draft.host_formats, curator_areas: draft.curator_areas }
          : fields),
      });
      await readJson(response);
      // «Перестал ходить» and «Из другого города» carry their own rules (announcement pause, roles):
      // the same server step as the bulk screen applies them.
      if (activity !== baseline.activity) {
        const activityResponse = await fetch('/api/players/access/bulk', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_ids: [player.id], activity }),
        });
        await readJson(activityResponse);
      }

      const readbackResponse = await fetch(`/api/players/${encodeURIComponent(player.id)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const readback = await readJson(readbackResponse) as PlayerWithAccess;
      if (sequence !== saveSequence.current) return;

      const persisted = normalize(readback);
      // «Из другого города» may drop club roles on the server (owner rule), so after an activity change
      // only the activity itself must read back as chosen.
      if (activity !== baseline.activity ? persisted.activity !== activity : !equalDraft(persisted, draft)) {
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
        throw new Error('Сервер не подтвердил изменение доступа к кабинету организатора.');
      }
      setOrganizerAccess(enabled);
      // The role follows the cabinet on the server; keep the draft in step so a later Save does not undo it.
      const syncRole = (value: Draft): Draft => ({
        ...value,
        club_role: enabled ? 'organizer' : (value.club_role === 'organizer' ? (value.attends_sometimes ? 'guest' : 'member') : value.club_role),
      });
      setDraft(syncRole);
      setBaseline(syncRole);
      setSuccess(enabled ? 'Доступ к кабинету организатора выдан.' : 'Доступ к кабинету организатора отозван.');
      if (!dirty) await onSaved?.();
    } catch (accessError: any) {
      setError(accessError?.message || 'Не удалось изменить доступ к кабинету организатора');
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

  const visitsCount = Number((player as PlayerDetails).stats?.attendanceCount || 0);
  const lastVisit = (player as PlayerDetails).stats?.lastVisit as string | null | undefined;
  const visitsText = visitsCount ? `${countVisits(visitsCount)}${lastVisit ? ` · последний ${visitDate(lastVisit)}` : ''}` : 'Ещё не был на вечерах';
  const summaryRows: Array<[string, string, string | null]> = [
    ['Уровень игры', accessLabel(GAME_LEVELS, draft.game_level), null],
    ['Как часто ходит', PLAYER_ACTIVITY.find((item) => item.value === draft.activity)?.label || accessLabel(CLUB_MEMBERSHIPS, draft.attends_sometimes ? 'guest' : 'member'), [visitsText, clubStageNote((player as { club_stage?: string }).club_stage)].filter(Boolean).join(' · ')],
    ['Роль в клубе', accessLabel(CLUB_ORGANIZATION, organizationOf(draft.club_role)), null],
    ['Может вести', hostFormatsSummary(draft.host_formats), null],
    ['Проводит вечера', organizeFormatsSummary(draft.organize_formats), null],
    ['Куратор', curatorAreasSummary(draft.curator_areas), null],
    ['Доступы', organizerAccess ? 'Кабинет организатора' : 'Только кабинет игрока', null],
  ];

  return (
    <>
      <section data-testid="crm-player-access-summary" className="rounded-[17px] border border-border-soft bg-surface-1 p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent"><ShieldCheck className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-text-primary">Статус игрока</div>
          </div>
          <button data-testid="crm-player-access-edit" type="button" onClick={() => { const normalized = normalize(accessPlayer); setDraft(normalized); setBaseline(normalized); setOrganizerAccess(Boolean(accessPlayer.organizer_player_access)); setError(null); setSuccess(null); setOpen(true); }} className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[11px] border border-border-soft bg-surface-2 px-3 text-[12px] font-semibold text-text-primary"><SlidersHorizontal className="h-3.5 w-3.5" /> Изменить</button>
        </div>
        <dl className="mt-3 divide-y divide-border-soft rounded-[12px] bg-black/20 text-[12px]">
          {summaryRows.map(([label, value, note]) => (
            <div key={label} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <dt className="shrink-0 text-text-muted">{label}</dt>
              <dd className="min-w-0 text-right"><span className="font-semibold text-text-primary">{value}</span>{note ? <span className="mt-0.5 block text-[11px] text-text-muted">{note}</span> : null}</dd>
            </div>
          ))}
        </dl>
        {success ? <div data-testid="crm-player-access-success" className="mt-2 rounded-[11px] bg-success-soft px-3 py-2 text-[10px] text-success">{success}</div> : null}
        {quickAdd ? <button data-testid="crm-player-signup" type="button" onClick={() => quickAdd.openForPlayer(player)} className="mt-2.5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[11px] border border-accent/25 bg-accent-soft px-3 text-[11px] font-semibold text-accent"><CalendarPlus className="h-4 w-4" /> Добавить на игровой вечер</button> : null}
      </section>

      <MobileSheet open={open} onClose={requestClose} title="Статус игрока" subtitle={player.nickname} widthClass="sm:max-w-lg" footer={footer}>
        <div data-testid="crm-player-access-sheet" className="space-y-4 overflow-x-hidden pb-2">
          {error ? <div data-testid="crm-player-access-error" className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{error}</div> : null}

          <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-text-primary">Уровень игры</span><span className="mb-2 block text-[11px] leading-4 text-text-muted">Насколько хорошо играет. Определяет, в какие форматы можно записаться.</span><select value={draft.game_level} onChange={(event) => setDraft((value) => ({ ...value, game_level: event.target.value as GameLevel }))} className="mobile-field w-full max-w-full">{GAME_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}</select></label>

          <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-text-primary">Как часто ходит</span><span className="mb-2 block text-[11px] leading-4 text-text-muted">Как и в «Уровнях и ролях»: от этого зависят анонсы и приглашения. Число визитов считается само.</span><select data-testid="crm-player-activity" value={draft.activity} onChange={(event) => setDraft((value) => {
            const activity = event.target.value as PlayerActivity;
            const sometimes = activity === 'regular' ? false : activity === 'stopped' ? value.attends_sometimes : true;
            return { ...value, activity, attends_sometimes: sometimes, club_role: clubRoleFrom(sometimes ? 'guest' : 'member', organizationOf(value.club_role)) };
          })} className="mobile-field w-full max-w-full">{PLAYER_ACTIVITY.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}</select></label>

          <div className="space-y-3 rounded-[13px] border border-border-soft p-3">
            <div><div className="text-[12px] font-semibold text-text-primary">Роль в клубе</div><div className="mt-1 text-[11px] leading-4 text-text-muted">Роль в команде клуба и какие вечера может вести. «Организатор» сразу получает кабинет организатора; назначает и снимает организаторов только владелец.</div></div>
            <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Роль в клубе</span><select value={organizationOf(draft.club_role)} disabled={ownerOnlyLocked && organizationOf(draft.club_role) === 'organizer'} onChange={(event) => setDraft((value) => ({ ...value, club_role: clubRoleFrom(value.attends_sometimes ? 'guest' : 'member', event.target.value as ClubOrganization) }))} className="mobile-field w-full max-w-full">{CLUB_ORGANIZATION.map((item) => <option key={item.value} value={item.value} disabled={ownerOnlyLocked && item.value === 'organizer'}>{item.label} — {item.hint}</option>)}</select></label>
            <fieldset className="space-y-1.5" data-testid="crm-player-host-formats">
              <legend className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Может вести</legend>
              {HOST_FORMAT_OPTIONS.map((item) => {
                const checked = draft.host_formats.includes(item.value);
                return (
                  <label key={item.value} className="flex min-h-11 items-start gap-2.5 rounded-[10px] border border-border-soft px-3 py-2">
                    <input type="checkbox" checked={checked} className="mt-0.5 h-5 w-5 shrink-0"
                      onChange={() => setDraft((value) => ({
                        ...value,
                        host_formats: HOST_FORMATS.filter((format) => (format === item.value ? !checked : value.host_formats.includes(format))),
                      }))} />
                    <span className="min-w-0"><span className="block text-[13px] text-text-primary">{item.label}</span><span className="block text-[11px] leading-4 text-text-muted">{item.hint}</span></span>
                  </label>
                );
              })}
            </fieldset>
            <fieldset className="space-y-1.5" data-testid="crm-player-organize-formats" disabled={ownerOnlyLocked}>
              <legend className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Может проводить вечера</legend>
              <p className="mb-1.5 text-[11px] leading-4 text-text-muted">Сам создаёт такие вечера в календаре урезанного кабинета и проводит их: приход, оплата, столы, анонс, закрытие. Турниры — отдельные события: отметка позволяет быть организатором турнира. Даёт только владелец.</p>
              {ORGANIZE_FORMAT_OPTIONS.map((item) => {
                const checked = draft.organize_formats.includes(item.value);
                return (
                  <label key={item.value} className="flex min-h-11 items-start gap-2.5 rounded-[10px] border border-border-soft px-3 py-2">
                    <input type="checkbox" checked={checked} className="mt-0.5 h-5 w-5 shrink-0"
                      onChange={() => setDraft((value) => ({
                        ...value,
                        organize_formats: ORGANIZE_FORMATS.filter((format) => (format === item.value ? !checked : value.organize_formats.includes(format))),
                      }))} />
                    <span className="min-w-0"><span className="block text-[13px] text-text-primary">{item.label}</span><span className="block text-[11px] leading-4 text-text-muted">{item.hint}</span></span>
                  </label>
                );
              })}
            </fieldset>
          </div>

          {draft.activity === 'other_city' ? null : <fieldset className="space-y-1.5 rounded-[13px] border border-border-soft p-3" data-testid="crm-player-curator-areas">
            <legend className="px-1 text-[12px] font-semibold text-text-primary">Куратор направления</legend>
            <p className="mb-1.5 text-[11px] leading-4 text-text-muted">За что отвечает в клубе. Прав в приложении не даёт; если направление давно стоит без дел, в «Делах» появится напоминание написать куратору.</p>
            {CURATOR_AREA_OPTIONS.map((item) => {
              const checked = draft.curator_areas.includes(item.value);
              return (
                <label key={item.value} className="flex min-h-11 items-start gap-2.5 rounded-[10px] border border-border-soft px-3 py-2">
                  <input type="checkbox" checked={checked} className="mt-0.5 h-5 w-5 shrink-0"
                    onChange={() => setDraft((value) => ({
                      ...value,
                      curator_areas: CURATOR_AREAS.filter((area) => (area === item.value ? !checked : value.curator_areas.includes(area))),
                    }))} />
                  <span className="min-w-0"><span className="block text-[13px] text-text-primary">{item.label}</span><span className="block text-[11px] leading-4 text-text-muted">{item.hint}</span></span>
                </label>
              );
            })}
          </fieldset>}

          <div className="rounded-[13px] border border-border-soft bg-surface-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-text-primary">Доступы · кабинет организатора</div>
                <div className="mt-1 text-[10px] leading-4 text-text-muted">Это то же, что роль «Организатор»: выдали доступ — игрок стал организатором клуба, закрыли — снова просто игрок. Выдаёт и закрывает только владелец.</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${organizerAccess ? 'bg-success-soft text-success' : 'bg-black/20 text-text-muted'}`}>{organizerAccess ? 'Есть доступ' : 'Нет доступа'}</span>
            </div>
            {ownerOnlyLocked ? <p className="mt-3 text-[11px] leading-4 text-text-muted" data-testid="crm-player-access-owner-only">Выдать или закрыть кабинет может только владелец клуба.</p> : <button type="button" disabled={accessSaving} onClick={() => setConfirmation({ kind: 'crm-access', enabled: !organizerAccess })} className={`mt-3 min-h-[44px] w-full rounded-[11px] border px-3 text-[11px] font-semibold disabled:opacity-40 ${organizerAccess ? 'border-danger/30 bg-danger-soft text-danger' : 'border-accent/25 bg-accent-soft text-accent'}`}>{accessSaving ? 'Сохраняем…' : organizerAccess ? 'Закрыть доступ к кабинету организатора' : 'Дать доступ к кабинету организатора'}</button>}
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
        title={confirmation?.kind === 'crm-access' && confirmation.enabled ? 'Дать доступ к кабинету организатора?' : 'Закрыть доступ к кабинету организатора?'}
        description={confirmation?.kind === 'crm-access' && confirmation.enabled
          ? 'Игрок станет организатором клуба и сможет открывать кабинет после входа в свой профиль через Telegram или VK.'
          : 'Игрок больше не организатор клуба и не сможет открывать кабинет. Игровой уровень и «Может вести» не изменятся.'}
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
