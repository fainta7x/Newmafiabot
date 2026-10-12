import ReactDOM from 'react-dom/client';
import PlayerGameDetail, { type PlayerGameDetailData } from '../src/components/player/PlayerGameDetail.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const score = (total: number, extra: Record<string, number> = {}) => ({ win_point: 0, judge_bonus: 0, protocol_bonus: 0, ci_points: 0, best_move_points: 0, disciplinary_penalty_points: 0, total_points: total, ...extra });
const names = ['Богданчик', 'Алоэ', 'Дина', 'Знак с очень длинным ником игрока', 'Дон Эль', 'Тень', 'Маша', 'Игорь', 'Вера', 'Чагин'];
const roles = ['citizen', 'mafia', 'sheriff', 'citizen', 'don', 'citizen', 'citizen', 'mafia', 'citizen', 'citizen'] as const;
const players = names.map((nickname, index) => {
  const role = roles[index];
  const team = role === 'mafia' || role === 'don' ? 'black' : 'red';
  const won = team === 'red';
  return {
    player_id: `p${index + 1}`, participant_id: `s${index + 1}`, nickname, avatar_url: null, seat_number: index + 1, role, team, won,
    exit_type: index === 3 ? 'killed' : index === 1 ? 'voted_day' : index === 0 ? 'voted_zero_round' : 'alive', exit_order: index < 4 ? index + 1 : null,
    regular_fouls: index === 4 ? 2 : 0, minor_technical_fouls: 0, major_technical_fouls: 0, removal_reason: null, notes: null,
    color_protocol: index === 2 ? [{ mark: 'black', seat_numbers: [2, 5] }] : [], judge_bonus: 0, protocol_bonus: 0, ci_points: 0, penalty_points: 0, disciplinary_penalty_points: 0,
    first_killed: index === 3, zero_round_voted: index === 0, best_move: index === 3, best_move_source: index === 3 ? 'first_killed' : null, best_move_seats: index === 3 ? [2, 5, 6] : [],
    score: won ? score(index === 2 ? 1.5 : 1, { win_point: 1, ...(index === 2 ? { judge_bonus: 0.5 } : {}) }) : score(0),
    elo_before: 1000 + index, elo_after: 1000 + index + (won ? 11 : -9), elo_delta: won ? 11 : -9,
  };
}) as PlayerGameDetailData['players'];

const detail: PlayerGameDetailData = {
  game: { id: 'club:11', source: 'club', title: 'Игровой вечер — 9 октября', date: '2026-10-09T18:00:00.000Z', game_number: 11, format: 'CASUAL', winner_team: 'red', judge_name: 'Точка', table_name: 'Основной стол', elo_affected: true },
  protocol: {
    end_reason: 'normal',
    votes: [
      { round_number: 1, day_number: 0, is_revote: false, parent_round_number: null, eligible_voters: 10, nominated_seats: [1, 2, 4], vote_counts: { '1': 4, '2': 2, '4': 4 }, outcome: 'tie_revote' },
      { round_number: 2, day_number: 0, is_revote: true, parent_round_number: 1, eligible_voters: 10, nominated_seats: [1, 4], vote_counts: { '1': 7, '4': 3 }, outcome: 'eliminated' },
      { round_number: 3, day_number: 1, is_revote: false, parent_round_number: null, eligible_voters: 8, nominated_seats: [2], vote_counts: { '2': 8 }, outcome: 'eliminated' },
    ],
    shots: [{ night_number: 1, target_seat: 4, result: 'killed' }, { night_number: 2, target_seat: 7, result: 'miss' }],
    replacement: null, judge_notes: 'Спортивная игра ФСМ. Победили Красные.',
    first_killed: { participant_id: 's4', seat_number: 4, nickname: names[3] }, zero_round_voted: { participant_id: 's1', seat_number: 1, nickname: names[0] }, ppk_culprit: null,
  },
  players,
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <main className="mx-auto flex max-w-[430px] flex-col gap-3 p-3 pb-24 text-white">
    <PlayerGameDetail detail={detail} loading={false} error={null} selfId="p4" onBack={() => undefined} />
  </main>,
);
