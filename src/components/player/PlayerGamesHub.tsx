import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerCabinetV2 from './PlayerCabinetV2.tsx';
import PlayerCareerProfile from './PlayerCareerProfile.tsx';
import PlayerEveningSummaries from './PlayerEveningSummaries.tsx';

export type PlayerGamesSection = 'games' | 'stats' | 'career' | 'recaps';

const TABS: Array<{ id: PlayerGamesSection; label: string }> = [
  { id: 'games', label: 'История' },
  { id: 'stats', label: 'Статистика' },
  { id: 'career', label: 'Карьера' },
  { id: 'recaps', label: 'Итоги' },
];

export default function PlayerGamesHub({
  data,
  canOpenAdmin,
  section,
  target = null,
  onOpen,
}: {
  data: PlayerMeResponse;
  canOpenAdmin: boolean;
  section: PlayerGamesSection;
  target?: string | null;
  onOpen: (section: PlayerGamesSection, target?: string | null) => void;
}) {
  return (
    <div className="bg-[#090a0d] text-white">
      <div className="mx-auto w-full max-w-[430px] px-3 pt-3">
        <header className="px-1 pb-3 pt-1">
          <h1 className="text-2xl font-semibold">Игры</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">История партий, показатели, карьера и итоги вечеров</p>
        </header>
        <div className="grid grid-cols-4 gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-1">
          {TABS.map((tab) => {
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onOpen(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-10 rounded-xl px-1 text-[11px] font-semibold transition ${active ? 'bg-white text-black' : 'text-white/42 active:bg-white/[0.05]'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {section === 'career' ? (
        <PlayerCareerProfile playerId={data.player.id} embedded />
      ) : section === 'recaps' ? (
        <PlayerEveningSummaries initialEveningId={target} embedded />
      ) : (
        <div className="player-games-v2">
          <style>{`
            .player-games-v2 nav.fixed{display:none!important}
            .player-games-v2 main > div > div[class*="px-1"][class*="pb-1"][class*="pt-2"]{display:none!important}
            .player-games-v2 main{padding-top:.5rem!important}
          `}</style>
          <PlayerCabinetV2
            data={data}
            canOpenAdmin={canOpenAdmin}
            initialTab={section}
            onTabChange={(next) => {
              if (next === 'games' || next === 'stats') onOpen(next);
            }}
          />
        </div>
      )}
    </div>
  );
}