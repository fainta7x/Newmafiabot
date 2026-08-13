import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import careerProfileRoutes from './playerCareerProfileRoutes.ts';
import clubWorldRoutes from './playerClubWorldRoutes.ts';
import notificationsRoutes from './playerNotificationsRoutes.ts';
import { loadCompletedGameSnapshots } from '../services/clubGameAnalyticsService.ts';
import { loadPlayerEloHistory } from '../services/playerEloHistoryService.ts';
import { calculateCanonicalEloGame, DEFAULT_ELO, type EloTeam } from '../services/eloRatingService.ts';
import { loadPlayerEveningSummaries } from '../services/playerEveningSummaryService.ts';

const router = Router();

router.use(careerProfileRoutes);
router.use(clubWorldRoutes);
router.use(notificationsRoutes);

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return String(playerId);
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const opposite = (team: EloTeam): EloTeam => team === 'red' ? 'black' : 'red';

const explanationFor = (row: {
  won: boolean;
  expectedTeamResult: number;
  modifiedResultDelta: number;
  resultDelta: number;
  carryModifier: number;
  personalDelta: number;
  totalDelta: number;
}) => {
  const chance = Math.round(row.expectedTeamResult * 100);
  const outcome = row.won ? 'Победа' : 'Поражение';
  const carryEffect = row.modifiedResultDelta - row.resultDelta;
  const parts = [
    `${outcome} при расчётной вероятности команды ${chance}%`,
    `командная часть ${row.modifiedResultDelta >= 0 ? '+' : ''}${round(row.modifiedResultDelta)}`,
  ];
  if (Math.abs(row.personalDelta) >= 0.01) {
    parts.push(`личный вклад ${row.personalDelta >= 0 ? '+' : ''}${round(row.personalDelta)}`);
  } else {
    parts.push('без личной поправки');
  }
  if (Math.abs(carryEffect) >= 0.01) {
    parts.push(`коэффициент силы ×${round(row.carryModifier)}`);
  }
  return {
    headline: `${outcome}: ${row.totalDelta >= 0 ? '+' : ''}${round(row.totalDelta)} Elo`,
    details: parts,
    formula: `${round(row.modifiedResultDelta)} ${row.personalDelta >= 0 ? '+' : '−'} ${Math.abs(round(row.personalDelta))} = ${round(row.totalDelta)}`,
  };
};

const previewOutcome = (
  playerId: string,
  selfElo: number,
  clubAverage: number,
  team: EloTeam,
  won: boolean,
) => {
  const players = [] as Array<{ playerId: string; team: EloTeam; elo: number; canonicalPersonalGamePoints: number }>;
  const redCount = team === 'red' ? 6 : 7;
  const blackCount = team === 'black' ? 2 : 3;
  if (team === 'red') players.push({ playerId, team: 'red', elo: selfElo, canonicalPersonalGamePoints: 0 });
  for (let index = 0; index < redCount; index += 1) {
    players.push({ playerId: `preview-red-${index}`, team: 'red', elo: clubAverage, canonicalPersonalGamePoints: 0 });
  }
  if (team === 'black') players.push({ playerId, team: 'black', elo: selfElo, canonicalPersonalGamePoints: 0 });
  for (let index = 0; index < blackCount; index += 1) {
    players.push({ playerId: `preview-black-${index}`, team: 'black', elo: clubAverage, canonicalPersonalGamePoints: 0 });
  }

  const winner = won ? team : opposite(team);
  const delta = calculateCanonicalEloGame(players, winner).find((item) => item.playerId === playerId);
  if (!delta) return null;
  return {
    expected_percent: Math.round(delta.expectedTeamResult * 100),
    elo_delta: round(delta.totalDelta),
    team_delta: round(delta.modifiedResultDelta),
    carry_modifier: round(delta.carryModifier),
  };
};

router.get('/elo-journey', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = (req as any).db;
    const [player, timeline, snapshots, ratingRows] = await Promise.all([
      db.get(`SELECT id, nickname, elo, COALESCE(elo_seed, ?) AS elo_seed FROM players WHERE id = ? LIMIT 1`, [DEFAULT_ELO, playerId]),
      loadPlayerEloHistory(db),
      loadCompletedGameSnapshots(db),
      db.all(`SELECT id, elo FROM players WHERE id <> ? AND elo IS NOT NULL`, [playerId]),
    ]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });

    const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
    const events = timeline.flatMap((event) => {
      const row = event.players.find((item) => item.playerId === playerId);
      if (!row) return [];
      const gameKey = `${event.source}:${event.sourceId}`;
      const snapshot = snapshotById.get(gameKey);
      return [{
        id: gameKey,
        source: event.source,
        date: event.sortAt,
        title: snapshot?.title || (event.source === 'tournament' ? 'Турнир' : 'Игровой вечер'),
        game_number: snapshot?.game_number || event.sortOrder,
        team: row.team,
        won: row.won,
        winner_team: event.winnerTeam,
        elo_before: round(row.eloBefore),
        elo_after: round(row.eloAfter),
        elo_delta: round(row.totalDelta),
        expected_percent: Math.round(row.expectedTeamResult * 100),
        base_team_delta: round(row.resultDelta),
        carry_modifier: round(row.carryModifier),
        carry_effect: round(row.modifiedResultDelta - row.resultDelta),
        team_delta: round(row.modifiedResultDelta),
        personal_game_points: round(row.canonicalPersonalGamePoints),
        personal_delta: round(row.personalDelta),
        explanation: explanationFor(row),
      }];
    });

    const seed = Number.isFinite(Number(player.elo_seed)) ? Number(player.elo_seed) : DEFAULT_ELO;
    const values = [seed, ...events.map((event) => Number(event.elo_after))].filter(Number.isFinite);
    const computedCurrent = events.length ? Number(events[events.length - 1].elo_after) : seed;
    const current = Number.isFinite(Number(player.elo)) ? Number(player.elo) : computedCurrent;
    const clubElos = ratingRows.map((row: any) => Number(row.elo)).filter(Number.isFinite);
    const clubAverage = clubElos.length ? clubElos.reduce((sum: number, value: number) => sum + value, 0) / clubElos.length : DEFAULT_ELO;

    return res.json({
      player: {
        id: playerId,
        nickname: String(player.nickname || 'Игрок'),
        elo: round(current),
        seed: round(seed),
      },
      summary: {
        games: events.length,
        current: round(current),
        computed_current: round(computedCurrent),
        peak: round(Math.max(...values)),
        floor: round(Math.min(...values)),
        net: round(computedCurrent - seed),
        last_delta: events.length ? Number(events[events.length - 1].elo_delta) : 0,
      },
      preview: {
        basis: `Средний Elo остальных игроков клуба: ${Math.round(clubAverage)}. Личные игровые баллы в прогнозе = 0.`,
        red: {
          win: previewOutcome(playerId, current, clubAverage, 'red', true),
          loss: previewOutcome(playerId, current, clubAverage, 'red', false),
        },
        black: {
          win: previewOutcome(playerId, current, clubAverage, 'black', true),
          loss: previewOutcome(playerId, current, clubAverage, 'black', false),
        },
      },
      events,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось построить Elo-карьеру' });
  }
});

router.get('/evening-summaries', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const db = (req as any).db;
    const summaries = await loadPlayerEveningSummaries(db, playerId, 10);
    return res.json({ summaries });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить итоги вечеров' });
  }
});

router.get('/evening-summaries/:eveningId', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const db = (req as any).db;
    const summaries = await loadPlayerEveningSummaries(db, playerId, 30);
    const summary = summaries.find((item) => item.id === String(req.params.eveningId));
    if (!summary) return res.status(404).json({ error: 'Итог вечера не найден или недоступен' });
    return res.json({ summary });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить итог вечера' });
  }
});

export default router;
