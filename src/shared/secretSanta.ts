/**
 * «Тайный Санта» (owner, 2026-11-17: «подарки до 1000 рублей… шафл только между теми, кто участвует… сначала просто
 * внутри ЛК регистрация на ивент… потом я просто в его настройках делаю привязку к событию и запускаю шафл»).
 * «Подарок шмурдяку» (owner, same day): each santa also gets one person who will be at the exchange evening but does not take
 * part — an anti-gift for him. Rules are in docs/BUSINESS_RULES.md.
 */
export const SANTA_GIFT_LIMIT_RUB = 1000;
export const SANTA_MIN_PARTICIPANTS = 3;
export const SANTA_NAME = 'Тайный Санта';
export const SHMURDYAK_NAME = 'Подарок шмурдяку';
export const SANTA_PROMISE = `Обязуюсь подготовить подарок до ${SANTA_GIFT_LIMIT_RUB} ₽ и антиподарок шмурдяку и прийти с ними на вечер обмена`;
/** Weekly reminder: every Monday from this hour (Moscow) until the exchange. */
export const SANTA_MONDAY_HOUR_MSK = 12;

export type SantaEvening = { id: string; title: string; starts_at: string };
export type SantaStatus = 'open' | 'drawn' | 'cancelled';
export type SantaPlayer = { id: string; nickname: string };
/** What a player sees. Who gives to whom is never shown to anybody but the giver himself. */
export type SantaPlayerState = {
  event: null | {
    id: string; status: SantaStatus; evening: SantaEvening | null; gift_limit: number;
    participants: SantaPlayer[]; joined: boolean; recipient: SantaPlayer | null; shmurdyak: SantaPlayer | null; drawn_at: string | null;
  };
};
/** What the organizer sees: who takes part and who got the result; never who gives to whom (he may take part himself). */
export type SantaOrganizerState = {
  event: null | {
    id: string; status: SantaStatus; evening: SantaEvening | null; gift_limit: number; created_at: string; drawn_at: string | null;
    posted: boolean;
    /** People with «Иду» on the bound evening who are not in Santa: the «шмурдяки» the draw takes from. */
    shmurdyak_pool: SantaPlayer[];
    /** message: the personal message with the result — sent to the bot queue, or it cannot reach him (no Telegram/VK, messages off). */
    participants: Array<SantaPlayer & { joined_at: string; bot_blocked: boolean; message: null | 'queued' | 'unreachable' }>;
  };
};

/** «20 декабря, сб, 19:00» by Moscow time. */
export const santaEveningWhen = (startsAt: string) => {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' });
  const weekday = date.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'short' });
  const time = date.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
  return `${day}, ${weekday}, ${time}`;
};
const eveningLine = (evening: SantaEvening) => `«${evening.title}», ${santaEveningWhen(evening.starts_at)}`;

/** The «Новости» post when the organizer creates it; the evening is bound later (shown to him before he creates it). */
export const santaAnnouncementText = () => [
  `🎅 ${SANTA_NAME} в 2LA Noire!`,
  '',
  `Дарим друг другу подарки до ${SANTA_GIFT_LIMIT_RUB} ₽. Обмен — на клубном вечере, дату сообщим.`,
  '',
  `А ещё каждому санте выпадет «шмурдяк» — человек с вечера обмена, который в Санте не участвует. Ему нужно подарить антиподарок 😈`,
  '',
  'Запишись в приложении и подтверди участие. Когда запись закроется, каждому участнику бот напишет, кому он дарит. Пары выпадают только между записавшимися 👇',
].join('\n');

const shmurdyakLine = (shmurdyak: string | null) => shmurdyak ? `😈 ${SHMURDYAK_NAME}: ${shmurdyak} — ему нужен антиподарок (без лимита).` : '';

/** The personal message after the draw (the first of the three reminders, owner: «как получаешь цель»). */
export const santaResultText = (recipient: string, shmurdyak: string | null, evening: SantaEvening) => [
  `🎅 ${SANTA_NAME}: ты даришь подарок игроку ${recipient}.`,
  shmurdyakLine(shmurdyak),
  '',
  `Подарок до ${SANTA_GIFT_LIMIT_RUB} ₽, вручение — на вечере ${eveningLine(evening)}. Никому не говори, кто тебе выпал 🤫`,
].filter((line, index) => index !== 1 || line).join('\n');

/** Every Monday until the exchange. */
export const santaMondayText = (recipient: string, shmurdyak: string | null, evening: SantaEvening) =>
  `🎅 Напоминание: ${SANTA_NAME} — подарок до ${SANTA_GIFT_LIMIT_RUB} ₽ для ${recipient}${shmurdyak ? ` и антиподарок для ${shmurdyak}` : ''}. Обмен — на вечере ${eveningLine(evening)}.`;

/** 24 hours before the exchange evening. */
export const santaDayBeforeText = (recipient: string, shmurdyak: string | null, evening: SantaEvening) =>
  `🎅 Завтра обмен подарками! Не забудь подарок для ${recipient}${shmurdyak ? ` и антиподарок для ${shmurdyak}` : ''} — вечер ${eveningLine(evening)}.`;

/**
 * Who gives to whom: one shuffled circle through every participant, so nobody draws himself and no two people draw each
 * other (with 3 or more). `random(n)` returns an integer in [0, n).
 */
export function santaCircle(playerIds: string[], random: (n: number) => number): Array<{ giver: string; receiver: string }> {
  const order = shuffled(playerIds, random);
  return order.map((giver, index) => ({ giver, receiver: order[(index + 1) % order.length] }));
}

/** «Шмурдяки» for the givers: shuffled and handed out in turn, so each one gets an anti-gift from as few santas as possible. */
export function shmurdyakFor(givers: string[], pool: string[], random: (n: number) => number): Map<string, string> {
  const result = new Map<string, string>();
  if (!pool.length) return result;
  const people = shuffled(pool, random);
  shuffled(givers, random).forEach((giver, index) => result.set(giver, people[index % people.length]));
  return result;
}

function shuffled<T>(items: T[], random: (n: number) => number): T[] {
  const order = [...items];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
