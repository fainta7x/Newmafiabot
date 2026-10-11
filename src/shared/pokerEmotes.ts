/**
 * The emotes of the poker table chat (owner, 2026-10-10): a few friendly ones — hello, bye, good game — and, for the
 * most part, teasing, provocative ones. Each is an emoji with its own short animation (`anim` is a CSS class suffix).
 * Phrases avoid addressing a person as «ты»/«вы»: they are said about the game, not about somebody.
 */
export type PokerEmoteTone = 'friendly' | 'taunt';
export type PokerEmote = { id: string; emoji: string; label: string; tone: PokerEmoteTone; anim: 'wave' | 'pop' | 'shake' | 'float' | 'spin' | 'swim' | 'flame' | 'frost' | 'drop' | 'boom' | 'sway' | 'rise' };

export const POKER_EMOTES: PokerEmote[] = [
  { id: 'hello', emoji: '👋', label: 'Привет!', tone: 'friendly', anim: 'wave' },
  { id: 'bye', emoji: '🫡', label: 'Пока!', tone: 'friendly', anim: 'sway' },
  { id: 'gg', emoji: '🤝', label: 'GG', tone: 'friendly', anim: 'pop' },
  { id: 'luck', emoji: '🍀', label: 'Удачи', tone: 'friendly', anim: 'rise' },
  { id: 'easy', emoji: '😎', label: 'Лёгкая раздача', tone: 'taunt', anim: 'pop' },
  { id: 'bluff', emoji: '🤥', label: 'Блефуешь!', tone: 'taunt', anim: 'shake' },
  { id: 'scared', emoji: '😱', label: 'Страшно?', tone: 'taunt', anim: 'shake' },
  { id: 'fold', emoji: '🏳️', label: 'Фолд, не мучайся', tone: 'taunt', anim: 'wave' },
  { id: 'money', emoji: '💸', label: 'Фишки сами идут', tone: 'taunt', anim: 'rise' },
  { id: 'snore', emoji: '😴', label: 'Долго думает', tone: 'taunt', anim: 'float' },
  { id: 'clown', emoji: '🤡', label: 'Цирк!', tone: 'taunt', anim: 'spin' },
  { id: 'shark', emoji: '🦈', label: 'Акула за столом', tone: 'taunt', anim: 'swim' },
  { id: 'ice', emoji: '🥶', label: 'Ледяные нервы', tone: 'taunt', anim: 'frost' },
  { id: 'fire', emoji: '🔥', label: 'Горячо!', tone: 'taunt', anim: 'flame' },
  { id: 'smirk', emoji: '😏', label: 'Слабовато', tone: 'taunt', anim: 'sway' },
  { id: 'tilt', emoji: '🤬', label: 'Тильт?', tone: 'taunt', anim: 'shake' },
  { id: 'crown', emoji: '👑', label: 'Король стола', tone: 'taunt', anim: 'drop' },
  { id: 'boom', emoji: '💥', label: 'Бум!', tone: 'taunt', anim: 'boom' },
];

export const pokerEmoteById = (id: unknown): PokerEmote | null => POKER_EMOTES.find((emote) => emote.id === id) || null;
