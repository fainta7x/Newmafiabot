import { describe, expect, it } from 'vitest';
import {
  getEveningResponseLabel,
  getEveningRosterResponseLabel,
} from '../lib/eveningResponse.ts';

describe('CRM roster RSVP labels', () => {
  it.each([
    ['going', 'Иду', 'Иду'],
    ['late', 'Приду позже', 'Приду позже'],
    ['thinking', 'Пока думаю', 'Пока думаю'],
    ['declined', 'Не буду', 'Не иду'],
    ['unanswered', 'Нет ответа', 'Не ответил'],
  ])('retains the CRM label for %s', (status, roster, canonical) => {
    const participant = { response_status: status };
    expect(getEveningRosterResponseLabel(participant)).toBe(roster);
    expect(getEveningResponseLabel(participant)).toBe(canonical);
  });

  it('keeps a deliberate unanswered answer despite a stale registered flag', () => {
    const participant = { response_status: 'unanswered', registration_status: 'registered' };
    expect(getEveningRosterResponseLabel(participant)).toBe('Нет ответа');
  });

  it('preserves reading legacy RSVP status through the canonical adapter', () => {
    expect(getEveningRosterResponseLabel({
      response_status: null, registration_status: 'confirmed',
    })).toBe('Иду');
    expect(getEveningRosterResponseLabel({
      response_status: null, registration_status: 'waitlist', arrival_status: 'late',
    })).toBe('Приду позже');
    expect(getEveningRosterResponseLabel({
      response_status: null, registration_status: 'cancelled',
    })).toBe('Не буду');
  });

  it('keeps the missing-response fallback in the roster', () => {
    expect(getEveningRosterResponseLabel({})).toBe('Нет ответа');
  });
});
