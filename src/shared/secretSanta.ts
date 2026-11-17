/**
 * «Тайный Санта» (owner, 2026-11-17: «подарки до 1000 рублей… шафл только между теми, кто участвует… подтвержденная
 * регистрация внутри приложения на ивент и потом, когда я нажму кнопку, чтобы выдало того, кому тебе нужно будет дарить»).
 * Answers of 2026-11-17: the player confirms himself; gifts are given at a club evening; no wishes; a «Новости» post with a
 * button and the result in a personal message. Rules are in docs/BUSINESS_RULES.md.
 */
export const SANTA_GIFT_LIMIT_RUB = 1000;
export const SANTA_MIN_PARTICIPANTS = 3;
export const SANTA_NAME = 'Тайный Санта';
export const SANTA_PROMISE = `Обязуюсь подготовить подарок до ${SANTA_GIFT_LIMIT_RUB} ₽ и прийти с ним на вечер обмена`;

export type SantaEvening = { id: string; title: string; starts_at: string };
export type SantaStatus = 'open' | 'drawn' | 'cancelled';
export type SantaPlayer = { id: string; nickname: string };
/** What a player sees. The pairs are never shown to anybody but the giver himself. */
export type SantaPlayerState = {
  event: null | {
    id: string; status: SantaStatus; evening: SantaEvening; gift_limit: number;
    participants: SantaPlayer[]; joined: boolean; recipient: SantaPlayer | null; drawn_at: string | null;
  };
};
/** What the organizer sees: who takes part and who got the result; never who gives to whom (he may take part himself). */
export type SantaOrganizerState = {
  event: null | {
    id: string; status: SantaStatus; evening: SantaEvening; gift_limit: number; created_at: string; drawn_at: string | null;
    posted: boolean;
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

/** The «Новости» post when the organizer opens the registration (shown to him before he opens it). */
export const santaAnnouncementText = (evening: SantaEvening) => [
  `🎅 ${SANTA_NAME} в 2LA Noire!`,
  '',
  `Дарим друг другу подарки до ${SANTA_GIFT_LIMIT_RUB} ₽. Обмен — на вечере «${evening.title}», ${santaEveningWhen(evening.starts_at)}.`,
  '',
  'Запишись в приложении и подтверди участие. Когда запись закроется, каждому участнику бот напишет, кому он дарит подарок. Пары выпадают только между записавшимися 👇',
].join('\n');

/** The personal message after the draw. */
export const santaResultText = (recipient: string, evening: SantaEvening) => [
  `🎅 ${SANTA_NAME}: ты даришь подарок игроку ${recipient}.`,
  '',
  `Подарок до ${SANTA_GIFT_LIMIT_RUB} ₽, вручение — на вечере «${evening.title}», ${santaEveningWhen(evening.starts_at)}. Никому не говори, кто тебе выпал 🤫`,
].join('\n');

/**
 * Who gives to whom: one shuffled circle through every participant, so nobody draws himself and no two people draw each
 * other (with 3 or more). `random(n)` returns an integer in [0, n).
 */
export function santaCircle(playerIds: string[], random: (n: number) => number): Array<{ giver: string; receiver: string }> {
  const order = [...playerIds];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.map((giver, index) => ({ giver, receiver: order[(index + 1) % order.length] }));
}
