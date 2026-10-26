/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api } from '../lib/api';

// Characterization of the tournament card before splitting its markup (AUDIT_LOG: coverage 32 %). The heavy children
// (their own screens with their own tests) are stubs that only say they are open.
vi.mock('../components/crm/tournaments/TournamentStandingsView.tsx', () => ({ TournamentStandingsView: () => <div>ТАБЛИЦА</div> }));
vi.mock('../components/crm/tournaments/TournamentNominationsView.tsx', () => ({ TournamentNominationsView: () => <div>НОМИНАЦИИ</div> }));
vi.mock('../components/crm/tournaments/TournamentOfficialResults.tsx', () => ({ TournamentOfficialResults: () => <div>ОФИЦИАЛЬНЫЕ ИТОГИ</div> }));
vi.mock('../components/crm/tournaments/TournamentGameSetup.tsx', () => ({ TournamentGameSetup: ({ game }: any) => <div>ПОДГОТОВКА ИГРЫ {game.game_number}</div> }));
vi.mock('../components/crm/tournaments/GameProtocolModal.tsx', () => ({ GameProtocolModal: ({ isOpen }: any) => (isOpen ? <div>ОКНО ПРОТОКОЛА</div> : null) }));
vi.mock('../components/player/TournamentLiveGameModal.tsx', () => ({ default: () => <div>ДВИЖОК</div> }));
vi.mock('../components/crm/tournaments/ConfirmReopenTournamentModal.tsx', () => ({ ConfirmReopenTournamentModal: ({ isOpen }: any) => (isOpen ? <div>ОКНО ВОЗВРАТА</div> : null) }));
vi.mock('../components/crm/tournaments/ConfirmCompleteTournamentModal.tsx', () => ({ ConfirmCompleteTournamentModal: ({ isOpen }: any) => (isOpen ? <div>ОКНО ЗАВЕРШЕНИЯ</div> : null) }));
vi.mock('../components/crm/tournaments/SeatingExportModal.tsx', () => ({ SeatingExportModal: ({ isOpen }: any) => (isOpen ? <div>ОКНО РАССАДКИ</div> : null) }));
vi.mock('../components/crm/tournaments/ResultsImageExportModal.tsx', () => ({ ResultsImageExportModal: ({ isOpen, gameNumber }: any) => (isOpen ? <div>ОКНО РЕЗУЛЬТАТА {gameNumber}</div> : null) }));

const { TournamentDetailView } = await import('../components/crm/tournaments/TournamentDetailViewBase');

const ROLES = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'];
const seats = (gameId: string, roles: (string | null)[] = ROLES) => roles.map((role, i) => ({ id: `${gameId}-s${i + 1}`, seat_number: i + 1, display_name: `Игрок ${i + 1}`, player_id: `p${i + 1}`, role }));
const game = (n: number, status: string, extra: Record<string, unknown> = {}) => ({ id: `g${n}`, game_number: n, status, judge_name: 'Судья', seats: seats(`g${n}`), ...extra });
const participants = Array.from({ length: 10 }, (_, i) => ({ id: `tp${i + 1}`, participant_number: i + 1, display_name: `Игрок ${i + 1}`, player_id: `p${i + 1}` }));
const tournament = (extra: Record<string, unknown> = {}) => ({
  id: 't1', title: 'Кубок октября', date: '2026-10-03T12:00:00.000Z', venue: 'Клуб', status: 'draft', chief_judge_name: 'Главный',
  participants, games: [game(1, 'planned'), game(2, 'planned')], start_readiness: { ready: true, errors: [] }, ...extra,
});

const open = async (data: any, props: Record<string, unknown> = {}) => {
  vi.spyOn(api, 'getTournament').mockResolvedValue(data);
  render(<TournamentDetailView tournamentId="t1" onBack={vi.fn()} {...props} />);
  await screen.findByText(data.title);
};

beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('tournament card: header and organization', () => {
  it('a draft that is not ready lists what to fix, blocks the start and offers to cancel', async () => {
    await open(tournament({ start_readiness: { ready: false, errors: ['Нет судьи у игры 2'] } }));
    expect(screen.getByText('Черновик')).toBeTruthy();
    expect(screen.getByText('Требуется исправление')).toBeTruthy();
    expect(screen.getByText('Нет судьи у игры 2')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Запустить турнир/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('cancel-tournament-button')).toBeTruthy();
    // a tournament made the old way edits its data and roster here
    expect(screen.getByRole('button', { name: 'Редактировать данные' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Изменить состав' }).length).toBe(2);
  });

  it('a ready draft can start; a tournament with registration has no old data/roster forms', async () => {
    const start = vi.spyOn(api, 'startTournament');
    await open(tournament({ tournament_evening_flow: 1 }));
    expect(screen.getByText('Готов к запуску')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Запустить турнир/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Редактировать данные' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Изменить состав' })).toBeNull();
    expect(start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Рассадка для игроков/ }));
    expect(screen.getByText('ОКНО РАССАДКИ')).toBeTruthy();
  });

  it('a running tournament shows its progress and why it cannot be completed yet', async () => {
    await open(tournament({ status: 'active', games: [game(1, 'completed'), game(2, 'active')], complete_readiness: { isReady: false, errors: ['Игра 2 не завершена'] } }));
    expect(screen.getByText('Турнир идёт')).toBeTruthy();
    expect(screen.getByText(/1 из 2 игры завершено/)).toBeTruthy();
    expect(screen.getByText('Игра 2 не завершена')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Завершить турнир/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('cancel-tournament-button')).toBeNull();
  });

  it('a ready running tournament opens the completion dialog', async () => {
    await open(tournament({ status: 'active', games: [game(1, 'completed')], complete_readiness: { isReady: true, errors: [] } }));
    fireEvent.click(screen.getByRole('button', { name: /Завершить турнир/ }));
    expect(screen.getByText('ОКНО ЗАВЕРШЕНИЯ')).toBeTruthy();
  });

  it('correction mode explains itself and completes again', async () => {
    await open(tournament({ status: 'correction', games: [game(1, 'completed')], complete_readiness: { isReady: true, errors: [] } }));
    expect(screen.getByText('Режим корректировки')).toBeTruthy();
    expect(screen.getByText('Режим корректировки турнира')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Повторно завершить турнир/ }));
    expect(screen.getByText('ОКНО ЗАВЕРШЕНИЯ')).toBeTruthy();
  });

  it('a completed tournament shows the official results and can be reopened', async () => {
    await open(tournament({ status: 'completed', games: [game(1, 'completed')] }));
    expect(screen.getByText('Завершён')).toBeTruthy();
    expect(screen.getByText('ОФИЦИАЛЬНЫЕ ИТОГИ')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Редактировать завершённый турнир/ }));
    expect(screen.getByText('ОКНО ВОЗВРАТА')).toBeTruthy();
  });

  it('the roster folds out with every participant', async () => {
    await open(tournament());
    expect(screen.getByText('Состав участников (10 человек)')).toBeTruthy();
    expect(screen.queryByText('Игрок 7')).toBeNull();
    fireEvent.click(screen.getByText('Показать'));
    expect(screen.getByText('Игрок 7')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Исправить' }).length).toBe(10);
  });

  it('a failed action shows its message, which can be closed', async () => {
    vi.spyOn(api, 'generateTournamentSeating').mockRejectedValue(new Error('Сервер недоступен'));
    await open(tournament());
    fireEvent.click(screen.getByRole('button', { name: /Перегенерировать рассадку/ }));
    const banner = await screen.findByText(/Сервер недоступен/);
    fireEvent.click(within(banner.closest('div')!.parentElement as HTMLElement).getByRole('button'));
    expect(screen.queryByText(/Сервер недоступен/)).toBeNull();
  });

  it('the step screen shows only its tabs and no header', async () => {
    vi.spyOn(api, 'getTournament').mockResolvedValue(tournament() as any);
    render(<TournamentDetailView tournamentId="t1" onBack={vi.fn()} hideHeader tabs={['standings', 'nominations']} />);
    expect(await screen.findByText('ТАБЛИЦА')).toBeTruthy();
    expect(screen.queryByText('Кубок октября')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Номинации' }));
    expect(screen.getByText('НОМИНАЦИИ')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Организация' })).toBeNull();
  });
});

describe('tournament card: games', () => {
  const games = () => fireEvent.click(screen.getByRole('button', { name: 'Игры' }));

  it('a planned game opens its setup; the arrows and the numbers move between games', async () => {
    await open(tournament({ status: 'active', games: [game(1, 'completed'), game(2, 'planned'), game(3, 'planned')] }));
    games();
    expect(screen.getByText('ПОДГОТОВКА ИГРЫ 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Игра 3' }));
    expect(screen.getByText('ПОДГОТОВКА ИГРЫ 3')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Протокол игры/ }) as HTMLButtonElement).disabled).toBe(true);
    // the last planned game of a running tournament can be dropped
    expect(screen.getByTestId('drop-last-game-button').textContent).toContain('Убрать игру №3');
  });

  it('a running game offers the engine, the protocol, a role fix and a return to the plan', async () => {
    await open(tournament({ status: 'active', games: [game(1, 'active')] }));
    games();
    expect(screen.getByText('Идёт сейчас')).toBeTruthy();
    expect(screen.getByText('Мирные: 6 / 6')).toBeTruthy();
    expect(screen.getByTestId('fix-active-game-roles-button')).toBeTruthy();
    expect(screen.getByTestId('reset-game-to-planned-button')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tournament-live-game-button'));
    expect(screen.getByText('ДВИЖОК')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Протокол игры/ }));
    expect(screen.getByText('ОКНО ПРОТОКОЛА')).toBeTruthy();
  });

  it('a completed game shows its result picture and «Исправить»', async () => {
    await open(tournament({ status: 'active', games: [game(1, 'completed'), game(2, 'planned')] }));
    games();
    fireEvent.click(screen.getByRole('button', { name: 'Игра 1' }));
    expect(screen.getByText('Завершено')).toBeTruthy();
    expect(screen.getByTestId('correct-completed-game-button')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Посмотреть результат/ }));
    expect(screen.getByText('ОКНО РЕЗУЛЬТАТА 1')).toBeTruthy();
  });

  it('roles of a game in correction are chosen per seat and saved', async () => {
    const save = vi.spyOn(api, 'updateGameRoles').mockResolvedValue({} as any);
    const roles: (string | null)[] = [...ROLES]; roles[9] = null;
    await open(tournament({ status: 'correction', games: [game(1, 'active', { seats: seats('g1', roles), protocol_status: 'draft' })], complete_readiness: { isReady: false, errors: [] } }));
    games();
    expect(screen.getByText('Дон: 0 / 1')).toBeTruthy();
    const select = screen.getAllByRole('combobox')[9] as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'don' } });
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(JSON.stringify(save.mock.calls[0])).toContain('"role":"don"');
  });

  it('the judge of a planned game is edited inline', async () => {
    const save = vi.spyOn(api, 'updateGameJudge').mockResolvedValue({} as any);
    await open(tournament({ status: 'draft', games: [game(1, 'planned')] }));
    games();
    fireEvent.click(screen.getByRole('button', { name: /Судья/ }));
    const input = screen.getByPlaceholderText('Имя судьи');
    fireEvent.change(input, { target: { value: 'Новый судья' } });
    fireEvent.click(input.parentElement!.querySelectorAll('button')[0]);
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(JSON.stringify(save.mock.calls[0])).toContain('Новый судья');
  });
});
