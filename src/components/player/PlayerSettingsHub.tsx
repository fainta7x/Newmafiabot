import { useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerMusicSlots from './PlayerMusicSlots.tsx';
import PlayerNotificationSettings from './PlayerNotificationSettings.tsx';
import PlayerInviteSettings from './PlayerInviteSettings.tsx';
import PlayerProfilePrivacySettings from './PlayerProfilePrivacySettings.tsx';
import PlayerProfileSettings from './PlayerProfileSettings.tsx';

/** «Настройки» — the gear in the header (owner decision 2026-10-06): my details, notifications, privacy, music. */
export default function PlayerSettingsHub({ data, onPlayerChange }: { data: PlayerMeResponse; onPlayerChange?: (player: PlayerMeResponse['player']) => void }) {
  const [player, setPlayer] = useState(data.player);
  const updatePlayer = (next: PlayerMeResponse['player']) => { setPlayer(next); onPlayerChange?.(next); };
  return (
    <main className="player-workspace-page min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white" data-testid="player-settings">
      <div className="player-workspace player-settings-layout mx-auto w-full max-w-[430px] space-y-4">
        <header className="px-1 pt-1">
          <h1 className="text-2xl font-semibold">Настройки</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">Мои данные, уведомления, приглашения, кто видит профиль и музыка для вечера</p>
        </header>
        <nav aria-label="Разделы настроек" className="flex gap-2 overflow-x-auto pb-1">{[['data','Данные'],['notifications','Уведомления'],['invites','Приглашения'],['privacy','Приватность'],['music','Музыка']].map(([id,label]) => <a key={id} href={`#settings-${id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-white/10 px-3 text-xs text-white/75">{label}</a>)}</nav>
        <div id="settings-data" className="player-settings-primary scroll-mt-20"><PlayerProfileSettings player={player} onPlayerChange={updatePlayer} /></div>
        <div className="player-settings-secondary space-y-4">
        <section id="settings-notifications" className="scroll-mt-20"><p className="mb-1 text-xs text-white/55">Изменения сохраняются сразу</p><PlayerNotificationSettings nickname={player.nickname} /></section>
        <section id="settings-invites" className="scroll-mt-20"><p className="mb-1 text-xs text-white/55">Изменения сохраняются сразу</p><PlayerInviteSettings /></section>
        <section id="settings-privacy" className="scroll-mt-20"><p className="mb-1 text-xs text-white/55">Изменения сохраняются сразу</p><PlayerProfilePrivacySettings /></section>
        <details id="settings-music" className="scroll-mt-20 rounded-2xl border border-white/10 bg-white/[.03] p-4">
          <summary className="cursor-pointer font-semibold">Моя музыка для вечера</summary>
          <div className="mt-4"><PlayerMusicSlots /></div>
        </details>
        </div>
      </div>
    </main>
  );
}
