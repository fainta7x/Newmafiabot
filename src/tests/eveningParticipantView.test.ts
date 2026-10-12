import { describe, expect, it } from 'vitest';
import { isEveningGameRosterEligible } from '../lib/eveningDomain.ts';
import { isInOrganizerWorkingRoster, needsEveningCloseoutAttendance } from '../lib/eveningParticipantView.ts';

describe('evening participant view projections', () => {
  it.each([
    ['going', true, true],
    ['late', true, true],
    ['thinking', false, false],
    ['declined', false, false],
    ['unanswered', true, false],
  ] as const)('keeps pending %s in the expected organizer and closeout states', (response, roster, closeout) => {
    const participant = { response_status: response, attendance_status: 'pending' };
    expect(isInOrganizerWorkingRoster(participant)).toBe(roster);
    expect(needsEveningCloseoutAttendance(participant)).toBe(closeout);
  });

  it.each(['going', 'late', 'thinking', 'declined', 'unanswered'] as const)(
    'recognizes a factually arrived %s respondent without inventing an attendance decision',
    (response) => {
      const participant = { response_status: response, attendance_status: 'attended' };
      expect(isInOrganizerWorkingRoster(participant)).toBe(true);
      expect(needsEveningCloseoutAttendance(participant)).toBe(false);
    },
  );

  it.each(['going', 'late', 'thinking', 'declined', 'unanswered'] as const)(
    'keeps a no-show %s respondent out of the working roster and closeout queue',
    (response) => {
      const participant = { response_status: response, attendance_status: 'no_show' };
      expect(isInOrganizerWorkingRoster(participant)).toBe(false);
      expect(needsEveningCloseoutAttendance(participant)).toBe(false);
    },
  );

  it('retains a manually invited player with no answer in the organizer roster but not the game seating pool', () => {
    const participant = { response_status: 'unanswered', registration_status: 'invited', attendance_status: 'pending' };
    expect(isInOrganizerWorkingRoster(participant)).toBe(true);
    expect(needsEveningCloseoutAttendance(participant)).toBe(false);
    expect(isEveningGameRosterEligible('unanswered', 'pending')).toBe(false);
  });

  it('does not fabricate an RSVP from old registered compatibility state when unanswered was explicit', () => {
    const participant = { response_status: 'unanswered', registration_status: 'registered', attendance_status: 'pending' };
    expect(isInOrganizerWorkingRoster(participant)).toBe(true);
    expect(needsEveningCloseoutAttendance(participant)).toBe(false);
  });

  it('keeps historical responses readable when no canonical response was stored', () => {
    expect(needsEveningCloseoutAttendance({
      registration_status: 'confirmed', attendance_status: 'pending',
    })).toBe(true);
    expect(needsEveningCloseoutAttendance({
      registration_status: 'waitlist', arrival_status: 'late', attendance_status: 'pending',
    })).toBe(true);
    expect(isInOrganizerWorkingRoster({
      registration_status: 'cancelled', attendance_status: 'pending',
    })).toBe(false);
  });

  it('does not equate physical arrival with a prior positive RSVP', () => {
    const walkIn = { response_status: 'unanswered', attendance_status: 'attended', arrival_status: 'unknown' };
    expect(isInOrganizerWorkingRoster(walkIn)).toBe(true);
    expect(needsEveningCloseoutAttendance(walkIn)).toBe(false);
    expect(isEveningGameRosterEligible('unanswered', 'attended_unknown')).toBe(true);
  });
});
