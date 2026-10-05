import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerHistoryStatsView from './PlayerHistoryStatsView.tsx';
import PlayerEveningSummaries from './PlayerEveningSummaries.tsx';

export type PlayerGamesSection = 'games' | 'recaps';

const TABS: Array<{ id: PlayerGamesSection; label: string }> = [
  { id: 'games', label: 'История' },
  { id: 'recaps', label: 'Итоги вечеров' },
];

export default function PlayerGamesHub({
  data,
  canOpenAdmin,
  section,
  target = null,
  onOpen,
  onOpenProfile,
}: {
  data: PlayerMeResponse;
  canOpenAdmin: boolean;
  section: PlayerGamesSection;
  target?: string | null;
  onOpen: (section: PlayerGamesSection, target?: string | null) => void;
  /** Statistics, roles, Elo and awards live in the one player profile. */
  onOpenProfile?: () => void;
}) {
  return (
    <div className="bg-[#090a0d] text-white">
      <div className="mx-auto w-full max-w-[430px] px-3 pt-3">
        <header className="px-1 pb-3 pt-1">
          <h1 className="text-2xl font-semibold">Игры</h1>
          <p className="mt-1 text-sm leading-5 text-white/50">История партий и итоги вечеров</p>
        </header>
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-1" aria-label="Раздел игр">
          {TABS.map((tab) => {
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onOpen(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-11 rounded-xl px-2 text-[14px] font-semibold transition ${active ? 'bg-white text-black' : 'text-white/55 active:bg-white/[0.05]'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {onOpenProfile ? <button type="button" onClick={onOpenProfile} data-testid="games-open-profile" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 text-left text-[13px] text-white/60">Статистика, роли, Elo и награды — в профиле ›</button> : null}
      </div>

      {section === 'recaps' ? (
        <PlayerEveningSummaries initialEveningId={target} embedded />
      ) : (
        <div className="player-games-v2">
          <PlayerHistoryStatsView
            data={data}
            canOpenAdmin={canOpenAdmin}
            initialTab="games"
            embedded
            onTabChange={(next) => {
              if (next === 'games') onOpen(next);
            }}
          />
        </div>
      )}
    </div>
  );
}
