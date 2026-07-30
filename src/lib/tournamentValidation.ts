export interface TournamentValidationInput {
  title: string;
  date: string;
  participants: Array<{ player_id: string; display_name: string }>;
}

export interface TournamentValidationErrors {
  title?: string;
  date?: string;
  participants?: string;
  displayNames?: Record<string, string>;
}

export function validateTournamentForm(data: TournamentValidationInput): TournamentValidationErrors {
  const errors: TournamentValidationErrors = {};

  if (!data.title || !data.title.trim()) {
    errors.title = 'Укажите название турнира';
  }

  if (!data.date || !data.date.trim()) {
    errors.date = 'Укажите дату и время начала';
  } else {
    const d = new Date(data.date);
    if (isNaN(d.getTime())) {
      errors.date = 'Укажите корректную дату и время';
    }
  }

  if (data.participants.length !== 10) {
    errors.participants = `Выберите ровно 10 участников (выбрано: ${data.participants.length})`;
  }

  const nameErrors: Record<string, string> = {};
  let hasEmptyDisplayName = false;

  for (const p of data.participants) {
    if (!p.display_name || !p.display_name.trim()) {
      nameErrors[p.player_id] = 'Имя не может быть пустым';
      hasEmptyDisplayName = true;
    }
  }

  if (hasEmptyDisplayName) {
    errors.displayNames = nameErrors;
    if (!errors.participants) {
      errors.participants = 'Заполните отображаемое имя для всех участников';
    }
  }

  return errors;
}

export function hasTournamentErrors(errors: TournamentValidationErrors): boolean {
  return Boolean(
    errors.title ||
      errors.date ||
      errors.participants ||
      (errors.displayNames && Object.keys(errors.displayNames).length > 0)
  );
}
