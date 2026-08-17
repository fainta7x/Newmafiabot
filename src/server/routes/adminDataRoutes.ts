import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { mutateTokenBalance } from '../services/tokenLedgerService.ts';
import { evaluatePlayerAchievements, loadAchievementDefinitions } from '../services/playerAchievementsService.ts';

const router = Router();
router.use(requireOrganizerAuth);

const ACHIEVEMENT_CATEGORIES = new Set(['games', 'wins', 'rating', 'roles', 'judge', 'special']);
const ACHIEVEMENT_METRICS = new Set(['games', 'wins', 'rating', 'judged', 'role', 'pu', 'perfect_game']);
const ACHIEVEMENT_RARITIES = new Set(['common', 'rare', 'epic', 'legendary']);
const ACHIEVEMENT_ROLES = new Set(['sheriff', 'mafia', 'don']);

const EXPERT_TABLES: Record<string, { label: string; blockedColumns?: string[] }> = {
  players: { label: 'Игроки', blockedColumns: ['tokens'] },
  game_evenings: { label: 'Игровые вечера' },
  evening_participants: { label: 'Участники вечеров' },
  games: { label: 'Клубные игры' },
  tournaments: { label: 'Турниры' },
  tournament_participants: { label: 'Участники турниров' },
  tournament_games: { label: 'Игры турниров' },
  tournament_game_seats: { label: 'Рассадка турниров' },
  tournament_game_player_results: { label: 'Результаты игроков турнира' },
  tournament_game_protocols: { label: 'Протоколы турниров' },
  rating_periods: { label: 'Рейтинговые периоды' },
  shop_items: { label: 'Товары магазина' },
  shop_purchases: { label: 'Покупки' },
  player_achievements: { label: 'Полученные достижения' },
  achievement_definitions: { label: 'Каталог достижений' },
  player_achievement_overrides: { label: 'Ручные правила достижений' },
};

const jsonValue = (value: unknown) => value === undefined ? null : JSON.stringify(value);

const writeAudit = async (
  db: any,
  input: { entityType: string; entityId?: string | null; action: string; fieldName?: string | null; before?: unknown; after?: unknown; note?: string | null },
) => {
  await db.run(
    `INSERT INTO admin_change_log
      (id, entity_type, entity_id, action, field_name, before_json, after_json, note, actor_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'organizer', ?)`,
    [
      `acl_${randomUUID()}`,
      input.entityType,
      input.entityId || null,
      input.action,
      input.fieldName || null,
      jsonValue(input.before),
      jsonValue(input.after),
      input.note?.trim() || null,
      new Date().toISOString(),
    ],
  );
};

const tableInfo = async (db: any, table: string) => {
  if (!EXPERT_TABLES[table]) return null;
  const exists = await db.get("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ?", [table]);
  if (!exists) return null;
  const columns = await db.all(`PRAGMA table_info(${table})`);
  const blocked = new Set(EXPERT_TABLES[table].blockedColumns || []);
  const pkColumns = columns.filter((column: any) => Number(column.pk || 0) > 0).sort((a: any, b: any) => Number(a.pk) - Number(b.pk));
  return {
    table,
    label: EXPERT_TABLES[table].label,
    columns: columns.map((column: any) => ({
      name: String(column.name),
      type: String(column.type || ''),
      notnull: Boolean(column.notnull),
      pk: Number(column.pk || 0),
      editable: Number(column.pk || 0) === 0 && !blocked.has(String(column.name)) && !/BLOB/i.test(String(column.type || '')),
    })),
    pkColumns,
  };
};

const serializePk = (row: any, pkColumns: any[]) => pkColumns.map((column) => `${column.name}=${String(row[column.name])}`).join('|');

const parsePk = (raw: string, pkColumns: any[]) => {
  const decoded = decodeURIComponent(raw);
  const parts = new Map(decoded.split('|').map((part) => {
    const index = part.indexOf('=');
    return index >= 0 ? [part.slice(0, index), part.slice(index + 1)] : ['', ''];
  }));
  const values = pkColumns.map((column) => parts.get(String(column.name)));
  if (values.some((value) => value === undefined)) throw new Error('Некорректный идентификатор записи');
  return values;
};

const coerceColumnValue = (value: unknown, type: string) => {
  if (value === null || value === '') return null;
  if (/INT|REAL|NUM|DOUBLE|FLOAT|DECIMAL/i.test(type)) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('Ожидалось числовое значение');
    return number;
  }
  return String(value);
};

router.get('/summary', async (req, res) => {
  try {
    const db = req.db;
    const [definitions, definitionRows, shopItems, players, changes] = await Promise.all([
      loadAchievementDefinitions(db, true),
      db.all('SELECT id, active, updated_at FROM achievement_definitions ORDER BY sort_order, id'),
      db.all('SELECT * FROM shop_items ORDER BY active DESC, sort_order ASC, id ASC'),
      db.all('SELECT id, nickname, elo, tokens, game_level FROM players ORDER BY nickname COLLATE NOCASE ASC'),
      db.all('SELECT * FROM admin_change_log ORDER BY created_at DESC, id DESC LIMIT 50'),
    ]);
    const definitionMeta = new Map(definitionRows.map((row: any) => [String(row.id), row]));
    return res.json({
      achievements: definitions.map((item) => ({ ...item, active: Boolean(definitionMeta.get(item.id)?.active), updated_at: definitionMeta.get(item.id)?.updated_at || null })),
      shop_items: shopItems,
      players,
      changes,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить данные настроек' });
  }
});

router.patch('/achievements/:id', async (req, res) => {
  try {
    const db = req.db;
    const id = String(req.params.id);
    const before = await db.get('SELECT * FROM achievement_definitions WHERE id = ?', [id]);
    if (!before) return res.status(404).json({ error: 'Достижение не найдено' });
    const next = {
      name: String(req.body?.name ?? before.name).trim().slice(0, 120),
      description: String(req.body?.description ?? before.description).trim().slice(0, 500),
      icon: String(req.body?.icon ?? before.icon).trim().slice(0, 24) || '🏅',
      category: String(req.body?.category ?? before.category),
      metric: String(req.body?.metric ?? before.metric),
      threshold: Number(req.body?.threshold ?? before.threshold),
      role: req.body?.role === null || req.body?.role === '' ? null : String(req.body?.role ?? before.role ?? ''),
      rarity: String(req.body?.rarity ?? before.rarity),
      sort_order: Math.trunc(Number(req.body?.order ?? req.body?.sort_order ?? before.sort_order)),
      active: req.body?.active === undefined ? Number(before.active || 0) : req.body.active ? 1 : 0,
    };
    if (!next.name) return res.status(400).json({ error: 'Название обязательно' });
    if (!next.description) return res.status(400).json({ error: 'Описание обязательно' });
    if (!ACHIEVEMENT_CATEGORIES.has(next.category)) return res.status(400).json({ error: 'Некорректная категория' });
    if (!ACHIEVEMENT_METRICS.has(next.metric)) return res.status(400).json({ error: 'Некорректное условие достижения' });
    if (!ACHIEVEMENT_RARITIES.has(next.rarity)) return res.status(400).json({ error: 'Некорректная редкость' });
    if (!Number.isFinite(next.threshold) || next.threshold < 0) return res.status(400).json({ error: 'Некорректный порог' });
    if (next.metric === 'role' && (!next.role || !ACHIEVEMENT_ROLES.has(next.role))) return res.status(400).json({ error: 'Для ролевого достижения укажите роль' });
    if (next.metric !== 'role') next.role = null;
    const now = new Date().toISOString();
    await db.run(
      `UPDATE achievement_definitions
          SET name=?, description=?, icon=?, category=?, metric=?, threshold=?, role=?, rarity=?, sort_order=?, active=?, updated_at=?
        WHERE id=?`,
      [next.name, next.description, next.icon, next.category, next.metric, next.threshold, next.role, next.rarity, next.sort_order, next.active, now, id],
    );
    const after = await db.get('SELECT * FROM achievement_definitions WHERE id = ?', [id]);
    await writeAudit(db, { entityType: 'achievement', entityId: id, action: 'update', before, after, note: req.body?.note });
    return res.json({ success: true, achievement: after });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось изменить достижение' });
  }
});

router.patch('/shop-items/:id', async (req, res) => {
  try {
    const db = req.db;
    const id = String(req.params.id);
    const before = await db.get('SELECT * FROM shop_items WHERE id = ?', [id]);
    if (!before) return res.status(404).json({ error: 'Товар не найден' });
    const next = {
      name: String(req.body?.name ?? before.name).trim().slice(0, 140),
      description: String(req.body?.description ?? before.description).trim().slice(0, 600),
      price: Math.trunc(Number(req.body?.price ?? before.price)),
      icon: String(req.body?.icon ?? before.icon).trim().slice(0, 24) || '🛍️',
      item_type: String(req.body?.item_type ?? before.item_type).trim().slice(0, 60) || 'custom',
      active: req.body?.active === undefined ? Number(before.active || 0) : req.body.active ? 1 : 0,
      sort_order: Math.trunc(Number(req.body?.sort_order ?? before.sort_order)),
    };
    if (!next.name || !next.description) return res.status(400).json({ error: 'Название и описание обязательны' });
    if (!Number.isSafeInteger(next.price) || next.price < 0) return res.status(400).json({ error: 'Цена должна быть целым неотрицательным числом' });
    const now = new Date().toISOString();
    await db.run(
      `UPDATE shop_items SET name=?, description=?, price=?, icon=?, item_type=?, active=?, sort_order=?, updated_at=? WHERE id=?`,
      [next.name, next.description, next.price, next.icon, next.item_type, next.active, next.sort_order, now, id],
    );
    const after = await db.get('SELECT * FROM shop_items WHERE id = ?', [id]);
    await writeAudit(db, { entityType: 'shop_item', entityId: id, action: 'update', before, after, note: req.body?.note });
    return res.json({ success: true, item: after });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось изменить товар' });
  }
});

router.post('/shop-items', async (req, res) => {
  try {
    const db = req.db;
    const id = String(req.body?.id || `custom_${randomUUID().slice(0, 8)}`).trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const name = String(req.body?.name || '').trim().slice(0, 140);
    const description = String(req.body?.description || '').trim().slice(0, 600);
    const price = Math.trunc(Number(req.body?.price || 0));
    const icon = String(req.body?.icon || '🛍️').trim().slice(0, 24) || '🛍️';
    const itemType = String(req.body?.item_type || 'custom').trim().slice(0, 60) || 'custom';
    const sortOrder = Math.trunc(Number(req.body?.sort_order || 100));
    if (!id || !name || !description) return res.status(400).json({ error: 'ID, название и описание обязательны' });
    if (!Number.isSafeInteger(price) || price < 0) return res.status(400).json({ error: 'Некорректная цена' });
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO shop_items (id, name, description, price, icon, item_type, active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [id, name, description, price, icon, itemType, sortOrder, now, now],
    );
    const after = await db.get('SELECT * FROM shop_items WHERE id = ?', [id]);
    await writeAudit(db, { entityType: 'shop_item', entityId: id, action: 'create', after, note: req.body?.note });
    return res.status(201).json({ success: true, item: after });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось создать товар' });
  }
});

router.post('/players/:playerId/tokens', async (req, res) => {
  try {
    const db = req.db;
    const playerId = String(req.params.playerId);
    const delta = Math.trunc(Number(req.body?.delta));
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (!Number.isSafeInteger(delta) || delta === 0) return res.status(400).json({ error: 'Укажите ненулевое целое количество жетонов' });
    if (!reason) return res.status(400).json({ error: 'Укажите причину начисления или списания' });
    const before = await db.get('SELECT id, nickname, tokens FROM players WHERE id = ?', [playerId]);
    if (!before) return res.status(404).json({ error: 'Игрок не найден' });
    const entry = await mutateTokenBalance(db, {
      playerId,
      delta,
      reasonType: 'admin_manual',
      description: reason,
      sourceType: 'admin_data',
      sourceId: null,
      idempotencyKey: `admin-token:${randomUUID()}`,
      debitPolicy: req.body?.allow_negative ? 'allow_negative' : 'prevent_negative',
      actorType: 'organizer',
      actorId: null,
      metadata: { manual: true },
    });
    const after = await db.get('SELECT id, nickname, tokens FROM players WHERE id = ?', [playerId]);
    await writeAudit(db, { entityType: 'player_tokens', entityId: playerId, action: 'adjust', before, after, note: reason });
    return res.json({ success: true, entry, player: after });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось изменить баланс' });
  }
});

router.post('/players/:playerId/achievements/:achievementId', async (req, res) => {
  try {
    const db = req.db;
    const playerId = String(req.params.playerId);
    const achievementId = String(req.params.achievementId);
    const state = String(req.body?.state || 'auto');
    if (!['auto', 'grant', 'revoke'].includes(state)) return res.status(400).json({ error: 'Некорректный режим достижения' });
    const [player, achievement] = await Promise.all([
      db.get('SELECT id, nickname FROM players WHERE id = ?', [playerId]),
      db.get('SELECT id, name FROM achievement_definitions WHERE id = ?', [achievementId]),
    ]);
    if (!player || !achievement) return res.status(404).json({ error: 'Игрок или достижение не найдено' });
    const before = {
      earned: await db.get('SELECT * FROM player_achievements WHERE player_id = ? AND achievement_id = ?', [playerId, achievementId]),
      override: await db.get('SELECT * FROM player_achievement_overrides WHERE player_id = ? AND achievement_id = ?', [playerId, achievementId]),
    };
    const now = new Date().toISOString();
    await db.transaction(async (tx: any) => {
      if (state === 'auto') {
        await tx.run('DELETE FROM player_achievement_overrides WHERE player_id = ? AND achievement_id = ?', [playerId, achievementId]);
      } else {
        await tx.run(
          `INSERT INTO player_achievement_overrides (player_id, achievement_id, state, note, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(player_id, achievement_id) DO UPDATE SET state=excluded.state, note=excluded.note, updated_at=excluded.updated_at`,
          [playerId, achievementId, state, String(req.body?.note || '').trim() || null, now],
        );
      }
      if (state === 'grant') {
        await tx.run(
          `INSERT OR REPLACE INTO player_achievements
           (id, player_id, achievement_id, earned_at, source, legacy_user_id, created_at)
           VALUES (?, ?, ?, ?, 'manual', NULL, ?)`,
          [`${playerId}:${achievementId}`, playerId, achievementId, now, now],
        );
      }
      if (state === 'revoke') {
        await tx.run('DELETE FROM player_achievements WHERE player_id = ? AND achievement_id = ?', [playerId, achievementId]);
      }
    });
    if (state === 'auto') await evaluatePlayerAchievements(db, playerId);
    const after = {
      earned: await db.get('SELECT * FROM player_achievements WHERE player_id = ? AND achievement_id = ?', [playerId, achievementId]),
      override: await db.get('SELECT * FROM player_achievement_overrides WHERE player_id = ? AND achievement_id = ?', [playerId, achievementId]),
    };
    await writeAudit(db, { entityType: 'player_achievement', entityId: `${playerId}:${achievementId}`, action: state, before, after, note: req.body?.note });
    return res.json({ success: true, state, player, achievement, after });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось изменить достижение игрока' });
  }
});

router.get('/changes', async (req, res) => {
  try {
    const db = req.db;
    const limit = Math.max(1, Math.min(200, Math.trunc(Number(req.query.limit || 100))));
    const changes = await db.all('SELECT * FROM admin_change_log ORDER BY created_at DESC, id DESC LIMIT ?', [limit]);
    return res.json({ changes });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить журнал' });
  }
});

router.get('/database/tables', async (req, res) => {
  try {
    const db = req.db;
    const tables = [];
    for (const table of Object.keys(EXPERT_TABLES)) {
      const info = await tableInfo(db, table);
      if (info) tables.push(info);
    }
    return res.json({ tables });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить список таблиц' });
  }
});

router.get('/database/:table', async (req, res) => {
  try {
    const db = req.db;
    const table = String(req.params.table);
    const info = await tableInfo(db, table);
    if (!info) return res.status(404).json({ error: 'Таблица недоступна в экспертном редакторе' });
    const limit = Math.max(1, Math.min(100, Math.trunc(Number(req.query.limit || 50))));
    const offset = Math.max(0, Math.trunc(Number(req.query.offset || 0)));
    const rows = await db.all(`SELECT * FROM ${table} LIMIT ? OFFSET ?`, [limit, offset]);
    const total = await db.get(`SELECT COUNT(*) AS count FROM ${table}`);
    return res.json({
      ...info,
      rows: rows.map((row: any) => ({ ...row, __pk: serializePk(row, info.pkColumns) })),
      total: Number(total?.count || 0),
      limit,
      offset,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось загрузить таблицу' });
  }
});

router.patch('/database/:table/:pk', async (req, res) => {
  try {
    const db = req.db;
    const table = String(req.params.table);
    const info = await tableInfo(db, table);
    if (!info || !info.pkColumns.length) return res.status(404).json({ error: 'Таблица недоступна для редактирования' });
    const pkValues = parsePk(String(req.params.pk), info.pkColumns);
    const where = info.pkColumns.map((column: any) => `${column.name} = ?`).join(' AND ');
    const before = await db.get(`SELECT * FROM ${table} WHERE ${where}`, pkValues);
    if (!before) return res.status(404).json({ error: 'Запись не найдена' });
    const changes = req.body?.changes && typeof req.body.changes === 'object' ? req.body.changes : {};
    const editable = new Map(info.columns.filter((column: any) => column.editable).map((column: any) => [column.name, column]));
    const fields: string[] = [];
    const values: any[] = [];
    for (const [name, raw] of Object.entries(changes)) {
      const column: any = editable.get(name);
      if (!column) continue;
      fields.push(`${name} = ?`);
      values.push(coerceColumnValue(raw, column.type));
    }
    if (!fields.length) return res.status(400).json({ error: 'Нет допустимых изменений' });
    values.push(...pkValues);
    await db.run(`UPDATE ${table} SET ${fields.join(', ')} WHERE ${where}`, values);
    const after = await db.get(`SELECT * FROM ${table} WHERE ${where}`, pkValues);
    await writeAudit(db, {
      entityType: `db:${table}`,
      entityId: serializePk(before, info.pkColumns),
      action: 'expert_update',
      before,
      after,
      note: String(req.body?.note || '').trim() || 'Изменение через экспертный редактор',
    });
    return res.json({ success: true, row: { ...after, __pk: serializePk(after, info.pkColumns) } });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось изменить запись' });
  }
});

export default router;
