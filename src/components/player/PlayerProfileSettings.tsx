import React, { useEffect, useRef, useState } from 'react';
import { preparePlayerAvatar } from '../../lib/playerAvatarImage.ts';
import type { PlayerMeResponse } from '../../types/player.ts';
import { Button } from '../ui/Button.tsx';
import ConfirmDialog from '../ui/ConfirmDialog.tsx';
import { FieldDescription, FieldMessage } from '../ui/Field.tsx';
import PlayerIdentityFields, { type PlayerIdentityDraft } from './PlayerIdentityFields.tsx';

type Player = PlayerMeResponse['player'];
const normalizeNullable = (value: string) => value.trim() || null;

export default function PlayerProfileSettings({ player, onPlayerChange }: { player: Player; onPlayerChange: (player: Player) => void }) {
  const [identity, setIdentity] = useState<PlayerIdentityDraft>({ nickname: player.nickname || '', fullName: player.full_name || '', phone: player.phone || '' });
  const [saving, setSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarDeleteOpen, setAvatarDeleteOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setIdentity({ nickname: player.nickname || '', fullName: player.full_name || '', phone: player.phone || '' });
  }, [player.id, player.nickname, player.full_name, player.phone]);

  const saveProfile = async () => {
    if (saving) return;
    const nextNickname = identity.nickname.trim();
    if (!nextNickname) { setError('Ник не может быть пустым'); return; }
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch('/api/player/me', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nextNickname, full_name: normalizeNullable(identity.fullName), phone: normalizeNullable(identity.phone) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить профиль');
      onPlayerChange({ ...player, ...body.player } as Player);
      setMessage('Профиль сохранён');
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить профиль');
    } finally { setSaving(false); }
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || avatarSaving) return;
    setAvatarSaving(true); setError(null); setMessage(null);
    try {
      const prepared = await preparePlayerAvatar(file);
      const response = await fetch('/api/player/me/avatar', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prepared) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить фото');
      const version = encodeURIComponent(String(body.updated_at || Date.now()));
      onPlayerChange({ ...player, avatar_url: `/api/player/players/${encodeURIComponent(player.id)}/avatar?v=${version}` });
      setMessage('Фото обновлено');
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Не удалось сохранить фото');
    } finally { setAvatarSaving(false); }
  };

  const deleteAvatar = async () => {
    if (avatarSaving || !player.avatar_url) return;
    setAvatarSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch('/api/player/me/avatar', { method: 'DELETE', credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось удалить фото');
      onPlayerChange({ ...player, avatar_url: null });
      setMessage('Фото удалено');
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Не удалось удалить фото');
    } finally { setAvatarSaving(false); setAvatarDeleteOpen(false); }
  };

  return (
    <div className="space-y-3">
      <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Фото профиля</div>
        <div className="mt-3 flex items-center gap-4">
          {player.avatar_url ? <img src={player.avatar_url} alt={player.nickname} className="h-24 w-24 shrink-0 rounded-[24px] object-cover ring-1 ring-white/15" /> : <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[24px] bg-white/10 text-3xl font-semibold text-white/65">{player.nickname.slice(0, 1).toUpperCase()}</div>}
          <div className="min-w-0 flex-1 space-y-2">
            <button type="button" disabled={avatarSaving} onClick={() => fileRef.current?.click()} className="min-h-11 w-full rounded-2xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-50">{avatarSaving ? 'Сохраняем…' : player.avatar_url ? 'Сменить фото' : 'Загрузить фото'}</button>
            {player.avatar_url ? <button type="button" disabled={avatarSaving} onClick={() => setAvatarDeleteOpen(true)} className="min-h-10 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white/55 disabled:opacity-50">Удалить</button> : null}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
          </div>
        </div>
      </section>

      <section data-testid="profile-personal-data" className="rounded-[var(--ds-radius-lg)] border border-border bg-[var(--ds-surface)] p-4">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Основной профиль</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Один профиль используется в кабинете, CRM и играх.</p>
        <div className="mt-3"><PlayerIdentityFields value={identity} onChange={setIdentity} /></div>
        <div className="mt-3 rounded-[var(--ds-radius-md)] border border-border bg-[var(--ds-background)] px-3.5 py-3">
          <div className="text-xs font-semibold text-muted-foreground">Telegram</div>
          <div className="mt-1 text-sm text-foreground">{player.telegram_username ? `@${player.telegram_username.replace(/^@/, '')}` : 'Привязан через Telegram'}</div>
          <FieldDescription className="mt-1">Системная привязка не меняется вручную.</FieldDescription>
        </div>
        {error ? <FieldMessage className="mt-3" tone="error" data-testid="profile-form-message">{error}</FieldMessage> : null}
        {message ? <FieldMessage className="mt-3" tone="success" data-testid="profile-form-message">{message}</FieldMessage> : null}
        <Button data-testid="profile-save" type="button" size="lg" disabled={saving} onClick={() => void saveProfile()} className="mt-4 w-full">{saving ? 'Сохраняем…' : 'Сохранить изменения'}</Button>
      </section>

      <ConfirmDialog open={avatarDeleteOpen} title="Удалить фото?" description="Фото будет удалено из единого профиля игрока." confirmLabel="Удалить" tone="danger" busy={avatarSaving} onCancel={() => setAvatarDeleteOpen(false)} onConfirm={deleteAvatar} />
    </div>
  );
}
