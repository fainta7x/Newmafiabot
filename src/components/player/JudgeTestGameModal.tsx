import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EveningLiveGameModal } from '../crm/EveningLiveGameModal.tsx';
import type { ClubGameRecord } from '../../lib/clubGamesApi.ts';
import { TEST_GAME_ID, beginTestGameSandbox, endTestGameSandbox } from '../../lib/testGameSandbox.ts';
import { createJudgeTrainingSeatingPlan, TRAINING_PEOPLE } from '../../lib/judgeTrainingSetup.ts';
import JudgeTrainingSeating from './JudgeTrainingSeating.tsx';

const buildTestGame = (judge: { id: string; nickname: string }, lineup: string[]): ClubGameRecord => {
  const now = new Date().toISOString();
  const playerResults = Array.from({ length: 10 }, (_, index) => {
    const seat = index + 1;
    return {
      participant_id: `test-participant-${seat}`,
      player_id: null,
      display_name: lineup[index] || `Игрок ${seat}`,
      seat_number: seat,
      role: null,
      team: null,
      exit_type: 'alive',
      regular_fouls: 0,
      minor_tech_fouls: 0,
      major_tech_fouls: 0,
      removal_reason: null,
      ppk: false,
      judge_bonus: 0,
      protocol_bonus: 0,
      ci_points: 0,
      penalty_points: 0,
      disciplinary_penalty_points: 0,
      notes: null,
      color_protocol: [],
    };
  });

  return {
    id: TEST_GAME_ID,
    evening_id: '__test_game__',
    evening_table_id: null,
    table_name: 'Тестовый стол',
    global_game_number: 0,
    game_date: now,
    winner_team: 'draft',
    winner_label: 'Тестовая игра',
    judge_name: judge.nickname,
    judge_player_id: judge.id,
    slots: [],
    status: 'draft',
    club_protocol: {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: {
        status: 'draft',
        winner_team: null,
        end_reason: null,
        judge_notes: null,
        best_moves: [],
        best_move_participant_id: null,
        best_move_source: null,
        best_move_seats: [],
        first_killed_participant_id: null,
        zero_round_voted_participant_id: null,
      } as any,
      player_results: playerResults as any,
    },
    created_at: now,
    archived_at: null,
  };
};

const installTestSaveInterceptor = (game: ClubGameRecord) => {
  const originalFetch = window.fetch;
  const testPath = `/api/games/${TEST_GAME_ID}/evening-protocol`;

  const patchedFetch: typeof window.fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl, window.location.origin);
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    if (method === 'PUT' && url.pathname === testPath) {
      let payload: any = {};
      try {
        payload = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      } catch {}

      const updated: ClubGameRecord = {
        ...game,
        status: 'completed',
        winner_team: payload?.protocol?.winner_team || 'completed',
        winner_label: payload?.protocol?.winner_team === 'red' ? 'Красные' : 'Чёрные',
        club_protocol: game.club_protocol ? {
          ...game.club_protocol,
          protocol: payload?.protocol || game.club_protocol.protocol,
          player_results: Array.isArray(payload?.player_results) ? payload.player_results : game.club_protocol.player_results,
        } : game.club_protocol,
      };

      return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // A synthetic game must never send gameplay changes to the real API.
    if (url.pathname.startsWith(testPath.slice(0, testPath.indexOf('/evening-protocol')) + '/')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch.call(window, input as any, init);
  };

  window.fetch = patchedFetch;
  return () => {
    if (window.fetch === patchedFetch) window.fetch = originalFetch;
  };
};

export default function JudgeTestGameModal({
  judge,
  onClose,
  training = false,
}: {
  judge: { id: string; nickname: string };
  onClose: (completed?: boolean) => void;
  training?: boolean;
}) {
  const seatPlan = useMemo(() => createJudgeTrainingSeatingPlan(), []);
  const [trainingLineup, setTrainingLineup] = useState<string[] | null>(training ? null : TRAINING_PEOPLE);
  const game = useMemo(() => buildTestGame(judge, trainingLineup || TRAINING_PEOPLE), [judge.id, judge.nickname, trainingLineup]);
  const [ready, setReady] = useState(false);
  const completedRef = useRef(false);

  useLayoutEffect(() => {
    if (!trainingLineup) return;
    completedRef.current = false;
    beginTestGameSandbox();
    const restoreFetch = installTestSaveInterceptor(game);
    setReady(true);

    return () => {
      restoreFetch();
      endTestGameSandbox();
    };
  }, [game, trainingLineup]);

  if (training && !trainingLineup) {
    return <JudgeTrainingSeating plan={seatPlan} onClose={() => onClose(false)} onComplete={setTrainingLineup} />;
  }
  if (!ready) return null;

  return (
    <>
      <EveningLiveGameModal
        game={game}
        trainingMode={training}
        onClose={() => {
          if (!completedRef.current) onClose(false);
        }}
        onUpdated={() => {
          completedRef.current = true;
          onClose(true);
        }}
      />
      {!training && <div className="pointer-events-none fixed left-1/2 top-1 z-[125] -translate-x-1/2 rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-amber-200 backdrop-blur-xl">
        Тест · не сохраняется
      </div>}
    </>
  );
}
