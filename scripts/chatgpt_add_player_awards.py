from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


# 1. Persistent manual award overrides.
Path('drizzle/0006_tournament_award_overrides.sql').write_text('''CREATE TABLE IF NOT EXISTS tournament_award_overrides (\n  id TEXT PRIMARY KEY,\n  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,\n  award_key TEXT NOT NULL,\n  player_id TEXT REFERENCES players(id) ON DELETE SET NULL,\n  action TEXT NOT NULL DEFAULT 'assign',\n  comment TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  UNIQUE(tournament_id, award_key)\n);\n\nCREATE INDEX IF NOT EXISTS idx_tournament_award_overrides_player\nON tournament_award_overrides(player_id);\n''', encoding='utf-8')

replace_once(
    'src/db/index.ts',
    """  const migration5SqlPath = path.join(process.cwd(), 'drizzle', '0005_tournament_game_best_moves.sql');\n  if (fs.existsSync(migration5SqlPath)) {\n    const migration5Sql = fs.readFileSync(migration5SqlPath, 'utf8');\n    dbWrapper.sqlite.exec(migration5Sql);\n  }\n\n  addColumnIfNotExists('tournament_games', 'draft_protocol_json', 'TEXT');\n""",
    """  const migration5SqlPath = path.join(process.cwd(), 'drizzle', '0005_tournament_game_best_moves.sql');\n  if (fs.existsSync(migration5SqlPath)) {\n    const migration5Sql = fs.readFileSync(migration5SqlPath, 'utf8');\n    dbWrapper.sqlite.exec(migration5Sql);\n  }\n\n  const migration6SqlPath = path.join(process.cwd(), 'drizzle', '0006_tournament_award_overrides.sql');\n  if (fs.existsSync(migration6SqlPath)) {\n    const migration6Sql = fs.readFileSync(migration6SqlPath, 'utf8');\n    dbWrapper.sqlite.exec(migration6Sql);\n  }\n\n  addColumnIfNotExists('tournament_games', 'draft_protocol_json', 'TEXT');\n""",
)

# 2. Award calculation/override service. Automatic values come from the existing official tournament logic.
Path('src/server/services/tournamentAwardsService.ts').write_text(r'''import type { DatabaseWrapper } from '../../db/index.ts';
import { internalGetNominations, internalGetStandings } from '../routes/tournamentsRoutes.ts';

export type TournamentAwardKind = 'placement' | 'nomination';
export type TournamentAwardSource = 'automatic' | 'manual' | 'suppressed' | 'unresolved';

export const TOURNAMENT_AWARD_DEFINITIONS = [
  { key: 'place_1', kind: 'placement', title: '1 место', place: 1, category: null },
  { key: 'place_2', kind: 'placement', title: '2 место', place: 2, category: null },
  { key: 'place_3', kind: 'placement', title: '3 место', place: 3, category: null },
  { key: 'nomination_best_citizen', kind: 'nomination', title: 'Лучший мирный', place: null, category: 'best_citizen' },
  { key: 'nomination_best_mafia', kind: 'nomination', title: 'Лучшая мафия', place: null, category: 'best_mafia' },
  { key: 'nomination_best_sheriff', kind: 'nomination', title: 'Лучший Шериф', place: null, category: 'best_sheriff' },
  { key: 'nomination_best_don', kind: 'nomination', title: 'Лучший Дон', place: null, category: 'best_don' },
  { key: 'nomination_mvp', kind: 'nomination', title: 'MVP', place: null, category: 'mvp' },
] as const;

export type TournamentAwardKey = typeof TOURNAMENT_AWARD_DEFINITIONS[number]['key'];

export interface TournamentAwardSlot {
  key: TournamentAwardKey;
  kind: TournamentAwardKind;
  title: string;
  place: number | null;
  category: string | null;
  player_id: string | null;
  player_nickname: string | null;
  participant_id: string | null;
  source: TournamentAwardSource;
  comment: string | null;
  calculated_player_id: string | null;
  calculated_player_nickname: string | null;
}

export interface PlayerTournamentAward {
  id: string;
  key: TournamentAwardKey;
  kind: TournamentAwardKind;
  title: string;
  place: number | null;
  category: string | null;
  tournament_id: string;
  tournament_title: string;
  tournament_date: string | null;
  source: 'automatic' | 'manual';
  comment: string | null;
}

export interface PlayerAwardStats {
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaces: number;
  nominations: number;
}

export const isTournamentAwardKey = (value: string): value is TournamentAwardKey =>
  TOURNAMENT_AWARD_DEFINITIONS.some((item) => item.key === value);

export const getTournamentAwardDefinition = (key: string) =>
  TOURNAMENT_AWARD_DEFINITIONS.find((item) => item.key === key) || null;

export const buildPlayerAwardStats = (awards: Array<Pick<PlayerTournamentAward, 'key' | 'kind'>>): PlayerAwardStats => ({
  firstPlaces: awards.filter((award) => award.key === 'place_1').length,
  secondPlaces: awards.filter((award) => award.key === 'place_2').length,
  thirdPlaces: awards.filter((award) => award.key === 'place_3').length,
  nominations: awards.filter((award) => award.kind === 'nomination').length,
});

const getParticipants = async (db: DatabaseWrapper, tournamentId: string) => db.all<any>(`
  SELECT tp.id AS participant_id, tp.player_id,
         COALESCE(tp.display_name, p.nickname, 'Участник') AS display_name
    FROM tournament_participants tp
    LEFT JOIN players p ON p.id = tp.player_id
   WHERE tp.tournament_id = ?
`, [tournamentId]);

export async function loadTournamentAwardSnapshot(db: DatabaseWrapper, tournamentId: string) {
  const tournament = await db.get<any>('SELECT id, title, date, status FROM tournaments WHERE id = ?', [tournamentId]);
  if (!tournament) throw new Error('Турнир не найден');

  const participants = await getParticipants(db, tournamentId);
  const byParticipant = new Map(participants.map((item: any) => [String(item.participant_id), item]));
  const byPlayer = new Map(participants.map((item: any) => [String(item.player_id), item]));
  const calculatedOwners = new Map<TournamentAwardKey, any>();

  if (tournament.status === 'completed') {
    const [standingsData, nominationsData] = await Promise.all([
      internalGetStandings(db, tournamentId),
      internalGetNominations(db, tournamentId),
    ]);

    for (const definition of TOURNAMENT_AWARD_DEFINITIONS) {
      if (definition.kind === 'placement') {
        const candidates = (standingsData.standings || []).filter((item: any) =>
          Number(item.official_place ?? item.place) === definition.place && Number(item.games_played || 0) > 0
        );
        if (candidates.length === 1) {
          const owner = byParticipant.get(String(candidates[0].participant_id));
          if (owner) calculatedOwners.set(definition.key, owner);
        }
      } else {
        const nomination = (nominationsData.nominations || []).find((item: any) => item.category === definition.category);
        if (nomination?.winner_participant_id) {
          const owner = byParticipant.get(String(nomination.winner_participant_id));
          if (owner) calculatedOwners.set(definition.key, owner);
        }
      }
    }
  }

  const overrides = await db.all<any>(
    'SELECT * FROM tournament_award_overrides WHERE tournament_id = ?',
    [tournamentId]
  );
  const overrideMap = new Map(overrides.map((item: any) => [String(item.award_key), item]));

  const slots: TournamentAwardSlot[] = TOURNAMENT_AWARD_DEFINITIONS.map((definition) => {
    const calculated = calculatedOwners.get(definition.key) || null;
    const override: any = overrideMap.get(definition.key) || null;

    let owner = calculated;
    let source: TournamentAwardSource = calculated ? 'automatic' : 'unresolved';
    let comment: string | null = null;

    if (override) {
      comment = override.comment || null;
      if (override.action === 'suppress') {
        owner = null;
        source = 'suppressed';
      } else {
        owner = override.player_id ? byPlayer.get(String(override.player_id)) || null : null;
        source = owner ? 'manual' : 'suppressed';
      }
    }

    return {
      key: definition.key,
      kind: definition.kind,
      title: definition.title,
      place: definition.place,
      category: definition.category,
      player_id: owner ? String(owner.player_id) : null,
      player_nickname: owner?.display_name || null,
      participant_id: owner ? String(owner.participant_id) : null,
      source,
      comment,
      calculated_player_id: calculated ? String(calculated.player_id) : null,
      calculated_player_nickname: calculated?.display_name || null,
    };
  });

  return {
    tournament: {
      id: String(tournament.id),
      title: tournament.title || 'Турнир',
      date: tournament.date || null,
      status: tournament.status,
    },
    slots,
  };
}

export async function loadPlayerTournamentAwards(db: DatabaseWrapper, playerId: string) {
  const tournaments = await db.all<any>(`
    SELECT DISTINCT t.id, t.title, t.date, t.status
      FROM tournament_participants tp
      JOIN tournaments t ON t.id = tp.tournament_id
     WHERE tp.player_id = ? AND t.status = 'completed'
     ORDER BY t.date DESC, t.title ASC
  `, [playerId]);

  const awards: PlayerTournamentAward[] = [];

  for (const tournament of tournaments) {
    const snapshot = await loadTournamentAwardSnapshot(db, String(tournament.id));
    for (const slot of snapshot.slots) {
      if (slot.player_id !== String(playerId)) continue;
      if (slot.source !== 'automatic' && slot.source !== 'manual') continue;
      awards.push({
        id: `${tournament.id}:${slot.key}`,
        key: slot.key,
        kind: slot.kind,
        title: slot.title,
        place: slot.place,
        category: slot.category,
        tournament_id: String(tournament.id),
        tournament_title: tournament.title || 'Турнир',
        tournament_date: tournament.date || null,
        source: slot.source,
        comment: slot.comment,
      });
    }
  }

  awards.sort((a, b) => {
    const dateDiff = new Date(b.tournament_date || 0).getTime() - new Date(a.tournament_date || 0).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.title.localeCompare(b.title, 'ru');
  });

  return {
    awards,
    stats: buildPlayerAwardStats(awards),
    tournaments: tournaments.map((item: any) => ({
      id: String(item.id),
      title: item.title || 'Турнир',
      date: item.date || null,
    })),
  };
}
''', encoding='utf-8')

# 3. Organizer endpoints for official award overrides.
Path('src/server/routes/tournamentAwardsRoutes.ts').write_text(r'''import { Router } from 'express';
import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { createPreviewCheckpoint } from '../../db/previewDatabaseCheckpoint.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  getTournamentAwardDefinition,
  isTournamentAwardKey,
  loadTournamentAwardSnapshot,
  type TournamentAwardKey,
} from '../services/tournamentAwardsService.ts';

const router = Router();

const checkpointAfterMutation = async (db: DatabaseWrapper) => {
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_PATH) return undefined;
  const result = await createPreviewCheckpoint(db);
  return result.success ? undefined : result.message;
};

const upsertOverride = async (
  db: DatabaseWrapper,
  tournamentId: string,
  awardKey: TournamentAwardKey,
  playerId: string | null,
  action: 'assign' | 'suppress',
  comment: string | null,
) => {
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO tournament_award_overrides
      (id, tournament_id, award_key, player_id, action, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tournament_id, award_key) DO UPDATE SET
       player_id = excluded.player_id,
       action = excluded.action,
       comment = excluded.comment,
       updated_at = excluded.updated_at`,
    [crypto.randomUUID(), tournamentId, awardKey, playerId, action, comment, now, now]
  );
};

router.get('/:id/awards', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  const db = (req as any).db as DatabaseWrapper;
  try {
    res.json(await loadTournamentAwardSnapshot(db, req.params.id));
  } catch (err: any) {
    res.status(err.message === 'Турнир не найден' ? 404 : 500).json({ error: err.message || 'Ошибка загрузки наград' });
  }
});

router.put('/:id/awards/:awardKey', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  const db = (req as any).db as DatabaseWrapper;
  const tournamentId = req.params.id;
  const awardKey = req.params.awardKey;

  if (!isTournamentAwardKey(awardKey)) {
    return res.status(400).json({ error: 'Неизвестный тип награды' });
  }

  try {
    const tournament = await db.get<any>('SELECT id, status FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    if (tournament.status !== 'completed') {
      return res.status(400).json({ error: 'Награды можно фиксировать вручную только для завершённого турнира' });
    }

    const mode = req.body?.mode === 'suppress' ? 'suppress' : 'assign';
    const comment = typeof req.body?.comment === 'string' && req.body.comment.trim()
      ? req.body.comment.trim().slice(0, 500)
      : null;

    if (mode === 'suppress') {
      await upsertOverride(db, tournamentId, awardKey, null, 'suppress', comment);
    } else {
      const playerId = String(req.body?.player_id || '').trim();
      if (!playerId) return res.status(400).json({ error: 'Не указан игрок для награды' });

      const participant = await db.get<any>(
        'SELECT id FROM tournament_participants WHERE tournament_id = ? AND player_id = ?',
        [tournamentId, playerId]
      );
      if (!participant) {
        return res.status(400).json({ error: 'Награду можно назначить только участнику этого турнира' });
      }

      const definition = getTournamentAwardDefinition(awardKey)!;

      await db.transaction(async (tx) => {
        if (definition.kind === 'placement') {
          const snapshot = await loadTournamentAwardSnapshot(tx, tournamentId);
          const targetSlot = snapshot.slots.find((slot) => slot.key === awardKey)!;
          const previousSlot = snapshot.slots.find(
            (slot) => slot.kind === 'placement' && slot.key !== awardKey && slot.player_id === playerId
          );
          const displacedPlayerId = targetSlot.player_id && targetSlot.player_id !== playerId
            ? targetSlot.player_id
            : null;

          await upsertOverride(tx, tournamentId, awardKey, playerId, 'assign', comment);

          if (previousSlot) {
            if (displacedPlayerId) {
              await upsertOverride(
                tx,
                tournamentId,
                previousSlot.key,
                displacedPlayerId,
                'assign',
                `Автоматическая перестановка при корректировке ${definition.title}`
              );
            } else {
              await upsertOverride(
                tx,
                tournamentId,
                previousSlot.key,
                null,
                'suppress',
                `Освобождено при корректировке ${definition.title}`
              );
            }
          }
        } else {
          await upsertOverride(tx, tournamentId, awardKey, playerId, 'assign', comment);
        }
      });
    }

    const snapshot = await loadTournamentAwardSnapshot(db, tournamentId);
    const checkpoint_warning = await checkpointAfterMutation(db);
    res.json({ ...snapshot, checkpoint_warning });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка сохранения награды' });
  }
});

router.delete('/:id/awards/:awardKey', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  const db = (req as any).db as DatabaseWrapper;
  const tournamentId = req.params.id;
  const awardKey = req.params.awardKey;

  if (!isTournamentAwardKey(awardKey)) {
    return res.status(400).json({ error: 'Неизвестный тип награды' });
  }

  try {
    await db.run(
      'DELETE FROM tournament_award_overrides WHERE tournament_id = ? AND award_key = ?',
      [tournamentId, awardKey]
    );
    const snapshot = await loadTournamentAwardSnapshot(db, tournamentId);
    const checkpoint_warning = await checkpointAfterMutation(db);
    res.json({ ...snapshot, checkpoint_warning });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка возврата к автоматическому результату' });
  }
});

export default router;
''', encoding='utf-8')

replace_once(
    'src/app.ts',
    "import tournamentProtocolRoutes from './server/routes/tournamentProtocolRoutes.ts';\nimport botRoutes from './server/routes/botRoutes.ts';\n",
    "import tournamentProtocolRoutes from './server/routes/tournamentProtocolRoutes.ts';\nimport tournamentAwardsRoutes from './server/routes/tournamentAwardsRoutes.ts';\nimport botRoutes from './server/routes/botRoutes.ts';\n",
)
replace_once(
    'src/app.ts',
    "  app.use('/api/tournaments', tournamentProtocolRoutes);\n  app.use('/api/bot', botRoutes);\n",
    "  app.use('/api/tournaments', tournamentProtocolRoutes);\n  app.use('/api/tournaments', tournamentAwardsRoutes);\n  app.use('/api/bot', botRoutes);\n",
)

# 4. Add awards to player profile payload.
replace_once(
    'src/server/services/playerProfileService.ts',
    "export type PlayerGameSource = 'club' | 'tournament';\n",
    "import { loadPlayerTournamentAwards } from './tournamentAwardsService.ts';\n\nexport type PlayerGameSource = 'club' | 'tournament';\n",
)
replace_once(
    'src/server/services/playerProfileService.ts',
    """  return {\n    clubGames,\n    tournamentGames,\n    gameStats: buildPlayerProfileStats(allGames),\n  };\n};\n""",
    """  const awardProfile = await loadPlayerTournamentAwards(db, playerId);\n\n  return {\n    clubGames,\n    tournamentGames,\n    gameStats: buildPlayerProfileStats(allGames),\n    tournamentAwards: awardProfile.awards,\n    awardStats: awardProfile.stats,\n    awardTournaments: awardProfile.tournaments,\n  };\n};\n""",
)

# 5. Clear manual award overrides when a completed tournament is reopened for correction.
replace_once(
    'src/server/routes/tournamentsRoutes.ts',
    """      if (invalidatedCount > 0) {\n        await tx.run(\n          'DELETE FROM tournament_final_resolutions WHERE tournament_id = ?',\n          [tournamentId]\n        );\n      }\n\n      const now = new Date().toISOString();\n""",
    """      if (invalidatedCount > 0) {\n        await tx.run(\n          'DELETE FROM tournament_final_resolutions WHERE tournament_id = ?',\n          [tournamentId]\n        );\n      }\n\n      const awardOverrides = await tx.all<any>(\n        'SELECT id FROM tournament_award_overrides WHERE tournament_id = ?',\n        [tournamentId]\n      );\n      const invalidatedAwardOverridesCount = awardOverrides.length;\n      if (invalidatedAwardOverridesCount > 0) {\n        await tx.run(\n          'DELETE FROM tournament_award_overrides WHERE tournament_id = ?',\n          [tournamentId]\n        );\n      }\n\n      const now = new Date().toISOString();\n""",
)
replace_once(
    'src/server/routes/tournamentsRoutes.ts',
    """      return {\n        invalidated_resolutions_count: invalidatedCount,\n      };\n""",
    """      return {\n        invalidated_resolutions_count: invalidatedCount,\n        invalidated_award_overrides_count: invalidatedAwardOverridesCount,\n      };\n""",
)
replace_once(
    'src/server/routes/tournamentsRoutes.ts',
    """      invalidated_resolutions_count: result.invalidated_resolutions_count,\n    });\n""",
    """      invalidated_resolutions_count: result.invalidated_resolutions_count,\n      invalidated_award_overrides_count: result.invalidated_award_overrides_count,\n    });\n""",
)

# 6. Front-end API types/methods.
api_path = Path('src/lib/api.ts')
api_text = api_path.read_text(encoding='utf-8')
anchor = """export interface PlayerGameProfileStats {\n  totalGames: number;\n  completedGames: number;\n  wins: number;\n  losses: number;\n  winRate: number;\n  clubGames: number;\n  tournamentGames: number;\n  redGames: number;\n  blackGames: number;\n  bestMoves: number;\n  firstKilled: number;\n  zeroRoundVoted: number;\n  lastGameAt: string | null;\n  roleCounts: { citizen: number; sheriff: number; mafia: number; don: number; unknown: number };\n}\n\n"""
if anchor not in api_text:
    raise SystemExit('api stats anchor not found')
api_types = anchor + """export type PlayerAwardKey =\n  | 'place_1'\n  | 'place_2'\n  | 'place_3'\n  | 'nomination_best_citizen'\n  | 'nomination_best_mafia'\n  | 'nomination_best_sheriff'\n  | 'nomination_best_don'\n  | 'nomination_mvp';\n\nexport interface PlayerTournamentAward {\n  id: string;\n  key: PlayerAwardKey;\n  kind: 'placement' | 'nomination';\n  title: string;\n  place: number | null;\n  category: string | null;\n  tournament_id: string;\n  tournament_title: string;\n  tournament_date: string | null;\n  source: 'automatic' | 'manual';\n  comment: string | null;\n}\n\nexport interface PlayerAwardStats {\n  firstPlaces: number;\n  secondPlaces: number;\n  thirdPlaces: number;\n  nominations: number;\n}\n\nexport interface PlayerAwardTournament {\n  id: string;\n  title: string;\n  date: string | null;\n}\n\nexport interface TournamentAwardSlot {\n  key: PlayerAwardKey;\n  kind: 'placement' | 'nomination';\n  title: string;\n  place: number | null;\n  category: string | null;\n  player_id: string | null;\n  player_nickname: string | null;\n  participant_id: string | null;\n  source: 'automatic' | 'manual' | 'suppressed' | 'unresolved';\n  comment: string | null;\n  calculated_player_id: string | null;\n  calculated_player_nickname: string | null;\n}\n\nexport interface TournamentAwardsResponse {\n  tournament: { id: string; title: string; date: string | null; status: string };\n  slots: TournamentAwardSlot[];\n  checkpoint_warning?: string;\n}\n\n"""
api_text = api_text.replace(anchor, api_types, 1)
api_text = api_text.replace(
    """  tournamentGames: PlayerGameHistoryItem[];\n  gameStats: PlayerGameProfileStats;\n}\n""",
    """  tournamentGames: PlayerGameHistoryItem[];\n  gameStats: PlayerGameProfileStats;\n  tournamentAwards: PlayerTournamentAward[];\n  awardStats: PlayerAwardStats;\n  awardTournaments: PlayerAwardTournament[];\n}\n""",
    1,
)
api_text = api_text.replace(
    """  getPlayer: (id: string) => request<PlayerDetails>(`/api/players/${id}`),\n  createPlayer: (data: Partial<Player>) => request<Player>('/api/players', { method: 'POST', body: JSON.stringify(data) }),\n""",
    """  getPlayer: (id: string) => request<PlayerDetails>(`/api/players/${id}`),\n  getTournamentAwards: (tournamentId: string) =>\n    request<TournamentAwardsResponse>(`/api/tournaments/${tournamentId}/awards`),\n  setTournamentAwardOverride: (\n    tournamentId: string,\n    awardKey: PlayerAwardKey,\n    data: { player_id?: string; mode?: 'assign' | 'suppress'; comment?: string }\n  ) => request<TournamentAwardsResponse>(`/api/tournaments/${tournamentId}/awards/${awardKey}`, {\n    method: 'PUT',\n    body: JSON.stringify(data),\n  }),\n  resetTournamentAwardOverride: (tournamentId: string, awardKey: PlayerAwardKey) =>\n    request<TournamentAwardsResponse>(`/api/tournaments/${tournamentId}/awards/${awardKey}`, { method: 'DELETE' }),\n  createPlayer: (data: Partial<Player>) => request<Player>('/api/players', { method: 'POST', body: JSON.stringify(data) }),\n""",
    1,
)
api_path.write_text(api_text, encoding='utf-8')

# 7. Full player profile UI with clickable award counters and organizer editing.
Path('src/components/crm/PlayerProfileContent.tsx').write_text(r'''import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CalendarDays,
  ChevronRight,
  CircleDot,
  Crown,
  Gamepad2,
  Medal,
  Plus,
  RotateCcw,
  Shield,
  Skull,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import {
  api,
  type PlayerAwardKey,
  type PlayerAwardStats,
  type PlayerAwardTournament,
  type PlayerDetails,
  type PlayerGameHistoryItem,
  type PlayerTournamentAward,
} from '../../lib/api.ts';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';

type ProfileTab = 'overview' | 'games' | 'tournaments' | 'evenings';
type AwardFilter = 'place_1' | 'place_2' | 'place_3' | 'nominations';

const nominationOptions: Array<{ key: PlayerAwardKey; label: string }> = [
  { key: 'nomination_best_citizen', label: 'Лучший мирный' },
  { key: 'nomination_best_mafia', label: 'Лучшая мафия' },
  { key: 'nomination_best_sheriff', label: 'Лучший Шериф' },
  { key: 'nomination_best_don', label: 'Лучший Дон' },
  { key: 'nomination_mvp', label: 'MVP' },
];

const roleInfo = (role: string | null) => {
  if (role === 'don') return { label: 'Дон', icon: '🎩', cls: 'text-purple-300 border-purple-500/30 bg-purple-500/10' };
  if (role === 'mafia') return { label: 'Мафия', icon: '🔫', cls: 'text-rose-300 border-rose-500/30 bg-rose-500/10' };
  if (role === 'sheriff') return { label: 'Шериф', icon: '⭐', cls: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' };
  if (role === 'citizen') return { label: 'Мирный', icon: '❤️', cls: 'text-sky-300 border-sky-500/30 bg-sky-500/10' };
  return { label: 'Роль не указана', icon: '•', cls: 'text-slate-400 border-slate-700 bg-slate-800/40' };
};

const exitLabel = (value: string | null) => {
  if (value === 'killed') return 'Убит ночью';
  if (value === 'voted_zero_round') return 'Ушёл в 0 круге';
  if (value === 'voted_day') return 'Ушёл голосованием';
  if (value === 'removed') return 'Удалён';
  if (value === 'alive') return 'Дожил до конца';
  return value || '—';
};

const fmtDate = (value: string | null | undefined) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
};

const GameCard: React.FC<{ game: PlayerGameHistoryItem }> = ({ game }) => {
  const role = roleInfo(game.role);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black text-white truncate">{game.title}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{fmtDate(game.date)} · Игра #{game.game_number || '—'}{game.table_name ? ` · ${game.table_name}` : ''}</div>
        </div>
        {game.status === 'completed' ? (
          <span className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black ${game.won ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
            {game.won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}
          </span>
        ) : (
          <span className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[9px] font-black text-slate-400">{game.status.toUpperCase()}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${role.cls}`}>{role.icon} {role.label}</span>
        <span className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-300">Место #{game.seat_number || '—'}</span>
        {game.best_move && <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300">🏆 ЛХ</span>}
        {game.first_killed && <span className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-300">ПУ</span>}
        {game.zero_round_voted && <span className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] font-bold text-orange-300">0 круг</span>}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-xl bg-slate-900 px-2.5 py-2"><span className="text-slate-500 block">Итог за столом</span><strong className="text-slate-200">{exitLabel(game.exit_type)}</strong></div>
        <div className="rounded-xl bg-slate-900 px-2.5 py-2"><span className="text-slate-500 block">Фолы</span><strong className="text-slate-200">{game.regular_fouls} · тех {game.minor_technical_fouls + game.major_technical_fouls}</strong></div>
      </div>
    </div>
  );
};

const emptyAwardStats: PlayerAwardStats = { firstPlaces: 0, secondPlaces: 0, thirdPlaces: 0, nominations: 0 };

export const PlayerProfileContent: React.FC<{ player: PlayerDetails }> = ({ player }) => {
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [awardFilter, setAwardFilter] = useState<AwardFilter | null>(null);
  const [awardList, setAwardList] = useState<PlayerTournamentAward[]>(player.tournamentAwards || []);
  const [awardStats, setAwardStats] = useState<PlayerAwardStats>(player.awardStats || emptyAwardStats);
  const [awardTournaments, setAwardTournaments] = useState<PlayerAwardTournament[]>(player.awardTournaments || []);
  const [showAwardEditor, setShowAwardEditor] = useState(false);
  const [awardTournamentId, setAwardTournamentId] = useState(player.awardTournaments?.[0]?.id || '');
  const [awardKey, setAwardKey] = useState<PlayerAwardKey>('place_1');
  const [awardComment, setAwardComment] = useState('');
  const [awardSaving, setAwardSaving] = useState(false);
  const [awardError, setAwardError] = useState<string | null>(null);

  const stats = player.gameStats;
  const allGames = useMemo(() => [...(player.clubGames || []), ...(player.tournamentGames || [])].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()), [player.clubGames, player.tournamentGames]);
  const recentGames = allGames.slice(0, 3);
  const visits = player.stats?.attendanceCount ?? player.attendance_count ?? 0;

  useEffect(() => {
    setAwardList(player.tournamentAwards || []);
    setAwardStats(player.awardStats || emptyAwardStats);
    setAwardTournaments(player.awardTournaments || []);
    if (!awardTournamentId && player.awardTournaments?.[0]?.id) setAwardTournamentId(player.awardTournaments[0].id);
  }, [player]);

  const refreshAwards = async () => {
    const fresh = await api.getPlayer(player.id);
    setAwardList(fresh.tournamentAwards || []);
    setAwardStats(fresh.awardStats || emptyAwardStats);
    setAwardTournaments(fresh.awardTournaments || []);
  };

  const openAwardHistory = (filter: AwardFilter) => {
    setAwardFilter(filter);
    setShowAwardEditor(false);
    setAwardError(null);
    setAwardComment('');
    if (filter === 'nominations') setAwardKey('nomination_best_citizen');
    else setAwardKey(filter);
    if (!awardTournamentId && awardTournaments[0]) setAwardTournamentId(awardTournaments[0].id);
  };

  const filteredAwards = awardList.filter((award) => {
    if (awardFilter === 'nominations') return award.kind === 'nomination';
    return awardFilter ? award.key === awardFilter : false;
  });

  const handleAssignAward = async () => {
    if (!awardTournamentId) return;
    setAwardSaving(true);
    setAwardError(null);
    try {
      await api.setTournamentAwardOverride(awardTournamentId, awardKey, {
        player_id: player.id,
        mode: 'assign',
        comment: awardComment || undefined,
      });
      await refreshAwards();
      setAwardComment('');
      setShowAwardEditor(false);
    } catch (err: any) {
      setAwardError(err.message || 'Не удалось сохранить награду');
    } finally {
      setAwardSaving(false);
    }
  };

  const handleSuppressAward = async (award: PlayerTournamentAward) => {
    if (!window.confirm(`Убрать «${award.title}» за турнир «${award.tournament_title}»?`)) return;
    setAwardSaving(true);
    setAwardError(null);
    try {
      await api.setTournamentAwardOverride(award.tournament_id, award.key, {
        mode: 'suppress',
        comment: `Награда снята вручную из профиля ${player.nickname}`,
      });
      await refreshAwards();
    } catch (err: any) {
      setAwardError(err.message || 'Не удалось убрать награду');
    } finally {
      setAwardSaving(false);
    }
  };

  const handleResetAward = async (award: PlayerTournamentAward) => {
    setAwardSaving(true);
    setAwardError(null);
    try {
      await api.resetTournamentAwardOverride(award.tournament_id, award.key);
      await refreshAwards();
    } catch (err: any) {
      setAwardError(err.message || 'Не удалось вернуть автоматический результат');
    } finally {
      setAwardSaving(false);
    }
  };

  const awardHistoryTitle = awardFilter === 'place_1'
    ? 'Первые места'
    : awardFilter === 'place_2'
      ? 'Вторые места'
      : awardFilter === 'place_3'
        ? 'Третьи места'
        : 'Номинации';

  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950/30 p-4 overflow-hidden relative">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <PlayerAvatar playerId={player.id} avatarVersion={player.avatar_updated_at} nickname={player.nickname} size="xl" className="ring-2 ring-rose-500/20" />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-black text-white leading-tight break-words">{player.nickname}</h2>
            {player.full_name && <p className="text-xs text-slate-400 mt-1 break-words">{player.full_name}</p>}
            {player.telegram_username && <p className="text-[11px] text-sky-400 mt-1">@{player.telegram_username.replace('@', '')}</p>}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5 mt-4 text-center">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-1.5 py-2"><span className="block text-[8px] uppercase text-slate-500">Игры</span><strong className="text-base text-white">{stats?.totalGames || 0}</strong></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-1.5 py-2"><span className="block text-[8px] uppercase text-slate-500">Победы</span><strong className="text-base text-emerald-400">{stats?.wins || 0}</strong></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-1.5 py-2"><span className="block text-[8px] uppercase text-slate-500">Винрейт</span><strong className="text-base text-amber-300">{stats?.winRate || 0}%</strong></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-1.5 py-2"><span className="block text-[8px] uppercase text-slate-500">Вечера</span><strong className="text-base text-sky-300">{visits}</strong></div>
        </div>
      </section>

      <div className="grid grid-cols-4 gap-1 rounded-2xl border border-slate-800 bg-slate-950 p-1">
        {([
          ['overview', 'Обзор'],
          ['games', 'Игры'],
          ['tournaments', 'Турниры'],
          ['evenings', 'Вечера'],
        ] as Array<[ProfileTab, string]>).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`min-h-10 rounded-xl text-[9px] font-black ${tab === id ? 'bg-rose-600 text-white' : 'text-slate-500'}`}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5">
            <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2"><Shield className="w-4 h-4 text-rose-400" /> Роли</h3>
            <div className="grid grid-cols-4 gap-1.5 mt-3 text-center">
              {[
                ['❤️', 'Мирный', stats?.roleCounts?.citizen || 0],
                ['⭐', 'Шериф', stats?.roleCounts?.sheriff || 0],
                ['🔫', 'Мафия', stats?.roleCounts?.mafia || 0],
                ['🎩', 'Дон', stats?.roleCounts?.don || 0],
              ].map(([icon, label, count]) => <div key={String(label)} className="rounded-xl bg-slate-950 p-2"><span className="text-lg block">{icon}</span><strong className="text-sm text-white block">{count}</strong><span className="text-[8px] text-slate-500">{label}</span></div>)}
            </div>
          </section>

          <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-slate-900 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2"><Medal className="w-4 h-4 text-amber-400" /> Турнирные награды</h3>
              <span className="text-[9px] text-slate-500">Нажми на статистику</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {[
                { filter: 'place_1' as AwardFilter, icon: '🥇', label: '1 место', value: awardStats.firstPlaces },
                { filter: 'place_2' as AwardFilter, icon: '🥈', label: '2 место', value: awardStats.secondPlaces },
                { filter: 'place_3' as AwardFilter, icon: '🥉', label: '3 место', value: awardStats.thirdPlaces },
                { filter: 'nominations' as AwardFilter, icon: '🏅', label: 'Номинации', value: awardStats.nominations },
              ].map((item) => (
                <button
                  key={item.filter}
                  type="button"
                  onClick={() => openAwardHistory(item.filter)}
                  className="min-h-[76px] rounded-xl border border-slate-800 bg-slate-950 p-2 transition hover:border-amber-500/40 active:scale-[0.98]"
                >
                  <span className="text-xl block">{item.icon}</span>
                  <strong className="text-base text-white block">{item.value}</strong>
                  <span className="text-[8px] text-slate-500 flex items-center justify-center gap-0.5">{item.label}<ChevronRight className="w-2.5 h-2.5" /></span>
                </button>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-center"><Trophy className="w-5 h-5 text-amber-400 mx-auto" /><strong className="text-lg text-white block mt-1">{stats?.bestMoves || 0}</strong><span className="text-[9px] text-amber-300">Лучший ход</span></div>
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-3 text-center"><Skull className="w-5 h-5 text-rose-400 mx-auto" /><strong className="text-lg text-white block mt-1">{stats?.firstKilled || 0}</strong><span className="text-[9px] text-rose-300">ПУ</span></div>
            <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3 text-center"><CircleDot className="w-5 h-5 text-orange-400 mx-auto" /><strong className="text-lg text-white block mt-1">{stats?.zeroRoundVoted || 0}</strong><span className="text-[9px] text-orange-300">0 круг</span></div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-sky-400" /> Последние игры</h3>{allGames.length > 3 && <button type="button" onClick={() => setTab('games')} className="text-[9px] font-bold text-rose-400">Все игры →</button>}</div>
            {recentGames.length ? recentGames.map((game) => <GameCard key={game.id} game={game} />) : <div className="py-6 text-center text-xs text-slate-500">Сыгранных протоколов пока нет</div>}
          </section>
        </div>
      )}

      {tab === 'games' && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 px-1"><Gamepad2 className="w-4 h-4 text-rose-400" /><h3 className="text-xs font-black uppercase text-white">Клубные игры · {player.clubGames?.length || 0}</h3></div>
          {player.clubGames?.length ? player.clubGames.map((game) => <GameCard key={game.id} game={game} />) : <div className="rounded-2xl border border-slate-800 bg-slate-900 py-10 text-center text-xs text-slate-500">Обычных игр пока нет</div>}
        </section>
      )}

      {tab === 'tournaments' && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 px-1"><Crown className="w-4 h-4 text-amber-400" /><h3 className="text-xs font-black uppercase text-white">Турнирные игры · {player.tournamentGames?.length || 0}</h3></div>
          {player.tournamentGames?.length ? player.tournamentGames.map((game) => <GameCard key={game.id} game={game} />) : <div className="rounded-2xl border border-slate-800 bg-slate-900 py-10 text-center text-xs text-slate-500">Турнирных игр пока нет</div>}
        </section>
      )}

      {tab === 'evenings' && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 px-1"><CalendarDays className="w-4 h-4 text-sky-400" /><h3 className="text-xs font-black uppercase text-white">История вечеров</h3></div>
          {player.eveningHistory?.length ? player.eveningHistory.map((item: any) => (
            <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><strong className="text-xs text-white block truncate">{item.evening_title || 'Игровой вечер'}</strong><span className="text-[10px] text-slate-500">{fmtDate(item.evening_date)}</span></div>
              <span className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-black ${item.attendance_status === 'attended' ? 'bg-emerald-500/10 text-emerald-300' : item.attendance_status === 'no_show' ? 'bg-rose-500/10 text-rose-300' : item.registration_status === 'cancelled' ? 'bg-slate-700 text-slate-400' : 'bg-sky-500/10 text-sky-300'}`}>
                {item.attendance_status === 'attended' ? 'БЫЛ' : item.attendance_status === 'no_show' ? 'НЕ ПРИШЁЛ' : item.registration_status === 'cancelled' ? 'ОТМЕНИЛ' : 'ЗАПИСАН'}
              </span>
            </div>
          )) : <div className="rounded-2xl border border-slate-800 bg-slate-900 py-10 text-center text-xs text-slate-500">Истории вечеров пока нет</div>}
        </section>
      )}

      {awardFilter && (
        <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setAwardFilter(null)}>
          <div className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-slate-800 bg-slate-950 p-4 space-y-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2"><Award className="w-5 h-5 text-amber-400" /> {awardHistoryTitle}</h3>
                <p className="text-[10px] text-slate-500 mt-1">История официальных наград по турнирам</p>
              </div>
              <button type="button" aria-label="Закрыть" onClick={() => setAwardFilter(null)} className="w-10 h-10 rounded-xl bg-slate-900 text-slate-400 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-2">
              {filteredAwards.length ? filteredAwards.map((award) => (
                <div key={award.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-black text-white">{award.title}</div>
                      <div className="text-[11px] font-bold text-amber-300 mt-0.5 break-words">{award.tournament_title}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5">{fmtDate(award.tournament_date)}</div>
                    </div>
                    <span className={`shrink-0 rounded-lg border px-2 py-1 text-[8px] font-black ${award.source === 'manual' ? 'border-sky-500/30 bg-sky-500/10 text-sky-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>
                      {award.source === 'manual' ? 'РУЧНАЯ ПРАВКА' : 'ПО ИТОГАМ'}
                    </span>
                  </div>
                  {award.comment && <div className="rounded-xl bg-slate-950 px-2.5 py-2 text-[10px] text-slate-400">{award.comment}</div>}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button type="button" disabled={awardSaving} onClick={() => handleSuppressAward(award)} className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-[9px] font-bold text-rose-300 disabled:opacity-50">Убрать</button>
                    {award.source === 'manual' && (
                      <button type="button" disabled={awardSaving} onClick={() => handleResetAward(award)} className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[9px] font-bold text-slate-300 flex items-center gap-1 disabled:opacity-50"><RotateCcw className="w-3 h-3" />Вернуть расчёт</button>
                    )}
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 py-8 text-center text-xs text-slate-500">Таких наград пока нет</div>
              )}
            </div>

            {awardError && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-[10px] text-rose-300">{awardError}</div>}

            {!showAwardEditor ? (
              <button type="button" onClick={() => setShowAwardEditor(true)} className="w-full min-h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-black flex items-center justify-center gap-2"><Plus className="w-4 h-4" />Добавить / исправить награду</button>
            ) : (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-3">
                <div className="flex items-center justify-between"><strong className="text-xs text-white">Ручная корректировка</strong><button type="button" onClick={() => setShowAwardEditor(false)} className="text-[10px] text-slate-500">Закрыть</button></div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Турнир</label>
                  <select value={awardTournamentId} onChange={(event) => setAwardTournamentId(event.target.value)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white">
                    <option value="">Выбери турнир</option>
                    {awardTournaments.map((item) => <option key={item.id} value={item.id}>{item.title} · {fmtDate(item.date)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Награда</label>
                  {awardFilter === 'nominations' ? (
                    <select value={awardKey} onChange={(event) => setAwardKey(event.target.value as PlayerAwardKey)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white">
                      {nominationOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  ) : (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs font-bold text-amber-300">{awardHistoryTitle.replace('ые места', 'ое место').replace('Первые места', '1 место').replace('Вторые места', '2 место').replace('Третьи места', '3 место')}</div>
                  )}
                </div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Комментарий, необязательно</label>
                  <input value={awardComment} onChange={(event) => setAwardComment(event.target.value)} maxLength={500} placeholder="Например: решение главного судьи" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" />
                </div>
                <p className="text-[9px] leading-relaxed text-slate-500">Назначение заменит текущего обладателя этой награды. Для призовых мест, если оба игрока уже в топ-3, система автоматически поменяет их местами.</p>
                <button type="button" disabled={awardSaving || !awardTournamentId} onClick={handleAssignAward} className="w-full min-h-11 rounded-xl bg-amber-500 text-slate-950 text-xs font-black disabled:opacity-50">{awardSaving ? 'Сохранение…' : `Назначить: ${player.nickname}`}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
''', encoding='utf-8')

# 8. Tests for award keys/stat counters.
Path('src/tests/tournamentAwardsService.test.ts').write_text(r'''import { describe, expect, it } from 'vitest';
import {
  buildPlayerAwardStats,
  getTournamentAwardDefinition,
  isTournamentAwardKey,
  TOURNAMENT_AWARD_DEFINITIONS,
} from '../server/services/tournamentAwardsService.ts';

describe('tournament awards service', () => {
  it('defines exactly three placements and five nomination categories', () => {
    expect(TOURNAMENT_AWARD_DEFINITIONS.filter((item) => item.kind === 'placement')).toHaveLength(3);
    expect(TOURNAMENT_AWARD_DEFINITIONS.filter((item) => item.kind === 'nomination')).toHaveLength(5);
    expect(getTournamentAwardDefinition('nomination_mvp')?.title).toBe('MVP');
  });

  it('validates supported award keys', () => {
    expect(isTournamentAwardKey('place_1')).toBe(true);
    expect(isTournamentAwardKey('nomination_best_don')).toBe(true);
    expect(isTournamentAwardKey('place_4')).toBe(false);
  });

  it('counts podium places and nominations independently', () => {
    const stats = buildPlayerAwardStats([
      { key: 'place_1', kind: 'placement' },
      { key: 'place_1', kind: 'placement' },
      { key: 'place_2', kind: 'placement' },
      { key: 'place_3', kind: 'placement' },
      { key: 'nomination_mvp', kind: 'nomination' },
      { key: 'nomination_best_citizen', kind: 'nomination' },
    ] as any);

    expect(stats).toEqual({ firstPlaces: 2, secondPlaces: 1, thirdPlaces: 1, nominations: 2 });
  });
});
''', encoding='utf-8')

print('Player tournament awards patch applied')
