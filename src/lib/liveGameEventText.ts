import type { LiveGameEvent } from '../shared/liveGameEvents';

const PHASES: Record<string, string> = {
  zero_night: 'Нулевая ночь',
  day_speeches: 'День · речи',
  day_voting: 'Голосование',
  night: 'Ночь',
  shootout: 'Переголосование',
};

const NIGHT_STEPS: Record<string, string> = {
  shooting: 'стрельба мафии',
  don: 'проверка Дона',
  sheriff: 'проверка Шерифа',
  morning: 'итоги ночи',
  best_move: 'лучший ход',
};

const EXIT_REASONS: Record<string, string> = {
  killed: 'убит',
  voted_day: 'заголосован',
  voted_zero_round: 'заголосован в нулевом круге',
  removed: 'удалён',
  night_kill: 'убит',
};

const OUTCOMES: Record<string, string> = {
  single_eliminated: 'один выбывает',
  tie_revote: 'ничья, переголосование',
  all_tied_eliminated: 'выбывают все спорные',
  no_elimination: 'никто не выбывает',
};

export type LiveGameEventLine = { seq: number; time: string; text: string; heading: boolean };

const timeOf = (at: string): string => {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Moscow' });
};

/** One readable line per event, for the game log screen. `nameOf` turns a seat into «#3 Игрок». */
export const describeLiveGameEvents = (events: LiveGameEvent[], nameOf: (seat: number) => string): LiveGameEventLine[] =>
  events.map((event) => {
    const seat = event.seat ? nameOf(event.seat) : '';
    const target = event.target ? nameOf(event.target) : '';
    const by = event.by ? nameOf(event.by) : '';
    const value = event.value === null || event.value === undefined ? '' : String(event.value);
    let text = '';
    let heading = false;
    switch (event.kind) {
      case 'game_start': text = 'Игра началась'; heading = true; break;
      case 'phase': text = `${PHASES[value] || value}${event.round >= 1 ? ` · круг ${event.round}` : ''}`; heading = true; break;
      case 'night_step': text = `Ночь: ${NIGHT_STEPS[value] || value}`; break;
      case 'voting_stage': text = `Голосование: ${value}`; break;
      case 'nomination': text = by ? `${by} выставил ${seat}` : `${seat} выставлен`; break;
      case 'nomination_removed': text = `Снято выставление ${seat}`; break;
      case 'speech_start': text = value === 'farewell' ? `Прощальная речь: ${seat}` : value === 'revote' ? `Речь перед переголосованием: ${seat}` : value === 'death_protocol' ? `Протокол убитого: ${seat}` : `Речь: ${seat}`; break;
      case 'vote': text = `${seat} голосует за ${target}`; break;
      case 'vote_removed': text = `Голос ${seat} снят`; break;
      case 'table_vote': text = `${seat}: за «поднять»`; break;
      case 'table_vote_removed': text = `${seat}: «поднять» снято`; break;
      case 'vote_round_result': { const [round, outcome] = value.split(':'); text = `Итог голосования №${round}: ${OUTCOMES[outcome] || outcome}`; break; }
      case 'shot_target': text = target ? `Выстрел мафии: ${target}` : 'Выстрел снят'; break;
      case 'don_check': text = `Дон проверил ${target}: ${value === 'sheriff' ? 'Шериф' : value === 'not_sheriff' ? 'не Шериф' : '—'}`; break;
      case 'sheriff_check': text = `Шериф проверил ${target}: ${value || '—'}`; break;
      case 'foul': text = `${seat}: фолов ${value}`; break;
      case 'tech_minor': text = `${seat}: малых техфолов ${value}`; break;
      case 'tech_major': text = `${seat}: больших техфолов ${value}`; break;
      case 'exit': text = `${seat} выбыл (${EXIT_REASONS[value] || value})`; break;
      case 'restored': text = `${seat} возвращён в игру`; break;
      case 'first_killed': text = `Первый убитый: ${seat}`; break;
      case 'zero_round_voted': text = `Заголосован в нулевом круге: ${seat}`; break;
      case 'best_move': text = `ЛХ ${seat}: ${value.split(',').map((n) => `#${n}`).join(', ')}`; break;
      case 'ppk': text = `ППК: ${seat}`; break;
      case 'death_protocol': {
        const parts = value.split('|').map((part) => part.split(':')).filter(([, seats]) => seats);
        const label: Record<string, string> = { red: 'красные', black: 'чёрные', sheriff: 'шериф' };
        text = `Протокол убитого ${seat}: ${parts.map(([key, seats]) => `${label[key] || key} ${seats.split('.').map((n) => `#${n}`).join(', ')}`).join('; ') || 'пусто'}`;
        break;
      }
      case 'game_end': text = `Конец игры: победа ${value === 'red' ? 'красных' : 'чёрных'}`; heading = true; break;
      default: text = event.kind;
    }
    return { seq: event.seq, time: timeOf(event.at), text, heading };
  });
