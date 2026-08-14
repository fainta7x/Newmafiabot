import { useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerProfileSettings from './PlayerProfileSettings.tsx';

const gameLevelLabel = (level: string) => {
  if (level === 'novice') return 'Новичок';
  if (level === 'tournament') return 'Турнирный игрок';
  return 'Игрок клуба';
};

export default function PlayerProfileHub({
  data,
  onPlayerChange,
}: {
  data: PlayerMeResponse;
  onPlayerChange?: (player: PlayerMeResponse['player']) => void;
}) {
  const [player, setPlayer] = useState(data.player);

  const updatePlayer = (next: PlayerMeResponse['player']) => {
    setPlayer(next);
    onPlayerChange?.(next);
  };

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pb-1 pt-1">
          <h1 className="text-2xl font-semibold">Профиль</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">Аккаунт, судейство и игровые настройки</p>
        </header>

        <section className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
          <div className="flex items-center gap-4">
            {player.avatar_url ? (
              <img src={player.avatar_url} alt={player.nickname} className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-white/15" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-semibold text-white/70">
                {player.nickname.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-2xl font-semibold">{player.nickname}</h2>
              {player.full_name && <p className="mt-1 truncate text-sm text-white/55">{player.full_name}</p>}
              {player.telegram_username && <p className="mt-1 truncate text-xs text-white/40">@{player.telegram_username.replace(/^@/, '')}</p>}
              <p className="mt-2 text-xs text-white/30">{gameLevelLabel(player.game_level)}</p>
            </div>
          </div>
        </section>

        <PlayerProfileSettings player={player} onPlayerChange={updatePlayer} />
      </div>
    </main>
  );
}
