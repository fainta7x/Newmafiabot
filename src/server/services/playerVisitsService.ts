/**
 * Who really came to which evening (owner decision 2026-09-30): a visit is an evening where the player
 * is marked «пришёл» OR sat at a table in one of its games. Evenings are often closed without attendance
 * marks, but the games always have seats, so both sources count. One row per player and evening.
 *
 * Used by the player list (visits, last visit) and «Дела» (who has not come for a long time).
 */
const PLAYED_EVENING = "e.status NOT IN ('cancelled', 'draft') AND datetime(e.starts_at) <= datetime('now')";
const SLOTS = "json_each(CASE WHEN json_valid(g.slots_json) AND json_type(g.slots_json) = 'array' THEN g.slots_json ELSE '[]' END)";

export const PLAYER_VISITS_SQL = `
  SELECT CAST(ep.player_id AS TEXT) AS player_id, e.id AS evening_id, e.starts_at AS starts_at
    FROM evening_participants ep
    JOIN game_evenings e ON e.id = ep.evening_id
   WHERE ep.player_id IS NOT NULL AND ep.attendance_status = 'attended' AND ${PLAYED_EVENING}
  UNION
  SELECT CAST(COALESCE(json_extract(slot.value, '$.player_id'), seat_ep.player_id) AS TEXT) AS player_id, e.id AS evening_id, e.starts_at AS starts_at
    FROM games g
    JOIN game_evenings e ON e.id = g.evening_id
    JOIN ${SLOTS} slot
    LEFT JOIN evening_participants seat_ep
      ON CAST(seat_ep.id AS TEXT) = CAST(json_extract(slot.value, '$.participant_id') AS TEXT) AND seat_ep.evening_id = e.id
   WHERE g.archived_at IS NULL AND ${PLAYED_EVENING}
     AND COALESCE(json_extract(slot.value, '$.player_id'), seat_ep.player_id) IS NOT NULL
`;

/** Visits count, first and last visit per player. */
export const PLAYER_VISIT_STATS_SQL = `
  SELECT player_id, COUNT(*) AS visits, MIN(starts_at) AS first_visit, MAX(starts_at) AS last_visit
    FROM (${PLAYER_VISITS_SQL})
   GROUP BY player_id
`;
