import type { CompletedGameSnapshot } from './clubGameAnalyticsService.ts';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const MILESTONES = [10, 25, 50, 100, 200, 300, 500];

type CompactPlayer = {
  player_id: string;
  nickname: string;
  games: number;
  wins: number;
  win_rate: number;
};

type WeeklyDigest = {
  period_start: string;
  period_end: string;
  games: number;
  players: number;
  red_wins: number;
  black_wins: number;
  viewer: null | { games: number; wins: number; win_rate: number };
  leader: CompactPlayer | null;
  hot_streak: null | { player_id: string; nickname: string; streak: number };
  highlights: string[];
  share_text: string;
};

type PersonalHook = {
  key: string;
  type: 'milestone' | 'streak' | 'season_movement' | 'rivalry' | 'duo';
  icon: string;
  title: string;
  text: string;
  action: 'career' | 'club' | 'relations' | 'seasons';
  priority: number;
};

type RelationshipEvent = {
  key: string;
  type: 'rivalry' | 'duo';
  date: string;
  icon: string;
  title: string;
  text: string;
  player_ids: string[];
  share_text: string;
};

const rate = (wins: number, games: number) => games ? Math.round((wins / games) * 100) : 0;

const aggregate = (games: CompletedGameSnapshot[]) => {
  const map = new Map<string, { player_id: string; nickname: string; games: number; wins: number }>();
  for (const game of games) {
    for (const player of game.players) {
      const row = map.get(player.player_id) || { player_id: player.player_id, nickname: player.nickname, games: 0, wins: 0 };
      row.nickname = player.nickname || row.nickname;
      row.games += 1;
      if (player.won) row.wins += 1;
      map.set(player.player_id, row);
    }
  }
  return map;
};

const currentWinStreak = (snapshots: CompletedGameSnapshot[], playerId: string) => {
  let streak = 0;
  for (const game of snapshots.slice().sort((a, b) => b.dateMs - a.dateMs)) {
    const player = game.players.find((item) => item.player_id === playerId);
    if (!player) continue;
    if (!player.won) break;
    streak += 1;
  }
  return streak;
};

const longestWinStreak = (snapshots: CompletedGameSnapshot[], playerId: string) => {
  let best = 0;
  let current = 0;
  for (const game of snapshots.slice().sort((a, b) => a.dateMs - b.dateMs)) {
    const player = game.players.find((item) => item.player_id === playerId);
    if (!player) continue;
    if (player.won) {
      current += 1;
      best = Math.max(best, current);
    } else current = 0;
  }
  return best;
};

const compact = (row: { player_id: string; nickname: string; games: number; wins: number }): CompactPlayer => ({
  ...row,
  win_rate: rate(row.wins, row.games),
});

export const buildWeeklyDigest = (
  snapshots: CompletedGameSnapshot[],
  viewerId: string,
  nowMs = Date.now(),
): WeeklyDigest => {
  const start = nowMs - WEEK;
  const weekly = snapshots.filter((game) => game.dateMs >= start && game.dateMs <= nowMs);
  const stats = aggregate(weekly);
  const rows = [...stats.values()];
  const leaderRaw = rows.slice().sort((a, b) => b.wins - a.wins || rate(b.wins, b.games) - rate(a.wins, a.games) || b.games - a.games)[0] || null;
  const viewerRaw = stats.get(viewerId) || null;
  const redWins = weekly.filter((game) => game.winner_team === 'red').length;
  const blackWins = weekly.filter((game) => game.winner_team === 'black').length;

  let hotStreak: WeeklyDigest['hot_streak'] = null;
  for (const row of rows) {
    const streak = currentWinStreak(snapshots, row.player_id);
    if (streak < 2) continue;
    if (!hotStreak || streak > hotStreak.streak) hotStreak = { player_id: row.player_id, nickname: row.nickname, streak };
  }

  const highlights: string[] = [];
  if (weekly.length) highlights.push(`${weekly.length} завершённых игр · красные ${redWins}:${blackWins} чёрные`);
  if (leaderRaw) highlights.push(`${leaderRaw.nickname} — лидер недели: ${leaderRaw.wins}/${leaderRaw.games} побед`);
  if (hotStreak) highlights.push(`${hotStreak.nickname} идёт на серии из ${hotStreak.streak} побед`);
  if (viewerRaw) highlights.push(`Твоя неделя: ${viewerRaw.wins}/${viewerRaw.games} побед · ${rate(viewerRaw.wins, viewerRaw.games)}%`);
  if (!highlights.length) highlights.push('На этой неделе завершённых игр пока не было.');

  const shareText = [
    '2LA Noire · Неделя клуба',
    ...highlights.slice(0, 3),
    '#2LANoire #СпортивнаяМафия',
  ].join('\n');

  return {
    period_start: new Date(start).toISOString(),
    period_end: new Date(nowMs).toISOString(),
    games: weekly.length,
    players: stats.size,
    red_wins: redWins,
    black_wins: blackWins,
    viewer: viewerRaw ? { games: viewerRaw.games, wins: viewerRaw.wins, win_rate: rate(viewerRaw.wins, viewerRaw.games) } : null,
    leader: leaderRaw ? compact(leaderRaw) : null,
    hot_streak: hotStreak,
    highlights,
    share_text: shareText,
  };
};

const pairKey = (a: string, b: string) => [a, b].sort().join('|');

export const buildRelationshipEvents = (snapshots: CompletedGameSnapshot[]): RelationshipEvent[] => {
  const encounters = new Map<string, Array<{ dateMs: number; date: string; sameTeam: boolean; a: any; b: any }>>();
  for (const game of snapshots.slice().sort((a, b) => a.dateMs - b.dateMs)) {
    for (let left = 0; left < game.players.length; left += 1) {
      for (let right = left + 1; right < game.players.length; right += 1) {
        const a = game.players[left];
        const b = game.players[right];
        const key = pairKey(a.player_id, b.player_id);
        const bucket = encounters.get(key) || [];
        bucket.push({ dateMs: game.dateMs, date: game.played_at, sameTeam: a.team === b.team, a, b });
        encounters.set(key, bucket);
      }
    }
  }

  const events: RelationshipEvent[] = [];
  for (const [key, rows] of encounters) {
    const rivalRows = rows.filter((row) => !row.sameTeam);
    if (rivalRows.length >= 3) {
      const unlock = rivalRows[2];
      events.push({
        key: `rivalry:${key}:${unlock.dateMs}`,
        type: 'rivalry',
        date: unlock.date,
        icon: '⚔️',
        title: `Новое противостояние: ${unlock.a.nickname} × ${unlock.b.nickname}`,
        text: 'Третья игра по разные стороны стола — rivalry официально появилось в истории клуба.',
        player_ids: [unlock.a.player_id, unlock.b.player_id],
        share_text: `⚔️ 2LA Noire · Новое противостояние\n${unlock.a.nickname} × ${unlock.b.nickname}\nТри игры по разные стороны стола. #2LANoire`,
      });
    }
    const duoRows = rows.filter((row) => row.sameTeam);
    if (duoRows.length >= 3) {
      const unlock = duoRows[2];
      events.push({
        key: `duo:${key}:${unlock.dateMs}`,
        type: 'duo',
        date: unlock.date,
        icon: '🤝',
        title: `Новая связка: ${unlock.a.nickname} + ${unlock.b.nickname}`,
        text: 'Третья совместная игра в одной команде — связка закрепилась в клубной истории.',
        player_ids: [unlock.a.player_id, unlock.b.player_id],
        share_text: `🤝 2LA Noire · Новая связка\n${unlock.a.nickname} + ${unlock.b.nickname}\nТри совместные игры в одной команде. #2LANoire`,
      });
    }
  }
  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const buildPersonalHooks = (
  snapshots: CompletedGameSnapshot[],
  viewerId: string,
  currentPlace: number | null,
  previousPlace: number | null,
  relationshipEvents: RelationshipEvent[],
  nowMs = Date.now(),
): PersonalHook[] => {
  const hooks: PersonalHook[] = [];
  const personalGames = snapshots.filter((game) => game.players.some((player) => player.player_id === viewerId));
  const gamesCount = personalGames.length;
  const nextMilestone = MILESTONES.find((target) => target > gamesCount);
  if (nextMilestone && nextMilestone - gamesCount <= 5) {
    const left = nextMilestone - gamesCount;
    hooks.push({
      key: `near-milestone:${nextMilestone}:${gamesCount}`,
      type: 'milestone',
      icon: '🎯',
      title: `${left} ${left === 1 ? 'игра' : left < 5 ? 'игры' : 'игр'} до отметки ${nextMilestone}`,
      text: `Следующая карьерная отметка уже близко: сейчас у тебя ${gamesCount} завершённых игр.`,
      action: 'career',
      priority: 90,
    });
  }

  const streak = currentWinStreak(snapshots, viewerId);
  const best = longestWinStreak(snapshots, viewerId);
  if (streak >= 2) {
    hooks.push({
      key: `streak:${streak}:${best}`,
      type: 'streak',
      icon: '🔥',
      title: streak >= best && best > 0 ? `Личный рекорд: ${streak} побед подряд` : `Серия: ${streak} побед подряд`,
      text: streak < best ? `До повторения личного рекорда осталось ${best - streak}.` : 'Следующая победа продлит твой лучший отрезок.',
      action: 'club',
      priority: 88,
    });
  }

  if (currentPlace && previousPlace && currentPlace !== previousPlace) {
    const movement = previousPlace - currentPlace;
    hooks.push({
      key: `season-place:${previousPlace}:${currentPlace}`,
      type: 'season_movement',
      icon: movement > 0 ? '📈' : '📉',
      title: movement > 0 ? `Ты поднялся на ${movement} ${movement === 1 ? 'место' : 'места'}` : `Позиция сезона изменилась: #${currentPlace}`,
      text: `Неделю назад было #${previousPlace}, сейчас #${currentPlace}.`,
      action: 'seasons',
      priority: 80,
    });
  }

  const recentRelationship = relationshipEvents.find((event) => event.player_ids.includes(viewerId) && nowMs - new Date(event.date).getTime() <= WEEK);
  if (recentRelationship) {
    hooks.push({
      key: `relationship:${recentRelationship.key}`,
      type: recentRelationship.type,
      icon: recentRelationship.icon,
      title: recentRelationship.type === 'rivalry' ? 'У тебя новое rivalry' : 'У тебя новая клубная связка',
      text: recentRelationship.title.replace(/^Новое противостояние:\s*|^Новая связка:\s*/, ''),
      action: 'relations',
      priority: 84,
    });
  }

  return hooks.sort((a, b) => b.priority - a.priority).slice(0, 4);
};

export const weekAgoSeasonPlace = (
  seasonGames: CompletedGameSnapshot[],
  viewerId: string,
  nowMs = Date.now(),
): number | null => {
  const cutoff = nowMs - WEEK;
  const older = aggregate(seasonGames.filter((game) => game.dateMs < cutoff));
  const ranked = [...older.values()].sort((a, b) => b.wins - a.wins || rate(b.wins, b.games) - rate(a.wins, a.games) || b.games - a.games || a.nickname.localeCompare(b.nickname, 'ru'));
  const index = ranked.findIndex((row) => row.player_id === viewerId);
  return index >= 0 ? index + 1 : null;
};
