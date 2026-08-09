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
  { key: 'place_1', kind: 'placement', title: '1 место', place: 1, source: 'automatic', participant_id: 'p1', player_id: 'player-1' },
  { key: 'place_2', kind: 'placement', title: '2 место', place: 2, source: 'automatic', participant_id: 'p2', player_id: 'player-2' },
  { key: 'place_3', kind: 'placement', title: '3 место', place: 3, source: 'automatic', participant_id: 'p3', player_id: 'player-3' },
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

describe('result export publication pages', () => {
  it('paginates game rows without splitting seats', () => {
    const pages = generateGameResultsPages(tournament, game, gameRows);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((page) => page.width === 1080 && page.height === 1350)).toBe(true);
    expect(pages.flatMap((page) => page.block_ids).sort()).toEqual(gameRows.map((row) => `seat-${row.seat_number}`).sort());
    expect(pages.map((page) => page.svg).join('\n')).toContain('ИТОГИ ИГРЫ');
    expect(pages.map((page) => page.svg).join('\n')).not.toContain('>Баллы<');
  });

  it('paginates intermediate standings as complete ranking rows', () => {
    const pages = generateStandingsPages(tournament, standings, 6, 10);
    expect(pages.every((page) => page.width === 1080 && page.height === 1350)).toBe(true);
    expect(pages.flatMap((page) => page.block_ids).sort()).toEqual(standings.map((item) => `standing-${item.place}`).sort());
    const svg = pages.map((page) => page.svg).join('\n');
    expect(svg).toContain('ПРОМЕЖУТОЧНЫЕ ИТОГИ');
    expect(svg).toContain('После 6 из 10 игр');
    expect(svg).not.toContain('#0F172A');
  });

  it('keeps official hero, ranking rows and awards whole while using plain nomination wording', () => {
    const presentation = buildOfficialTournamentResultsPresentation(tournament, standings, awardSlots, new Date('2026-08-09T08:00:00Z'), {}, nominations as any);
    const pages = generateOfficialTournamentResultsPages(presentation);
    expect(pages.every((page) => page.width === 1080 && page.height === 1350)).toBe(true);
    expect(pages.some((page) => page.block_ids.includes('hero'))).toBe(true);
    expect(pages.flatMap((page) => page.block_ids).filter((id) => id.startsWith('ranking-')).length).toBe(10);
    const longSvg = generateOfficialTournamentResultsSvg(presentation).svg;
    expect(longSvg).not.toContain('Игровые начисления');
    expect(longSvg).not.toContain('Доп. баллы');
    expect(longSvg).toContain('ПОБЕДИЛ ПО ОЦЕНКЕ СУДЕЙ');
    expect(longSvg).toContain('ЛУЧШЕ ПО БОНУСАМ И ШТРАФАМ');
    expect(longSvg).toContain('Итог бонусов и штрафов');
    expect(longSvg).toContain('Штраф по протоколу');
    expect(longSvg).toContain('ПРИ ПОЛНОМ РАВЕНСТВЕ ·');
    expect(longSvg).toContain('ЛИЧНЫЕ ВСТРЕЧИ 2:1');
    expect(longSvg).not.toMatch(/ГЛАВНОГО СУДЬИ|ЖЕРЕБ|СЛУЧАЙН/i);
  });
});
