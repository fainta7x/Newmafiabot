import { useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerMusicSlots from './PlayerMusicSlots.tsx';
import { PlayerProfileCompletionCard } from './PlayerProfileCompleteness.tsx';
import PlayerProfileSettings from './PlayerProfileSettings.tsx';
import PlayerVerifiedAwards from './PlayerVerifiedAwards.tsx';

const gameLevelLabel = (level: string) => {
  if (level === 'novice') return 'Новичок';
  if (level === 'tournament') return 'Турнирный игрок';
  return 'Игрок клуба';
};

export default function PlayerProfileHub({ data, onPlayerChange }: { data: PlayerMeResponse; onPlayerChange?: (player: PlayerMeResponse['player']) => void }) {
  const [player, setPlayer] = useState(data.player);
  const updatePlayer = (next: PlayerMeResponse['player']) => { setPlayer(next); onPlayerChange?.(next); };
  const stats = data.games.stats;
  const earnedAchievements = data.achievements.categories.flatMap((category) => category.achievements.filter((achievement) => achievement.earned));

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pb-1 pt-1"><h1 className="text-2xl font-semibold">Профиль</h1><p className="mt-1 text-sm leading-5 text-white/50">Личные данные, достижения и история игрока</p></header>

        <section className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
          <div className="flex items-center gap-4">
            {player.avatar_url ? <img src={player.avatar_url} alt={player.nickname} className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-white/15" /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-semibold text-white/70">{player.nickname.slice(0, 1).toUpperCase()}</div>}
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-2xl font-semibold leading-tight">{player.nickname}</h2>
              {player.full_name && <p className="mt-1 break-words text-sm text-white/55">{player.full_name}</p>}
              {player.telegram_username && <p className="mt-1 break-all text-sm text-white/45">@{player.telegram_username.replace(/^@/, '')}</p>}
              <p className="mt-2 text-xs text-white/35">{gameLevelLabel(player.game_level)}</p>
            </div>
          </div>
        </section>

        <PlayerProfileCompletionCard />

        <section className="grid grid-cols-4 gap-1.5 rounded-[24px] border border-white/10 bg-white/[0.045] p-2.5 text-center">
          {[['Elo', player.elo], ['Игры', stats.completedGames], ['Победы', stats.wins], ['Винрейт', `${stats.winRate}%`]].map(([label, value]) => <div key={String(label)} className="min-w-0 rounded-xl bg-black/20 px-1 py-2.5"><strong className="block break-words text-base font-semibold">{value}</strong><span className="mt-1 block text-xs text-white/45">{label}</span></div>)}
        </section>

        <PlayerVerifiedAwards />

        <details className="group rounded-[24px] border border-white/10 bg-white/[0.045]" open={earnedAchievements.length > 0}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 text-sm font-semibold">Достижения приложения <span className="ml-auto text-white/45">{data.achievements.earned}/{data.achievements.total}</span></summary>
          <div className="border-t border-white/10 p-3">
            {earnedAchievements.length ? <div className="space-y-2">{earnedAchievements.map((achievement) => <div key={achievement.id} className="rounded-xl bg-black/20 p-3"><div className="text-sm font-semibold">{achievement.icon} {achievement.name}</div><p className="mt-1 text-sm leading-5 text-white/50">{achievement.description}</p></div>)}</div> : <div className="py-5 text-center text-sm text-white/45">Достижения появятся по мере игр.</div>}
          </div>
        </details>

        <details className="group rounded-[24px] border border-white/10 bg-white/[0.045]">
          <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 text-sm font-semibold">История турниров и игр <span className="ml-auto text-white/45">{data.games.all.length}</span></summary>
          <div className="space-y-2 border-t border-white/10 p-3">
            {data.games.all.length ? data.games.all.slice(0, 30).map((game) => <div key={game.id} className="rounded-xl bg-black/20 p-3"><div className="break-words text-sm font-semibold">{game.title}</div><div className="mt-1 text-xs text-white/45">Игра №{game.game_number}{game.date ? ` · ${new Date(game.date).toLocaleDateString('ru-RU')}` : ''}{game.won === true ? ' · победа' : game.won === false ? ' · поражение' : ''}</div></div>) : <div className="py-5 text-center text-sm text-white/45">История игр пока пустая.</div>}
          </div>
        </details>

        <PlayerProfileSettings player={player} onPlayerChange={updatePlayer} />
        <PlayerMusicSlots />
      </div>
    </main>
  );
}
