import type { PlayerMeResponse } from '../../types/player.ts';
import LegacyPlayerCabinetShell, { type PlayerCabinetSection as LegacySection } from './PlayerCabinetShellLegacy.tsx';
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
  onOpen: (section: LegacySection, target?: string | null) => void;
}) {
  return (
    <div className="bg-[#090a0d] text-white">
      <div className="mx-auto w-full max-w-[430px] px-3 pt-3">
        <div className="grid grid-cols-4 gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-1">
          {TABS.map((tab) => {
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onOpen(tab.id as LegacySection)}
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
        <PlayerCareerProfile playerId={data.player.id} onBack={() => onOpen('games')} />
      ) : section === 'recaps' ? (
        <PlayerEveningSummaries onBack={() => onOpen('games')} initialEveningId={target} />
      ) : (
        <div className="legacy-cabinet-wrap">
          <LegacyPlayerCabinetShell
            data={data}
            canOpenAdmin={canOpenAdmin}
            initialSection={section}
            initialTarget={target}
            onSectionChange={(next, nextTarget) => onOpen(next, nextTarget || null)}
          />
        </div>
      )}
    </div>
  );
}
