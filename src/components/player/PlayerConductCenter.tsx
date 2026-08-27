import { useEffect, useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import type { ClubGameRecord } from '../../lib/clubGamesApi.ts';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import { EveningLiveGameModal } from '../crm/EveningLiveGameModal.tsx';
import JudgeGameLauncher, { type JudgeStartEvening } from './JudgeGameLauncher.tsx';
import JudgeMusicPlaylist from './JudgeMusicPlaylist.tsx';
import PlayerJudging, { loadPlayerJudgingDashboard, type PlayerJudgingDashboard } from './PlayerJudging.tsx';

type ConductPane = 'games' | 'music';
type JudgingWithEvenings = PlayerJudgingDashboard & { available_evenings?: JudgeStartEvening[] };

type Props = {
  data: PlayerMeResponse;
  initialPane?: ConductPane;
  onPaneChange?: (pane: ConductPane) => void;
};

export default function PlayerConductCenter({ data, initialPane = 'games', onPaneChange }: Props) {
  const [pane, setPane] = useState<ConductPane>(initialPane);
  const [judging, setJudging] = useState<JudgingWithEvenings | null>(null);
  const [launchedGame, setLaunchedGame] = useState<ClubGameRecord | null>(null);

  useEffect(() => setPane(initialPane), [initialPane]);
  useEffect(() => {
    let cancelled = false;
    void loadPlayerJudgingDashboard()
      .then((next) => { if (!cancelled) setJudging(next as JudgingWithEvenings); })
      .catch(() => { if (!cancelled) setJudging(null); });
    return () => { cancelled = true; };
  }, []);

  const isOrganizer = data.player.club_role === 'organizer';
  const judgeLevel = judging?.player.judge_level || data.player.judge_level || 'none';
  const canJudgeClubGame = judgeLevel !== 'none';
  const canOpenTestGame = canJudgeClubGame || isOrganizer;
  const canManageMusic = isOrganizer || judgeLevel === 'host' || judgeLevel === 'judge';

  const openPane = (next: ConductPane) => {
    setPane(next);
    onPaneChange?.(next);
  };

  if (launchedGame) {
    return <EveningLiveGameModal game={launchedGame} onClose={() => setLaunchedGame(null)} onUpdated={() => setLaunchedGame(null)} />;
  }

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <div className="px-1 pb-1 pt-2">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-100/40">Рабочий режим</div>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-white">Ведение</h1>
              <p className="mt-1 text-sm leading-5 text-white/45">Игры, назначения и музыка ведущего — в одном месте.</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200/15 bg-amber-200/[0.08] text-xl text-amber-100">▶</div>
          </div>
        </div>

        {canManageMusic ? (
          <SegmentedControl
            ariaLabel="Раздел ведения"
            value={pane}
            items={[{ value: 'games', label: 'Игры' }, { value: 'music', label: 'Музыка' }]}
            onValueChange={openPane}
          />
        ) : null}

        {pane === 'music' && canManageMusic ? <JudgeMusicPlaylist /> : null}

        {pane === 'games' ? (
          <>
            {canOpenTestGame ? (
              <JudgeGameLauncher
                judge={{ id: judging?.player.id || data.player.id, nickname: judging?.player.nickname || data.player.nickname }}
                evenings={canJudgeClubGame ? judging?.available_evenings || [] : []}
                allowClubGame={canJudgeClubGame}
                onCreated={setLaunchedGame}
              />
            ) : null}
            <PlayerJudging />
          </>
        ) : null}
      </div>
    </main>
  );
}
