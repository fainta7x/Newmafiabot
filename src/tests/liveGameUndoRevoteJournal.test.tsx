/** @vitest-environment jsdom */
/**
 * Game #20 (2026-10-23) was saved without its day-3 voting (AUDIT_LOG 2026-10-24 P4, 2026-10-27). The engine is not where
 * rounds go: a sequence shaped like that game's journal — a day vote whose elimination is undone and re-voted into a tie and
 * a revote, the next day's tie and revote, then a PPK — hands over every round, and today's save accepts it. (In the real
 * game the day-3 revote was a second tie and everybody stayed; the journal shows 5–3 after a stray vote.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LiveGameEngine from '../components/LiveGameEngine';
import { mapEngineResultToProtocol } from '../components/crm/EveningLiveGameModal';
import { advanceLiveEngineJournal } from '../lib/liveEngineJournal.ts';
import { createInitialGameDiscipline } from '../lib/gameDiscipline';
import { deactivateTableDecisionSelection } from '../components/LiveGameEngine/tableDecisionSelectionStore';
import { canonicalizeClubGameSave } from '../server/services/clubGameProtocolService';

const roleOf = (slot: number) => (slot === 10 ? 'Дон' : slot >= 8 ? 'Мафия' : slot === 7 ? 'Шериф' : 'Мирный');
const protocolRole = (slot: number) => (slot === 10 ? 'don' : slot >= 8 ? 'mafia' : slot === 7 ? 'sheriff' : 'citizen');
const player = (slot: number, alive: boolean) => ({
  slot_num: slot, user_id: slot, nickname: `Игрок ${slot}`, role: roleOf(slot), team: slot >= 8 ? 'Чёрные' : 'Красные',
  fouls: 0, minor_tech_fouls: 0, major_tech_fouls: 0, removal_reason: null, alive, nominated_this_round: false,
  has_spoken_this_round: true, mute_this_round: false, is_pu: false, best_move_guesses: [], kick: false, ppk: false,
  bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0,
  eliminated_phase: alive ? '' : 'Ранее', has_foul_penalty: false, exit_reason: alive ? 'alive' : 'killed',
});
const buttons = () => screen.getAllByRole('button').map((b) => b.textContent?.trim()).filter(Boolean).join(' | ');
const press = async (name: RegExp | string) => {
  const button = await screen.findByRole('button', { name }).catch(() => { throw new Error(`No button ${name}; on screen: ${buttons()}`); });
  fireEvent.click(button);
};
const seat = (slot: number) => document.querySelector(`.live-seat-card[data-seat="${slot}"]`) as HTMLElement;

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); deactivateTableDecisionSelection(); });
afterEach(() => { cleanup(); deactivateTableDecisionSelection(); localStorage.clear(); sessionStorage.clear(); });

describe('judge engine: an undone elimination and two revoting days reach the saved protocol', () => {
  it('keeps every voting round through undo, revotes and a PPK, and the club save accepts the game', async () => {
    // Day 2 voting of game #20: #9 was killed in night 1; the zero round ended in a tie, a revote and «nobody leaves».
    const activePlayers = Array.from({ length: 10 }, (_, i) => player(i + 1, i + 1 !== 9));
    const initial: any = {
      activePlayers, nominations: [10, 2, 4, 5], nominationsMap: {}, phase: 'day_voting', roundNumber: 2, dayStarterSlot: 1,
      nightSubPhase: 'intro', postNightStage: 'none',
      protocolMarkers: { firstKilledSlot: 9, zeroRoundVotedSlot: null, bestMoveSource: null, bestMoveSourceSlot: null, bestMoveSeats: [] },
      activeBestMoveSource: null, activeBestMoveSlot: null, pendingBestMoveSeats: [], bestMoveDeadlineMs: null,
      votingRounds: [{ round_number: 1, is_revote: false, nominated_seats: [10, 2, 4, 5], vote_counts: {}, day_number: 1, eligible_voters: 9, parent_round_number: null, outcome: 'pending', eliminated_seats: [], table_leave_votes: null }],
      activeVotingRoundIndex: 0, votesByPlayer: {}, votes: {}, votingStage: 'collecting', revoteSpeakerIndex: 0,
      tableLeaveVotesInput: 0, tableDecisionSelectionKey: null, tableDecisionSelectedVoterSlots: [], currentVotingNomineeIndex: 0,
      activeSpeakerSlot: null, customTimerLabel: null, timeLeft: 60, timerMax: 60, isTimerRunning: false,
      zeroNightSubPhase: null, zeroNightMusicState: 'pending', shotPlayerSlot: null, donCheckSlot: null, donCheckResult: null,
      sheriffCheckSlot: null, sheriffCheckResult: null, nightLogs: [], votingFarewellQueue: [], votingFarewellIndex: 0,
      discipline: createInitialGameDiscipline(activePlayers.map((p: any) => ({ id: String(p.slot_num), team: p.team === 'Чёрные' ? 'black' : 'red' }))),
      savedAt: '21:00',
    };
    initial.protocolEvidence = advanceLiveEngineJournal(null, initial).evidence;
    initial.protocolEvidence.shots = [{ night_number: 1, target_seat: 9, result: 'killed' }];
    initial.protocolEvidence.votes = [
      { day_number: 0, round_number: 1, is_revote: false, outcome: 'tie_revote', nominated_seats: [1, 2, 3], vote_counts: { 1: 5, 2: 0, 3: 5 }, eligible_voters: 10, parent_round_number: null, eliminated_seats: [], table_leave_votes: null },
      { day_number: 0, round_number: 2, is_revote: true, outcome: 'no_elimination', nominated_seats: [1, 3], vote_counts: { 1: 5, 3: 5 }, eligible_voters: 10, parent_round_number: 1, parent_nominated_seats: [1, 2, 3], parent_vote_counts: { 1: 5, 2: 0, 3: 5 }, eliminated_seats: [], table_leave_votes: 1 },
    ];
    const done = vi.fn();
    localStorage.setItem('mafia_live_session', JSON.stringify(initial));
    render(<LiveGameEngine players={[]} initialJudgeId={777} onGameFinished={done} onCancel={vi.fn()} onPhaseChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    const vote = async (groups: number[][]) => {
      for (let i = 0; i < groups.length; i += 1) {
        for (const slot of groups[i]) fireEvent.click(seat(slot));
        if (i < groups.length - 1) await press(/Следующий/);
      }
      await press('Подвести итог');
    };
    // #10: 2, #2: 3, #4: 4, #5: 0 → #4 out
    await vote([[1, 3], [5, 6, 7], [8, 10, 2, 4], []]);
    await press('Подтвердить');
    // The judge undoes the elimination back to the vote count; #8 moves its vote from #4 to #5: a 3–3 tie of #2 and #4.
    await press('Назад');
    await press('Назад');
    fireEvent.click(seat(8));
    await press('Подвести итог');
    await press('Речи по 30 секунд');
    for (let speech = 0; speech < 4 && !screen.queryByRole('button', { name: 'Начать голосование' }); speech += 1) await press(/Следующий игрок|К переголосованию/);
    await press('Начать голосование');
    // Revote: #2 4, #4 5 → #4 out; the night has no shot.
    await vote([[1, 3, 5, 6], [7, 8, 10, 2, 4]]);
    await press('Подтвердить');
    await press('Завершить последние речи');
    await press(/Включите музыку/);
    await press(/^Отстрел$/);
    await press(/Проверка Дона/);
    await press(/Проверка Шерифа/);
    await press(/Выключите музыку/);
    await press(/Итоги ночи/);
    await press(/Зафиксировать ночь/);
    // Day 3: #5, #8, #2, #3 nominated; 4–4 between #5 and #3, revote 3–5 → #3 out (as the journal reads); again no shot; day 4 ends by a PPK of #10.
    const nominate = (slot: number) => fireEvent.click(screen.getByRole('button', { name: `Выставить #${slot}` }));
    const order = [2, 3, 5, 6, 7, 8, 10, 1];
    const noms = [5, 8, 2, 3];
    for (let i = 0; i < order.length; i += 1) {
      await press(`Речь #${order[i]}`);
      if (noms[i]) nominate(noms[i]);
      await press(`Завершить речь #${order[i]}`);
    }
    await press('К голосованию');
    await press('Начать голосование');
    await vote([[1, 3, 7, 8], [], [], [2, 5, 6, 10]]);
    await press('Речи по 30 секунд');
    for (let speech = 0; speech < 4 && !screen.queryByRole('button', { name: 'Начать голосование' }); speech += 1) await press(/Следующий игрок|К переголосованию/);
    await press('Начать голосование');
    await vote([[1, 7, 8], [3, 2, 5, 6, 10]]);
    await press('Подтвердить');
    await press('Завершить последние речи');
    await press(/Включите музыку/);
    await press(/^Отстрел$/);
    await press(/Проверка Дона/);
    await press(/Проверка Шерифа/);
    await press(/Выключите музыку/);
    await press(/Итоги ночи/);
    await press(/Зафиксировать ночь/);
    fireEvent.click(seat(10));
    await press('ППК');
    await press('Подтвердить ППК');
    const result = done.mock.calls[0]?.[0];
    expect(result.end_reason).toBe('ppk');
    expect(result.protocol_evidence.votes.map((r: any) => `${r.day_number}:${r.round_number}:${r.outcome}`)).toEqual([
      '0:1:tie_revote', '0:2:no_elimination', '1:1:tie_revote', '1:2:single_eliminated', '2:1:tie_revote', '2:2:single_eliminated',
    ]);
    expect(result.protocol_evidence.votes[5].vote_counts).toEqual({ 3: 5, 5: 3 });

    const seats = Array.from({ length: 10 }, (_, i) => i + 1);
    const game: any = {
      id: 20, status: 'draft',
      club_protocol: {
        version: 1, kind: 'club_evening_protocol',
        protocol: { game_id: '20', status: 'draft', votes: [], shots: [], events: [], zero_round_rule: 'tournament', end_reason: 'normal', winner_team: null },
        player_results: seats.map((s) => ({ participant_id: `ep${s}`, player_id: `p${s}`, seat_number: s, display_name: `Игрок ${s}`, role: protocolRole(s), exit_type: 'alive', exit_order: null, regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0, technical_fouls: 0, judge_bonus: 0, protocol_bonus: 0, penalty_points: 0, disciplinary_penalty_points: 0, removal_reason: null, ci_points: 0, color_protocol: [], notes: null, ppk: false })),
      },
    };
    const evidence = result.protocol_evidence;
    const next = mapEngineResultToProtocol(game, { ...result, votes: evidence.votes, shots: evidence.shots, events: evidence.events });
    expect(next.player_results.find((r) => r.seat_number === 3)?.exit_type).toBe('voted_day');
    const saved = canonicalizeClubGameSave(game.club_protocol, next.protocol, next.player_results, 'completed');
    expect(saved.protocol.votes).toHaveLength(6);
    expect(saved.protocol.votes[5]).toMatchObject({ day_number: 2, is_revote: true, parent_round_number: 5, eliminated_seats: [3] });
  });
});
