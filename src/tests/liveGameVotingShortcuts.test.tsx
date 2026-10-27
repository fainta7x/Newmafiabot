/** @vitest-environment jsdom */
/**
 * Two shortcuts of the judge's vote count (owner, 2026-10-27): «Поделилось также» repeats the previous round on a revote where
 * nobody changed a vote, and «Цифрами» counts a voting in a window with the seat numbers, like the best-move entry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import LiveGameEngine from '../components/LiveGameEngine';
import { createInitialGameDiscipline } from '../lib/gameDiscipline';
import { deactivateTableDecisionSelection } from '../components/LiveGameEngine/tableDecisionSelectionStore';

const roleOf = (slot: number) => (slot === 10 ? 'Дон' : slot >= 8 ? 'Мафия' : slot === 7 ? 'Шериф' : 'Мирный');
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

const saved = () => JSON.parse(localStorage.getItem('mafia_live_session') || '{}');

const dayVote = (nominations: number[], out: number[] = [9]) => {
  const activePlayers = Array.from({ length: 10 }, (_, i) => player(i + 1, !out.includes(i + 1)));
  return {
    activePlayers, nominations, nominationsMap: {}, phase: 'day_voting', roundNumber: 2, dayStarterSlot: 1,
    nightSubPhase: 'intro', postNightStage: 'none',
    protocolMarkers: { firstKilledSlot: 9, zeroRoundVotedSlot: null, bestMoveSource: null, bestMoveSourceSlot: null, bestMoveSeats: [] },
    activeBestMoveSource: null, activeBestMoveSlot: null, pendingBestMoveSeats: [], bestMoveDeadlineMs: null,
    votingRounds: [{ round_number: 1, is_revote: false, nominated_seats: nominations, vote_counts: {}, day_number: 1, eligible_voters: 10 - out.length, parent_round_number: null, outcome: 'pending', eliminated_seats: [], table_leave_votes: null }],
    activeVotingRoundIndex: 0, votesByPlayer: {}, votes: {}, votingStage: 'collecting', revoteSpeakerIndex: 0,
    tableLeaveVotesInput: 0, tableDecisionSelectionKey: null, tableDecisionSelectedVoterSlots: [], currentVotingNomineeIndex: 0,
    activeSpeakerSlot: null, customTimerLabel: null, timeLeft: 60, timerMax: 60, isTimerRunning: false,
    zeroNightSubPhase: null, zeroNightMusicState: 'pending', shotPlayerSlot: null, donCheckSlot: null, donCheckResult: null,
    sheriffCheckSlot: null, sheriffCheckResult: null, nightLogs: [], votingFarewellQueue: [], votingFarewellIndex: 0,
    discipline: createInitialGameDiscipline(activePlayers.map((p: any) => ({ id: String(p.slot_num), team: p.team === 'Чёрные' ? 'black' : 'red' }))),
    savedAt: '21:00',
  };
};
const play = async (snapshot: Record<string, unknown>) => {
  localStorage.setItem('mafia_live_session', JSON.stringify(snapshot));
  render(<LiveGameEngine players={[]} initialJudgeId={777} onGameFinished={vi.fn()} onCancel={vi.fn()} onPhaseChange={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
};
const vote = async (groups: number[][]) => {
  for (let i = 0; i < groups.length; i += 1) {
    for (const slot of groups[i]) fireEvent.click(seat(slot));
    if (i < groups.length - 1) await press(/Следующий/);
  }
  await press('Подвести итог');
};
const toRevote = async () => {
  await press('Речи по 30 секунд');
  for (let speech = 0; speech < 4 && !screen.queryByRole('button', { name: 'Начать голосование' }); speech += 1) await press(/Следующий игрок|К переголосованию/);
  await press('Начать голосование');
};

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); deactivateTableDecisionSelection(); });
afterEach(() => { cleanup(); deactivateTableDecisionSelection(); localStorage.clear(); sessionStorage.clear(); });

describe('vote count shortcuts', () => {
  it('«Поделилось также» repeats the split of the previous round on the revote', async () => {
    // As in game №20: #4 and #9 are out; 4 nominated, #8 and #2 get nothing, #5 and #3 split 4–4.
    await play(dayVote([5, 8, 2, 3], [4, 9]));
    expect(screen.queryByRole('button', { name: 'Поделилось также' })).toBeNull();
    await vote([[1, 3, 7, 8], [], [], [2, 5, 6, 10]]);
    await toRevote();
    await press('Поделилось также');
    expect(saved().votesByPlayer).toEqual({ 1: 5, 3: 5, 7: 5, 8: 5, 2: 3, 5: 3, 6: 3, 10: 3 });
    expect(saved().votingRounds[1].vote_counts).toEqual({ 5: 4, 3: 4 });
    await press('Подвести итог');
    // the same split again: the table decides
    await screen.findByText('Поднять всех?');
  });

  it('is not offered when someone voted for a candidate who is not on the revote', async () => {
    await play(dayVote([5, 8, 3], [9]));
    await vote([[1, 3, 7, 8], [4], [2, 5, 6, 10]]);
    await toRevote();
    expect(screen.queryByRole('button', { name: 'Поделилось также' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Цифрами' })).toBeTruthy();
  });

  it('«Цифрами» counts the voting candidate by candidate; a voter of another candidate is dimmed and blocked', async () => {
    await play(dayVote([5, 3]));
    await press('Цифрами');
    const sheet = await screen.findByTestId('live-vote-numbers-sheet');
    expect(sheet.textContent).toContain('За #5 Игрок 5 проголосовали');
    for (const slot of [1, 3, 7]) fireEvent.click(within(sheet).getByRole('button', { name: `Голос #${slot}` }));
    expect((within(sheet).getByRole('button', { name: 'Голос #9' }) as HTMLButtonElement).disabled).toBe(true); // out of the game
    fireEvent.click(within(sheet).getByRole('button', { name: 'Далее →' }));
    expect(sheet.textContent).toContain('За #3 Игрок 3 проголосовали');
    expect((within(sheet).getByRole('button', { name: 'Голос #1' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(sheet).getByRole('button', { name: 'Голос #1' }).textContent).toContain('→#5');
    // the rest goes to the last candidate when the count is closed, as with the seat cards
    fireEvent.click(within(sheet).getByRole('button', { name: 'Подвести итог' }));
    await screen.findByRole('button', { name: 'Подтвердить' });
    expect(screen.queryByTestId('live-vote-numbers-sheet')).toBeNull();
    expect(saved().votingRounds[0].vote_counts).toEqual({ 5: 3, 3: 6 });
  });
});
