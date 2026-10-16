/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerGameDetail, { type PlayerGameDetailData } from '../components/player/PlayerGameDetail.tsx';

afterEach(cleanup);

const score = (total: number, extra: Partial<PlayerGameDetailData['players'][number]['score']> = {}) => ({ win_point: 0, judge_bonus: 0, protocol_bonus: 0, ci_points: 0, best_move_points: 0, disciplinary_penalty_points: 0, total_points: total, ...extra });
const player = (seat: number, nickname: string, role: PlayerGameDetailData['players'][number]['role'], team: 'red' | 'black', won: boolean, patch: Partial<PlayerGameDetailData['players'][number]> = {}): PlayerGameDetailData['players'][number] => ({
  player_id: `p${seat}`, participant_id: `s${seat}`, nickname, avatar_url: null, seat_number: seat, role, team, won, exit_type: 'alive', exit_order: null,
  regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0, removal_reason: null, notes: null, color_protocol: [],
  judge_bonus: 0, protocol_bonus: 0, ci_points: 0, penalty_points: 0, disciplinary_penalty_points: 0, first_killed: false, zero_round_voted: false,
  best_move: false, best_move_source: null, best_move_seats: [], score: score(won ? 1 : 0, won ? { win_point: 1 } : {}), elo_before: 1000, elo_after: won ? 1012 : 990, elo_delta: won ? 12 : -10, ...patch,
});

const detail: PlayerGameDetailData = {
  game: { id: 'club:1', source: 'club', title: 'Игровой вечер — 9 октября', date: '2026-10-09T18:00:00.000Z', game_number: 11, format: 'CASUAL', winner_team: 'red', judge_name: 'Точка', table_name: 'Основной стол', elo_affected: true },
  protocol: {
    end_reason: 'normal',
    votes: [
      { round_number: 1, day_number: 0, is_revote: false, parent_round_number: null, eligible_voters: 10, nominated_seats: [1, 3], vote_counts: { '1': 5, '3': 5 }, outcome: 'tie_revote' },
      { round_number: 2, day_number: 0, is_revote: true, parent_round_number: 1, eligible_voters: 10, nominated_seats: [1, 3], vote_counts: { '1': 7, '3': 3 }, outcome: 'eliminated' },
      { round_number: 3, day_number: 1, is_revote: false, parent_round_number: null, eligible_voters: 8, nominated_seats: [2], vote_counts: { '2': 8 }, outcome: 'eliminated' },
    ],
    shots: [{ night_number: 1, target_seat: 9, result: 'killed' }, { night_number: 2, target_seat: 4, result: 'miss' }],
    replacement: null, judge_notes: 'Спортивная игра ФСМ.',
    first_killed: { participant_id: 's9', seat_number: 9, nickname: 'Знак' }, zero_round_voted: null, ppk_culprit: null,
  },
  players: [
    player(1, 'Богданчик', 'citizen', 'red', true, { exit_type: 'voted_zero_round' }),
    player(2, 'Алоэ', 'mafia', 'black', false, { exit_type: 'voted_day' }),
    player(3, 'Дина', 'sheriff', 'red', true, { score: score(1.5, { win_point: 1, judge_bonus: 0.5 }) }),
    player(9, 'Знак', 'citizen', 'red', true, { exit_type: 'killed', first_killed: true, best_move: true, best_move_source: 'first_killed', best_move_seats: [2, 3, 5] }),
    player(5, 'Дон Эль', 'don', 'black', false),
  ],
};

const view = (patch: Partial<Parameters<typeof PlayerGameDetail>[0]> = {}) => render(<PlayerGameDetail detail={detail} loading={false} error={null} selfId="p9" onBack={vi.fn()} {...patch} />);

describe('reveals on the game page', () => {
  it('shows who claimed to be the Sheriff and marks an announced colour that was not true', () => {
    view({ detail: { ...detail, protocol: { ...detail.protocol, reveals: [{ seat: 2, round: 2, checks: [{ target: 5, color: 'red' }, { target: 1, color: 'black' }, { target: 3, color: 'red' }] }] } } });
    const box = screen.getByTestId('game-reveals');
    expect(box.textContent).toContain('#2 Алоэ');
    expect(box.textContent).toContain('назвал красным');
    // seat 5 is the Don announced red, seat 1 a red announced black: two untruths; seat 3 (Sheriff announced red) is true
    expect(within(box).getAllByText('неправда')).toHaveLength(2);
    expect(within(box).getByTestId('game-reveal-claim-2')).toBeDefined();
  });

  it('shows the two competing versions of the table and which one was true', () => {
    view({ detail: { ...detail, protocol: { ...detail.protocol,
      reveals: [{ seat: 3, round: 2, checks: [{ target: 2, color: 'black' }] }, { seat: 5, round: 2, checks: [{ target: 1, color: 'black' }] }],
      reveal_versions: [{ claimant: 3, blacks: [2, 5], reds: [] }, { claimant: 5, blacks: [1, 3], reds: [] }] } } });
    const versions = screen.getByTestId('game-reveal-versions');
    expect(versions.textContent).toContain('Две версии стола');
    expect(versions.textContent).toContain('Шериф — #3 Дина');
    expect(versions.textContent).toContain('Чёрные: #2, #5');
    expect(within(versions).getAllByText('верная версия')).toHaveLength(1); // seat 3 is the real Sheriff
    expect(within(versions).getAllByText('ложная версия')).toHaveLength(1);
  });

  it('shows no block when nobody revealed', () => {
    view();
    expect(screen.queryByTestId('game-reveals')).toBeNull();
  });
});

describe('visual game timeline', () => {
  it('keeps all voting phases and shots in one chronological story', () => {
    view();
    fireEvent.click(screen.getByTestId('game-full-protocol').querySelector('summary')!);
    const timeline = screen.getByTestId('game-story-timeline');
    const items = within(timeline).getAllByRole('listitem');
    expect(items).toHaveLength(detail.protocol.votes.length + detail.protocol.shots.length);
    expect(timeline.textContent).toContain('Нулевой круг');
    expect(timeline.textContent).toContain('переголосование');
    expect(timeline.textContent).toContain('Ночь 1');
    expect(timeline.textContent).toContain('Мафия стреляла в');
    expect(within(timeline).getAllByTestId('game-night-graphic')).toHaveLength(detail.protocol.shots.length);
    expect(timeline.textContent).toContain('#9 Знак');
  });
});

describe('verified voting and night facts', () => {
  it('shows the candidate on the left of the voters, not the inverse', () => {
    view({ detail: { ...detail, protocol: { ...detail.protocol, events: [
      { seq: 1, at: '', round: 1, phase: 'day_voting', kind: 'vote', seat: 2, target: 1, value: 1 },
      { seq: 2, at: '', round: 1, phase: 'day_voting', kind: 'vote', seat: 3, target: 1, value: 1 },
      { seq: 3, at: '', round: 1, phase: 'day_voting', kind: 'vote_round_result', value: '1:tie_revote' },
    ] } } });
    fireEvent.click(screen.getByTestId('game-full-protocol').querySelector('summary')!);
    const timeline = screen.getByTestId('game-story-timeline');
    expect(timeline.textContent).toContain('←');
    expect(timeline.textContent).toContain('#1 Богданчик');
  });

  it('does not describe a confirmed first-night victim as a miss', () => {
    view({ detail: { ...detail, protocol: { ...detail.protocol, shots: [{ night_number: 1, target_seat: 9, result: 'miss' }] } } });
    fireEvent.click(screen.getByTestId('game-full-protocol').querySelector('summary')!);
    const timeline = screen.getByTestId('game-story-timeline');
    expect(timeline.textContent).toContain('убит');
    expect(timeline.textContent).not.toContain('Промах');
  });
});

describe('player game page', () => {
  it('opens with the result, the viewer’s own game and what mattered', () => {
    view();
    const hero = screen.getByTestId('game-hero');
    expect(hero.textContent).toContain('Игра №11');
    expect(hero.textContent).toContain('Победа красных');
    expect(hero.textContent).toContain('Обычное завершение');
    expect(hero.textContent).toContain('Основной стол');
    expect(hero.textContent).toContain('Судья Точка');
    const mine = screen.getByTestId('game-mine');
    expect(mine.textContent).toContain('Моя игра');
    expect(mine.textContent).toContain('Победа');
    expect(mine.textContent).toContain('+12 Elo');
    expect(screen.getByText('Главное в игре')).toBeDefined();
    expect((screen.getByTestId('game-full-protocol') as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(screen.getByTestId('game-key-moments').querySelector('summary')!);
    expect(screen.getAllByText('#9 Знак', { selector: 'div' })).toHaveLength(2); // the first killed and the best move
    expect(screen.getByText('назвал чёрными #2, #3, #5 · угадал 2 из 3')).toBeDefined();
  });

  it('groups the table by team, marks the winners and hides details until opened', () => {
    view();
    expect(screen.getByText('Красные')).toBeDefined();
    expect(screen.getByText('Чёрные')).toBeDefined();
    expect(screen.getAllByText('победили')).toHaveLength(1);
    const row = screen.getByTestId('game-player-3');
    expect(row.tagName).toBe('DETAILS');
    expect((row as HTMLDetailsElement).open).toBe(false);
    expect(within(row).getByText('+1,5')).toBeDefined();
    fireEvent.click(row.querySelector('summary')!);
    expect((row as HTMLDetailsElement).open).toBe(true);
    expect(within(row).getByText('судья +0,5')).toBeDefined();
    expect(within(screen.getByTestId('game-player-9')).getByText('вы')).toBeDefined();
  });

  it('tells the game in order: zero circle, first night, first day, second night', () => {
    view();
    fireEvent.click(screen.getByTestId('game-full-protocol').querySelector('summary')!);
    const story = screen.getByText('Ход игры').closest('section')!;
    const titles = within(story).getAllByRole('listitem').map((item) => item.textContent || '');
    expect(titles[0]).toContain('Нулевой круг');
    expect(titles[0]).toContain('Ничья — переголосование');
    expect(titles[1]).toContain('Нулевой круг · переголосование');
    expect(titles[1]).toContain('Заголосован #1 Богданчик');
    expect(titles[2]).toContain('Ночь 1');
    expect(titles[2]).toContain('Мафия стреляла в #9 Знак');
    expect(titles[3]).toContain('День 1');
    expect(titles[4]).toContain('Ночь 2');
    expect(titles[4]).toContain('промах');
    expect(screen.getByText('Заметка судьи')).toBeDefined();
  });

  it('works for a viewer who did not play and for a game without a protocol log', () => {
    view({ selfId: 'nobody', detail: { ...detail, protocol: { ...detail.protocol, votes: [], shots: [], judge_notes: null, first_killed: null } } });
    expect(screen.queryByTestId('game-mine')).toBeNull();
    expect(screen.queryByText('Ход игры')).toBeNull();
    expect(screen.queryByText('Заметка судьи')).toBeNull();
    expect(screen.getByText('Составы и баллы')).toBeDefined();
  });
});


describe('owner score-sheet detail', () => {
  it('shows recorded voters and personal accuracy without deriving identities from totals', () => {
    view({selfId:'p1',detail:{...detail,protocol:{...detail.protocol,events:[
      {seq:1,at:'',round:1,phase:'zero_night',kind:'game_start'},
      {seq:2,at:'',round:2,phase:'day_voting',kind:'vote',seat:1,target:2,value:3},
      {seq:3,at:'',round:2,phase:'day_voting',kind:'vote_round_result',value:'3:single_eliminated'},
      {seq:4,at:'',round:2,phase:'day_voting',kind:'exit',seat:2,value:'voted_day'},
      {seq:5,at:'',round:2,phase:'finished',kind:'game_end',value:'red'},
    ]}}});
    expect(screen.getByTestId('game-score-sheet').textContent).not.toContain('5 игроков');
    expect(screen.getByTestId('game-personal-stats').textContent).toContain('100%');
    expect(screen.getByTestId('game-personal-stats').textContent).toContain('1 из 1 в чёрных');
    expect(screen.getByLabelText('Кто в кого голосовал').textContent).toContain('#2 Алоэ');
    const don=screen.getByTestId('game-player-5').querySelector('summary [style]');
    expect(don?.getAttribute('style')).toContain('rgb(167, 139, 250)');
  });
  it('keeps accuracy unavailable for historical aggregate-only protocols', () => {
    view();
    expect(screen.getByTestId('game-personal-stats').textContent).toContain('Нет подходящих записанных голосов');
    expect(screen.queryByLabelText('Кто в кого голосовал')).toBeNull();
  });
});
