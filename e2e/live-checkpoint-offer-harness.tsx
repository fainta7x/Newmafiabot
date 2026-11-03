import ReactDOM from 'react-dom/client';
import { EveningLiveGameModal } from '../src/components/crm/EveningLiveGameModal.tsx';
import './appStyles.ts';

// «Продолжить игру» (owner, 2026-11-03): this device has no saved session, the server has a copy.
import { createInitialGameDiscipline } from '../src/lib/gameDiscipline.ts';

const names = ['Богданчик', 'Матроскина', 'Пристань', 'Вид', 'Диссонанс', 'Перец', 'Дина', 'Солнце', 'Крот', 'Шторм'];
const activePlayers = names.map((nickname, index) => {
  const slot = index + 1;
  const role = slot === 10 ? 'Дон' : slot >= 8 ? 'Мафия' : slot === 7 ? 'Шериф' : 'Мирный';
  return { slot_num: slot, user_id: slot, nickname, role, team: slot >= 8 ? 'Чёрные' : 'Красные', fouls: slot === 4 ? 2 : 0, minor_tech_fouls: 0, major_tech_fouls: 0,
    removal_reason: null, alive: slot !== 3, nominated_this_round: false, has_spoken_this_round: slot < 4, mute_this_round: false, is_pu: false, best_move_guesses: [],
    kick: false, ppk: false, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, eliminated_phase: slot === 3 ? 'night' : '',
    has_foul_penalty: false, exit_reason: slot === 3 ? 'killed' : 'alive' };
});
// A real-shaped session of a game in its second day: #3 Пристань killed at night, #4 Вид with two fouls.
const session = JSON.stringify({
  activePlayers, nominations: [6], nominationsMap: { 6: 2 }, phase: 'day_speeches', roundNumber: 2, dayStarterSlot: 4, nightSubPhase: 'intro', postNightStage: 'none',
  protocolMarkers: { firstKilledSlot: 3, zeroRoundVotedSlot: null, bestMoveSource: null, bestMoveSourceSlot: null, bestMoveSeats: [] },
  activeBestMoveSource: null, activeBestMoveSlot: null, pendingBestMoveSeats: [], bestMoveDeadlineMs: null, votingRounds: [], activeVotingRoundIndex: 0,
  votesByPlayer: {}, votes: {}, votingStage: 'setup', revoteSpeakerIndex: 0, tableLeaveVotesInput: null, currentVotingNomineeIndex: 0, activeSpeakerSlot: 4,
  customTimerLabel: null, timeLeft: 60, timerMax: 60, isTimerRunning: false, zeroNightSubPhase: null, zeroNightMusicState: 'stopped', shotPlayerSlot: null,
  donCheckSlot: null, donCheckResult: null, sheriffCheckSlot: null, sheriffCheckResult: null, nightLogs: [], votingFarewellQueue: [], votingFarewellIndex: 0,
  discipline: createInitialGameDiscipline(activePlayers.map((player) => ({ id: String(player.slot_num), team: player.team === 'Чёрные' ? 'black' : 'red' }))),
  sessionKey: 'club:7', savedAt: '21:42',
});
globalThis.fetch = async (input: RequestInfo | URL) => {
  const url = String(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
  if (url.includes('/live-checkpoint')) return new Response(JSON.stringify({ session, saved_at: '2026-11-03T18:42:00.000Z' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
};
try { localStorage.clear(); } catch { /* harness */ }
const game = { id: 7, evening_id: 'ev', global_game_number: 7, club_protocol: { protocol: { status: 'draft' }, player_results: names.map((display_name, index) => ({
  participant_id: `pt-${index + 1}`, player_id: `p${index + 1}`, seat_number: index + 1, display_name, role: index === 9 ? 'don' : index >= 7 ? 'mafia' : index === 6 ? 'sheriff' : 'citizen' })) } } as any;
ReactDOM.createRoot(document.getElementById('root')!).render(<EveningLiveGameModal game={game} onClose={() => {}} onUpdated={() => {}} />);
