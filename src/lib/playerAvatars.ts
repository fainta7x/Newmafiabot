const AVATAR_ROOT = '/avatars/tournament-2026';

const avatarByNickname: Record<string, string> = {
  'богдан': `${AVATAR_ROOT}/bogdanchik.jpg`,
  'богданчик': `${AVATAR_ROOT}/bogdanchik.jpg`,
  'фандорин': `${AVATAR_ROOT}/fandorin.jpg`,
  'спящий': `${AVATAR_ROOT}/spyashchiy.jpg`,
  'знак': `${AVATAR_ROOT}/znak.jpg`,
  'матроскина': `${AVATAR_ROOT}/matroskina.jpg`,
  'денди': `${AVATAR_ROOT}/dendi.jpg`,
  'насон': `${AVATAR_ROOT}/nason.jpg`,
  'пристань': `${AVATAR_ROOT}/pristan.jpg`,
  'джава': `${AVATAR_ROOT}/java.jpg`,
  'вид': `${AVATAR_ROOT}/vid.jpg`,
  'чагин': `${AVATAR_ROOT}/chagin.jpg`,
  'женя чагин': `${AVATAR_ROOT}/chagin.jpg`,
  'евгений чагин': `${AVATAR_ROOT}/chagin.jpg`,
  'чага': `${AVATAR_ROOT}/chagin.jpg`,
};

export function normalizeAvatarNickname(value: string | null | undefined): string {
  return (value || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

export function getPlayerAvatarUrl(nickname: string | null | undefined): string | null {
  return avatarByNickname[normalizeAvatarNickname(nickname)] || null;
}
