import { Router, type Response } from 'express';
import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { internalGetNominations } from './tournamentsRoutesBase.ts';
import { getFlexibleTournamentStandings } from '../services/flexibleTournamentStandingsService.ts';

const router = Router();

const loadFinalReadiness = async (db: DatabaseWrapper, tournamentId: string) => {
  const [standingsData, nominationsData] = await Promise.all([
    getFlexibleTournamentStandings(db, tournamentId),
    internalGetNominations(db, tournamentId),
  ]);

  const standingsResolutions = await db.all<any>(
    "SELECT * FROM tournament_final_resolutions WHERE tournament_id = ? AND type = 'standings_tie'",
    [tournamentId],
  );
  const resolvedGroups = new Set<string>();
  for (const resolution of standingsResolutions) {
    let participantIds: string[] = [];
    try { participantIds = JSON.parse(resolution.participant_ids_json || '[]'); } catch {}
    resolvedGroups.add([...participantIds].sort().join(','));
  }

  const unresolvedStandings = (standingsData.tie_groups || [])
    .filter((group: any) => !resolvedGroups.has([...group.participant_ids].sort().join(',')))
    .map((group: any) => ({
      tie_group_id: group.tie_group_id,
      participant_ids: group.participant_ids,
      display_names: group.participant_ids.map((participantId: string) =>
        standingsData.standings.find((item: any) => String(item.participant_id) === String(participantId))?.display_name || participantId),
    }));

  const unresolvedNominations = (nominationsData.nominations || [])
    .filter((category: any) => category.has_tie)
    .map((category: any) => {
      const candidateIds = category.comparison?.tied_participant_ids || [];
      return {
        category: category.category,
        title: category.title,
        candidate_ids: candidateIds,
        display_names: (category.candidates || [])
          .filter((candidate: any) => candidateIds.includes(candidate.participant_id))
          .map((candidate: any) => candidate.display_name),
      };
    });

  return {
    ready: unresolvedStandings.length === 0 && unresolvedNominations.length === 0,
    unresolved_standings_ties: unresolvedStandings,
    unresolved_nomination_ties: unresolvedNominations,
    standings: standingsData,
  };
};

router.get('/:tournamentId/standings', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  try {
    res.json(await getFlexibleTournamentStandings(db, req.params.tournamentId));
  } catch (err: any) {
    res.status(err?.message === 'Турнир не найден' ? 404 : 500).json({ error: err?.message || 'Ошибка вычисления турнирной таблицы' });
  }
});

router.get('/:id/final-readiness', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  try {
    if (!await db.get('SELECT id FROM tournaments WHERE id = ?', [req.params.id])) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }
    const readiness = await loadFinalReadiness(db, req.params.id);
    res.json({
      ready: readiness.ready,
      unresolved_standings_ties: readiness.unresolved_standings_ties,
      unresolved_nomination_ties: readiness.unresolved_nomination_ties,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Ошибка проверки готовности результатов' });
  }
});

router.put('/:id/final-resolutions/standings/:tieGroupId', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = req.params.id;
  try {
    const tournament = await db.get<any>('SELECT id, status FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    if (tournament.status !== 'completed') return res.status(400).json({ error: 'Решения разрешены только для completed-турнира' });

    const orderedIds = req.body?.ordered_participant_ids;
    const method = req.body?.resolution_method;
    if (!Array.isArray(orderedIds) || orderedIds.length < 2) {
      return res.status(400).json({ error: 'Должен быть передан массив упорядоченных участников длиной от 2' });
    }
    if (!['draw', 'chief_judge_decision'].includes(method)) {
      return res.status(400).json({ error: 'Неверный способ решения' });
    }

    const standings = await getFlexibleTournamentStandings(db, tournamentId);
    const group = standings.tie_groups.find((item: any) => item.tie_group_id === req.params.tieGroupId);
    if (!group) return res.status(400).json({ error: 'Группа равенства не найдена или неактивна' });
    if ([...orderedIds].sort().join(',') !== [...group.participant_ids].sort().join(',')) {
      return res.status(400).json({ error: 'Состав решения не совпадает с текущей группой равенства' });
    }

    const now = new Date().toISOString();
    const groupKey = [...group.participant_ids].sort().join(',');
    const existing = (await db.all<any>(
      "SELECT * FROM tournament_final_resolutions WHERE tournament_id = ? AND type = 'standings_tie'",
      [tournamentId],
    )).find((item: any) => {
      let participantIds: string[] = [];
      try { participantIds = JSON.parse(item.participant_ids_json || '[]'); } catch {}
      return [...participantIds].sort().join(',') === groupKey;
    });

    if (existing) {
      await db.run(
        `UPDATE tournament_final_resolutions
            SET ordered_participant_ids_json = ?, resolution_method = ?, comment = ?, updated_at = ?
          WHERE id = ?`,
        [JSON.stringify(orderedIds), method, req.body?.comment || null, now, existing.id],
      );
    } else {
      await db.run(
        `INSERT INTO tournament_final_resolutions (
           id, tournament_id, type, category, participant_ids_json,
           ordered_participant_ids_json, winner_participant_id, resolution_method, comment, created_at, updated_at
         ) VALUES (?, ?, 'standings_tie', NULL, ?, ?, NULL, ?, ?, ?, ?)`,
        [crypto.randomUUID(), tournamentId, JSON.stringify(group.participant_ids), JSON.stringify(orderedIds), method, req.body?.comment || null, now, now],
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Ошибка сохранения решения равенства' });
  }
});

router.post('/:id/publish', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    if (tournament.status !== 'completed') {
      return res.status(400).json({ error: 'Публикация результатов возможна только для завершённых турниров' });
    }
    const readiness = await loadFinalReadiness(db, req.params.id);
    if (!readiness.ready) return res.status(400).json({ error: 'Нельзя опубликовать результаты: не все равенства разрешены' });

    const publicToken = tournament.public_token || crypto.randomUUID();
    const now = new Date().toISOString();
    await db.run(
      'UPDATE tournaments SET public_token = ?, results_published_at = ?, updated_at = ? WHERE id = ?',
      [publicToken, now, now, req.params.id],
    );
    res.json({ success: true, public_token: publicToken });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Ошибка публикации результатов' });
  }
});

export default router;
