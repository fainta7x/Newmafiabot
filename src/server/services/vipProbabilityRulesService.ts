import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { validateVipProbabilityRule } from '../../lib/vipRoleProbabilityRules.ts';
import { ensureVipGameQuotaSchema } from './vipGameQuotaService.ts';

export async function ensureVipProbabilityRulesSchema(db: DatabaseWrapper) {
  return db.transaction(async db => {
  await db.exec(`CREATE TABLE IF NOT EXISTS vip_probability_rules (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('role','same_color','different_color','red_color')),
    role TEXT,
    other_player_id TEXT,
    percent INTEGER NOT NULL CHECK(percent BETWEEN 0 AND 100),
    enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
    personal_limit INTEGER,
    limit_scope TEXT NOT NULL DEFAULT 'evening' CHECK(limit_scope IN ('game','evening')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_vip_probability_player ON vip_probability_rules(player_id);`);
  // Upgrade older table constraints while retaining all prior owner rules.
  // Build the new table in one transaction: never drop the original if
  // copying records fails or the old schema lacks a newer column.
  const existing = await db.get<{sql:string}>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='vip_probability_rules'",
  );
  if (existing?.sql && !existing.sql.includes("'red_color'")) {
    const columns = await db.all<{name:string}>('PRAGMA table_info(vip_probability_rules)');
    const hasScope = columns.some(column => column.name === 'limit_scope');
    const scopeExpr = hasScope ? "COALESCE(limit_scope,'evening')" : "'evening'";
    await db.transaction(async tx => {
      await tx.exec(`CREATE TABLE vip_probability_rules_next (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('role','same_color','different_color','red_color')),
        role TEXT,
        other_player_id TEXT,
        percent INTEGER NOT NULL CHECK(percent BETWEEN 0 AND 100),
        enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
        personal_limit INTEGER,
        limit_scope TEXT NOT NULL DEFAULT 'evening' CHECK(limit_scope IN ('game','evening')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
      await tx.exec(`INSERT INTO vip_probability_rules_next
        (id,player_id,kind,role,other_player_id,percent,enabled,personal_limit,limit_scope,created_at,updated_at)
        SELECT id,player_id,kind,role,other_player_id,percent,enabled,personal_limit,
          ${scopeExpr},created_at,updated_at FROM vip_probability_rules`);
      await tx.exec('DROP TABLE vip_probability_rules');
      await tx.exec('ALTER TABLE vip_probability_rules_next RENAME TO vip_probability_rules');
      await tx.exec('CREATE INDEX IF NOT EXISTS idx_vip_probability_player ON vip_probability_rules(player_id)');
    });
  }
  const columns = await db.all<{ name: string }>('PRAGMA table_info(vip_probability_rules)');
  if (!columns.some(row => row.name === 'limit_scope')) {
    await db.exec("ALTER TABLE vip_probability_rules ADD COLUMN limit_scope TEXT NOT NULL DEFAULT 'evening'");
  }
  });
}

/**
 * One-time migration of the former fixed red-card guarantee for Chagin into
 * owner-editable settings. The UUID is used ONLY to recognize the legacy
 * configuration, never by the draw algorithm. The migration flag prevents
 * silently recreating an owner-deleted rule on future reads.
 */
export async function migrateLegacyChaginRedGuarantee(db: DatabaseWrapper) {
  await ensureVipProbabilityRulesSchema(db);
  await ensureVipGameQuotaSchema(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS vip_legacy_migrations (
    migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL
  )`);
  const key = 'chagin_red_card_to_private_vip_20261103';
  const playerId = 'fad23405-9715-566f-acd9-5632c30eb198';
  await db.transaction(async tx => {
  const already = await tx.get('SELECT migration_key FROM vip_legacy_migrations WHERE migration_key=?',[key]);
  if (already) return;
  const owner = await tx.get('SELECT id FROM players WHERE id=?',[playerId]);
  if (!owner) return; // A new install should not invent a profile.
  const now = new Date().toISOString();
  await tx.run(`INSERT INTO vip_probability_rules
    (id,player_id,kind,role,other_player_id,percent,enabled,created_at,updated_at)
    SELECT ?, ?, 'role','citizen',NULL,100,1,?,?
     WHERE NOT EXISTS (
       SELECT 1 FROM vip_probability_rules WHERE player_id=? AND kind IN ('role','red_color') AND COALESCE(role,'citizen')='citizen'
     )`, ['legacy-chagin-red-guarantee',playerId,now,now,playerId]);
  await tx.run(`INSERT INTO vip_player_game_quotas
    (player_id,whole_evening,max_successful_games,updated_at)
    VALUES (?,1,NULL,?) ON CONFLICT(player_id) DO NOTHING`,[playerId,now]);
  await tx.run('INSERT OR IGNORE INTO vip_legacy_migrations (migration_key,applied_at) VALUES (?,?)',[key,now]);
  });
}

/**
 * One-time clean-up (owner, 2026-11-10: Chagin's card showed «Красная карта (мирный)» twice): identical conditions of one player
 * (the duplicate check came after they were created) collapse into the oldest one, which keeps its percent and on/off state.
 */
export async function removeDuplicateVipRules(db: DatabaseWrapper) {
  await ensureVipProbabilityRulesSchema(db);
  await db.exec('CREATE TABLE IF NOT EXISTS vip_legacy_migrations (migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const key = 'vip_duplicate_rules_20261110';
  const redKey = 'vip_red_color_to_role_20261110';
  await db.transaction(async tx => {
    // «Красная карта» was a separate kind that always meant the citizen role (owner, 2026-11-10: show it as «Мне нравится играть на: Мирный»).
    if (!(await tx.get('SELECT migration_key FROM vip_legacy_migrations WHERE migration_key=?', [redKey]))) {
      await tx.run(`DELETE FROM vip_probability_rules WHERE kind='red_color' AND EXISTS (
        SELECT 1 FROM vip_probability_rules o WHERE o.player_id=vip_probability_rules.player_id AND o.kind='role' AND o.role='citizen')`);
      await tx.run(`UPDATE vip_probability_rules SET kind='role', role='citizen' WHERE kind='red_color'`);
      await tx.run('INSERT OR IGNORE INTO vip_legacy_migrations (migration_key,applied_at) VALUES (?,?)', [redKey, new Date().toISOString()]);
    }
    if (await tx.get('SELECT migration_key FROM vip_legacy_migrations WHERE migration_key=?', [key])) return;
    await tx.run(`DELETE FROM vip_probability_rules WHERE id IN (
      SELECT r.id FROM vip_probability_rules r WHERE EXISTS (
        SELECT 1 FROM vip_probability_rules o
         WHERE o.player_id=r.player_id AND o.kind=r.kind AND COALESCE(o.role,'')=COALESCE(r.role,'')
           AND COALESCE(o.other_player_id,'')=COALESCE(r.other_player_id,'')
           AND (o.created_at<r.created_at OR (o.created_at=r.created_at AND o.id<r.id))))`);
    await tx.run('INSERT OR IGNORE INTO vip_legacy_migrations (migration_key,applied_at) VALUES (?,?)', [key, new Date().toISOString()]);
  });
}

export async function listVipProbabilityRules(db: DatabaseWrapper) {
  await migrateLegacyChaginRedGuarantee(db);
  await removeDuplicateVipRules(db);
  const rows = await db.all<any>(`SELECT id,player_id,kind,role,other_player_id,percent,enabled
    FROM vip_probability_rules ORDER BY created_at, id`);
  return rows.map(row => ({
    id: row.id, playerId: row.player_id, kind: row.kind, role: row.role,
    otherPlayerId: row.other_player_id, percent: row.percent,
    enabled: Boolean(row.enabled),
  }));
}

export async function saveVipProbabilityRule(db: DatabaseWrapper, input: unknown, id?: string) {
  const rule = validateVipProbabilityRule(input);
  await ensureVipProbabilityRulesSchema(db);
  return db.transaction(async tx => {
    const player = await tx.get('SELECT id FROM players WHERE id=? LIMIT 1', [rule.playerId]);
    if (!player) throw Object.assign(new Error('Игрок не найден'), { statusCode: 400 });
    if (rule.otherPlayerId) {
      const other = await tx.get('SELECT id FROM players WHERE id=? LIMIT 1', [rule.otherPlayerId]);
      if (!other) throw Object.assign(new Error('Второй игрок не найден'), { statusCode: 400 });
    }
    // One condition once per player (owner, 2026-11-03: the same condition could be added to the same player again and again).
    const twin = await tx.get(`SELECT id FROM vip_probability_rules WHERE player_id=? AND kind=?
      AND COALESCE(role,'')=COALESCE(?,'') AND COALESCE(other_player_id,'')=COALESCE(?,'') AND id<>? LIMIT 1`,
      [rule.playerId, rule.kind, rule.role, rule.otherPlayerId, id || '']);
    if (twin) throw Object.assign(new Error('Такое условие у игрока уже есть — измените его процент'), { statusCode: 409 });
    const now = new Date().toISOString();
    const ruleId = id || randomUUID();
    if (id) {
      const existing = await tx.get('SELECT id FROM vip_probability_rules WHERE id=?', [id]);
      if (!existing) throw Object.assign(new Error('Правило не найдено'), { statusCode: 404 });
      await tx.run(`UPDATE vip_probability_rules
        SET player_id=?,kind=?,role=?,other_player_id=?,percent=?,enabled=?,personal_limit=NULL,limit_scope='evening',updated_at=?
        WHERE id=?`, [rule.playerId,rule.kind,rule.role,rule.otherPlayerId,rule.percent,
          Number(rule.enabled),now,id]);
    } else {
      await tx.run(`INSERT INTO vip_probability_rules
        (id,player_id,kind,role,other_player_id,percent,enabled,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`,
        [ruleId,rule.playerId,rule.kind,rule.role,rule.otherPlayerId,rule.percent,
          Number(rule.enabled),now,now]);
    }
    return { id: ruleId, ...rule };
  });
}

export async function deleteVipProbabilityRule(db: DatabaseWrapper, id: string) {
  await ensureVipProbabilityRulesSchema(db);
  const result = await db.run('DELETE FROM vip_probability_rules WHERE id=?', [id]);
  return { deleted: Number(result.changes) > 0 };
}
