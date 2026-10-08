import type { PersistedLiveSession } from '../components/LiveGameEngine/liveSessionStorage.ts';
import { determineLiveWinner } from './liveGameFlow.ts';
import { TRAINING_BEST_MOVE_SEATS, getTrainingDeathProtocolPlan, getTrainingDeathMarkSteps } from './judgeTrainingProtocols.ts';
import { determineVotingResult } from '../shared/tournamentVoting.ts';

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

export const trainingVotes = (session: PersistedLiveSession, nominees: number[], _isRevote: boolean) => {
  const alive = session.activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
  // The zero-circle exercise deliberately ties 5:5 BOTH times. A 6:4
  // revote would elect a loser immediately, skipping the real table decision.
  const zeroRoundTie = session.roundNumber === 1 && alive.length === 10 && nominees.length === 2;
  const needed = zeroRoundTie ? 5 : Math.floor(alive.length / 2) + 1;
  // The first practice ballot is precisely 2,3,4,5,6 against #1 (and five against #3).
  const ordered = session.roundNumber === 1 && nominees[0] === 1 && nominees[1] === 3
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
    if (s.postNightStage === 'death_protocol') {
      const steps = getTrainingDeathMarkSteps(getTrainingDeathProtocolPlan(s.roundNumber, s.shotPlayerSlot ?? 0));
      return p('Протокол убитого #' + (s.shotPlayerSlot ?? '?'),
        'Отметь ' + steps.map((step) => step.label.toLowerCase() + ' #' + step.seat).join(' → ') +
        '. Слова убитого — его предположения, они могут быть неверными. После отметок сохрани протокол.');
    }
    if (s.nightSubPhase === 'intro') return p('Наступила ночь', 'Включи музыку ночи и перейди к отстрелу мафии.');
    if (s.nightSubPhase === 'shooting') {
      const target = trainingNightTarget(s);
      return p('Мафия убила #' + target, 'Нажми на место игрока #' + target + ' и зафиксируй отстрел.' + (s.shotPlayerSlot && s.shotPlayerSlot !== target ? ' Сейчас отмечен другой игрок — исправь выбор.' : ' Затем перейди к проверке Дона.'), 'live-judge-hud', Boolean(s.shotPlayerSlot && s.shotPlayerSlot !== target));
    }
    if (s.nightSubPhase === 'don') {
      const target = trainingCheckTarget(s, 'don');
      return p('Проверка Дона', 'Дон проверяет игрока #' + target + '. Отметь его на столе, затем перейди к проверке Шерифа.');
    }
    if (s.nightSubPhase === 'sheriff') {
      const target = trainingCheckTarget(s, 'sheriff');
      return p('Проверка Шерифа', 'Шериф проверяет игрока #' + target + '. Отметь его на столе. Не забудь выключить музыку перед утром.');
    }
    if (s.nightSubPhase === 'best_move') return p('ЛХ первого убитого', 'Открой ЛХ убитого #7 и выбери по порядку #' + TRAINING_BEST_MOVE_SEATS.join(' → #') + '. Затем подтверди протокол.');
    return p('Зафиксируй ночь', 'Проверь записанные отстрел и проверки. Нажми «Зафиксировать ночь», затем проведи последнюю речь и протокол убитого.');
  }
  return p('Продолжай игру', 'Выполняй показанные в Live Game действия ведущего.');
};


/**
 * One scripted practice game played entirely with the real judge actions.
 * The guard applies through revotes, the following nights and later days.
 * It never mutates engine state: completing each instruction is a real click.
 */
export type JudgeTrainingGate = {
  title: string;
  detail: string;
  allowed: string[];
  highlight: string[];
  kind?: 'action' | 'nomination' | 'vote' | 'night' | 'foul';
  foulSeat?: number;
};

const gate = (title: string, detail: string, allowed: string[], kind: JudgeTrainingGate['kind'] = 'action', highlight = allowed): JudgeTrainingGate =>
  ({ title, detail, allowed, highlight, kind });
const next = (title: string, detail: string): JudgeTrainingGate =>
  gate(title, detail, ['.live-judge-hud__primary']);
const backToSpeeches = '[data-testid="live-voting-back-to-speeches"]';
const seatTarget = (slot: number) => '.live-seat-card[data-seat="' + slot + '"]';

const regularFouls = (s: PersistedLiveSession, slot: number): number =>
  s.discipline?.players?.[String(slot)]?.regularFouls ??
  s.activePlayers.find((player) => player.slot_num === slot)?.fouls ?? 0;

/**
 * Every night is a new exercise. First night retains the familiar target;
 * following nights rotate across living, non-self targets, preferring people
 * this role has not checked before (from the engine's saved night history).
 * Purely derived from persisted engine data so recovery doesn't reshuffle.
 */
export const trainingCheckTarget = (s: PersistedLiveSession, kind: 'don' | 'sheriff'): number => {
  const alive = s.activePlayers.filter((p) => p.alive).sort((a, b) => a.slot_num - b.slot_num);
  const actorRole = kind === 'don' ? 'Дон' : 'Шериф';
  const targets = alive.filter((p) => p.role !== actorRole);
  if (!targets.length) return alive[0]?.slot_num ?? 1;

  const initial = kind === 'don'
    ? targets.find((p) => p.role === 'Шериф')?.slot_num
    : targets.find((p) => p.team === 'Чёрные')?.slot_num;
  const start = Math.max(0, targets.findIndex((p) => p.slot_num === initial));
  const round = Math.max(1, s.roundNumber || 1);
  const ordered = targets.map((_, index) => targets[(start + round - 1 + index) % targets.length].slot_num);

  const rx = kind === 'don' ? /Дон: #(\d+)/ : /Шериф: #(\d+)/;
  const previous = (s.nightLogs || []).filter((item) => item.round < round)
    .map((item) => rx.exec(item.log)?.[1]).filter((seat): seat is string => Boolean(seat)).map(Number);
  const unchecked = ordered.filter((slot) => !previous.includes(slot));
  const avoidLast = ordered.filter((slot) => slot !== previous[previous.length - 1]);
  return (unchecked.length ? unchecked : avoidLast.length ? avoidLast : ordered)[0];
};

const requireFoul = (s: PersistedLiveSession, slot: number, amount: number, reason: string): JudgeTrainingGate | null => {
  const count = regularFouls(s, slot);
  if (count >= amount) return null;
  const selector = '[data-testid="live-player-add-regular-foul"][data-seat="' + slot + '"]';
  const allowed = [seatTarget(slot), '[data-testid="live-player-actions-center-selector"]', selector];
  return { ...gate('Обычный фол игроку #' + slot,
    reason + ' Открой действия игрока #' + slot + ' и нажми «+ Обычный фол». Сейчас ' + count + ' из ' + amount + '.',
    allowed, 'foul', [seatTarget(slot), selector]), foulSeat: slot };
};

export const getJudgeTrainingGate = (s: PersistedLiveSession | null): JudgeTrainingGate | null => {
  if (!s) return null;
  // The real engine opens the winner confirmation only when the game is won.
  // It is the final required training task, not an unauthorized action.
  if (s.phase !== 'setup' && s.postNightStage === 'none' &&
      s.nightSubPhase !== 'best_move' && !s.votingFarewellQueue?.length) {
    const winner = determineLiveWinner(s.activePlayers);
    if (winner) return gate('Заверши игру — победили ' + winner,
      'Условие победы выполнено. Нажми «Завершить игру», чтобы закрыть учебную партию. Данные виртуальных игроков в CRM не отправляются.',
      ['[data-testid="live-winner-confirm"]'], 'action');
  }

  if (s.phase === 'zero_night') {
    if (s.zeroNightMusicState === 'pending') return next('Включи музыку нулевой ночи', 'Нажми подсвеченную кнопку включения музыки.');
    if (!s.zeroNightSubPhase) return next('Договорка мафии', 'Запусти договорку на 75 секунд.');
    if (s.zeroNightSubPhase === 'agreement') return next('Вызов Шерифа', 'Заверши договорку и вызови Шерифа для жеста ведущему. Это не проверка.');
    if (s.zeroNightSubPhase === 'sheriff') return next('Свободная посадка', 'Запусти 40 секунд свободной посадки.');
    if (s.zeroNightSubPhase === 'seating' && s.zeroNightMusicState === 'playing') return next('Выключи музыку', 'Выключи музыку перед нулевым кругом.');
    return next('Открой нулевой круг', 'Разбуди город.');
  }

  if (s.phase === 'day_speeches') {
    const current = s.activeSpeakerSlot;
    if (current !== null) {
      const planned = planTrainingDay(s).find((entry) => entry.speaker === current);
      if (planned && s.nominationsMap[planned.nominee] !== current) {
        const selector = seatTarget(planned.nominee) + ' .live-seat-quick-action--nomination';
        return gate('Игрок #' + current + ' выставляет #' + planned.nominee,
          'Выставь только игрока #' + planned.nominee + ', затем заверши речь.', [selector], 'nomination');
      }

      // The judge gives player #3 a foul during player #4's speech;
      // do not ask the speaking player to penalize themselves.
      if (s.roundNumber === 1 && current === 4) {
        const foul = requireFoul(s, 3, 1, 'Во время речи игрока #4 игрок #3 нарушил порядок. Ведущий фиксирует обычный фол игроку #3.');
        if (foul) return foul;
      }
      // +30 is NOT a refund for two accumulated fouls. In the real game it
      // ADDS two fouls, and it is forbidden in the zero round. Demonstrate
      // it on the next day's first eligible speaker (#2 in this practice game).
      if (s.roundNumber === 2 && current === 2 && s.speechExtendedSlot !== 2) {
        const selector = '[data-testid="live-hud-speech-extension"]';
        return gate('Добавь +30 секунд игроку #2',
          'Нажми «+30» у таймера. Это добавит к текущей речи 30 секунд И начислит два обычных фола игроку #2. На нулевом круге такая опция недоступна.',
          [selector], 'foul');
      }
      return next('Заверши речь #' + current, 'Нажми «Завершить речь #' + current + '».');
    }
    const alive = s.activePlayers.filter((player) => player.alive && !player.has_spoken_this_round);
    const ordered = alive.sort((a, b) => ((a.slot_num - (s.dayStarterSlot || 1) + 10) % 10) - ((b.slot_num - (s.dayStarterSlot || 1) + 10) % 10));
    return ordered.length
      ? next('Начни речь #' + ordered[0].slot_num, 'Следующая речь — игрок #' + ordered[0].slot_num + '.')
      : next('К голосованию', 'Речи завершены. Перейди к голосованию.');
  }

  if (s.phase === 'day_voting') {
    if (s.votingFarewellQueue.length && s.activeSpeakerSlot !== null)
      return next('Последняя речь заголосованного', 'Заверши последнюю речь #' + s.activeSpeakerSlot + '.');
    const round = s.votingRounds[s.activeVotingRoundIndex];
    if (!round) return next('Подготовь голосование', 'Продолжи голосование через центральную панель.');
    const backs = s.activeVotingRoundIndex === 0 ? [backToSpeeches] : [];
    if (s.votingStage === 'collecting' || s.votingStage === 'setup') {
      const first = round.nominated_seats[0];
      const required = trainingVotes(s, round.nominated_seats, Boolean(round.is_revote));
      const missing = required.filter((slot) => Number(s.votesByPlayer?.[slot]) !== first);
      if (s.currentVotingNomineeIndex === 0 && missing.length) {
        const selectors = missing.map(seatTarget);
        return gate('Голоса против #' + first,
          'Нажимай только подсвеченные бирюзовым места: ' + missing.map((slot) => '#' + slot).join(' · ') + '. Жёлтые контуры обозначают выставленных кандидатов, а не голосующих.',
          [...selectors, ...backs], 'vote', selectors);
      }
      if (s.currentVotingNomineeIndex === 0) return gate('К следующему кандидату',
        'Нужные голоса записаны, нажми «Следующий».',
        ['[data-testid="live-voting-next"]', ...backs], 'action', ['[data-testid="live-voting-next"]']);
      return gate('Подведи итог голосования',
        'Остальные голоса уйдут последнему кандидату. Нажми «Подвести итог».',
        ['[data-testid="live-voting-finalize"]', ...backs], 'action', ['[data-testid="live-voting-finalize"]']);
    }
    if (s.votingStage === 'round_result') {
      const result = determineVotingResult(round);
      if (result.outcome === 'requires_table_decision') {
        // In the actual Live Engine this remains votingStage='round_result':
        // the "table_decision" enum branch is not entered for this outcome.
        const chosen = s.tableDecisionSelectedVoterSlots || [];
        if (!chosen.includes(2)) return gate('Решение стола: руку поднял #2',
          'После второго попила 5:5 стол решает, поднять ли обоих кандидатов. За поднятие голосует ТОЛЬКО игрок #2. Нажми его место.',
          [seatTarget(2)], 'vote', [seatTarget(2)]);
        if (chosen.length > 1) return gate('Исправь решение стола',
          'Поднять руку должен только #2. Сними лишние отметки.',
          chosen.filter((slot) => slot !== 2).map(seatTarget), 'vote');
        return gate('Один голос — оба остаются',
          'За поднятие — 1 из 10. Большинства нет: #1 и #3 остаются в игре. Нажми «Зафиксировать решение» и переходи в ночь.',
          ['.live-judge-table-decision .live-judge-action'], 'action');
      }
      if (result.outcome === 'needs_revote') return gate('Первый попил 5:5',
        'Дай #1 и #3 по 30 секунд, затем проведи второе голосование. Ждём повторное 5:5.',
        ['.live-judge-hud__stack .live-judge-action--primary']);
      return gate('Итог голосования', 'Используй действие в центральной панели согласно результату.',
        ['.live-judge-hud__stack .live-judge-action--primary', '.live-judge-hud__stack .live-judge-action--success']);
    }
    if (s.votingStage === 'revote_speeches')
      return gate('Попил: речи по 30 секунд',
        'Дай каждому кандидату 30 секунд, переходи кнопкой «Следующий игрок», затем «К переголосованию».',
        ['.live-judge-hud__stack--revote-speech > .live-judge-action']);
    return next('Далее после голосования', 'Перейди к следующему этапу.');
  }

  if (s.phase === 'night') {
    if (s.postNightStage === 'farewell') return next('Последняя речь убитого', 'Заверши 60-секундную речь убитого игрока #' + s.shotPlayerSlot + '.');
    if (s.postNightStage === 'death_protocol') {
      return gate('Протокол убитого #' + (s.shotPlayerSlot ?? '?'),
        'В открытом окне повтори отметки из задания — здесь от 1 до 4 цветов, Шериф может отсутствовать. Протокол отражает догадки игрока, не обязательно истину. Затем нажми «Сохранить → день».',
        ['[data-testid="judge-training-death-task"]', '[data-testid="live-death-protocol-save"]', '.live-judge-hud__primary']);
    }
    if (s.nightSubPhase === 'intro') return next('Наступила ночь', 'Включи музыку и открой этап отстрела через центральную панель.');
    if (s.nightSubPhase === 'shooting') {
      const target = trainingNightTarget(s);
      return s.shotPlayerSlot === target
        ? next('Отстрел #' + target + ' записан', 'Перейди к проверке Дона.')
        : gate('Мафия стреляет в #' + target, 'Нажми только игрока #' + target + ' для отстрела.',
          [seatTarget(target)], 'night');
    }
    if (s.nightSubPhase === 'don') {
      const target = trainingCheckTarget(s, 'don');
      return s.donCheckSlot === target
        ? next('Проверка Дона записана', 'Дон проверил #' + target + '. Перейди к Шерифу.')
        : gate('Дон проверяет #' + target, 'Нажми место #' + target + ' — Дон проверяет, является ли он Шерифом.',
          [seatTarget(target)], 'night');
    }
    if (s.nightSubPhase === 'sheriff') {
      const target = trainingCheckTarget(s, 'sheriff');
      return s.sheriffCheckSlot === target
        ? next('Проверка Шерифа записана', 'Шериф проверил #' + target + '. Перейди к результатам ночи или ЛХ.')
        : gate('Шериф проверяет #' + target, 'Нажми место #' + target + ' — Шериф проверяет его цвет.',
          [seatTarget(target)], 'night');
    }
    if (s.nightSubPhase === 'best_move') return gate('ЛХ первого убитого',
      'Выбери последовательно #' + TRAINING_BEST_MOVE_SEATS.join(' → #') + ' в открытом окне ЛХ. Затем подтверди.',
      ['[data-testid="live-best-move-sheet"]']);
    if (s.nightSubPhase === 'morning') return next('Зафиксируй ночь', 'Проверь записанные проверки и отстрел, затем нажми «Зафиксировать ночь».');
    return next('Заверши ночной этап', 'Используй центральную панель.');
  }
  return next('Продолжай игру', 'Следуй заданию на центральной панели.');
};
