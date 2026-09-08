import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerHistoryStatsView from './PlayerHistoryStatsView.tsx';
import PlayerCareerProfile from './PlayerCareerProfile.tsx';
import PlayerEveningSummaries from './PlayerEveningSummaries.tsx';

export type PlayerGamesSection = 'games' | 'stats' | 'career' | 'recaps';

type PrimaryGamesSection = 'games' | 'stats' | 'overview';

const PRIMARY_TABS: Array<{ id: PrimaryGamesSection; label: string; description: string }> = [
  { id: 'games', label: 'История', description: 'Список сыгранных партий' },
  { id: 'stats', label: 'Статистика', description: 'Сводные показатели' },
  { id: 'overview', label: 'Обзор', description: 'Карьера и итоги вечеров' },
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
  const primarySection: PrimaryGamesSection = section === 'career' || section === 'recaps' ? 'overview' : section;

  return (
    <div className="bg-[#090a0d] text-white">
      <div className="mx-auto w-full max-w-[430px] px-3 pt-3">
        <header className="px-1 pb-3 pt-1">
          <h1 className="text-2xl font-semibold">Игры</h1>
          <p className="mt-1 text-sm leading-5 text-white/50">История партий, показатели и развитие игрока</p>
        </header>
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-1" aria-label="Раздел игр">
          {PRIMARY_TABS.map((tab) => {
            const active = primarySection === tab.id;
            const destination: PlayerGamesSection = tab.id === 'overview' ? 'career' : tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onOpen(destination)}
                aria-current={active ? 'page' : undefined}
                aria-label={`${tab.label}: ${tab.description}`}
                className={`min-h-11 rounded-xl px-2 text-[14px] font-semibold transition ${active ? 'bg-white text-black' : 'text-white/55 active:bg-white/[0.05]'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {primarySection === 'overview' ? (
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.025] p-1" aria-label="Обзор игр">
            <button
              type="button"
              onClick={() => onOpen('career')}
              aria-current={section === 'career' ? 'page' : undefined}
              className={`min-h-11 rounded-xl px-3 text-[14px] font-semibold transition ${section === 'career' ? 'bg-white/[0.12] text-white' : 'text-white/50'}`}
            >
              Карьера
            </button>
            <button
              type="button"
              onClick={() => onOpen('recaps')}
              aria-current={section === 'recaps' ? 'page' : undefined}
              className={`min-h-11 rounded-xl px-3 text-[14px] font-semibold transition ${section === 'recaps' ? 'bg-white/[0.12] text-white' : 'text-white/50'}`}
            >
              Итоги вечеров
            </button>
          </div>
        ) : null}
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
          <PlayerHistoryStatsView
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
