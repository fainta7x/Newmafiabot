import { useState } from 'react';
import { EveningLiveGameModal } from '../crm/EveningLiveGameModal.js';
import type { ClubGameRecord } from '../../lib/clubGamesApi.js';

const fixtureGame: ClubGameRecord = {
  id: 999001,
  evening_id: 'e2e-evening',
  evening_table_id: 'e2e-table',
  table_name: 'E2E стол',
  global_game_number: 999,
  game_date: '2026-08-18',
  winner_team: '',
  winner_label: '',
  judge_name: 'E2E Ведущий',
  judge_player_id: 'e2e-judge',
  slots: [],
  status: 'draft',
  created_at: '2026-08-18T00:00:00.000Z',
  archived_at: null,
  club_protocol: {
    version: 1,
    kind: 'club_evening_protocol',
    protocol: {
      status: 'draft',
      winner_team: null,
      judge_notes: null,
      votes: [],
      shots: [],
      best_moves: [],
      best_move_participant_id: null,
      best_move_source: null,
      best_move_seats: [],
      ppk_culprit_participant_id: null,
      first_killed_participant_id: null,
      zero_round_voted_participant_id: null,
    } as any,
    player_results: Array.from({ length: 10 }, (_, index) => ({
      participant_id: `participant-${index + 1}`,
      player_id: `player-${index + 1}`,
      display_name: `Игрок ${index + 1}`,
      seat_number: index + 1,
      role: null,
      exit_type: 'alive',
      regular_fouls: 0,
      minor_technical_fouls: 0,
      major_technical_fouls: 0,
      technical_fouls: 0,
      removal_reason: null,
      ppk: false,
      notes: null,
    } as any)),
  },
};

export default function LiveGameE2EHarness() {
  const [closed, setClosed] = useState(false);
  const [updated, setUpdated] = useState<ClubGameRecord | null>(null);

  if (closed) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 p-4 text-white" data-testid="live-game-e2e-closed">
        <h1 className="text-xl font-black">Движок закрыт</h1>
        {updated ? <div data-testid="live-game-e2e-saved">Результат сохранён</div> : null}
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-white" data-testid="live-game-e2e-harness">
      <EveningLiveGameModal
        game={fixtureGame}
        onClose={() => setClosed(true)}
        onUpdated={(game) => setUpdated(game)}
      />
    </main>
  );
}
