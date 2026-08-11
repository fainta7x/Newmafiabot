import type { DatabaseWrapper } from '../../db/index.ts';
import { internalGetStandings as getLegacyTournamentStandings } from '../routes/tournamentsRoutesBase.ts';
import { calculateCiRate, calculateCiThreshold, roundToTwo } from '../utils/ciHelper.ts';
import { normalizeTournamentGameCount } from './tournamentDistanceService.ts';

const sameSportResult = (a: any, b: any) =>
  Math.abs(Number(a.total_points || 0) - Number(b.total_points || 0)) < 0.0001
  && Math.abs(Number(a.additional_total || 0) - Number(b.additional_total || 0)) < 0.0001
  && Number(a.wins || 0) === Number(b.wins || 0)
  && Number(a.don_wins || 0) + Number(a.sheriff_wins || 0) === Number(b.don_wins || 0) + Number(b.sheriff_wins || 0)
  && Number(a.first_killed_count || 0) === Number(b.first_killed_count || 0);

const sportSort = (a: any, b: any) => {
  const total = Number(b.total_points || 0) - Number(a.total_points || 0);
  if (Math.abs(total) > 0.0001) return total;
  const additional = Number(b.additional_total || 0) - Number(a.additional_total || 0);
  if (Math.abs(additional) > 0.0001) return additional;
  const wins = Number(b.wins || 0) - Number(a.wins || 0);
  if (wins) return wins;
  const specialWins = (Number(b.don_wins || 0) + Number(b.sheriff_wins || 0))
    - (Number(a.don_wins || 0) + Number(a.sheriff_wins || 0));
  if (specialWins) return specialWins;
  const firstKilled = Number(b.first_killed_count || 0) - Number(a.first_killed_count || 0);
  if (firstKilled) return firstKilled;
  return Number(a.participant_number || 0) - Number(b.participant_number || 0);
};

const recalculateCi = (row: any, distanceGames: number, thresholdB: number) => {
  const rate = calculateCiRate(Number(row.first_killed_count || 0), thresholdB);
  let ciTotal = 0;
  const games = Array.isArray(row.games) ? row.games.map((game: any) => {
    let ciPoints = 0;
    if (game.ci_reason === 'red_loss_full') ciPoints = rate;
    if (game.ci_reason === 'red_win_half_with_black_lh') ciPoints = roundToTwo(rate * 0.5);
    ciTotal = roundToTwo(ciTotal + ciPoints);
    return { ...game, ci_points: ciPoints, ci_rate: rate };
  }) : [];

  const previousCi = Number(row.ci_points || 0);
  return {
    ...row,
    games,
    ci_points: ciTotal,
    total_points: roundToTwo(Number(row.total_points || 0) - previousCi + ciTotal),
    ci_calculation: {
      distance_games: distanceGames,
      threshold_b: thresholdB,
      first_killed_count: Number(row.first_killed_count || 0),
      ci_rate: rate,
      provisional: Boolean(row.ci_calculation?.provisional),
    },
    tie_group_id: null,
    calculated_place: 0,
    official_place: 0,
    place: 0,
  };
};

export async function getFlexibleTournamentStandings(db: DatabaseWrapper, tournamentId: string) {
  const tournament = await db.get<any>('SELECT id, game_count, status FROM tournaments WHERE id = ?', [tournamentId]);
  if (!tournament) throw new Error('Турнир не найден');

  const base = await getLegacyTournamentStandings(db, tournamentId);
  const distanceGames = normalizeTournamentGameCount(tournament.game_count, 10);
  const thresholdB = calculateCiThreshold(distanceGames);
  const standings = (base.standings || []).map((row: any) => recalculateCi(row, distanceGames, thresholdB));

  standings.sort(sportSort);
  for (let index = 0; index < standings.length; index += 1) {
    const row = standings[index];
    row.calculated_place = index === 0 || !sameSportResult(row, standings[index - 1])
      ? index + 1
      : standings[index - 1].calculated_place;
    row.official_place = row.calculated_place;
    row.place = row.calculated_place;
  }

  const tieGroups: Array<{ tie_group_id: string; participant_ids: string[] }> = [];
  const grouped = new Map<string, string[]>();
  for (const row of standings) {
    if (Number(row.games_played || 0) <= 0) continue;
    const key = `${row.total_points}_${row.additional_total}_${row.wins}_${Number(row.don_wins || 0) + Number(row.sheriff_wins || 0)}_${row.first_killed_count}`;
    const participantIds = grouped.get(key) || [];
    participantIds.push(String(row.participant_id));
    grouped.set(key, participantIds);
  }
  for (const [key, participantIds] of grouped) {
    if (participantIds.length < 2) continue;
    const tieGroupId = `tg_${key.replace(/\./g, '_')}`;
    tieGroups.push({ tie_group_id: tieGroupId, participant_ids: participantIds });
    for (const participantId of participantIds) {
      const row = standings.find((item: any) => String(item.participant_id) === participantId);
      if (row) row.tie_group_id = tieGroupId;
    }
  }

  const resolutions = await db.all<any>(
    "SELECT * FROM tournament_final_resolutions WHERE tournament_id = ? AND type = 'standings_tie'",
    [tournamentId],
  );
  const resolutionMap = new Map<string, any>();
  for (const resolution of resolutions) {
    const participantIds = (() => {
      try { return JSON.parse(resolution.participant_ids_json || '[]') as string[]; } catch { return []; }
    })();
    resolutionMap.set([...participantIds].sort().join(','), resolution);
  }

  let tieRequiresDraw = false;
  for (const group of tieGroups) {
    const key = [...group.participant_ids].sort().join(',');
    const resolution = resolutionMap.get(key);
    if (!resolution) {
      tieRequiresDraw = true;
      continue;
    }
    const orderedIds = (() => {
      try { return JSON.parse(resolution.ordered_participant_ids_json || '[]') as string[]; } catch { return []; }
    })();
    const groupRows = standings.filter((row: any) => group.participant_ids.includes(String(row.participant_id)));
    const basePlace = Math.min(...groupRows.map((row: any) => Number(row.calculated_place || 0)));
    for (const row of groupRows) {
      const orderIndex = orderedIds.indexOf(String(row.participant_id));
      if (orderIndex < 0) continue;
      row.official_place = basePlace + orderIndex;
      row.place = row.official_place;
    }
  }

  standings.sort((a: any, b: any) =>
    Number(a.official_place || a.calculated_place) - Number(b.official_place || b.calculated_place)
    || Number(a.participant_number || 0) - Number(b.participant_number || 0));

  return {
    ...base,
    configured_games_count: distanceGames,
    ci_threshold_b: thresholdB,
    tie_requires_draw: tieRequiresDraw,
    standings,
    tie_groups: tieGroups,
  };
}
