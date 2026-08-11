import type { DatabaseWrapper } from '../../db/index.ts';
import { internalGetNominations } from '../routes/tournamentsRoutesBase.ts';
import { getFlexibleTournamentStandings as internalGetStandings } from './flexibleTournamentStandingsService.ts';

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
export type HistoricalAwardKey = TournamentAwardKey | 'nomination_other';

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
  key: HistoricalAwardKey;
  kind: TournamentAwardKind;
  title: string;
  place: number | null;
  category: string | null;
  tournament_id: string | null;
  tournament_title: string;
  tournament_date: string | null;
  source: 'automatic' | 'manual' | 'historical';
  comment: string | null;
  historical_award_id: string | null;
}

export interface PlayerAwardStats {
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaces: number;
  nominations: number;
}

export const isTournamentAwardKey = (value: string): value is TournamentAwardKey =>
  TOURNAMENT_AWARD_DEFINITIONS.some((item) => item.key === value);

export const isHistoricalAwardKey = (value: string): value is HistoricalAwardKey =>
  isTournamentAwardKey(value) || value === 'nomination_other';

export const getTournamentAwardDefinition = (key: string) =>
  TOURNAMENT_AWARD_DEFINITIONS.find((item) => item.key === key) || null;

export const getHistoricalAwardDefaultTitle = (key: HistoricalAwardKey) => {
  if (key === 'nomination_other') return 'Номинация';
  return getTournamentAwardDefinition(key)?.title || 'Награда';
};

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

    if (override && definition.kind === 'placement') {
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
        historical_award_id: null,
      });
    }
  }

  const historicalRows = await db.all<any>(`
    SELECT id, award_key, title, tournament_title, tournament_date, comment, created_at
      FROM player_historical_awards
     WHERE player_id = ?
     ORDER BY COALESCE(tournament_date, created_at) DESC, created_at DESC
  `, [playerId]);

  for (const row of historicalRows) {
    const key = String(row.award_key || '');
    if (!isHistoricalAwardKey(key)) continue;
    const definition = getTournamentAwardDefinition(key);
    const place = key === 'place_1' ? 1 : key === 'place_2' ? 2 : key === 'place_3' ? 3 : null;

    awards.push({
      id: `historical:${row.id}`,
      key,
      kind: place ? 'placement' : 'nomination',
      title: row.title || getHistoricalAwardDefaultTitle(key),
      place,
      category: definition?.category || null,
      tournament_id: null,
      tournament_title: row.tournament_title || 'Турнир',
      tournament_date: row.tournament_date || null,
      source: 'historical',
      comment: row.comment || null,
      historical_award_id: String(row.id),
    });
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
