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

describe('live game emergency recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => cleanup());

  it('restores an interrupted game to its saved phase and blocks a double finish click', async () => {
    localStorage.setItem('mafia_live_session', JSON.stringify(recoverySnapshot()));
    const onGameFinished = vi.fn();
    const onPhaseChange = vi.fn();

    render(
      <LiveGameEngine
        players={[]}
        initialJudgeId={777}
        onGameFinished={onGameFinished}
        onCancel={vi.fn()}
        onPhaseChange={onPhaseChange}
      />,
    );

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
  });

  it('requires an explicit music resume before continuing a restored zero night', async () => {
    const zeroNightPlayers = players.map((player) => ({
      ...player,
      alive: true,
      eliminated_phase: '',
      exit_reason: 'alive',
    }));
    localStorage.setItem('mafia_live_session', JSON.stringify({
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
    }));

    render(
      <LiveGameEngine
        players={[]}
        initialJudgeId={777}
        onGameFinished={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));

    const resumeMusic = await screen.findByRole('button', { name: /Включить музыку ночи/i });
    expect(screen.queryByRole('button', { name: /Вызов шерифа · 10с/i })).toBeNull();

    fireEvent.click(resumeMusic);
    expect(await screen.findByRole('button', { name: /Вызов шерифа · 10с/i })).toBeTruthy();
  });

  it('restores undo history so Back exits a recovered best-move overlay', async () => {
    const beforeBestMove = {
      ...recoverySnapshot(),
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
    localStorage.setItem('mafia_live_session', JSON.stringify({
      ...beforeBestMove,
      nightSubPhase: 'best_move',
      customTimerLabel: null,
      activeBestMoveSource: 'first_killed',
      activeBestMoveSlot: 1,
      historyStack: [beforeBestMove],
    }));

    render(
      <LiveGameEngine
        players={[]}
        initialJudgeId={777}
        onGameFinished={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    fireEvent.click(await screen.findByRole('button', { name: '← Назад' }));

    expect(await screen.findByText('Проверка Шерифа · выберите номер')).toBeTruthy();
    expect(screen.queryByText(/Лучший ход/i)).toBeNull();
  });
});
