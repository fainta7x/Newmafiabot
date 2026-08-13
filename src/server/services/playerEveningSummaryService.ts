import { loadCompletedGameSnapshots, type CompletedGameSnapshot } from './clubGameAnalyticsService.ts';
import { loadPlayerEloHistory } from './playerEloHistoryService.ts';

export type EveningSummaryAward = {
  category: 'sympathy' | 'best_red' | 'best_black' | 'best_sheriff';
  label: string;
  player_id: string;
  nickname: string;
  avatar_url: string;
  votes: number;
};

export type PlayerEveningSummary = {
  id: string;
  title: string;
  starts_at: string;
  settled_at: string | null;
  venue: string | null;
  games: number;
  red_wins: number;
  black_wins: number;
  score: string;
  player: {
    games: number;
    wins: number;
    losses: number;
    win_rate: number;
    elo_before: number | null;
    elo_after: number | null;
    elo_delta: number;
    roles: string[];
  };
  best_elo_rise: null | {
    player_id: string;
    nickname: string;
    avatar_url: string;
    elo_delta: number;
  };
  most_games: null | {
    player_id: string;
    nickname: string;
    avatar_url: string;
    games: number;
  };
  awards: EveningSummaryAward[];
  facts: string[];
  game_ids: string[];
};

type Aggregate = {
  player_id: string;
  nickname: string;
  games: number;
  wins: number;
  elo_delta: number;
  elo_before: number | null;
  elo_after: number | null;
  roles: Set<string>;
};

const rate = (wins: number, games: number) => games ? Math.round((wins / games) * 100) : 0;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const avatarUrl = (playerId: string) => `/api/player/players/${encodeURIComponent(playerId)}/avatar`;

const safeTableExists = async (db: any, table: string) => {
  try {
    const row = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`, [table]);
    return Boolean(row);
  } catch {
    return false;
  }
};

const categoryLabel = (category: string) => {
  if (category === 'sympathy') return 'Симпатия вечера';
  if (category === 'best_red') return 'Лучший красный';
  if (category === 'best_black') return 'Лучший чёрный';
  return 'Лучший Шериф';
};

const sourceId = (snapshot: CompletedGameSnapshot) => snapshot.id.startsWith('club:')
  ? snapshot.id.slice('club:'.length)
  : snapshot.id;

const buildAwards = async (
  db: any,
  eveningId: string,
  nicknames: Map<string, string>,
  votesAvailable: boolean,
): Promise<EveningSummaryAward[]> => {
  if (!votesAvailable) return [];
  const rows = await db.all(`
    SELECT category, nominee_player_id, COUNT(*) AS votes
      FROM evening_player_votes
     WHERE evening_id = ?
     GROUP BY category, nominee_player_id
     ORDER BY category ASC, votes DESC
  `, [eveningId]);
  if (!rows.length) return [];

  const missingIds = [...new Set(rows.map((row: any) => String(row.nominee_player_id)))]
    .filter((id) => !nicknames.has(id));
  if (missingIds.length) {
    const placeholders = missingIds.map(() => '?').join(',');
    const players = await db.all(`SELECT id, nickname FROM players WHERE id IN (${placeholders})`, missingIds);
    for (const player of players) nicknames.set(String(player.id), String(player.nickname || 'Игрок'));
  }

  const bestByCategory = new Map<string, any>();
  for (const row of rows) {
    const category = String(row.category);
    const current = bestByCategory.get(category);
    const votes = Number(row.votes || 0);
    if (!current || votes > Number(current.votes || 0)) bestByCategory.set(category, row);
  }

  return ['sympathy', 'best_red', 'best_black', 'best_sheriff'].flatMap((category) => {
    const row = bestByCategory.get(category);
    if (!row) return [];
    const playerId = String(row.nominee_player_id);
    return [{
      category: category as EveningSummaryAward['category'],
      label: categoryLabel(category),
      player_id: playerId,
      nickname: nicknames.get(playerId) || 'Игрок',
      avatar_url: avatarUrl(playerId),
      votes: Number(row.votes || 0),
    }];
  });
};

export async function loadPlayerEveningSummaries(
  db: any,
  playerId: string,
  limit = 8,
): Promise<PlayerEveningSummary[]> {
  const [snapshots, eloTimeline, eveningRows, votesAvailable] = await Promise.all([
    loadCompletedGameSnapshots(db),
    loadPlayerEloHistory(db),
    db.all(`
      SELECT e.id, e.title, e.starts_at, e.settled_at, e.venue, e.status,
             ep.attendance_status
        FROM game_evenings e
   LEFT JOIN evening_participants ep
          ON ep.evening_id = e.id AND ep.player_id = ?
       WHERE e.status = 'completed' OR e.settled_at IS NOT NULL
       ORDER BY datetime(COALESCE(e.settled_at, e.starts_at)) DESC
       LIMIT 40
    `, [playerId]),
    safeTableExists(db, 'evening_player_votes'),
  ]);

  const clubSnapshots = snapshots.filter((snapshot) => snapshot.source === 'club');
  const gamesByEvening = new Map<string, CompletedGameSnapshot[]>();
  for (const snapshot of clubSnapshots) {
    const bucket = gamesByEvening.get(snapshot.event_id) || [];
    bucket.push(snapshot);
    gamesByEvening.set(snapshot.event_id, bucket);
  }

  const eloByGame = new Map(
    eloTimeline
      .filter((event) => event.source === 'club')
      .map((event) => [event.sourceId, event]),
  );

  const summaries: PlayerEveningSummary[] = [];
  for (const evening of eveningRows) {
    if (summaries.length >= limit) break;
    const eveningId = String(evening.id);
    const games = (gamesByEvening.get(eveningId) || []).slice().sort((a, b) => a.dateMs - b.dateMs || a.game_number - b.game_number);
    const personallyPlayed = games.some((game) => game.players.some((player) => player.player_id === playerId));
    const attended = String(evening.attendance_status || '') === 'attended';
    if (!personallyPlayed && !attended) continue;

    let redWins = 0;
    let blackWins = 0;
    const aggregates = new Map<string, Aggregate>();
    const nicknames = new Map<string, string>();

    for (const game of games) {
      if (game.winner_team === 'red') redWins += 1;
      else blackWins += 1;
      const eloEvent = eloByGame.get(sourceId(game));
      for (const result of game.players) {
        nicknames.set(result.player_id, result.nickname);
        const current = aggregates.get(result.player_id) || {
          player_id: result.player_id,
          nickname: result.nickname,
          games: 0,
          wins: 0,
          elo_delta: 0,
          elo_before: null,
          elo_after: null,
          roles: new Set<string>(),
        };
        current.nickname = result.nickname || current.nickname;
        current.games += 1;
        if (result.won) current.wins += 1;
        if (result.role) current.roles.add(result.role);
        const elo = eloEvent?.players.find((row) => row.playerId === result.player_id) || null;
        if (elo) {
          if (current.elo_before == null) current.elo_before = elo.eloBefore;
          current.elo_after = elo.eloAfter;
          current.elo_delta += elo.totalDelta;
        }
        aggregates.set(result.player_id, current);
      }
    }

    const personal = aggregates.get(playerId) || null;
    const bestElo = [...aggregates.values()]
      .filter((item) => Math.abs(item.elo_delta) > 0.0001)
      .sort((a, b) => b.elo_delta - a.elo_delta || b.wins - a.wins || b.games - a.games)[0] || null;
    const mostGames = [...aggregates.values()]
      .sort((a, b) => b.games - a.games || b.wins - a.wins || a.nickname.localeCompare(b.nickname, 'ru'))[0] || null;
    const awards = await buildAwards(db, eveningId, nicknames, votesAvailable);

    const personalGames = personal?.games || 0;
    const personalWins = personal?.wins || 0;
    const personalDelta = round(personal?.elo_delta || 0);
    const facts: string[] = [];
    if (games.length) facts.push(`Красные ${redWins}:${blackWins} чёрные`);
    if (personalGames && personalWins === personalGames) facts.push(`Ты прошёл вечер без поражений: ${personalWins}/${personalGames}`);
    else if (personalGames) facts.push(`Твой результат: ${personalWins}/${personalGames} побед`);
    if (Math.abs(personalDelta) >= 0.01) facts.push(`Elo за вечер: ${personalDelta > 0 ? '+' : ''}${personalDelta}`);
    if (bestElo && bestElo.player_id !== playerId && bestElo.elo_delta > 0.01) {
      facts.push(`Лучший рост Elo: ${bestElo.nickname} +${round(bestElo.elo_delta)}`);
    }
    const sympathy = awards.find((award) => award.category === 'sympathy');
    if (sympathy) facts.push(`Симпатия вечера: ${sympathy.nickname}`);

    summaries.push({
      id: eveningId,
      title: String(evening.title || 'Игровой вечер'),
      starts_at: String(evening.starts_at || ''),
      settled_at: evening.settled_at ? String(evening.settled_at) : null,
      venue: evening.venue ? String(evening.venue) : null,
      games: games.length,
      red_wins: redWins,
      black_wins: blackWins,
      score: `${redWins}:${blackWins}`,
      player: {
        games: personalGames,
        wins: personalWins,
        losses: Math.max(0, personalGames - personalWins),
        win_rate: rate(personalWins, personalGames),
        elo_before: personal?.elo_before == null ? null : round(personal.elo_before),
        elo_after: personal?.elo_after == null ? null : round(personal.elo_after),
        elo_delta: personalDelta,
        roles: personal ? [...personal.roles] : [],
      },
      best_elo_rise: bestElo ? {
        player_id: bestElo.player_id,
        nickname: bestElo.nickname,
        avatar_url: avatarUrl(bestElo.player_id),
        elo_delta: round(bestElo.elo_delta),
      } : null,
      most_games: mostGames ? {
        player_id: mostGames.player_id,
        nickname: mostGames.nickname,
        avatar_url: avatarUrl(mostGames.player_id),
        games: mostGames.games,
      } : null,
      awards,
      facts: facts.slice(0, 5),
      game_ids: games.map((game) => game.id),
    });
  }

  return summaries;
}
