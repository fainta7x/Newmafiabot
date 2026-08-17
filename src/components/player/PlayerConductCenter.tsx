import type { PlayerMeResponse } from '../../types/player.ts';
import JudgeGameLauncher from './JudgeGameLauncher.tsx';
import PlayerJudging from './PlayerJudging.tsx';

type Props = {
  data: PlayerMeResponse;
  onBack: () => void;
};

export default function PlayerConductCenter({ data, onBack }: Props) {
  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <div className="px-1 pb-1 pt-2">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-100/40">Игровой центр</div>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-white">Ведение игр</h1>
              <p className="mt-1 text-sm leading-5 text-white/45">Запуск движка и все назначенные вам игры — в одном месте.</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200/15 bg-amber-200/[0.08] text-xl text-amber-100">▶</div>
          </div>
        </div>

        <JudgeGameLauncher
          judge={{ id: data.player.id, nickname: data.player.nickname }}
          evenings={[]}
          allowClubGame={false}
          onCreated={() => undefined}
        />

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-xs leading-5 text-white/35">
          Боевые клубные и турнирные игры появляются ниже после назначения организатором. Тестовая игра не сохраняется в статистику.
        </div>

        <PlayerJudging onBack={onBack} />
      </div>
    </main>
  );
}
