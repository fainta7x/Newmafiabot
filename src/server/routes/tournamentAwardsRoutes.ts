import { Router } from 'express';
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
  const db = req.db as DatabaseWrapper;
  try {
    res.json(await loadTournamentAwardSnapshot(db, req.params.id));
  } catch (err: any) {
    res.status(err.message === 'Турнир не найден' ? 404 : 500).json({ error: err.message || 'Ошибка загрузки наград' });
  }
});

router.put('/:id/awards/:awardKey', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = req.params.id;
  const awardKey = req.params.awardKey;

  if (!isTournamentAwardKey(awardKey)) {
    return res.status(400).json({ error: 'Неизвестный тип награды' });
  }
  const awardDefinition = getTournamentAwardDefinition(awardKey);
  if (awardDefinition?.kind === 'nomination') {
    return res.status(400).json({ error: 'Победители номинаций определяются автоматически по каноническим критериям.' });
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
  const db = req.db as DatabaseWrapper;
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
