import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { EVENING_VOTING_WINDOW_MS } from '../services/clubYearAwardsService.ts';

const router = Router();
// One question for the whole evening (owner, 2026-10-04): «Кто сыграл лучше всех?». The old role categories are retired;
// their stored votes stay in the table but are no longer offered or counted.
export const EVENING_VOTE_CATEGORY = 'best_player';
const CATEGORIES = new Set([EVENING_VOTE_CATEGORY]);

type VotingContext =
  | { error: 'not_completed' }
  | { error: 'not_attended'; evening: any }
  | {
      error: null;
      evening: any;
      votingOpen: boolean;
      deadlineMs: number;
      attendeeIds: Set<string>;
      nominees: Array<{
        player_id: string;
        nickname: string;
        avatar_url: string;
        categories: string[];
      }>;
    };

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const ensureSchema = async (db: any) => {
  await db.run(`
    CREATE TABLE IF NOT EXISTS evening_player_votes (
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      voter_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      nominee_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (evening_id, voter_player_id, category)
    )
  `);
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_evening_player_votes_results
      ON evening_player_votes(evening_id, category, nominee_player_id)
  `);
};

const loadVotingContext = async (db: any, eveningId: string, viewerId: string): Promise<VotingContext> => {
  const evening = await db.get(`
    SELECT id, title, starts_at, settled_at, status
      FROM game_evenings
     WHERE id = ?
     LIMIT 1
  `, [eveningId]);
  if (!evening || (evening.status !== 'completed' && !evening.settled_at)) return { error: 'not_completed' };

  const viewer = await db.get(`
    SELECT id
      FROM evening_participants
     WHERE evening_id = ? AND player_id = ? AND attendance_status = 'attended'
     LIMIT 1
  `, [eveningId, viewerId]);
  if (!viewer) return { error: 'not_attended', evening };

  const baseTime = new Date(String(evening.settled_at || evening.starts_at || '')).getTime();
  const deadlineMs = Number.isFinite(baseTime) ? baseTime + EVENING_VOTING_WINDOW_MS : 0;
  const votingOpen = deadlineMs > Date.now();

  const attendeeRows = await db.all(`
    SELECT p.id, p.nickname
      FROM evening_participants ep
      JOIN players p ON p.id = ep.player_id
     WHERE ep.evening_id = ? AND ep.attendance_status = 'attended'
     ORDER BY p.nickname COLLATE NOCASE ASC
  `, [eveningId]);

  const attendeeIds = new Set<string>(attendeeRows.map((row: any) => String(row.id)));
  const nominees = attendeeRows
    .filter((row: any) => String(row.id) !== String(viewerId))
    .map((row: any) => ({
      player_id: String(row.id),
      nickname: String(row.nickname || 'Игрок'),
      avatar_url: `/api/player/players/${encodeURIComponent(String(row.id))}/avatar`,
      categories: [EVENING_VOTE_CATEGORY],
    }));

  return { error: null, evening, votingOpen, deadlineMs, attendeeIds, nominees };
};

router.get('/stories/:eveningId/voting', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;

  try {
    const db = req.db;
    await ensureSchema(db);
    const context = await loadVotingContext(db, req.params.eveningId, viewerId);
    if (context.error === 'not_completed') return res.status(409).json({ error: 'Голосование доступно только после завершения вечера' });
    if (context.error === 'not_attended') return res.status(403).json({ error: 'Голосовать могут только игроки, которые были на этом вечере' });

    const [myVotes, resultRows] = await Promise.all([
      db.all(`
        SELECT category, nominee_player_id
          FROM evening_player_votes
         WHERE evening_id = ? AND voter_player_id = ? AND category = 'best_player'
      `, [req.params.eveningId, viewerId]),
      db.all(`
        SELECT category, nominee_player_id, COUNT(*) AS votes
          FROM evening_player_votes
         WHERE evening_id = ? AND category = 'best_player'
         GROUP BY category, nominee_player_id
      `, [req.params.eveningId]),
    ]);

    const myVoteMap = Object.fromEntries(myVotes.map((row: any) => [String(row.category), String(row.nominee_player_id)]));
    const results = resultRows.map((row: any) => ({
      category: String(row.category),
      nominee_player_id: String(row.nominee_player_id),
      votes: Number(row.votes || 0),
    }));

    return res.json({
      evening: { id: String(context.evening.id), title: String(context.evening.title || 'Игровой вечер') },
      voting_open: context.votingOpen,
      deadline: context.deadlineMs ? new Date(context.deadlineMs).toISOString() : null,
      categories: [EVENING_VOTE_CATEGORY],
      nominees: context.nominees,
      my_votes: myVoteMap,
      results,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить голосование вечера' });
  }
});

router.post('/stories/:eveningId/vote', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;
  const category = String(req.body?.category || '').trim();
  const nomineePlayerId = String(req.body?.nominee_player_id || '').trim();
  if (!CATEGORIES.has(category) || !nomineePlayerId) return res.status(400).json({ error: 'Некорректная категория или кандидат' });

  try {
    const db = req.db;
    await ensureSchema(db);
    const context = await loadVotingContext(db, req.params.eveningId, viewerId);
    if (context.error === 'not_completed') return res.status(409).json({ error: 'Вечер ещё не завершён' });
    if (context.error === 'not_attended') return res.status(403).json({ error: 'Голосовать могут только участники вечера' });
    if (!context.votingOpen) return res.status(409).json({ error: 'Голосование по этому вечеру уже закрыто' });

    const nominee = context.nominees.find((item) => item.player_id === nomineePlayerId);
    if (!nominee || !nominee.categories.includes(category)) return res.status(400).json({ error: 'Этот игрок не подходит для выбранной номинации' });
    if (!context.attendeeIds.has(nomineePlayerId)) return res.status(400).json({ error: 'Кандидат не участвовал в вечере' });

    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO evening_player_votes (
        evening_id, voter_player_id, category, nominee_player_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(evening_id, voter_player_id, category) DO UPDATE SET
        nominee_player_id = excluded.nominee_player_id,
        updated_at = excluded.updated_at
    `, [req.params.eveningId, viewerId, category, nomineePlayerId, now, now]);

    return res.json({ success: true, category, nominee_player_id: nomineePlayerId, updated_at: now });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось сохранить голос' });
  }
});

export default router;
