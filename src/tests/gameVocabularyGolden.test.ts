import { describe, expect, it } from 'vitest';
import { gameTeamOfRole as teamFromRoleAlias, normalizeGameRole, normalizeWinnerTeam as winnerTeamFromLabel } from '../shared/gameRoles.ts';

// Copies of the implementations that lived in eloRatingService, playerEloHistoryService,
// tournamentGameTokenSettlementService, clubGameTokenSettlementService and ratingPeriodStandingsService.
const oldTeamFromRole = (role: unknown): 'red' | 'black' | null => {
  const value = String(role || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный', 'sheriff', 'шериф'].includes(value)) return 'red';
  if (['mafia', 'мафия', 'маф', 'black', 'черный', 'don', 'дон'].includes(value)) return 'black';
  return null;
};
const oldWinner = (value: unknown): 'red' | 'black' | null => {
  const normalized = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['red', 'красные', 'красная', 'город'].includes(normalized)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(normalized)) return 'black';
  return null;
};

const inputs: unknown[] = [
  'citizen', 'Citizen', ' мирный ', 'Мирный житель', 'red', 'Красный', 'sheriff', 'Шериф',
  'mafia', 'Мафия', 'маф', 'black', 'Чёрный', 'черный', 'don', 'Дон',
  'красные', 'Красная', 'город', 'чёрные', 'Чёрная', 'черные', 'draw', 'ничья', 'мирные', 'красн',
  '', '   ', null, undefined, 0, 7, {}, [],
];

describe('club game team aliases', () => {
  it('matches every previous private copy on role and winner labels', () => {
    for (const input of inputs) {
      expect(teamFromRoleAlias(input)).toBe(oldTeamFromRole(input));
      expect(winnerTeamFromLabel(input)).toBe(oldWinner(input));
    }
  });

  it('pins the documented alias lists', () => {
    expect(['citizen', 'мирный', 'мирный житель', 'red', 'красный', 'sheriff', 'шериф'].map(teamFromRoleAlias)).toEqual(Array(7).fill('red'));
    expect(['mafia', 'мафия', 'маф', 'black', 'чёрный', 'don', 'дон'].map(teamFromRoleAlias)).toEqual(Array(7).fill('black'));
    expect(['red', 'красные', 'красная', 'город'].map(winnerTeamFromLabel)).toEqual(Array(4).fill('red'));
    expect(['black', 'чёрные', 'черная', 'мафия'].map(winnerTeamFromLabel)).toEqual(Array(4).fill('black'));
    expect(teamFromRoleAlias('мирные')).toBeNull();
    expect(winnerTeamFromLabel('ничья')).toBeNull();
  });
});

describe('game role parser (domain model, 2026-10-22)', () => {
  it('reads every role spelling used by the engine, the CRM and stored protocols', () => {
    expect(['citizen', ' Мирный ', 'мирный житель', 'мирянин'].map(normalizeGameRole)).toEqual(Array(4).fill('citizen'));
    expect(['sheriff', 'Шериф'].map(normalizeGameRole)).toEqual(['sheriff', 'sheriff']);
    expect(['mafia', 'Мафия', 'маф'].map(normalizeGameRole)).toEqual(Array(3).fill('mafia'));
    expect(['don', 'Дон'].map(normalizeGameRole)).toEqual(['don', 'don']);
  });

  it('never turns a team colour or junk into a role', () => {
    for (const value of ['red', 'black', 'красный', 'чёрный', 'Красные', '', null, undefined, 'constructor', '__proto__', 'xyz']) {
      expect(normalizeGameRole(value)).toBeNull();
    }
  });
});

