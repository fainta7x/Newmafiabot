import { describe, it, expect } from 'vitest';
import { formatForDateTimeLocal } from '../lib/dateUtils.ts';
import {
  validateTournamentForm,
  hasTournamentErrors,
  TournamentValidationInput,
} from '../lib/tournamentValidation.ts';

describe('Tournament Local Date Formatting & Form Validation Unit Tests', () => {
  describe('formatForDateTimeLocal', () => {
    it('formats Date object into YYYY-MM-DDTHH:mm using local timezone components', () => {
      const d = new Date(2026, 6, 30, 19, 5); // Month 6 = July
      const formatted = formatForDateTimeLocal(d);
      expect(formatted).toBe('2026-07-30T19:05');
    });

    it('handles string input correctly', () => {
      const formatted = formatForDateTimeLocal('2026-07-30T19:00:00');
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it('returns empty string for invalid date input', () => {
      const formatted = formatForDateTimeLocal('invalid-date-string');
      expect(formatted).toBe('');
    });
  });

  describe('validateTournamentForm', () => {
    const valid10Participants = Array.from({ length: 10 }, (_, i) => ({
      player_id: `player-${i + 1}`,
      display_name: `Игрок ${i + 1}`,
    }));

    it('returns no errors for valid form data', () => {
      const input: TournamentValidationInput = {
        title: 'Кубок 2026',
        date: '2026-07-30T19:00',
        participants: valid10Participants,
      };

      const errors = validateTournamentForm(input);
      expect(hasTournamentErrors(errors)).toBe(false);
      expect(errors.title).toBeUndefined();
      expect(errors.date).toBeUndefined();
      expect(errors.participants).toBeUndefined();
    });

    it('rejects empty or whitespace-only title', () => {
      const input: TournamentValidationInput = {
        title: '   ',
        date: '2026-07-30T19:00',
        participants: valid10Participants,
      };

      const errors = validateTournamentForm(input);
      expect(hasTournamentErrors(errors)).toBe(true);
      expect(errors.title).toBe('Укажите название турнира');
    });

    it('rejects empty date or invalid date string', () => {
      const emptyDateErrors = validateTournamentForm({
        title: 'Тест',
        date: '',
        participants: valid10Participants,
      });
      expect(emptyDateErrors.date).toBe('Укажите дату и время начала');

      const invalidDateErrors = validateTournamentForm({
        title: 'Тест',
        date: 'not-a-valid-date',
        participants: valid10Participants,
      });
      expect(invalidDateErrors.date).toBe('Укажите корректную дату и время');
    });

    it('rejects participant count other than 10', () => {
      const nineParticipants = valid10Participants.slice(0, 9);
      const errors = validateTournamentForm({
        title: 'Турнир 9 игроков',
        date: '2026-07-30T19:00',
        participants: nineParticipants,
      });

      expect(hasTournamentErrors(errors)).toBe(true);
      expect(errors.participants).toContain('9');
    });

    it('rejects empty display_name for any participant', () => {
      const participantsWithEmptyName = [...valid10Participants];
      participantsWithEmptyName[2] = { player_id: 'player-3', display_name: '   ' };

      const errors = validateTournamentForm({
        title: 'Турнир со сбойным именем',
        date: '2026-07-30T19:00',
        participants: participantsWithEmptyName,
      });

      expect(hasTournamentErrors(errors)).toBe(true);
      expect(errors.displayNames?.['player-3']).toBe('Имя не может быть пустым');
    });
  });
});
