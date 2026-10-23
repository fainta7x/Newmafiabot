import { describe, expect, it } from 'vitest';
import { completeLiveRoleAssignments, liveRoleCorrectionEvents, applyLiveRoleCorrectionEvents, projectLiveRoleSnapshot } from '../lib/liveRoleCorrections.ts';
import { createInitialGameDiscipline } from '../lib/gameDiscipline.ts';
import { sanitizeLiveGameEvents } from '../shared/liveGameEvents.ts';
import { describeLiveGameEvents } from '../lib/liveGameEventText.ts';

const players = () => [
  { slot_num: 1, role: 'citizen' as const, team: 'red' as const, fouls: 3, alive: false },
  { slot_num: 2, role: 'mafia' as const, team: 'black' as const, fouls: 0, alive: true },
];
const context = { nextSeq: 8, at: '2026-10-23T12:00:00Z', round: 2, phase: 'night' };
const assignments = { 1: 'mafia' as const, 2: 'sheriff' as const };

describe('observed CRM role correction commands', () => {
  it('requires a complete canonical deal and accepts legacy spellings without guessing', () => {
    expect(completeLiveRoleAssignments([{ seat_number: 1, role: 'Мафия' }, { seat_number: 2, role: 'Шериф' }], 2)).toEqual(assignments);
    expect(completeLiveRoleAssignments([{ seat_number: 1, role: 'mafia' }], 2)).toBeNull();
    expect(completeLiveRoleAssignments([{ seat_number: 1, role: 'mafia' }, { seat_number: 1, role: 'sheriff' }], 2)).toBeNull();
    expect(completeLiveRoleAssignments([{ seat_number: 1, role: 'unknown' }, { seat_number: 2, role: 'sheriff' }], 2)).toBeNull();
  });

  it('replays exactly the journaled changes without moving seats or changing discipline facts', () => {
    const before = players();
    const events = liveRoleCorrectionEvents(before, assignments, context);
    expect(events).toEqual([
      { seq: 8, at: context.at, round: 2, phase: 'night', kind: 'role_corrected', seat: 1, value: 'mafia' },
      { seq: 9, at: context.at, round: 2, phase: 'night', kind: 'role_corrected', seat: 2, value: 'sheriff' },
    ]);
    const after = applyLiveRoleCorrectionEvents(before, events);
    expect(after).toEqual([{ ...before[0], role: 'mafia', team: 'black' }, { ...before[1], role: 'sheriff', team: 'red' }]);
    expect(before[0].role).toBe('citizen');
    expect(liveRoleCorrectionEvents(after, assignments, context)).toEqual([]);
    const cleaned = sanitizeLiveGameEvents(events);
    expect(applyLiveRoleCorrectionEvents(before, cleaned)).toEqual(after);
    expect(describeLiveGameEvents(cleaned, seat => `№${seat}`)[0].text).toBe('CRM: роль №1 исправлена — Мафия');
  });

  it('updates current/Undo role and team projections, keeping penalties, timers and historical logs', () => {
    const discipline = createInitialGameDiscipline([{ id: '1', team: 'red' }, { id: '2', team: 'black' }]);
    discipline.players['1'].regularFouls = 3;
    const before = { activePlayers: players(), discipline, donCheckSlot: 2, donCheckResult: false,
      sheriffCheckSlot: 1, sheriffCheckResult: 'Красный', timeLeft: 17, nightLogs: [{ log: 'прошлая ночь' }] };
    const after = projectLiveRoleSnapshot(before, assignments);
    expect(after.discipline.players['1']).toEqual({ ...discipline.players['1'], team: 'black' });
    expect(after.discipline.players['2'].team).toBe('red');
    expect(after.donCheckResult).toBe(true);
    expect(after.sheriffCheckResult).toBe('ЧЁРНЫЙ!');
    expect(after.timeLeft).toBe(17);
    expect(after.nightLogs).toEqual(before.nightLogs);
    expect(projectLiveRoleSnapshot(after, assignments)).toEqual(after);
    expect(before.donCheckResult).toBe(false);
  });
});
