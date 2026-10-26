// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EveningGameProtocolModal } from '../components/crm/EveningGameProtocolModal.tsx';
import { clubGamesApi } from '../lib/clubGamesApi.ts';

const ROLES = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'];
const makeGame = (status: 'draft' | 'completed', winner: 'red' | 'black' | null = null): any => ({
  id: 7, global_game_number: 7, table_name: 'Стол 1', judge_name: 'Судья',
  club_protocol: {
    protocol: { game_id: '7', status, winner_team: winner, votes: [], shots: [], best_moves: [], best_move_seats: [] },
    player_results: ROLES.map((role, i) => ({
      participant_id: `p${i + 1}`, seat_number: i + 1, display_name: `Игрок ${i + 1}`, role,
      exit_type: 'alive', regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0,
    })),
  },
});
// The server echoes the saved protocol as brand-new objects (JSON), like a real response.
const echo = (payload: any) => JSON.parse(JSON.stringify({ ...makeGame('draft'), club_protocol: { protocol: payload.protocol, player_results: payload.player_results } }));

const open = (game: any) => render(<EveningGameProtocolModal game={game} isOpen onClose={() => {}} onUpdated={() => {}} />);
/** The places of the protocol are in the rail (desktop) and in the bottom bar (phone); both are in the DOM here. */
const go = (name: string) => fireEvent.click(screen.getAllByRole('button', { name })[0]);
const openPlayer = (seat: number) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`Игрок ${seat} Игрок ${seat}, открыть`) }));
const sheet = () => within(screen.getByRole('dialog'));
const settle = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await vi.advanceTimersByTimeAsync(1100); }); };

describe('protocol editor autosave', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('saves one edit once and settles on «Сохранено» instead of re-saving its own server echo', async () => {
    const save = vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => echo(payload));
    open(makeGame('draft'));
    go('Протокол');
    openPlayer(1);
    fireEvent.click(sheet().getByRole('button', { name: 'Фолы: больше' }));
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1].player_results[0].regular_fouls).toBe(1);
    expect(screen.getAllByText('Сохранено').length).toBeGreaterThan(0);
  });

  it('«Подтвердить игру» is not rolled back to a draft by a pending autosave', async () => {
    const calls: any[] = [];
    vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => { calls.push(payload.protocol.status); return echo(payload); });
    open(makeGame('draft', 'red'));
    go('Протокол');
    openPlayer(1);
    fireEvent.click(sheet().getByRole('button', { name: 'Фолы: больше' })); // pending autosave (draft)
    fireEvent.click(sheet().getByRole('button', { name: 'Закрыть' }));
    go('Протокол');
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить игру' })); // before the 1 s timer fires
    await settle();
    expect(calls[calls.length - 1]).toBe('completed');
    expect(calls.filter((status) => status === 'draft').length).toBeLessThanOrEqual(1);
  });

  it('says on screen what blocks «Подтвердить игру» instead of failing silently', async () => {
    const save = vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => echo(payload));
    open(makeGame('draft', null));
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить игру' }));
    expect(screen.getByRole('alert').textContent).toContain('победившую команду');
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('club voting confirmation', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('confirms a broken club split without removing the player or creating a zero-round best move', async () => {
    const source = makeGame('draft', 'red');
    source.club_protocol.protocol.zero_round_rule = 'club';
    source.club_protocol.protocol.votes = [{ round_number: 1, day_number: 0, is_revote: false, nominated_seats: [2, 5], eligible_voters: 10, vote_counts: { 2: 6, 5: 4 }, outcome: 'pending', eliminated_seats: [] }];
    const save = vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => echo(payload));
    open(source);
    go('Ход игры');
    expect(screen.getByTestId('voting-summary').textContent).toMatch(/остаётся за столом/);
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить результат' }));
    go('Протокол');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Подтвердить игру' })); });
    const payload = save.mock.calls.at(-1)![1];
    expect(payload.protocol.status).toBe('completed');
    expect(payload.protocol.votes[0]).toMatchObject({ outcome: 'no_elimination', eliminated_seats: [] });
    expect(payload.protocol.zero_round_voted_participant_id).toBeNull();
    expect(payload.player_results.every((player: any) => player.exit_type === 'alive')).toBe(true);
  });

  it('blocks an unconfirmed round before saving completion and shows it in the circle', async () => {
    const source = makeGame('draft', 'red');
    source.club_protocol.protocol.votes = [{ round_number: 1, day_number: 1, is_revote: false, nominated_seats: [2, 5], eligible_voters: 10, vote_counts: { 2: 6, 5: 4 }, outcome: 'pending', eliminated_seats: [] }];
    const save = vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => echo(payload));
    open(source);
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить игру' }));
    expect(screen.getByRole('alert').textContent).toContain('не подтверждён');
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    // the judge is taken to the circle with the unfinished voting
    expect(screen.getByRole('button', { name: 'Подтвердить результат' })).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('a game saved by an older build', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  const legacyGame = () => {
    const game = makeGame('draft', 'black');
    game.club_protocol.protocol.first_killed_participant_id = 'p8';
    game.club_protocol.protocol.shots = [{ night_number: 1, target_seat: 8, result: 'miss' }];
    game.club_protocol.player_results[7].exit_type = 'killed';
    return game;
  };

  it('opens with the night put right from the record, says so, and saves the repaired record', async () => {
    const save = vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => echo(payload));
    open(legacyGame());
    expect(screen.getByTestId('legacy-repair-note').textContent).toContain('ночь 1: игрок #8 убит (в записи было «промах»)');
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1].protocol.shots).toEqual([{ night_number: 1, target_seat: 8, result: 'killed' }]);
  });

  it('keeps how a player left when an unrelated night is edited', async () => {
    const game = makeGame('draft', 'black');
    game.club_protocol.player_results[2].exit_type = 'voted_day'; // the day vote that left him was never recorded
    const save = vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => echo(payload));
    open(game);
    go('Ход игры');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить ночь' }));
    await settle();
    const saved = save.mock.calls.at(-1)![1];
    expect(saved.player_results[2].exit_type).toBe('voted_day');
    expect(saved.player_results[0].exit_type).toBe('killed'); // the new night's default target is seat 1
  });
});

describe('undoing a PPK and a judge removal', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('«Отменить ППК» gives the game back its winner choice', async () => {
    const save = vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => echo(payload));
    open(makeGame('draft', 'red'));
    go('Протокол');
    openPlayer(8); // a black player causes it
    fireEvent.click(sheet().getByRole('button', { name: 'ППК' }));
    expect(sheet().getByRole('button', { name: 'Отменить ППК' })).toBeTruthy();
    fireEvent.click(sheet().getByRole('button', { name: 'Отменить ППК' }));
    await settle();
    const saved = save.mock.calls.at(-1)![1];
    expect(saved.protocol).toMatchObject({ end_reason: 'normal', ppk_culprit_participant_id: null, winner_team: null });
  });

  it('«Отменить удаление» returns a player removed by the judge', async () => {
    const save = vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => echo(payload));
    open(makeGame('draft', 'red'));
    go('Протокол');
    openPlayer(3);
    fireEvent.click(sheet().getByRole('button', { name: 'Удалить судьёй' }));
    fireEvent.click(sheet().getByRole('button', { name: 'Отменить удаление' }));
    await settle();
    const saved = save.mock.calls.at(-1)![1];
    expect(saved.player_results[2]).toMatchObject({ exit_type: 'alive', removal_reason: null });
  });
});

describe('what the judge changed', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('lists a change since the window opened and takes it back', async () => {
    vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => echo(payload));
    open(makeGame('draft', 'red'));
    go('Протокол');
    openPlayer(2);
    fireEvent.click(sheet().getByRole('radio', { name: 'Мафия' }));
    fireEvent.click(sheet().getByRole('button', { name: 'Закрыть' }));
    go('Протокол');
    expect(screen.getByText(/Вы изменили · 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Вернуть: Роль/ }));
    expect(screen.queryByText(/Вы изменили/)).toBeNull();
    await settle();
  });
});

describe('taking back a voting change', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('also takes back who left the game because of it', async () => {
    const game = makeGame('draft', 'red');
    const round = { round_number: 1, day_number: 1, is_revote: false, nominated_seats: [2, 5], eligible_voters: 10, vote_counts: { 2: 6, 5: 4 }, outcome: 'single_eliminated', eliminated_seats: [2] };
    game.club_protocol.protocol.votes = [round];
    game.club_protocol.player_results[1].exit_type = 'voted_day';
    vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => echo(payload));
    open(game);
    go('Ход игры');
    fireEvent.click(screen.getByRole('tab', { name: /Круг 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить результат' }));
    go('Протокол');
    expect(screen.getByText(/Вы изменили · 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Вернуть: Круг 1/ }));
    expect(screen.queryByText(/Вы изменили/)).toBeNull();
    await settle();
  });
});
