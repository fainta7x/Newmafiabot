/** @vitest-environment jsdom */
/**
 * Whole-game scenarios of the judge engine (domain model, step 6, owner «да» 2026-10-22). Each one starts from a saved
 * position, plays it to the end with the judge's own buttons and pins what the engine hands over: the winner, how
 * every player left, the markers. They fix today's behaviour before the engine moves to the shared vocabulary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LiveGameEngine from '../components/LiveGameEngine';
import { createInitialGameDiscipline } from '../lib/gameDiscipline';
import { deactivateTableDecisionSelection } from '../components/LiveGameEngine/tableDecisionSelectionStore';

type Seat = { slot: number; alive?: boolean; exit?: string };

const roleOf = (slot: number) => (slot === 10 ? 'Дон' : slot >= 8 ? 'Мафия' : slot === 7 ? 'Шериф' : 'Мирный');

const player = ({ slot, alive = true, exit }: Seat, spoken: boolean) => ({
  slot_num: slot, user_id: slot, nickname: `Игрок ${slot}`, role: roleOf(slot), team: slot >= 8 ? 'Чёрные' : 'Красные',
  fouls: 0, minor_tech_fouls: 0, major_tech_fouls: 0, removal_reason: null, alive, nominated_this_round: false,
  has_spoken_this_round: spoken, mute_this_round: false, is_pu: false, best_move_guesses: [], kick: false, ppk: false,
  bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0,
  eliminated_phase: alive ? '' : 'Ранее', has_foul_penalty: false, exit_reason: alive ? 'alive' : (exit || 'voted_day'),
});

/** A saved position: `out` are the seats already out of the game (voted out earlier unless said otherwise). */
const position = (phase: string, out: Seat[], extra: Record<string, unknown> = {}) => {
  const outBySlot = new Map(out.map((seat) => [seat.slot, seat]));
  const activePlayers = Array.from({ length: 10 }, (_, index) => {
    const slot = index + 1;
    const gone = outBySlot.get(slot);
    // Positions taken at the start of the day speeches: nobody has spoken yet.
    return player(gone ? { ...gone, alive: false } : { slot }, phase !== 'day_speeches');
  });
  return {
    activePlayers,
    nominations: [], nominationsMap: {}, phase, roundNumber: 3, dayStarterSlot: 1, nightSubPhase: 'intro', postNightStage: 'none',
    protocolMarkers: { firstKilledSlot: 4, zeroRoundVotedSlot: null, bestMoveSource: null, bestMoveSourceSlot: null, bestMoveSeats: [] },
    activeBestMoveSource: null, activeBestMoveSlot: null, pendingBestMoveSeats: [], bestMoveDeadlineMs: null,
    votingRounds: [], activeVotingRoundIndex: 0, votesByPlayer: {}, votes: {}, votingStage: 'collecting', revoteSpeakerIndex: 0,
    tableLeaveVotesInput: 0, tableDecisionSelectionKey: null, tableDecisionSelectedVoterSlots: [], currentVotingNomineeIndex: 0,
    activeSpeakerSlot: null, customTimerLabel: null, timeLeft: 60, timerMax: 60, isTimerRunning: false,
    zeroNightSubPhase: null, zeroNightMusicState: 'pending', shotPlayerSlot: null, donCheckSlot: null, donCheckResult: null,
    sheriffCheckSlot: null, sheriffCheckResult: null, nightLogs: [], votingFarewellQueue: [], votingFarewellIndex: 0,
    discipline: createInitialGameDiscipline(activePlayers.map((p: any) => ({ id: String(p.slot_num), team: p.team === 'Чёрные' ? 'black' : 'red' }))),
    savedAt: '21:00',
    ...extra,
  };
};

const play = async (snapshot: Record<string, unknown>) => {
  const onGameFinished = vi.fn();
  localStorage.setItem('mafia_live_session', JSON.stringify(snapshot));
  render(<LiveGameEngine players={[]} initialJudgeId={777} onGameFinished={onGameFinished} onCancel={vi.fn()} onPhaseChange={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
  return onGameFinished;
};

const buttons = () => screen.getAllByRole('button').map((b) => b.textContent?.trim()).filter(Boolean).join(' | ');
const press = async (name: RegExp | string) => {
  const button = await screen.findByRole('button', { name }).catch(() => { throw new Error(`No button ${name}; on screen: ${buttons()}`); });
  fireEvent.click(button);
};
const seat = (slot: number) => document.querySelector(`.live-seat-card[data-seat="${slot}"]`) as HTMLElement;
const finished = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls[0]?.[0];
const exitOf = (result: any, slot: number) => result.slots.find((s: any) => s.slot_num === slot)?.exit_reason;

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); deactivateTableDecisionSelection(); });
afterEach(() => { cleanup(); deactivateTableDecisionSelection(); localStorage.clear(); sessionStorage.clear(); });

describe('judge engine: whole-game scenarios', () => {
  it('a night shot that leaves two red against two black ends the game for black', async () => {
    // Three red (1, 2, 7) and two black (8, 10) are left; the mafia shoots the sheriff.
    const done = await play(position('night', [{ slot: 3 }, { slot: 4, exit: 'killed' }, { slot: 5 }, { slot: 6 }, { slot: 9 }]));
    await press(/Включить музыку ночи/);
    await press(/^Отстрел$/);
    fireEvent.click(seat(7));
    await press(/Проверка Дона/);
    await press(/Проверка Шерифа/);
    await press(/Выключить музыку/);
    await press(/Итоги ночи/);
    await press(/Зафиксировать ночь/);
    await press(/Протокол убитого/);
    await press(/Завершить игру/);
    const result = finished(done);
    expect(result?.winning_team).toBe('Чёрные');
    expect(exitOf(result, 7)).toBe('killed');
    expect(result.end_reason).toBe('normal');
  });

  it('a day vote that takes out the last black player asks once, then ends the game for red', async () => {
    // Red 1, 2, 7 and the last black player 8 are left; 8 is on the vote after the day speeches.
    const done = await play(position('day_speeches', [{ slot: 3 }, { slot: 4, exit: 'killed' }, { slot: 5 }, { slot: 6 }, { slot: 9 }, { slot: 10 }], {
      nominations: [8], nominationsMap: { 1: 8 },
    }));
    for (const slot of [1, 2, 7, 8]) { await press(`Речь #${slot}`); await press(`Завершить речь #${slot}`); }
    await press('К голосованию');
    await press('Начать голосование');
    for (const slot of [1, 2, 7]) fireEvent.click(seat(slot));
    await press('Подвести итог');
    await press('Подтвердить');
    await press('Завершить последние речи');
    expect(done).not.toHaveBeenCalled(); // the judge is asked first, a misclick can still be taken back
    await press('Завершить игру');
    const result = finished(done);
    expect(result?.winning_team).toBe('Красные');
    expect(exitOf(result, 8)).toBe('voted_day');
    expect(result.slots.filter((s: any) => s.alive).map((s: any) => s.slot_num)).toEqual([1, 2, 7]);
  });

  it.each(['club', 'tournament'] as const)('ППК by a black player retains the %s setting and ends for red with culprit and reason', async (rule) => {
    const done = await play(position('day_speeches', [{ slot: 4, exit: 'killed' }], { zeroRoundRule: rule }));
    fireEvent.click(seat(9));
    await press('ППК');
    await press('Подтвердить ППК');
    const result = finished(done);
    expect(result?.winning_team).toBe('Красные');
    expect(result.end_reason).toBe('ppk');
    expect(result.zero_round_rule).toBe(rule);
    expect(result.slots.find((s: any) => s.slot_num === 9)?.ppk).toBe(true);
  });

  it('a fourth foul removes the player, and the removal reason travels with the result', async () => {
    const done = await play(position('day_speeches', [{ slot: 4, exit: 'killed' }]));
    for (let foul = 0; foul < 4; foul += 1) {
      fireEvent.click(seat(3));
      await press(/Обычный фол/);
      const confirm = screen.queryByRole('button', { name: /Подтвердить/ });
      if (confirm) fireEvent.click(confirm);
    }
    // The game goes on; the judge then ends it by a PPK to read the slots.
    fireEvent.click(seat(9));
    await press('ППК');
    await press('Подтвердить ППК');
    const third = finished(done).slots.find((s: any) => s.slot_num === 3);
    expect(third).toMatchObject({ alive: false, fouls: 4, exit_reason: 'removed', removal_reason: '4th_foul' });
  });

  it('the first red player killed at night names a best move; the marker and the seats reach the result', async () => {
    // First night of a full table: nobody is out yet and nobody has been killed.
    const done = await play(position('night', [], {
      roundNumber: 1,
      protocolMarkers: { firstKilledSlot: null, zeroRoundVotedSlot: null, bestMoveSource: null, bestMoveSourceSlot: null, bestMoveSeats: [] },
    }));
    await press(/Включить музыку ночи/);
    await press(/^Отстрел$/);
    fireEvent.click(seat(2));
    await press(/Проверка Дона/);
    await press(/Проверка Шерифа/);
    await press(/Выключить музыку/);
    await press(/ЛХ первого убитого/);
    const sheet = await screen.findByTestId('live-best-move-sheet');
    for (const pick of [8, 9, 5]) fireEvent.click(sheet.querySelector(`[data-seat="${pick}"]`) as HTMLElement);
    fireEvent.click(screen.getByTestId('live-best-move-confirm'));
    await press(/Зафиксировать ночь/);
    // End the game by a PPK to read what the engine hands over.
    fireEvent.click(seat(9));
    await press('ППК');
    await press('Подтвердить ППК');
    const result = finished(done);
    expect(exitOf(result, 2)).toBe('killed');
    expect(result.protocol_markers.firstKilledSlot).toBe(2);
    expect(result.protocol_markers.bestMoveSeats).toEqual([8, 9, 5]);
    expect(result.slots.find((s: any) => s.slot_num === 2)?.pu).toBe(true);
  });

  it('«подняли в нуле»: after a double revote in the zero round the table raises both, and both leave as voted in the zero round', async () => {
    const done = await play(position('day_voting', [], {
      roundNumber: 1,
      protocolMarkers: { firstKilledSlot: null, zeroRoundVotedSlot: null, bestMoveSource: null, bestMoveSourceSlot: null, bestMoveSeats: [] },
      nominations: [2, 5],
      votingRounds: [{
        round_number: 1, is_revote: false, nominated_seats: [2, 5], vote_counts: { 2: 0, 5: 0 }, eligible_voters: 10, day_number: 0,
        parent_round_number: 1, parent_nominated_seats: [2, 5], parent_vote_counts: { 2: 5, 5: 5 }, outcome: 'pending',
        eliminated_seats: [], table_leave_votes: null,
      }],
      votingStage: 'collecting',
      tableLeaveVotesInput: 0,
      tableDecisionSelectionKey: '0:2:2-5',
      tableDecisionSelectedVoterSlots: [],
    }));
    // Five against #2, five against #5: a tie.
    const tie = async () => {
      for (const slot of [1, 3, 4, 6, 7]) fireEvent.click(seat(slot));
      await press(/Следующий/);
      for (const slot of [2, 5, 8, 9, 10]) fireEvent.click(seat(slot));
      await press('Подвести итог');
    };
    await tie();
    // The two give 30-second speeches before the revote.
    await press('Речи по 30 секунд');
    for (let speech = 0; speech < 4 && !screen.queryByRole('button', { name: 'Начать голосование' }); speech += 1) await press(/Следующий игрок|К переголосованию/);
    await press('Начать голосование');
    await tie();
    // The second tie: the table decides whether both leave; six of ten raise them.
    await screen.findByText('Поднять всех?');
    for (const slot of [1, 3, 4, 6, 7, 8]) fireEvent.click(seat(slot));
    await press('Зафиксировать решение');
    // Both give their last speech, then the game goes on into the night: the saved game holds the result.
    await press(/Завершить последние речи|Последняя речь/);
    if (screen.queryByRole('button', { name: /Завершить последние речи/ })) await press(/Завершить последние речи/);
    await screen.findByRole('button', { name: /Включить музыку ночи/ });
    const saved = JSON.parse(localStorage.getItem('mafia_live_session') || '{}');
    const exit = (slot: number) => saved.activePlayers.find((p: any) => p.slot_num === slot)?.exit_reason;
    expect(exit(2)).toBe('voted_zero_round');
    expect(exit(5)).toBe('voted_zero_round');
    expect(saved.activePlayers.filter((p: any) => !p.alive).map((p: any) => p.slot_num)).toEqual([2, 5]);
    expect(done).not.toHaveBeenCalled();
  });
  const zeroRoundVote = (extra: Record<string, unknown> = {}) => position('day_voting', [], {
    roundNumber: 1,
    protocolMarkers: { firstKilledSlot: null, zeroRoundVotedSlot: null, bestMoveSource: null, bestMoveSourceSlot: null, bestMoveSeats: [] },
    nominations: [2, 5],
    votingRounds: [{
      round_number: 1, is_revote: false, nominated_seats: [2, 5], vote_counts: { 2: 0, 5: 0 }, eligible_voters: 10, day_number: 0,
      outcome: 'pending', eliminated_seats: [], table_leave_votes: null,
    }],
    votingStage: 'collecting',
    ...extra,
  });
  // The split is broken: six vote against #2, four against #5.
  const breakSplit = async () => {
    for (const slot of [1, 3, 4, 6, 7, 8]) fireEvent.click(seat(slot));
    await press(/Следующий/);
    for (const slot of [2, 5, 9, 10]) fireEvent.click(seat(slot));
    await press('Подвести итог');
  };

  it('club rule: the player the zero-round split was broken into stays, speaks 30 more seconds, and the night starts without a best move', async () => {
    const done = await play(zeroRoundVote({ zeroRoundRule: 'club' }));
    await breakSplit();
    await screen.findByText(/клубная настройка/);
    await press('Доп. речь #2 · 30 сек');
    await press('К ночи');
    await screen.findByRole('button', { name: /Включить музыку ночи/ });
    const saved = JSON.parse(localStorage.getItem('mafia_live_session') || '{}');
    expect(saved.activePlayers.every((p: any) => p.alive)).toBe(true);
    expect(saved.protocolMarkers.zeroRoundVotedSlot).toBeNull();
    expect(saved.activeBestMoveSource).toBeNull();
    expect(saved.zeroRoundRule).toBe('club');
    expect(saved.activePlayers.every((player: any) => ['citizen', 'sheriff', 'mafia', 'don'].includes(player.role))).toBe(true);
    expect(saved.activePlayers.every((player: any) => ['red', 'black'].includes(player.team))).toBe(true);
    expect(saved.breakSpeechSlot).toBeNull();
    expect(done).not.toHaveBeenCalled();
  });

  it('a game saved before the setting existed goes on under the tournament rule, even in a club evening', async () => {
    const onGameFinished = vi.fn();
    localStorage.setItem('mafia_live_session', JSON.stringify(zeroRoundVote()));
    render(<LiveGameEngine players={[]} initialJudgeId={777} onGameFinished={onGameFinished} onCancel={vi.fn()} onPhaseChange={vi.fn()} zeroRoundRule="club" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    await breakSplit();
    await press('Подтвердить');
    const saved = JSON.parse(localStorage.getItem('mafia_live_session') || '{}');
    expect(saved.zeroRoundRule).toBe('tournament');
    expect(saved.protocolMarkers.zeroRoundVotedSlot).toBe(2);
  });

  it('tournament rule: the player voted out in the zero round leaves the table and gives a best move', async () => {
    await play(zeroRoundVote());
    await breakSplit();
    await press('Подтвердить');
    await screen.findByText(/Лучший ход/);
    const saved = JSON.parse(localStorage.getItem('mafia_live_session') || '{}');
    expect(saved.activePlayers.find((p: any) => p.slot_num === 2)?.exit_reason).toBe('voted_zero_round');
    expect(saved.protocolMarkers.zeroRoundVotedSlot).toBe(2);
  });
});
