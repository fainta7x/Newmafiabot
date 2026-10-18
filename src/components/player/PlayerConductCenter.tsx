import { useResumeLiveGame } from '../../lib/useResumeLiveGame.ts';
import { useEffect, useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import type { ClubGameRecord } from '../../lib/clubGamesApi.ts';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import { EveningLiveGameModal } from '../crm/EveningLiveGameModal.tsx';
import type { JudgeStartEvening } from './JudgeGameLauncher.tsx';
import JudgeMusicPlaylist from './JudgeMusicPlaylist.tsx';
import PlayerJudging, { loadPlayerJudgingDashboard, type PlayerJudgingDashboard } from './PlayerJudging.tsx';

type ConductPane = 'games' | 'music';
type JudgingWithEvenings = PlayerJudgingDashboard & { available_evenings?: JudgeStartEvening[] };

type Props = {
  data: PlayerMeResponse;
  canOpenAdmin?: boolean;
  /** Way back to the CRM screen the organizer came from («Ещё → Музыкальная база»). */
  onBackToCrm?: () => void;
  initialPane?: ConductPane;
  onPaneChange?: (pane: ConductPane) => void;
};

export default function PlayerConductCenter({ data, canOpenAdmin = false, onBackToCrm, initialPane = 'games', onPaneChange }: Props) {
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

  // A reload returns to the game window that was open.
  useResumeLiveGame('club', judging ? (judging.club_games as unknown as ClubGameRecord[]).filter((game) => (game as { can_conduct?: boolean }).can_conduct) : null, launchedGame !== null, setLaunchedGame);

  const isOrganizer = canOpenAdmin || data.player.club_role === 'organizer';
  const judgeLevel = judging?.player.judge_level || data.player.judge_level || 'none';
  const canJudgeClubGame = judgeLevel !== 'none';
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
        {onBackToCrm && pane === 'music' ? <button type="button" data-testid="conduct-back-to-crm" onClick={onBackToCrm} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 text-sm font-semibold text-white/85">← Назад в CRM · Музыкальная база</button> : null}
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
            <PlayerJudging
              evenings={canJudgeClubGame || isOrganizer ? judging?.available_evenings || [] : []}
              onCreated={setLaunchedGame}
            />
            <p className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-xs leading-5 text-white/50">
              Потренироваться без записи в клуб можно в <a href="/guide?from=conduct&tab=judge-conduct" data-testid="conduct-training-link" className="font-semibold text-amber-100/80 underline">«Обучении»</a>: учебная партия с подсказками и свободная тестовая игра.
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
