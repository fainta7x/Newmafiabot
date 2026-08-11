import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildOfficialTournamentResultsPresentation,
  formatPoints,
  generateOfficialTournamentResultsSvg,
  getSafeFilenameForOfficial,
} from '../lib/tournamentResultsExport.ts';
import type { Tournament, TournamentAwardSlot, TournamentStandingItem } from '../lib/api.ts';

const tournament: Tournament = {
  id: 't-official',
  title: 'Кубок <2LA> & "Финал" с очень длинным названием турнира для проверки переноса',
  date: '2026-08-08T18:00:00.000Z',
  venue: 'Тула & Центр',
  chief_judge_name: 'Главный <Судья>',
  status: 'completed',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-08T20:00:00.000Z',
};

const makeStanding = (index: number): TournamentStandingItem => ({
  place: index,
  calculated_place: index,
  official_place: index,
  tie_group_id: null,
  participant_id: `p-${index}`,
  participant_number: index,
  display_name: index === 30
    ? 'Игрок <30> & самый длинный никнейм турнира который точно должен попасть в итог'
    : `Игрок ${index}`,
  total_points: index === 1 ? 0.5 : index === 2 ? -0.3 : index / 10,
  additional_total: index / 100,
  positive_points: index / 10,
  positive_judge_points: 0,
  negative_judge_points: 0,
  positive_protocol_points: 0,
  negative_protocol_points: 0,
  game_penalty_points: 0,
  disciplinary_penalty_points: 0,
  penalty_points: 0,
  best_move_points: index % 3 === 0 ? 0.5 : 0,
  ci_points: index % 4 === 0 ? 0.3 : 0,
  wins: index % 5,
  don_wins: index % 2,
  sheriff_wins: index % 3,
  first_killed_count: index % 4,
  games_played: 10,
  games: [],
});
const standings = Array.from({ length: 30 }, (_, idx) => makeStanding(idx + 1));

const slots: TournamentAwardSlot[] = [
  { key: 'place_1', kind: 'placement', title: '1 место', place: 1, category: null, player_id: 'player-2', player_nickname: 'Игрок 2', participant_id: 'p-2', source: 'manual', comment: 'Ручная перестановка', calculated_player_id: 'player-1', calculated_player_nickname: 'Игрок 1' },
  { key: 'place_2', kind: 'placement', title: '2 место', place: 2, category: null, player_id: 'player-1', player_nickname: 'Игрок 1', participant_id: 'p-1', source: 'manual', comment: null, calculated_player_id: 'player-2', calculated_player_nickname: 'Игрок 2' },
  { key: 'place_3', kind: 'placement', title: '3 место', place: 3, category: null, player_id: 'player-3', player_nickname: 'Игрок 3', participant_id: 'p-3', source: 'automatic', comment: null, calculated_player_id: 'player-3', calculated_player_nickname: 'Игрок 3' },
  { key: 'nomination_mvp', kind: 'nomination', title: 'MVP', place: null, category: 'mvp', player_id: 'player-4', player_nickname: 'Игрок 4', participant_id: 'p-4', source: 'manual', comment: 'Решение ГС', calculated_player_id: 'player-5', calculated_player_nickname: 'Старый автоматический MVP' },
  { key: 'nomination_best_citizen', kind: 'nomination', title: 'Лучший мирный', place: null, category: 'best_citizen', player_id: null, player_nickname: null, participant_id: null, source: 'suppressed', comment: 'Не присуждать', calculated_player_id: 'player-6', calculated_player_nickname: 'Скрытый автоматический победитель' },
];

describe('Official tournament PNG export', () => {
  it('uses official award slots for podium and nominations, including manual overrides and suppression', () => {
    const presentation = buildOfficialTournamentResultsPresentation(tournament, standings, slots, new Date('2026-08-08T20:30:00.000Z'));
    expect(presentation.podium[0].participant_id).toBe('p-2');
    expect(presentation.podium[0].display_name).toBe('Игрок 2');
    expect(presentation.standings[0].participant_id).toBe('p-2');
    expect(presentation.standings[0].display_place).toBe(1);
    expect(presentation.standings[1].participant_id).toBe('p-1');
    expect(presentation.standings[1].display_place).toBe(2);
    expect(presentation.nominations.find((item) => item.key === 'nomination_mvp')?.participant_id).toBe('p-4');
    const suppressed = presentation.nominations.find((item) => item.key === 'nomination_best_citizen');
    expect(suppressed?.display_name).toBe('Не присуждена');
    expect(suppressed?.participant_id).toBeNull();
  });

  it('renders branded official SVG with all participants and dynamic height', () => {
    const presentation = buildOfficialTournamentResultsPresentation(tournament, standings, slots, new Date('2026-08-08T20:30:00.000Z'));
    const { svg, width, height } = generateOfficialTournamentResultsSvg(presentation);
    expect(width).toBe(1080);
    expect(height).toBeGreaterThan(30 * 108);
    expect(svg).toContain('2LA NOIRE');
    expect(svg).toContain('ИТОГИ ТУРНИРА');
    expect(svg).toContain('ЧЕМПИОН ТУРНИРА');
    expect(svg).toContain('ФИНАЛЬНЫЙ РЕЙТИНГ');
    expect(svg).toContain('НАГРАДЫ ТУРНИРА');
    expect(svg).not.toContain('ОФИЦИАЛЬНЫЕ РЕЗУЛЬТАТЫ');
    expect(svg).not.toContain('КАК ЧИТАТЬ РЕЗУЛЬТАТ');
    expect(svg).not.toContain('ОФИЦИАЛЬНЫЙ ТУРНИРНЫЙ ПРОТОКОЛ');
    expect(svg).not.toContain('Сформировано:');
    expect(svg).toContain('Игрок 2');
    expect(svg).toContain('Игрок 1');
    expect(svg).toContain('Игрок 3');
    expect(svg).toContain('Игрок 4');
    expect(svg).toContain('Не присуждена');
    expect(svg).not.toContain('Старый автоматический MVP');
    expect(svg).not.toContain('Скрытый автоматический победитель');
    expect(svg).toContain('Игрок &lt;30&gt;');
    expect(svg).toContain('Кубок &lt;2LA&gt; &amp;');
    expect(svg).toContain('+0,5');
    expect(svg).toContain('−0,3');
    expect(svg).toContain('0');
    expect(svg).not.toContain('Промежуточные результаты');
    expect(svg).not.toContain('Не являются финальным протоколом');
    expect(svg).not.toContain('NewMafia CRM');
  });

  it('keeps point formatting and creates a safe dated filename', () => {
    expect(formatPoints(0.5)).toBe('+0,5');
    expect(formatPoints(-0.3)).toBe('−0,3');
    expect(formatPoints(0)).toBe('0');
    expect(getSafeFilenameForOfficial('Кубок "Тулы"', tournament.date)).toBe('кубок_тулы-official-results-2026-08-08.png');
  });

  it('has no URL-share fallback and contains freshness guards in the shared preview', () => {
    const modalSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/crm/tournaments/ResultsImageExportModal.tsx'), 'utf8');
    const officialSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/crm/tournaments/TournamentOfficialResults.tsx'), 'utf8');
    expect(modalSource).toContain("exportType: 'game' | 'standings' | 'official'");
    expect(modalSource).toContain('requestSeqRef');
    expect(modalSource).toContain('clearPreview();');
    expect(modalSource).toContain('return navigatorLike.canShare({ files });');
    expect(modalSource).not.toContain('window.location.href');
    expect(modalSource).not.toContain('renderSvgToPngDataUrl');
    expect(officialSource).toContain('Сформировать итоговый PNG');
    expect(officialSource).not.toContain('publishTournamentResults');
    expect(officialSource).not.toContain('public_token');
    expect(officialSource).not.toContain('Скопировать ссылку');
  });
});