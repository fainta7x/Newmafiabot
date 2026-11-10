/**
 * Interesting changes for the «Новости» digest (owner, 2026-11-10): only things players will enjoy, in lively words.
 * Never «fixed a bug», «moved a button», «repaired announcement sending». The bot posts the entries not yet sent, at most once per 3 days.
 * Add a new entry (unique `id`) when a fun change reaches the players; an entry is sent once.
 */
export const BOT_CHANGES_DIGEST: Array<{ id: string; text: string }> = [
  { id: '2026-11-virtual-roles', text: '🃏 Ведущий может раздать роли виртуальными картами: каждый игрок сам тянет карту, она переворачивается — и роль у него. Физические карты тоже остаются.' },
  { id: '2026-11-stream-roles', text: '📺 На трансляции видно, как идёт раздача ролей: подсвечен тот, кто выбирает, карта переворачивается и показывает роль.' },
  { id: '2026-11-out-marks', text: '🎯 У выбывших игроков теперь видно, как они покинули стол: «Убит» — прицел, «Заголосован» — тюремная решётка, «Удалён» — знак «запрещено».' },
  { id: '2026-11-compare-players', text: '📊 В «Сообществе» можно сравнить двух любых игроков по показателям и посмотреть историю их общих игр с протоколами.' },
  { id: '2026-11-mvp-medal', text: '🏅 За MVP вечера теперь выдают медаль, а при ничьей будет дополнительное голосование между лидерами.' },
];
