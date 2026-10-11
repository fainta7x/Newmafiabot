import type { LiveGameEvent } from '../shared/liveGameEvents.ts';

/** Unattributed, teaching-only reconstructions. Never actual quotations. */
export type TestamentStrength = 'no_reason' | 'single_fact' | 'checkable_reason' | 'verified_fact';
export type TestamentExercise = {
  id: string;
  title: string;
  facts: string[];
  teachingWill: string;
  strength: TestamentStrength;
  explanation: string;
  nextStep: string;
};
export const STRENGTH_OPTIONS: Array<{ id: TestamentStrength; label: string }> = [
  { id: 'no_reason', label: 'Оснований нет — только мнение' },
  { id: 'single_fact', label: 'Факт есть, но вывод о цвете не следует' },
  { id: 'checkable_reason', label: 'Есть проверяемая цепочка — цвет не доказан' },
  { id: 'verified_fact', label: 'Цвет установлен независимой достоверной проверкой' },
];

/** Authored scenarios give coverage even when game history lacks event logs. */
export const TESTAMENT_BASE_EXERCISES: TestamentExercise[] = [
  {
    id: 'base-feeling', title: '«Мне просто кажется»',
    facts: ['Первый убитый оставил ЛХ на №2, №5 и №9.', 'Ни одного конкретного игрового действия в объяснении он не назвал.'],
    teachingWill: '«№2 чёрный. Я просто чувствую, что он играет не так».',
    strength: 'no_reason',
    explanation: 'В завещании есть цветовая версия, но нет проверяемого основания. Уверенность и интуиция говорящего не подтверждают роль.',
    nextStep: 'Не игнорировать версию полностью, но попросить конкретный голос, выставление или противоречие.',
  },
  {
    id: 'base-one-vote', title: 'Один голос не устанавливает цвет',
    facts: ['№4 проголосовал в №7.', 'Роль №7 на момент завещания неизвестна.'],
    teachingWill: '«№4 точно чёрный: я видел, как он голосовал в №7».',
    strength: 'single_fact',
    explanation: 'Сам голос — факт. Однако в условии не показано, почему именно этот голос выгоден чёрным; красный тоже мог так поступить.',
    nextStep: 'Восстановить кандидатов и альтернативы, выяснить, чей вывод этим голосом изменился.',
  },
  {
    id: 'base-priority', title: 'Выставил одного, голосовал в другого',
    facts: ['№3 выставил №6.', 'На голосовании были выставлены №6 и №8.', '№3 проголосовал в №8. Цвета кандидатов неизвестны.'],
    teachingWill: '«№3 выставил №6, но проголосовал в №8. Надо понять, почему его приоритет сменился и кому был выгоден голос».',
    strength: 'checkable_reason',
    explanation: 'Сопоставлены два проверяемых действия и поставлен конкретный вопрос к версии. Но выставление не обязывает голосовать в своего кандидата, поэтому чёрный цвет не доказан.',
    nextStep: 'Сравнить его речи, кандидатуры и доступные голоса, не объявляя изменение приоритета автоматической уликой.',
  },
  {
    id: 'base-sheriff', title: 'Настоящая проверка важнее завещания',
    facts: ['Это специально составленное условие, не реальный протокол.', 'В условии достоверно установлено: №4 — настоящий шериф.', '№4 получил чёрную проверку №9, что также установлено достоверно.'],
    teachingWill: '«№9 чёрный, потому что есть подтверждённая проверка настоящего шерифа».',
    strength: 'verified_fact',
    explanation: 'Цвет следует из независимой достоверной проверки, явно заданной условием, а не из авторитета завещателя. Непроверенное заявление лжешерифа не имело бы той же силы.',
    nextStep: 'Опираемся на подтверждённую проверку, а не на эмоциональную убедительность речи.',
  },
];

const knownSeat = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 10;
const parseSeats = (value: unknown): number[] => String(value ?? '').split(/[,.]/).map(Number).filter(knownSeat);
const hash = (value: string) => [...value].reduce((x, char) => ((x * 33) ^ char.charCodeAt(0)) >>> 0, 5381);
const label = (seat: number, offset: number) => '№' + (((seat + offset - 1) % 10) + 1);

type RawSource = { gameKey: string; events: LiveGameEvent[] };
const reconstruct = (raw: RawSource): TestamentExercise[] => {
  const { events, gameKey } = raw;
  if (!Array.isArray(events)) return [];
  const result: TestamentExercise[] = [];
  const offset = hash(gameKey) % 10;
  // The chronology is append-only: a corrected best move leaves the old event too. Only the last one of each speaker counts.
  const lastBestMove = new Map<number, number>();
  events.forEach((event, index) => { if (event.kind === 'best_move' && knownSeat(event.seat)) lastBestMove.set(event.seat, index); });
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!knownSeat(e.seat) || !['best_move','death_protocol'].includes(e.kind)) continue;
    if (e.kind === 'best_move' && lastBestMove.get(e.seat) !== i) continue;
    const kind = e.kind;
    const picks = kind === 'best_move'
      ? parseSeats(e.value)
      : String(e.value ?? '').split('|').filter((part) => part.startsWith('black:')).flatMap((part) => parseSeats(part.slice(6)));
    if (!picks.length || picks.length > 3 || new Set(picks).size !== picks.length || picks.some((n) => n === e.seat)) continue;
    const chosen = picks[0];
    // Death protocols are serialized when a game ends, not at the real speech time.
    // No preceding game action may safely be attributed to what the speaker knew then.
    const prior = kind === 'best_move' ? events.slice(0, i) : [];
    // This comparison is only to illustrate a hypothetical reason, not to infer real speaker intent.
    // A recorded vote removed/corrected before the testament is never used as a fact.
    const votes = new Map<number, number>();
    const nominations = new Map<number, number>(); // candidate -> proposer
    for (const action of prior) {
      if (action.kind === 'vote' && knownSeat(action.seat) && knownSeat(action.target)) votes.set(action.seat, action.target);
      if (action.kind === 'vote_removed' && knownSeat(action.seat)) votes.delete(action.seat);
      if (action.kind === 'nomination' && knownSeat(action.seat) && knownSeat(action.by)) nominations.set(action.seat, action.by);
      if (action.kind === 'nomination_removed' && knownSeat(action.seat)) nominations.delete(action.seat);
    }
    // Whose best move it is follows from how the speaker went out: the first killed, or voted out on the zero circle.
    const before = events.slice(0, i).reverse();
    const bestMoveSource = before.some((item) => item.kind === 'first_killed' && item.seat === e.seat) ? 'ЛХ первого убитого'
      : before.some((item) => item.kind === 'zero_round_voted' && item.seat === e.seat) ? 'ЛХ заголосованного в нулевом круге' : 'ЛХ выбывшего игрока';
    const sourceLabel = kind === 'best_move' ? bestMoveSource : 'Цветовой протокол убитого';
    const facts = [sourceLabel + ': назван ' + label(chosen, offset) + ' чёрным.'];
    const nominated = [...nominations.entries()].find(([, author]) => author === chosen);
    const voted = votes.get(chosen);
    const shared = {
      id: 'anonymous-training-event',
      title: 'Завещание из игровой ситуации',
      facts,
      teachingWill: '',
      strength: 'no_reason' as TestamentStrength,
      explanation: '',
      nextStep: '',
    };
    if (nominated && voted !== undefined && nominated[0] !== voted) {
      const [nominee] = nominated;
      result.push({ ...shared, title: 'Выставление и выбор другого голоса', strength:'checkable_reason',
        facts: [...facts, label(chosen, offset) + ' выставил ' + label(nominee, offset) + '.',
          label(chosen, offset) + ' голосовал в ' + label(voted, offset) + '.'],
        teachingWill: '«' + label(chosen, offset) + ' выставил ' + label(nominee, offset) +
          ', но голосовал в ' + label(voted, offset) + '. Стоит проверить, почему он выбрал другой приоритет».',
        explanation: 'Это проверяемая связка действий, а не вывод по эмоции. Выставление не обязывает голосовать за своего кандидата; цвет остаётся версией.',
        nextStep: 'Сверить реальные альтернативы на голосовании и проверить, могло ли решение менять исход.',
      });
    } else if (voted !== undefined) {
      result.push({ ...shared, title: 'Подозрение по одному голосу', strength:'single_fact',
        facts: [...facts, label(chosen, offset) + ' голосовал в ' + label(voted, offset) + '.'],
        teachingWill: '«' + label(chosen, offset) + ' чёрный: он голосовал в ' + label(voted, offset) + '».',
        explanation: 'Голос подтверждён журналом, но без контекста кандидатов, известных ролей и последствий сам по себе не устанавливает цвет.',
        nextStep: 'Уточнить распределение рук и выгоду альтернативных голосов для каждой версии чёрной команды.',
      });
    } else {
      result.push({ ...shared, title: 'Версия без аргументов', strength:'no_reason',
        teachingWill: '«' + label(chosen, offset) + ' чёрный, просто мне так кажется».',
        explanation: 'Само указание чёрного места в ЛХ/протоколе записано. Но слова о причине придуманы только для тренировки и не содержат доказательств.',
        nextStep: 'Не повторять чужую тройку без конкретных оснований. Сначала проверить действия названных мест.',
      });
    }
    if (result.length >= 3) break;
  }
  return result;
};

/** Deterministic small bank: no names, game ids, dates, roles, editor labels or actual speech text. */
export const generateAnonymousTestamentExercises = (sources: RawSource[], attempt = 0): TestamentExercise[] => {
  const seen = new Set<string>();
  const generated = sources.flatMap(reconstruct).filter((item) => {
    const fingerprint = item.strength + '|' + item.teachingWill + '|' + item.facts.join('|');
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  }).slice(0, 12);
  // Public IDs are presentation-only; they are not hashes of private game identifiers.
  const all = [...TESTAMENT_BASE_EXERCISES, ...generated.map((item, i) => ({ ...item, id: 'practice-' + (i + 1) }))];
  const shift = Number.isSafeInteger(attempt) && attempt >= 0 ? attempt % all.length : 0;
  return [...all.slice(shift), ...all.slice(0, shift)];
};
