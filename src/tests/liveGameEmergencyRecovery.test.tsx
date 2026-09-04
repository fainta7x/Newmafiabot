/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LiveGameEngine from '../components/LiveGameEngine';
import { createInitialGameDiscipline } from '../lib/gameDiscipline';

const players = Array.from({ length: 10 }, (_, index) => {
  const slot = index + 1;
  const black = slot >= 8;
  const role = slot === 10 ? 'Дон' : slot >= 8 ? 'Мафия' : slot === 7 ? 'Шериф' : 'Мирный';
  const alive = [1, 2, 8, 9].includes(slot);
  return {
    slot_num: slot,
    user_id: slot,
    nickname: `Игрок ${slot}`,
    role,
    team: black ? 'Чёрные' : 'Красные',
    fouls: 0,
    minor_tech_fouls: 0,
    major_tech_fouls: 0,
    removal_reason: null,
    alive,
    nominated_this_round: false,
    has_spoken_this_round: false,
    mute_this_round: false,
    is_pu: false,
    best_move_guesses: [],
    kick: false,
    ppk: false,
    bonus_points: 0,
    lh_points: 0,
    will_protocol_points: 0,
    will_opinion_points: 0,
    dc_points: 0,
    eliminated_phase: alive ? '' : 'Покинул стол',
    has_foul_penalty: false,
    exit_reason: alive ? 'alive' : 'killed',
  };
});

const recoverySnapshot = () => ({
  activePlayers: players,
  nominations: [],
  nominationsMap: {},
  phase: 'night',
  roundNumber: 2,
  nightSubPhase: 'morning',
  postNightStage: 'death_protocol',
  protocolMarkers: {
    firstKilledSlot: 3,
    zeroRoundVotedSlot: null,
    bestMoveSource: null,
    bestMoveSourceSlot: null,
    bestMoveSeats: [],
  },
  activeBestMoveSource: null,
  activeBestMoveSlot: null,
  pendingBestMoveSeats: [],
  bestMoveDeadlineMs: null,
  votingRounds: [],
  activeVotingRoundIndex: 0,
  votesByPlayer: {},
  votes: {},
  votingStage: 'setup',
  revoteSpeakerIndex: 0,
  tableLeaveVotesInput: null,
  currentVotingNomineeIndex: 0,
  activeSpeakerSlot: 3,
  customTimerLabel: 'Протокол убитого #3',
  timeLeft: 15,
  timerMax: 15,
  isTimerRunning: false,
  zeroNightSubPhase: null,
  zeroNightMusicState: 'pending',
  shotPlayerSlot: 3,
  donCheckSlot: null,
  donCheckResult: null,
  sheriffCheckSlot: null,
  sheriffCheckResult: null,
  nightLogs: [{ round: 2, log: 'Н2: выстрел в #3 — убит.' }],
  votingFarewellQueue: [],
  votingFarewellIndex: 0,
  discipline: createInitialGameDiscipline(
    players.map((player) => ({ id: String(player.slot_num), team: player.team === 'Чёрные' ? 'black' : 'red' })),
  ),
  savedAt: '17:35',
});

const farewellSnapshot = () => ({
  ...recoverySnapshot(),
  postNightStage: 'farewell',
  customTimerLabel: 'Прощальная речь #3',
  timeLeft: 60,
  timerMax: 60,
  isTimerRunning: false,
});

const renderRecovered = (snapshot: any, onGameFinished = vi.fn(), onPhaseChange = vi.fn()) => {
  localStorage.setItem('mafia_live_session', JSON.stringify(snapshot));
  render(
    <LiveGameEngine
      players={[]}
      initialJudgeId={777}
      onGameFinished={onGameFinished}
      onCancel={vi.fn()}
      onPhaseChange={onPhaseChange}
    />,
  );
  return { onGameFinished, onPhaseChange };
};

describe('live game emergency recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => cleanup());

  it('restores an interrupted game to its saved phase and blocks a double finish click', async () => {
    const { onGameFinished, onPhaseChange } = renderRecovered(recoverySnapshot());

    const restoreButton = await screen.findByRole('button', { name: 'Восстановить' });
    fireEvent.click(restoreButton);

    await waitFor(() => expect(onPhaseChange).toHaveBeenCalledWith('night'));
    fireEvent.click(screen.getByTestId('live-events-toggle'));
    expect(screen.getByText('Н2:')).toBeTruthy();

    const finishButton = await screen.findByRole('button', { name: 'Завершить игру' });
    fireEvent.click(finishButton);
    fireEvent.click(finishButton);

    expect(onGameFinished).toHaveBeenCalledTimes(1);
    expect(onGameFinished.mock.calls[0][0].winning_team).toBe('Чёрные');
    expect(localStorage.getItem('mafia_live_session')).toBeNull();
  });

  it('does not auto-finish a recovered winning game before the last speech and death protocol', async () => {
    const { onGameFinished } = renderRecovered(farewellSnapshot());

    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    expect(onGameFinished).not.toHaveBeenCalled();
    expect(await screen.findByText('Последняя речь #3')).toBeTruthy();
    expect(screen.getByText('60с')).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: /Протокол убитого · 20с/i }));
    expect(onGameFinished).not.toHaveBeenCalled();
    expect(await screen.findByText('Протокол убитого #3')).toBeTruthy();
    expect(await screen.findByText('20с')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Завершить игру' })).toBeTruthy();
  });

  it('restores the farewell snapshot when undoing a recovered death protocol', async () => {
    renderRecovered({
      ...recoverySnapshot(),
      historyStack: [farewellSnapshot()],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Назад' }));

    expect(await screen.findByText('Последняя речь #3')).toBeTruthy();
    expect(screen.getByText('60с')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Завершить игру' })).toBeNull();
  });

  it('continues a recovered non-winning death protocol into the next day', async () => {
    const nonWinningPlayers = players.map((player) => player.slot_num === 4
      ? { ...player, alive: true, eliminated_phase: '', exit_reason: 'alive' }
      : player);
    const { onGameFinished, onPhaseChange } = renderRecovered({
      ...recoverySnapshot(),
      activePlayers: nonWinningPlayers,
      discipline: createInitialGameDiscipline(
        nonWinningPlayers.map((player) => ({ id: String(player.slot_num), team: player.team === 'Чёрные' ? 'black' : 'red' })),
      ),
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    expect(onGameFinished).not.toHaveBeenCalled();
    const openDay = await screen.findByRole('button', { name: 'Открыть день' });
    fireEvent.click(openDay);

    await waitFor(() => expect(onPhaseChange).toHaveBeenCalledWith('day_speeches'));
    expect(onGameFinished).not.toHaveBeenCalled();
  });

  it('keeps legacy 15-second death-protocol recovery compatible with the canonical 20-second display', async () => {
    renderRecovered({
      ...recoverySnapshot(),
      isTimerRunning: true,
      timeLeft: 15,
      timerMax: 15,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    expect(await screen.findByText('20с')).toBeTruthy();
  });

  it('requires an explicit music resume before continuing a restored zero night', async () => {
    const zeroNightPlayers = players.map((player) => ({
      ...player,
      alive: true,
      eliminated_phase: '',
      exit_reason: 'alive',
    }));
    renderRecovered({
      ...recoverySnapshot(),
      activePlayers: zeroNightPlayers,
      phase: 'zero_night',
      roundNumber: 1,
      nightSubPhase: 'intro',
      postNightStage: 'none',
      activeSpeakerSlot: null,
      customTimerLabel: 'Договорка',
      timeLeft: 75,
      timerMax: 75,
      zeroNightSubPhase: 'agreement',
      zeroNightMusicState: 'playing',
      shotPlayerSlot: null,
      nightLogs: [],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));

    const resumeMusic = await screen.findByRole('button', { name: /Включить музыку ночи/i });
    expect(screen.queryByRole('button', { name: /Вызов шерифа · 10с/i })).toBeNull();

    fireEvent.click(resumeMusic);
    expect(await screen.findByRole('button', { name: /Вызов шерифа · 10с/i })).toBeTruthy();
  });

  it('restores undo history so Back exits a recovered best-move overlay', async () => {
    const nonTerminalPlayers = players.map((player) => player.slot_num === 3
      ? { ...player, alive: true, eliminated_phase: '', exit_reason: 'alive' }
      : player);
    const beforeBestMove = {
      ...recoverySnapshot(),
      activePlayers: nonTerminalPlayers,
      nightSubPhase: 'sheriff',
      postNightStage: 'none',
      activeSpeakerSlot: null,
      customTimerLabel: 'Проверка Шерифа',
      timeLeft: 15,
      timerMax: 15,
      shotPlayerSlot: 1,
      activeBestMoveSource: null,
      activeBestMoveSlot: null,
      pendingBestMoveSeats: [],
    };
    renderRecovered({
      ...beforeBestMove,
      nightSubPhase: 'best_move',
      customTimerLabel: null,
      activeBestMoveSource: 'first_killed',
      activeBestMoveSlot: 1,
      historyStack: [beforeBestMove],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    fireEvent.click(await screen.findByRole('button', { name: '← Назад' }));

    expect(await screen.findByText('Проверка Шерифа · выберите номер')).toBeTruthy();
    expect(screen.queryByText(/Лучший ход/i)).toBeNull();
  });

  it('reconstructs a recovered first-killed best-move marker instead of auto-finishing a winning game', async () => {
    const snapshot = {
      ...recoverySnapshot(),
      nightSubPhase: 'best_move',
      postNightStage: 'none',
      customTimerLabel: null,
      activeSpeakerSlot: null,
      activeBestMoveSource: null,
      activeBestMoveSlot: null,
      bestMoveDeadlineMs: Date.now() + 20_000,
      protocolMarkers: {
        ...recoverySnapshot().protocolMarkers,
        firstKilledSlot: 3,
      },
    };
    const { onGameFinished } = renderRecovered(snapshot);

    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    expect(onGameFinished).not.toHaveBeenCalled();
    expect(await screen.findByTestId('live-best-move-sheet')).toBeTruthy();
    expect(screen.getByText('Протокол ЛХ')).toBeTruthy();
  });
});
