import type { DatabaseWrapper } from '../../db/index.ts';
import { DEFAULT_EVENING_PRICES, type EveningPrices } from '../../lib/eveningPrices.ts';
import { oncePerDatabase } from '../../db/oncePerDatabase.ts';

/**
 * Prices (owner, 2026-10-23: «если я делаю новую цену, нужно её применять сразу»): every evening that is not closed
 * — a draft, a published or a running one — uses the current settings. A closed evening keeps the tariff it was closed
 * with, so editing the settings never reprices a closed account.
 */
const CLOSED_EVENING_SQL = "(settled_at IS NOT NULL OR status IN ('completed', 'cancelled'))";

const ensure = oncePerDatabase(async (db: DatabaseWrapper) => {
  await db.run('CREATE TABLE IF NOT EXISTS evening_price_settings (id INTEGER PRIMARY KEY CHECK(id = 1), body TEXT NOT NULL, updated_at TEXT NOT NULL)');
  await db.run('CREATE TABLE IF NOT EXISTS evening_price_policies (evening_id TEXT PRIMARY KEY, body TEXT NOT NULL)');
  // Tariffs frozen for evenings that are still open (the first version froze every evening) no longer apply.
  await db.run(`DELETE FROM evening_price_policies WHERE evening_id IN (SELECT id FROM game_evenings WHERE NOT ${CLOSED_EVENING_SQL})`);
});

export function validateEveningPrices(input: unknown): EveningPrices {
  if (!input || typeof input !== 'object') throw Object.assign(new Error('Укажите цены'), { statusCode: 400 });
  const output = { ...DEFAULT_EVENING_PRICES };
  for (const key of Object.keys(output) as Array<keyof EveningPrices>) {
    const value = (input as Record<string, unknown>)[key];
    if (key === 'novice_cap' && value === null) { output.novice_cap = null; continue; }
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100000) throw Object.assign(new Error('Цена должна быть целым числом от 0 до 100 000 ₽'), { statusCode: 400 });
    output[key] = value;
  }
  return output;
}

function decode(body?: string): EveningPrices {
  try { return validateEveningPrices(JSON.parse(body || '')); } catch { return { ...DEFAULT_EVENING_PRICES }; }
}

export async function loadPriceSettings(db: DatabaseWrapper): Promise<EveningPrices> {
  await ensure(db);
  return decode((await db.get<{ body: string }>('SELECT body FROM evening_price_settings WHERE id = 1'))?.body);
}

/** Saves the settings; the evenings that are not closed follow them at once. Returns the ids of those evenings. */
export async function savePriceSettings(db: DatabaseWrapper, input: unknown): Promise<{ prices: EveningPrices; openEveningIds: string[] }> {
  const prices = validateEveningPrices(input);
  await ensure(db);
  await db.transaction(async tx => {
    const previous = await tx.get<{ body: string }>('SELECT body FROM evening_price_settings WHERE id = 1');
    // A closed evening without a frozen tariff was closed under the settings that are being replaced.
    await tx.run(`INSERT OR IGNORE INTO evening_price_policies (evening_id, body) SELECT id, ? FROM game_evenings WHERE ${CLOSED_EVENING_SQL}`,
      [JSON.stringify(decode(previous?.body))]);
    await tx.run(`DELETE FROM evening_price_policies WHERE evening_id IN (SELECT id FROM game_evenings WHERE NOT ${CLOSED_EVENING_SQL})`);
    await tx.run('INSERT INTO evening_price_settings (id, body, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at', [JSON.stringify(prices), new Date().toISOString()]);
  });
  const open = await db.all<{ id: string }>(`SELECT id FROM game_evenings WHERE NOT ${CLOSED_EVENING_SQL}`);
  return { prices, openEveningIds: open.map(row => String(row.id)) };
}

/** The tariff of one evening: its frozen tariff once it is closed, the current settings otherwise. Reads only. */
export async function loadEveningPrices(db: DatabaseWrapper, eveningId: string): Promise<EveningPrices> {
  await ensure(db);
  const row = await db.get<{ body: string | null; closed: number }>(
    `SELECT p.body, (e.settled_at IS NOT NULL OR e.status IN ('completed', 'cancelled')) AS closed
       FROM game_evenings e LEFT JOIN evening_price_policies p ON p.evening_id = e.id
      WHERE e.id = ?`,
    [eveningId],
  );
  if (row?.closed && row.body) return decode(row.body);
  return loadPriceSettings(db);
}
