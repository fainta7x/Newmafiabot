import { describe, expect, it } from 'vitest';
import {
  buildOfficialTournamentResultsPresentation,
  generateGameResultsPages,
  generateOfficialTournamentResultsPages,
  generateOfficialTournamentResultsSvg,
  generateStandingsPages,
  type GamePlayerExportRow,
} from '../lib/tournamentResultsExport.ts';
import type { Tournament, TournamentGame, TournamentStandingItem, TournamentAwardSlot } from '../lib/api.ts';

const tournament = {
  id: 't1',
  title: 'Турнир Богдана 1.08',
  date: '2026-08-01T12:00:00.000Z',
  venue: 'Суп с котом',
  status: 'completed',
  total_games_count: 10,
  completed_games_count: 10,
} as unknown as Tournament;

const standing = (place: number): TournamentStandingItem => ({
  participant_id: `p${place}`,
  participant_number: place,
  player_id: `player-${place}`,
  display_name: place === 10 ? 'Очень Длинный Ник Игрока' : `Игрок ${place}`,
  place,
  calculated_place: place,
  total_points: 12 - place * 0.4,
  games_played: 10,
  wins: 6,
  additional_total: 1.2,
  positive_points: 0,
  positive_judge_points: place % 2 ? 0.7 : 0,
  positive_protocol_points: place % 3 ? 0.3 : 0,
  negative_judge_points: place % 4 ? 0.2 : 0,
  negative_protocol_points: 0,
  best_move_points: place % 2 ? 0.5 : 0,
  ci_points: place === 5 ? 0.4 : 0,
  penalty_points: place % 4 ? 0.2 : 0,
  game_penalty_points: place % 4 ? 0.2 : 0,
  disciplinary_penalty_points: place === 7 ? 0.3 : 0,
  don_wins: 0,
  sheriff_wins: 0,
  first_killed_count: 0,
  games: [],
} as unknown as TournamentStandingItem);

const standings = Array.from({ length: 10 }, (_, index) => standing(index + 1));

const game = {
  id: 'g1', tournament_id: 't1', game_number: 10, status: 'completed', winner_team: 'red', judge_name: 'Судья',
} as unknown as TournamentGame;
const gameRows: GamePlayerExportRow[] = standings.map((item, index) => ({
  participant_id: item.participant_id,
  seat_number: index + 1,
  display_name: item.display_name,
  role: index === 0 ? 'sheriff' : index > 7 ? 'mafia' : 'citizen',
  game_total: index % 2 ? 1.2 : -0.3,
  win_point: index < 6 ? 1 : 0,
  judge_bonus: index % 2 ? 0.4 : 0,
  protocol_bonus: index === 4 ? -0.3 : 0.2,
  best_move_points: index === 0 ? 0.7 : 0,
  game_penalty_points: index === 4 ? 0.3 : 0,
  disciplinary_penalty_points: index === 7 ? 0.3 : 0,
  ci_points: index === 2 ? 0.4 : 0,
}));

const awardSlots: TournamentAwardSlot[] = [
  { key: 'place_1', kind: 'placement', title: '1 место', place: 1, category: null, source: 'automatic', participant_id: 'p1', player_id: 'player-1', player_nickname: 'Игрок 1', comment: null, calculated_player_id: 'player-1', calculated_player_nickname: 'Игрок 1' },
  { key: 'place_2', kind: 'placement', title: '2 место', place: 2, category: null, source: 'automatic', participant_id: 'p2', player_id: 'player-2', player_nickname: 'Игрок 2', comment: null, calculated_player_id: 'player-2', calculated_player_nickname: 'Игрок 2' },
  { key: 'place_3', kind: 'placement', title: '3 место', place: 3, category: null, source: 'automatic', participant_id: 'p3', player_id: 'player-3', player_nickname: 'Игрок 3', comment: null, calculated_player_id: 'player-3', calculated_player_nickname: 'Игрок 3' },
  ...[
    ['nomination_mvp', 'MVP', 'mvp', 'p1'],
    ['nomination_best_citizen', 'Лучший мирный', 'best_citizen', 'p2'],
    ['nomination_best_mafia', 'Лучшая мафия', 'best_mafia', 'p3'],
    ['nomination_best_sheriff', 'Лучший Шериф', 'best_sheriff', 'p4'],
    ['nomination_best_don', 'Лучший Дон', 'best_don', 'p5'],
  ].map(([key, title, category, participant_id]) => ({ key, kind: 'nomination', title, category, source: 'automatic', participant_id, player_id: `player-${participant_id.slice(1)}` } as TournamentAwardSlot)),
];

const nomination = (category: string, participantId: string, criterion: 'points' | 'additional_points' | 'role_wins' | 'head_to_head') => ({
  category,
  title: category,
  has_tie: false,
  winner_participant_id: participantId,
  decisive_criterion: criterion,
  candidates: [{
    participant_id: participantId,
    display_name: standings.find((item) => item.participant_id === participantId)?.display_name || participantId,
    points: 2.4,
    additional_points: 0.6,
    role_wins: 2,
    nomination_points: 3,
    games_in_role: 2,
    judge_bonus: 2.4,
    protocol_bonus: -0.1,
    best_move_points: 0.7,
  }],
  comparison: {
    winner_participant_id: participantId,
    tied_participant_ids: [],
    has_exact_tie: false,
    decisive_criterion: criterion,
    decisive_value: criterion === 'points' ? 2.4 : criterion === 'additional_points' ? 0.6 : 2,
    head_to_head_scores: criterion === 'head_to_head' ? { [participantId]: 2, other: 1 } : null,
    stages: criterion === 'head_to_head'
      ? [{ criterion: 'head_to_head', candidate_ids: [participantId, 'other'], values: { [participantId]: 2, other: 1 }, advancing_ids: [participantId], decisive: true }]
      : [{ criterion, candidate_ids: [participantId], values: { [participantId]: 1 }, advancing_ids: [participantId], decisive: true }],
  },
});

const nominations = [
  nomination('mvp', 'p1', 'points'),
  nomination('best_citizen', 'p2', 'additional_points'),
  nomination('best_mafia', 'p3', 'points'),
  nomination('best_sheriff', 'p4', 'role_wins'),
  nomination('best_don', 'p5', 'head_to_head'),
] as any[];

describe('result export publication assets', () => {
  it('keeps a completed ten-player game on one stable Noir sheet', () => {
    const pages = generateGameResultsPages(tournament, game, gameRows);
    expect(pages).toHaveLength(1);
    expect(pages[0].width).toBe(1080);
    expect(pages[0].height).toBeGreaterThan(1350);
    expect(pages[0].block_ids).toEqual(gameRows.map((row) => `seat-${row.seat_number}`));
    expect(pages[0].svg).toContain('ИТОГИ ИГРЫ');
    expect(pages[0].svg).toContain('Компенсация первого убитого');
    expect(pages[0].svg).not.toContain('ПРОДОЛЖЕНИЕ');
    expect(pages[0].svg).not.toContain('NewMafia CRM');
    gameRows.forEach((row) => expect(pages[0].svg).toContain(row.display_name));
  });

  it('keeps the complete intermediate standings on one Noir image', () => {
    const pages = generateStandingsPages(tournament, standings, 6, 10);
    expect(pages).toHaveLength(1);
    expect(pages[0].width).toBe(1080);
    expect(pages[0].block_ids).toEqual(standings.map((item) => `standing-${item.place}`));
    expect(pages[0].svg).toContain('ПРОМЕЖУТОЧНЫЕ ИТОГИ');
    expect(pages[0].svg).toContain('После 6 из 10 игр');
    expect(pages[0].svg).not.toContain('ПРОДОЛЖЕНИЕ');
    expect(pages[0].svg).not.toContain('#0F172A');
    standings.forEach((item) => expect(pages[0].svg).toContain(item.display_name));
  });

  it('publishes exactly winners, complete ranking and nominations in that order', () => {
    const presentation = buildOfficialTournamentResultsPresentation(tournament, standings, awardSlots, new Date('2026-08-09T08:00:00Z'), {}, nominations as any);
    const pages = generateOfficialTournamentResultsPages(presentation);
    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.section)).toEqual(['winners', 'ranking', 'awards']);
    expect(pages.map((page) => page.label)).toEqual(['Победители', 'Рейтинг', 'Номинации']);
    expect(pages.map((page) => page.file_suffix)).toEqual(['winners', 'final-rating', 'awards']);
    expect(pages.every((page) => page.width === 1080)).toBe(true);
    expect(pages.map((page) => page.svg).join('\n')).not.toContain('ПРОДОЛЖЕНИЕ');

    expect(pages[0].svg).toContain('ПОБЕДИТЕЛИ ТУРНИРА');
    expect(pages[0].svg).toContain('Игрок 1');
    expect(pages[0].svg).toContain('Игрок 2');
    expect(pages[0].svg).toContain('Игрок 3');
    expect(pages[0].svg).not.toContain('ФИНАЛЬНЫЙ РЕЙТИНГ');
    expect(pages[0].svg).not.toContain('НОМИНАЦИИ ТУРНИРА');

    standings.forEach((item) => expect(pages[1].svg).toContain(item.display_name));
    expect(pages[1].block_ids.filter((id) => id.startsWith('ranking-'))).toHaveLength(10);
    expect(pages[1].svg).toContain('ФИНАЛЬНЫЙ РЕЙТИНГ');
    expect(pages[1].svg).not.toContain('MVP ТУРНИРА');

    expect(pages[2].svg).toContain('НОМИНАЦИИ ТУРНИРА');
    expect(pages[2].svg).toContain('MVP ТУРНИРА');
    expect(pages[2].svg).toContain('ЛУЧШИЙ МИРНЫЙ');
    expect(pages[2].svg).toContain('ЛУЧШАЯ МАФИЯ');
    expect(pages[2].svg).toContain('ЛУЧШИЙ ШЕРИФ');
    expect(pages[2].svg).toContain('ЛУЧШИЙ ДОН');
    expect(pages[2].svg).not.toContain('Игровые начисления');
    expect(pages[2].svg).not.toContain('Доп. баллы');
    expect(pages[2].svg).toContain('ПОБЕДИЛ ПО ОЦЕНКЕ СУДЕЙ');
    expect(pages[2].svg).toContain('ЛУЧШЕ ПО БОНУСАМ И ШТРАФАМ');
    expect(pages[2].svg).toContain('Итог бонусов и штрафов');
    expect(pages[2].svg).toContain('Штраф по протоколу');
    expect(pages[2].svg).toContain('ПРИ ПОЛНОМ РАВЕНСТВЕ ·');
    expect(pages[2].svg).toContain('ЛИЧНЫЕ ВСТРЕЧИ 2:1');
    expect(pages[2].svg).not.toMatch(/ГЛАВНОГО СУДЬИ|ЖЕРЕБ|СЛУЧАЙН/i);
  });
});
