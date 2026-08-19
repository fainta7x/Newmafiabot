import React, { useEffect, useRef, useState } from 'react';
import { preparePlayerAvatar } from '../../lib/playerAvatarImage.ts';
import type { ClubGameRecord } from '../../lib/clubGamesApi.ts';
import type { PlayerMeResponse } from './PlayerCabinet.tsx';
import PlayerJudging, { loadPlayerJudgingDashboard, type PlayerJudgingDashboard } from './PlayerJudging.tsx';
import JudgeMusicPlaylist from './JudgeMusicPlaylist.tsx';
import JudgeGameLauncher, { type JudgeStartEvening } from './JudgeGameLauncher.tsx';
import { EveningLiveGameModal } from '../crm/EveningLiveGameModal.tsx';
import { Button } from '../ui/Button.tsx';
import { Field, FieldDescription, FieldLabel, FieldMessage } from '../ui/Field.tsx';
import { Input } from '../ui/Input.tsx';

type ClubRole = 'guest' | 'member' | 'team' | 'organizer';
type Player = PlayerMeResponse['player'] & { phone?: string | null; club_role?: ClubRole | null };
type JudgingWithLauncher = PlayerJudgingDashboard & { available_evenings?: JudgeStartEvening[] };

const normalizeNullable = (value: string) => value.trim() || null;

export default function PlayerProfileSettings({
  player,
  onPlayerChange,
}: {
  player: Player;
  onPlayerChange: (player: Player) => void;
}) {
  const [nickname, setNickname] = useState(player.nickname || '');
  const [fullName, setFullName] = useState(player.full_name || '');
  const [phone, setPhone] = useState(player.phone || '');
  const [saving, setSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [judging, setJudging] = useState<JudgingWithLauncher | null>(null);
  const [judgingOpen, setJudgingOpen] = useState(false);
  const [launchedGame, setLaunchedGame] = useState<ClubGameRecord | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reloadJudging = async () => {
    try {
      setJudging(await loadPlayerJudgingDashboard() as JudgingWithLauncher);
    } catch {
      setJudging(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/profile-settings', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить данные профиля');
        if (cancelled || !body?.player) return;
        const next = { ...player, ...body.player } as Player;
        onPlayerChange(next);
        setNickname(next.nickname || '');
        setFullName(next.full_name || '');
        setPhone(next.phone || '');
      } catch (loadError: any) {
        if (!cancelled) setError(loadError?.message || 'Не удалось загрузить данные профиля');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadPlayerJudgingDashboard()
      .then((data) => { if (!cancelled) setJudging(data as JudgingWithLauncher); })
      .catch(() => { if (!cancelled) setJudging(null); });
    return () => { cancelled = true; };
  }, []);

  const saveProfile = async () => {
    if (saving) return;
    const nextNickname = nickname.trim();
    if (!nextNickname) {
      setError('Ник не может быть пустым');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/player/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nextNickname, full_name: normalizeNullable(fullName), phone: normalizeNullable(phone) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить профиль');
      const next = { ...player, ...body.player } as Player;
      onPlayerChange(next);
      setNickname(next.nickname || '');
      setFullName(next.full_name || '');
      setPhone(next.phone || '');
      setMessage('Профиль сохранён');
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить профиль');
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || avatarSaving) return;
    setAvatarSaving(true);
    setError(null);
    setMessage(null);
    try {
      const prepared = await preparePlayerAvatar(file);
      const response = await fetch('/api/player/me/avatar', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prepared),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить аватар');
      const version = encodeURIComponent(String(body.updated_at || Date.now()));
      onPlayerChange({ ...player, avatar_url: `/api/player/players/${encodeURIComponent(player.id)}/avatar?v=${version}` });
      setMessage('Аватар обновлён');
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Не удалось сохранить аватар');
    } finally {
      setAvatarSaving(false);
    }
  };

  const deleteAvatar = async () => {
    if (avatarSaving || !player.avatar_url) return;
    if (!window.confirm('Удалить аватар из профиля?')) return;
    setAvatarSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/player/me/avatar', { method: 'DELETE', credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось удалить аватар');
      onPlayerChange({ ...player, avatar_url: null });
      setMessage('Аватар удалён');
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Не удалось удалить аватар');
    } finally {
      setAvatarSaving(false);
    }
  };

  const canJudgeClubGame = Boolean(judging && judging.player.judge_level !== 'none');
  const canOpenTestGame = canJudgeClubGame || player.club_role === 'organizer';

  if (launchedGame) {
    return (
      <EveningLiveGameModal
        game={launchedGame}
        onClose={() => { setLaunchedGame(null); void reloadJudging(); }}
        onUpdated={() => { setLaunchedGame(null); void reloadJudging(); }}
      />
    );
  }

  if (judgingOpen) {
    return <PlayerJudging onBack={() => { setJudgingOpen(false); void reloadJudging(); }} />;
  }

  return (
    <div className="space-y-3">
      <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Аватар</div>
        <div className="mt-3 flex items-center gap-4">
          {player.avatar_url ? <img src={player.avatar_url} alt={player.nickname} className="h-24 w-24 shrink-0 rounded-[24px] object-cover ring-1 ring-white/15" /> : <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[24px] bg-white/10 text-3xl font-semibold text-white/65">{player.nickname.slice(0, 1).toUpperCase()}</div>}
          <div className="min-w-0 flex-1 space-y-2">
            <button type="button" disabled={avatarSaving} onClick={() => fileRef.current?.click()} className="min-h-11 w-full rounded-2xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-50">{avatarSaving ? 'Сохраняем…' : player.avatar_url ? 'Сменить аватар' : 'Загрузить аватар'}</button>
            {player.avatar_url && <button type="button" disabled={avatarSaving} onClick={() => void deleteAvatar()} className="min-h-10 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white/55 disabled:opacity-50">Удалить</button>}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-white/30">Фото автоматически обрежется в квадрат и подготовится для профиля.</p>
      </section>

      <section data-testid="profile-personal-data" className="rounded-[var(--ds-radius-lg)] border border-border bg-[var(--ds-surface)] p-4">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Личные данные</div>
        <div className="mt-3 space-y-3">
          <Field>
            <FieldLabel htmlFor="profile-nickname">Игровой ник</FieldLabel>
            <Input id="profile-nickname" data-testid="profile-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={60} autoComplete="nickname" />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-full-name">Имя</FieldLabel>
            <Input id="profile-full-name" data-testid="profile-full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} placeholder="Можно не указывать" autoComplete="name" />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-phone">Телефон</FieldLabel>
            <Input id="profile-phone" data-testid="profile-phone" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} inputMode="tel" type="tel" placeholder="Можно не указывать" autoComplete="tel" />
          </Field>
          <div className="rounded-[var(--ds-radius-md)] border border-border bg-[var(--ds-background)] px-3.5 py-3">
            <div className="text-xs font-semibold text-muted-foreground">Telegram</div>
            <div className="mt-1 text-sm text-foreground">{player.telegram_username ? `@${player.telegram_username.replace(/^@/, '')}` : 'Привязан через Telegram'}</div>
            <FieldDescription className="mt-1">Telegram-привязка системная и вручную здесь не меняется.</FieldDescription>
          </div>
        </div>
        {error && <FieldMessage className="mt-3" tone="error" data-testid="profile-form-message">{error}</FieldMessage>}
        {message && <FieldMessage className="mt-3" tone="success" data-testid="profile-form-message">{message}</FieldMessage>}
        <Button data-testid="profile-save" type="button" size="lg" disabled={saving} onClick={() => void saveProfile()} className="mt-4 w-full">
          {saving ? 'Сохраняем…' : 'Сохранить изменения'}
        </Button>
      </section>

      {canJudgeClubGame && judging && (
        <section className="rounded-3xl border border-amber-200/15 bg-gradient-to-b from-amber-200/[0.07] to-white/[0.025] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/45">Судейство</div>
              <div className="mt-2 text-xl font-semibold text-white">{judging.player.judge_level_label}</div>
              <p className="mt-1 text-sm leading-5 text-white/35">Назначенных активных игр: {judging.club_games.filter((game) => game.status !== 'completed').length + judging.tournament_games.filter((game) => game.status !== 'completed').length}</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-200/[0.08] text-xl">⚖️</div>
          </div>
          <button type="button" onClick={() => setJudgingOpen(true)} className="mt-4 min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white">Назначения и история судейства</button>
        </section>
      )}

      {canOpenTestGame && (
        <JudgeGameLauncher
          judge={{ id: judging?.player.id || player.id, nickname: judging?.player.nickname || player.nickname }}
          evenings={canJudgeClubGame && judging ? judging.available_evenings || [] : []}
          onCreated={setLaunchedGame}
          allowClubGame={canJudgeClubGame}
        />
      )}

      {judging && (judging.player.judge_level === 'host' || judging.player.judge_level === 'judge') && <JudgeMusicPlaylist />}

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Оформление профиля</div>
        <p className="mt-2 text-sm leading-6 text-white/35">Здесь позже можно добавить рамки аватара, фон карточки и выбранное достижение — уже как настоящую кастомизацию, не смешивая её с личными данными.</p>
      </section>
    </div>
  );
}
