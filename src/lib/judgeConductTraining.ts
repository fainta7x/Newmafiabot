import type { PersistedLiveSession } from '../components/LiveGameEngine/liveSessionStorage.ts';

export type TrainingPrompt = {
  title: string;
  detail: string;
  focus: string;
  warning?: boolean;
};

/** A deterministic, ordinary game script. No fake votes or game state: the judge performs each action in Live Engine. */
export const planTrainingDay = (session: PersistedLiveSession) => {
  const alive = session.activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
  const starter = session.dayStarterSlot || 1;
  const speechOrder = alive.slice().sort((a, b) => ((a - starter + 10) % 10) - ((b - starter + 10) % 10));
  if (session.roundNumber === 1) {
    return [{ speaker: 2, nominee: 1 }, { speaker: 7, nominee: 3 }];
  }
  const speakers = [speechOrder[0], speechOrder[Math.min(2, speechOrder.length - 1)]];
  const nominees = alive.filter((n) => !speakers.includes(n));
  if (nominees.length < 2) return [];
  const offset = session.roundNumber % nominees.length;
  return [
    { speaker: speakers[0], nominee: nominees[offset] },
    { speaker: speakers[1], nominee: nominees[(offset + 1) % nominees.length] },
  ];
};

export const trainingNightTarget = (session: PersistedLiveSession) => {
  const reds = session.activePlayers.filter((p) => p.alive && p.team === 'Красные');
  if (session.roundNumber === 1 && reds.some((p) => p.slot_num === 7)) return 7;
  return reds[session.roundNumber % reds.length]?.slot_num ?? session.activePlayers.find((p) => p.alive)?.slot_num ?? 1;
};

const trainingVotes = (session: PersistedLiveSession, nominees: number[], isRevote: boolean) => {
  const alive = session.activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
  const needed = isRevote || session.roundNumber > 1 ? Math.floor(alive.length / 2) + 1 : 5;
  // The first practice ballot is precisely 2,3,4,5,6 against #1 (and five against #3).
  const ordered = session.roundNumber === 1 && !isRevote && nominees[0] === 1 && nominees[1] === 3
    ? [2, 3, 4, 5, 6, 1, 7, 8, 9, 10]
    : [...alive.slice(session.roundNumber), ...alive.slice(0, session.roundNumber)];
  return ordered.filter((n) => alive.includes(n)).slice(0, needed);
};

const p = (title: string, detail: string, focus = 'live-judge-hud', warning = false): TrainingPrompt =>
  ({ title, detail, focus, warning });

export const getTrainingPrompt = (s: PersistedLiveSession | null): TrainingPrompt => {
  if (!s || s.phase === 'setup') {
    return p('Подготовь учебный стол', 'Десять виртуальных игроков уже в составе. Подтверди состав, открой физическую раздачу, отметь роли и запусти игру.', 'club-game-setup-primary-actions');
  }

  if (s.phase === 'zero_night') {
    if (s.zeroNightMusicState === 'pending') return p('Нулевая ночь', 'Включи музыку ночи. Затем запусти договорку мафии (75 секунд).');
    if (!s.zeroNightSubPhase) return p('Договорка мафии', 'Нажми «Договорка» и запусти таймер. Это первое действие ведущего после включения музыки.');
    if (s.zeroNightSubPhase === 'agreement') return p('Вызови Шерифа', 'После договорки Шериф делает жест ведущему — проверки игрока сейчас НЕТ. Нажми «Вызов шерифа».');
    if (s.zeroNightSubPhase === 'sheriff') return p('Свободная посадка', 'Нажми «Посадка · 40с». Затем выключи музыку и разбуди город.');
    if (s.zeroNightMusicState === 'playing') return p('Выключи музыку', 'Музыка должна быть выключена до начала нулевого круга.');
    return p('Разбуди город', 'Нулевая ночь завершена. Нажми переход к речам нулевого круга.');
  }

  if (s.phase === 'day_speeches') {
    const plan = planTrainingDay(s);
    const missing = plan.find(({ speaker, nominee }) => {
      const player = s.activePlayers.find((entry) => entry.slot_num === speaker);
      return player?.has_spoken_this_round && s.nominationsMap[nominee] !== speaker;
    });
    if (missing) return p('Пропущено выставление', 'Игрок #' + missing.speaker + ' должен был выставить #' + missing.nominee + '. Нажми «Назад» и зафиксируй выставление во время его речи.', 'live-judge-hud', true);
    const current = s.activeSpeakerSlot;
    if (current !== null) {
      const event = plan.find((entry) => entry.speaker === current);
      if (event && s.nominationsMap[event.nominee] !== current) {
        return p('Игрок #' + current + ' выставляет #' + event.nominee,
          'Во время речи #' + current + ' открой действия игрока #' + event.nominee + ' и нажми «Выставить». Затем заверши речь.', 'live-player-actions-selector');
      }
      return p('Речь игрока #' + current, 'После объявления выставления, если оно было, нажми «Завершить речь #' + current + '».');
    }
    const next = s.activePlayers.filter((v) => v.alive && !v.has_spoken_this_round)
      .sort((a, b) => ((a.slot_num - (s.dayStarterSlot || 1) + 10) % 10) - ((b.slot_num - (s.dayStarterSlot || 1) + 10) % 10))[0];
    if (next) {
      const planned = plan.find((event) => event.speaker === next.slot_num);
      return p('Начни речь #' + next.slot_num, planned
        ? 'Во время этой речи прозвучит выставление #' + planned.nominee + '. Сначала запусти речь в центральной панели.'
        : 'Обычная речь без выставления. Запусти её и заверши после окончания виртуальной речи.');
    }
    return p('К голосованию', 'Все речи завершены. Выставлены: ' + s.nominations.join(', ') + '. Перейди к голосованию.');
  }

  if (s.phase === 'day_voting') {
    const stage = s.votingStage;
    const current = s.votingRounds[s.activeVotingRoundIndex];
    if (!current) return p('Подготовка голосования', 'Следуй действиям в центральной панели.');
    const nominees = current.nominated_seats;
    if (stage === 'collecting' || stage === 'setup') {
      const first = nominees[0];
      const required = trainingVotes(s, nominees, Boolean(current.is_revote));
      const assigned = s.votesByPlayer || {};
      const missing = required.filter((seat) => Number(assigned[seat]) !== first);
      const mistaken = Object.entries(assigned).filter(([seat, target]) => Number(target) === first && !required.includes(Number(seat)));
      if (mistaken.length) return p('Проверь голоса', 'За #' + first + ' случайно отмечены лишние игроки. Сними ошибочные голоса на столе.', 'live-judge-hud', true);
      if (missing.length) {
        return p('Голосуют против #' + first, 'Нажми на столе голосующих: ' + required.map((n) => '#' + n).join(' · ') + '. Осталось отметить: ' + missing.map((n) => '#' + n).join(', ') +
          (s.currentVotingNomineeIndex !== 0 ? '. Вернись к первому кандидату.' : '.'), 'live-judge-hud');
      }
      if (s.currentVotingNomineeIndex === 0) return p('Голоса записаны', 'Отлично! Выбраны все голосующие против #' + first + '. Нажми «Следующий →».');
      const last = nominees[nominees.length - 1];
      return p('Остальные — против #' + last, 'Оставшиеся игроки голосуют за последнюю кандидатуру #' + last + '. Нажми «Подвести итог»; остаток распределится автоматически.');
    }
    if (stage === 'revote_speeches') return p('Речи перед переголосованием', 'Дай кандидатам по 30 секунд. Используй кнопку «Следующий игрок», затем «К переголосованию».');
    if (stage === 'round_result') return p('Итог голосования', 'Посмотри, что определил Live Engine. При равенстве 5:5 дай кандидатам речи по 30 секунд и проведи обычное переголосование.');
    if (stage === 'table_decision') return p('Решение стола', 'Проведи предусмотренное правилами решение «поднять / оставить» и зафиксируй итог.');
    if (s.votingFarewellQueue.length) return p('Прощальная речь', 'Заголосованный игрок произносит последнюю речь на 60 секунд. Затем заверши этот этап.');
    return p('Голосование завершено', 'Перейди к следующему этапу игры.');
  }

  if (s.phase === 'night') {
    if (s.postNightStage === 'farewell') return p('Последняя речь убитого', 'После отстрела убитый получает 60 секунд на последнюю речь. Следом ОБЯЗАТЕЛЬНО идёт протокол убитого (20 секунд).');
    if (s.postNightStage === 'death_protocol') return p('Протокол убитого', 'Зафиксируй протокол убитого в открывшемся окне. Только после сохранения перейди ко дню или завершению.');
    if (s.nightSubPhase === 'intro') return p('Наступила ночь', 'Включи музыку ночи и перейди к отстрелу мафии.');
    if (s.nightSubPhase === 'shooting') {
      const target = trainingNightTarget(s);
      return p('Мафия убила #' + target, 'Нажми на место игрока #' + target + ' и зафиксируй отстрел.' + (s.shotPlayerSlot && s.shotPlayerSlot !== target ? ' Сейчас отмечен другой игрок — исправь выбор.' : ' Затем перейди к проверке Дона.'), 'live-judge-hud', Boolean(s.shotPlayerSlot && s.shotPlayerSlot !== target));
    }
    if (s.nightSubPhase === 'don') {
      const target = s.activePlayers.find((v) => v.alive && v.role === 'Шериф')?.slot_num;
      return p('Проверка Дона', 'Дон проверяет игрока #' + (target || s.activePlayers.find((v) => v.alive)?.slot_num || 1) + '. Отметь его на столе, затем перейди к проверке Шерифа.');
    }
    if (s.nightSubPhase === 'sheriff') {
      const target = s.activePlayers.find((v) => v.alive && v.team === 'Чёрные')?.slot_num || s.activePlayers.find((v) => v.alive)?.slot_num || 1;
      return p('Проверка Шерифа', 'Шериф проверяет игрока #' + target + '. Отметь его на столе. Не забудь выключить музыку перед утром.');
    }
    if (s.nightSubPhase === 'best_move') return p('ЛХ первого убитого', 'Убитый первой ночью называет три места за 25 секунд. Отметь их в окне ЛХ и подтверди.');
    return p('Зафиксируй ночь', 'Проверь записанные отстрел и проверки. Нажми «Зафиксировать ночь», затем проведи последнюю речь и протокол убитого.');
  }
  return p('Продолжай игру', 'Выполняй показанные в Live Game действия ведущего.');
};
