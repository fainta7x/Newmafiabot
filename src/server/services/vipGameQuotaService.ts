import type { DatabaseWrapper } from '../../db/index.ts';
import { validateVipGameQuota, type VipGameQuota } from '../../lib/vipSuccessfulGamesQuota.ts';

export async function ensureVipGameQuotaSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS vip_player_game_quotas (
    player_id TEXT PRIMARY KEY,
    whole_evening INTEGER NOT NULL CHECK(whole_evening IN (0,1)),
    max_successful_games INTEGER CHECK(max_successful_games IS NULL OR max_successful_games BETWEEN 1 AND 10000),
    updated_at TEXT NOT NULL,
    CHECK ((whole_evening = 1 AND max_successful_games IS NULL) OR
           (whole_evening = 0 AND max_successful_games IS NOT NULL))
  )`);
}
export async function getVipGameQuotas(db: DatabaseWrapper): Promise<VipGameQuota[]> {
  await ensureVipGameQuotaSchema(db);
  const rows = await db.all<{ player_id:string; whole_evening:number; max_successful_games:number|null }>(
    'SELECT player_id,whole_evening,max_successful_games FROM vip_player_game_quotas ORDER BY player_id',
  );
  return rows.map(row => ({
    playerId: row.player_id,
    wholeEvening: Boolean(row.whole_evening),
    maxSuccessfulGames: row.max_successful_games,
  }));
}
export async function saveVipGameQuota(db: DatabaseWrapper, playerId: string, body: unknown): Promise<VipGameQuota> {
  const quota = validateVipGameQuota(body, playerId);
  await ensureVipGameQuotaSchema(db);
  return db.transaction(async tx => {
    const player = await tx.get('SELECT id FROM players WHERE id=?', [playerId]);
    if (!player) throw Object.assign(new Error('Игрок не найден'), { statusCode:404 });
    await tx.run(`INSERT INTO vip_player_game_quotas
      (player_id,whole_evening,max_successful_games,updated_at)
      VALUES (?,?,?,?)
      ON CONFLICT(player_id) DO UPDATE SET
      whole_evening=excluded.whole_evening,
      max_successful_games=excluded.max_successful_games,
      updated_at=excluded.updated_at`,
      [quota.playerId,Number(quota.wholeEvening),quota.maxSuccessfulGames,new Date().toISOString()]);
    return quota;
  });
}
export async function deleteVipGameQuota(db: DatabaseWrapper, playerId: string) {
  await ensureVipGameQuotaSchema(db);
  const result = await db.run('DELETE FROM vip_player_game_quotas WHERE player_id=?',[playerId]);
  return { deleted: Number(result.changes)>0 };
}
