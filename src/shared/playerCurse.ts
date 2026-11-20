/** «Проклятье на понос» (owner, 2026-11-19): the mark next to a player's name, with the day it ends (Moscow). */
export const CURSE_NAME = 'Проклятье на понос';
export const curseLabel = (until: string) => `🤢 ${CURSE_NAME} до ${new Date(until).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' })}`;
