/** Known defects reproduced by independent audit: expected failures until fixed; see docs/ELO_AUDIT_2026-11-04.md. */
import { describe, expect, it } from 'vitest';
import { gameContribution } from '../lib/playerContribution';
import { explainEloDelta } from '../lib/eloExplanation';
const roles = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
const rows = roles.map((role, i) => ({ participant_id: `p${i+1}`, player_id: `p${i+1}`, seat_number: i+1, role, exit_type: 'alive', color_protocol: [] }));
describe('independent Elo audit 2026-11-04', () => {
 it.fails('does not award blacks for a raise with only black hands recorded', () => {
  const protocol = { winner_team: 'black', votes: [{ round_number: 2, day_number: 1, outcome: 'all_tied_eliminated', eliminated_seats: [2,3] }], events: [{ seq: 1, at: '', round: 2, phase: 'day_voting', kind: 'table_vote', seat: 8 }] };
  const out = gameContribution({ protocol, player_results: rows });
  expect(out.filter(r => r.items.some(i => i.kind === 'raise_defeat_black'))).toHaveLength(0);
 });
 it.fails('does not call a fixed tag deduction a missed shot', () => {
  const out = explainEloDelta({ won: false, expectedTeamResult: .3, modifiedResultDelta: -15, resultDelta: -15, carryModifier: 1, personalDelta: 0, missDelta: -20, totalDelta: -35 });
  expect(out.details.join(' ')).not.toContain('за промах');
 });
});

import { createDatabaseConnection } from '../db/index';
import { loadPlayerEloHistory } from '../server/services/playerEloHistoryService';
import { rebuildCanonicalEloRatings } from '../server/services/eloRatingService';
it.fails('rebuild accepts the same historical archived player as the history reader', async () => {
 const db = createDatabaseConnection(':memory:');
 try {
  const now = '2026-11-01T18:00:00Z';
  for (let n=1;n<=10;n++) await db.run("INSERT INTO players (id,nickname,lifecycle_status,source,elo,created_at,updated_at) VALUES (?,?,'normal','test',1000,?,?)", [`p${n}`,`Игрок ${n}`,now,now]);
  await db.run("UPDATE players SET lifecycle_status='archived' WHERE id='p8'");
  await db.run("INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,default_price,created_at,updated_at) VALUES ('audit','audit',?,'Europe/Moscow','CASUAL','active',0,?,?)",[now,now,now]);
  const payload={version:1,kind:'club_evening_protocol',protocol:{status:'completed',winner_team:'red'},player_results:rows};
  await db.run("INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES ('audit',1,?,'Красные','Победа Красные',?,'[]',?)",[now,JSON.stringify(payload),now]);
  expect((await loadPlayerEloHistory(db))[0].players).toHaveLength(10);
  await expect(rebuildCanonicalEloRatings(db)).resolves.toBeDefined();
 } finally {db.sqlite.close();}
});
