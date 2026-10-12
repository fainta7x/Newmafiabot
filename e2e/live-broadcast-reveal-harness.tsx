import ReactDOM from 'react-dom/client';
import LiveBroadcastOverlay from '../src/components/public/LiveBroadcastOverlay.tsx';
import { buildLiveBroadcastState } from '../src/lib/liveBroadcast.ts';
import '../src/index.css';

const roles = ['Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Шериф', 'Мафия', 'Мафия', 'Дон'];
const names = ['Богданчик', 'Алоэ', 'Дина', 'Знак', 'Тень', 'Маша', 'Игорь', 'Вера', 'Чагин', 'Дон Эль'];
const activePlayers = roles.map((role, index) => ({
  slot_num: index + 1, nickname: names[index], role, team: index >= 7 ? 'Чёрные' : 'Красные', alive: index !== 3,
  fouls: index === 4 ? 2 : 0, minor_tech_fouls: 0, major_tech_fouls: 0, exit_reason: index === 3 ? 'killed' : 'alive', eliminated_phase: index === 3 ? 'Ночь 1' : '',
}));
const metadata = { gameId: 1, globalGameNumber: 12, tableName: 'Основной стол', players: activePlayers.map((player) => ({ seat: player.slot_num, playerId: `p${player.slot_num}`, nickname: player.nickname })) };
const state = {
  ...buildLiveBroadcastState({
    phase: 'day_speeches', roundNumber: 2, activePlayers, activeSpeakerSlot: 10, timeLeft: 40, timerMax: 60, isTimerRunning: true, nominations: [], nominationsMap: {},
    votingRounds: [], activeVotingRoundIndex: 0, votesByPlayer: {}, votes: {}, votingStage: 'setup', nightSubPhase: 'intro', postNightStage: 'none', protocolMarkers: {},
    discipline: { players: {}, isNextVotingCancelled: false, isPpk: false, ppkCulpritId: null }, nightLogs: [],
    // The Don reveals as the Sheriff and covers his partner (9) with a red check; the real Sheriff (7) reveals too.
    reveals: [{ seat: 10, checks: [{ target: 9, color: 'red' }, { target: 3, color: 'red' }] }, { seat: 7, checks: [{ target: 8, color: 'black' }] }],
  }, metadata)!,
  updatedAt: new Date().toISOString(),
};

globalThis.fetch = async () => new Response(JSON.stringify({ connected: true, receivedAt: new Date().toISOString(), state }), { status: 200, headers: { 'Content-Type': 'application/json' } });
ReactDOM.createRoot(document.getElementById('root')!).render(<LiveBroadcastOverlay token="preview" />);
