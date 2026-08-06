import bogdanchikAvatar from '../assets/player-avatars/bogdanchik.jpg';
import chaginAvatar from '../assets/player-avatars/chagin.jpg';
import dendiAvatar from '../assets/player-avatars/dendi.jpg';
import fandorinAvatar from '../assets/player-avatars/fandorin.jpg';
import javaAvatar from '../assets/player-avatars/java.jpg';
import matroskinaAvatar from '../assets/player-avatars/matroskina.jpg';
import nasonAvatar from '../assets/player-avatars/nason.jpg';
import pristanAvatar from '../assets/player-avatars/pristan.jpg';
import spyashchiyAvatar from '../assets/player-avatars/spyashchiy.jpg';
import vidAvatar from '../assets/player-avatars/vid.jpg';
import znakAvatar from '../assets/player-avatars/znak.jpg';

const avatarByNickname: Record<string, string> = {
  'богдан': bogdanchikAvatar,
  'богданчик': bogdanchikAvatar,
  'фандорин': fandorinAvatar,
  'спящий': spyashchiyAvatar,
  'знак': znakAvatar,
  'матроскина': matroskinaAvatar,
  'денди': dendiAvatar,
  'насон': nasonAvatar,
  'пристань': pristanAvatar,
  'джава': javaAvatar,
  'вид': vidAvatar,
  'чагин': chaginAvatar,
  'женя чагин': chaginAvatar,
  'евгений чагин': chaginAvatar,
  'чага': chaginAvatar,
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
