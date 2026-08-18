import { useState } from 'react';
import type { Player } from '../../types.js';
import LiveGameEngine from '../LiveGameEngine.js';
import { MobileLiveGameStyles } from '../crm/EveningLiveGameModal.js';
import { CLUB_EVENING_ENGINE_JUDGE_NOTE } from './setupMode.js';

const fixturePlayers = [
  ...Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    user_id: index + 1,
    nickname: `Игрок ${index + 1}`,
    full_name: `Игрок ${index + 1}`,
    username: '',
    games_played: 0,
    games_won: 0,
    elo: 0,
    debt: 0,
    total_paid: 0,
    tokens: 0,
    achievements: [],
    last_visit: null,
  })),
  {
    id: 999,
    user_id: 999,
    nickname: 'E2E Ведущий',
    full_name: 'E2E Ведущий',
    username: '',
    games_played: 0,
    games_won: 0,
    elo: 0,
    debt: 0,
    total_paid: 0,
    tokens: 0,
    achievements: [],
    last_visit: null,
    notes: CLUB_EVENING_ENGINE_JUDGE_NOTE,
  },
] as Player[];

export default function LiveGameE2EHarness() {
  const [finished, setFinished] = useState<any | null>(null);
  const [cancelled, setCancelled] = useState(false);

  if (finished) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 p-4 text-white" data-testid="live-game-finished">
        <h1 className="text-xl font-black">Игра завершена</h1>
        <pre className="mt-4 whitespace-pre-wrap text-xs">{JSON.stringify(finished, null, 2)}</pre>
      </main>
    );
  }

  if (cancelled) {
    return <main className="min-h-[100dvh] bg-slate-950 p-4 text-white" data-testid="live-game-cancelled">Игра отменена</main>;
  }

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white" data-testid="live-game-e2e-harness">
      <MobileLiveGameStyles />
      <div className="evening-live-engine-shell">
        <LiveGameEngine
          players={fixturePlayers}
          initialJudgeId={999}
          onGameFinished={(game) => setFinished(game)}
          onCancel={() => setCancelled(true)}
        />
      </div>
    </div>
  );
}
