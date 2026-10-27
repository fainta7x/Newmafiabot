import { useEffect, useState } from 'react';
import PlayerReplayScreen from '../src/components/player/PlayerReplayScreen.tsx';
import PlayerHistoryStatsView from '../src/components/player/PlayerHistoryStatsView.tsx';
import ReactDOM from 'react-dom/client';
import PlayerGameDetail, { type PlayerGameDetailData } from '../src/components/player/PlayerGameDetail.tsx';
import PlayerEveningSummaries from '../src/components/player/PlayerEveningSummaries.tsx';
import BeforeEveningSummaries from './fixtures/PlayerEveningSummaries.before.tsx';
import BeforeGameDetail from './fixtures/PlayerGameDetail.before.tsx';
import './appStyles.ts';

const score = (total: number, extra: Record<string, number> = {}) => ({ win_point: 0, judge_bonus: 0, protocol_bonus: 0, ci_points: 0, best_move_points: 0, disciplinary_penalty_points: 0, total_points: total, ...extra });
const names = ['Богданчик', 'Алоэ', 'Дина', 'Знак с очень длинным ником игрока', 'Дон Эль', 'Тень', 'Маша', 'Игорь', 'Вера', 'Чагин'];
const roles = ['citizen', 'mafia', 'sheriff', 'citizen', 'don', 'citizen', 'citizen', 'mafia', 'citizen', 'citizen'] as const;
const ELO_LINES: Array<[number | null, string[]]> = [
  [16, ['За действия в игре: +16 Эло', 'Попил, ушёл красный №9: −2', 'Голосовал в чёрных №10, №1: +16', 'Верно подряд: голос в чёрного №10 → голос в чёрного №1: +2']],
  [0, ['За действия в игре: 0 Эло', 'Записан чёрным у №7: −4', 'Не записан у №5: +4']],
  [6, ['За действия в игре: +6 Эло', 'Попил, ушёл красный №9: −2', 'Голосовал в уже известных чёрных №10 — без баллов', 'Проверкой нашёл чёрного №10: +4', 'Проверенного чёрного вывел стол №10: +4']],
  [26, ['За действия в игре: +26 Эло', 'Попил, ушёл красный №9: −2', 'Голосовал в чёрных №10: +8', 'В завещании угадал №1, №4: +16', 'В завещании снова назвал №10 — уже засчитан', 'Верно подряд: голос в чёрного №10 → завещание: +4']],
  [0, ['За действия в игре: 0 Эло', 'Проверкой в первую ночь нашёл шерифа №9: +8', 'Записан чёрным у №5, №7: −8']],
  [-16, ['За действия в игре: −16 Эло', 'В завещании ошибся в №10, №6: −8', 'В завещании назвал чёрным красного, стол его вывел (×2) №9: −8', 'Завещание с ошибкой: за верные цвета плюсов нет']],
  [null, []],
  [0, ['За действия в игре: 0 Эло', 'Ушёл на девятке: −8', 'Записан красным у №5: +8']],
  [16, ['За действия в игре: +16 Эло', 'Попил, ушёл красный №9: −2', 'Голосовал в чёрных №10, №1: +16', 'Верно подряд: голос в чёрного №10 → голос в чёрного №1: +2']],
  [16, ['За действия в игре: +16 Эло', 'Попил, ушёл красный №9: −2', 'Голосовал в чёрных №10, №1: +16', 'Верно подряд: голос в чёрного №10 → голос в чёрного №1: +2']],
];
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
    // The blank's breakdown as the server writes it (lines of a real game, 23.10 №2).
    elo_contribution: ELO_LINES[index][0],
    elo_lines: ELO_LINES[index][1],
  };
}) as PlayerGameDetailData['players'];

const detail: PlayerGameDetailData = {
  game: { id: 'club:11', source: 'club', title: 'Игровой вечер — 9 октября', date: '2026-10-09T18:00:00.000Z', game_number: 11, format: 'CASUAL', winner_team: 'red', judge_name: 'Точка', table_name: 'Основной стол', elo_affected: true, elo_table: { redAvg: 1057, blackAvg: 1067, level: 'команды одного уровня', redChancePercent: 30 } },
  protocol: {
    events: [
      {seq:1,at:'',round:1,phase:'zero_night',kind:'game_start'},
      {seq:2,at:'',round:2,phase:'day_voting',kind:'vote',seat:10,target:2,value:3},
      {seq:3,at:'',round:2,phase:'day_voting',kind:'vote',seat:3,target:2,value:3},
      {seq:4,at:'',round:2,phase:'day_voting',kind:'vote_round_result',value:'3:single_eliminated'},
      {seq:5,at:'',round:2,phase:'day_voting',kind:'exit',seat:2,value:'voted_day'},
      {seq:6,at:'',round:2,phase:'finished',kind:'game_end',value:'red'},
    ],
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

const query = new URLSearchParams(location.search);
const flowMode = query.get('screen');
const isFlow = flowMode === 'flow' || flowMode === 'replay';
if (isFlow) {
  let gameFailures = Number(query.get('failGame') || 0);
  let replayFailures = Number(query.get('failReplay') || 0);
  let clipFailures = Number(query.get('failClips') || 0);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/replay')) {
      if (replayFailures-- > 0) return json({ error: 'Нет связи с Replay' }, 503);
      return json({ game_key: 'club:11', replay_available: true, game: { id: '11', number: 11, title: detail.game.title, winner_team: 'red' }, players: detail.players, events: ['Начало игры', 'Ночь', 'Игра завершена'].map((title, index) => ({ id: String(index), type: index === 1 ? 'night' : 'round', round: index, title, text: title })), analysis: ['Сохранились ключевые события партии.'] });
    }
    if (url.endsWith('/clips')) {
      if (clipFailures-- > 0) return json({ error: 'Записи речей временно недоступны' }, 503);
      return json({ clips: [] });
    }
    if (gameFailures-- > 0) return json({ error: 'Игра временно недоступна' }, 503);
    return json(detail);
  };
}
function ResultFlowPreview() {
  const [replayOpen, setReplayOpen] = useState(flowMode === 'replay');
  useEffect(() => {
    const sync = () => setReplayOpen(location.pathname.includes('/player/replay/'));
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);
  return replayOpen ? <PlayerReplayScreen gameKey="club:11" onBack={() => history.back()} /> : <PlayerHistoryStatsView data={{ player: { id: 'p3' }, games: { all: [] } } as any} initialGameKey="club:11" />;
}

const GameDetail = new URLSearchParams(location.search).has('before') ? BeforeGameDetail : PlayerGameDetail;

const isRecap = new URLSearchParams(location.search).get('screen') === 'recap';
const EveningSummaries = new URLSearchParams(location.search).has('before') ? BeforeEveningSummaries : PlayerEveningSummaries;
if (isRecap) window.fetch = async () => new Response(JSON.stringify({summaries:[{
  id:'past-1', title:'Пятничный клубный вечер', starts_at:'2026-10-09T18:00:00Z',settled_at:'2026-10-10T00:00:00Z',venue:'Суп с Котом',
  games:4, red_wins:3, black_wins:1,score:'3:1',player:{games:3,wins:2,losses:1,win_rate:67,elo_before:1500,elo_after:1522,elo_delta:22,roles:['citizen','sheriff']},
  best_elo_rise:{player_id:'p3',nickname:'Дина',avatar_url:'',elo_delta:31}, most_games:{player_id:'p4',nickname:'Богдан',avatar_url:'',games:4},
  awards:[{category:'mvp',label:'Игрок вечера',player_id:'p3',nickname:'Дина',avatar_url:'',votes:7}],facts:['Красные выиграли три партии из четырёх'],game_ids:['club:11','club:12','club:13','club:14'],game_links:[11,12,13,14].map((number,index)=>({id:`club:${number}`,game_number:number,winner_team:index===1?'black':'red',personal:index===3?null:{role:index===0?'sheriff':'citizen',won:index!==1}})),
}]}),{headers:{'Content-Type':'application/json'}});
ReactDOM.createRoot(document.getElementById('root')!).render(isFlow ? <ResultFlowPreview /> : isRecap ? <EveningSummaries onOpenGame={(key)=>{document.body.dataset.openedGame=key;}} /> :
  <main className="mx-auto flex max-w-[430px] flex-col gap-3 p-3 pb-24 text-white">
    <GameDetail detail={detail} loading={false} error={null} selfId="p3" onBack={() => undefined} />
  </main>,
);
