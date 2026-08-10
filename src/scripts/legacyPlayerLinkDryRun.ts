import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

type Db = InstanceType<typeof Database>;
type TargetPlayer = { id: string; telegram_user_id: string | null; nickname: string | null };
type LegacyPlayer = { user_id: string | number | null; nickname: string | null };

type Category =
  | 'already linked'
  | 'unique nickname candidate'
  | 'legacy-only named player'
  | 'target-only player'
  | 'placeholder/ambiguous'
  | 'conflict';

const CATEGORY_ORDER: Category[] = [
  'already linked',
  'unique nickname candidate',
  'legacy-only named player',
  'target-only player',
  'placeholder/ambiguous',
  'conflict',
];

function requiredArg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing required argument ${name} <sqlite-path>`);
  }
  return path.resolve(value);
}

function normalizeTelegramId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeNickname(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ru-RU');
}

function displayNickname(value: unknown): string {
  const nickname = String(value ?? '').trim().replace(/\s+/g, ' ');
  return nickname || '<без ника>';
}

function isPlaceholderNickname(value: unknown): boolean {
  const normalized = normalizeNickname(value);
  if (!normalized) return true;
  return /^(?:игрок|player|unknown|неизвестно|без ника|без_ника)(?:[_\s-]*\d+)?$/iu.test(normalized);
}

function openReadOnly(label: string, dbPath: string): Db {
  if (!fs.existsSync(dbPath) || !fs.statSync(dbPath).isFile()) {
    throw new Error(`${label} database file does not exist: ${dbPath}`);
  }

  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
    db.prepare('SELECT name FROM sqlite_master LIMIT 1').get();
    const quickCheck = db.pragma('quick_check', { simple: true });
    if (quickCheck !== 'ok') {
      db.close();
      throw new Error(`${label} database failed SQLite quick_check`);
    }
    return db;
  } catch (error: any) {
    throw new Error(`${label} database is not a valid readable SQLite database: ${error?.message || error}`);
  }
}

function requireColumns(db: Db, label: string, table: string, required: string[]): void {
  const tableExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!tableExists) throw new Error(`${label} database is missing required table: ${table}`);

  const columns = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name),
  );
  const missing = required.filter((column) => !columns.has(column));
  if (missing.length) {
    throw new Error(`${label} table ${table} is missing required column(s): ${missing.join(', ')}`);
  }
}

function addToMap(map: Map<string, number[]>, key: string | null, index: number): void {
  if (!key) return;
  const list = map.get(key) || [];
  list.push(index);
  map.set(key, list);
}

function main(): void {
  const targetPath = requiredArg('--target-db');
  const legacyPath = requiredArg('--legacy-db');

  const targetDb = openReadOnly('Target', targetPath);
  const legacyDb = openReadOnly('Legacy', legacyPath);

  try {
    requireColumns(targetDb, 'Target', 'players', ['id', 'telegram_user_id', 'nickname']);
    requireColumns(legacyDb, 'Legacy', 'users', ['user_id', 'nickname']);

    const targetPlayers = targetDb
      .prepare('SELECT id, telegram_user_id, nickname FROM players')
      .all() as TargetPlayer[];
    const legacyPlayers = legacyDb
      .prepare('SELECT user_id, nickname FROM users')
      .all() as LegacyPlayer[];

    const targetByTelegramId = new Map<string, number[]>();
    const legacyByTelegramId = new Map<string, number[]>();
    const targetByNickname = new Map<string, number[]>();
    const legacyByNickname = new Map<string, number[]>();

    targetPlayers.forEach((player, index) => {
      addToMap(targetByTelegramId, normalizeTelegramId(player.telegram_user_id), index);
      addToMap(targetByNickname, normalizeNickname(player.nickname) || null, index);
    });
    legacyPlayers.forEach((player, index) => {
      addToMap(legacyByTelegramId, normalizeTelegramId(player.user_id), index);
      addToMap(legacyByNickname, normalizeNickname(player.nickname) || null, index);
    });

    const report = new Map<Category, string[]>(CATEGORY_ORDER.map((category) => [category, []]));
    const consumedTargets = new Set<number>();

    const push = (category: Category, label: string) => report.get(category)!.push(label);

    legacyPlayers.forEach((legacy, legacyIndex) => {
      const legacyTelegramId = normalizeTelegramId(legacy.user_id);
      const legacyNickname = normalizeNickname(legacy.nickname);
      const legacyLabel = displayNickname(legacy.nickname);
      const exactTargets = legacyTelegramId ? targetByTelegramId.get(legacyTelegramId) || [] : [];
      const duplicateLegacyId = legacyTelegramId ? (legacyByTelegramId.get(legacyTelegramId)?.length || 0) > 1 : false;

      if (exactTargets.length === 1 && !duplicateLegacyId) {
        const targetIndex = exactTargets[0];
        consumedTargets.add(targetIndex);
        push('already linked', displayNickname(targetPlayers[targetIndex].nickname));
        return;
      }

      if (exactTargets.length > 1 || duplicateLegacyId) {
        exactTargets.forEach((targetIndex) => consumedTargets.add(targetIndex));
        push('conflict', legacyLabel);
        return;
      }

      if (isPlaceholderNickname(legacy.nickname)) {
        push('placeholder/ambiguous', legacyLabel);
        return;
      }

      const nicknameTargets = legacyNickname ? targetByNickname.get(legacyNickname) || [] : [];
      const nicknameLegacyRows = legacyNickname ? legacyByNickname.get(legacyNickname) || [] : [];

      if (nicknameTargets.length === 0) {
        if (nicknameLegacyRows.length > 1) {
          push('placeholder/ambiguous', legacyLabel);
        } else {
          push('legacy-only named player', legacyLabel);
        }
        return;
      }

      if (nicknameTargets.length !== 1 || nicknameLegacyRows.length !== 1) {
        nicknameTargets.forEach((targetIndex) => consumedTargets.add(targetIndex));
        push('placeholder/ambiguous', legacyLabel);
        return;
      }

      const targetIndex = nicknameTargets[0];
      const target = targetPlayers[targetIndex];
      consumedTargets.add(targetIndex);

      const targetTelegramId = normalizeTelegramId(target.telegram_user_id);
      if (targetTelegramId) {
        push('conflict', `${legacyLabel} ↔ ${displayNickname(target.nickname)}`);
        return;
      }

      push('unique nickname candidate', `${legacyLabel} ↔ ${displayNickname(target.nickname)}`);
      void legacyIndex;
    });

    targetPlayers.forEach((target, targetIndex) => {
      if (consumedTargets.has(targetIndex)) return;
      const label = displayNickname(target.nickname);
      if (isPlaceholderNickname(target.nickname)) {
        push('placeholder/ambiguous', label);
      } else {
        push('target-only player', label);
      }
    });

    console.log('Legacy player link dry run (read-only)');
    for (const category of CATEGORY_ORDER) {
      const rows = report.get(category)!;
      console.log(`\n${category}: ${rows.length}`);
      rows
        .slice()
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .forEach((nickname) => console.log(`- ${nickname}`));
    }
  } finally {
    legacyDb.close();
    targetDb.close();
  }
}

try {
  main();
} catch (error: any) {
  console.error(`Dry run failed: ${error?.message || error}`);
  process.exitCode = 1;
}
