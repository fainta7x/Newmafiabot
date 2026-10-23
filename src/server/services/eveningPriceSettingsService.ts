import type { DatabaseWrapper } from '../../db/index.ts';
import { DEFAULT_EVENING_PRICES, type EveningPrices } from '../../lib/eveningPrices.ts';
import { oncePerDatabase } from '../../db/oncePerDatabase.ts';
const ensure = oncePerDatabase(async (db: DatabaseWrapper) => {
  await db.run('CREATE TABLE IF NOT EXISTS evening_price_settings (id INTEGER PRIMARY KEY CHECK(id = 1), body TEXT NOT NULL, updated_at TEXT NOT NULL)');
  await db.run('CREATE TABLE IF NOT EXISTS evening_price_policies (evening_id TEXT PRIMARY KEY, body TEXT NOT NULL)');
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
  return decode((await db.get<{body: string}>('SELECT body FROM evening_price_settings WHERE id = 1'))?.body);
}
export async function savePriceSettings(db: DatabaseWrapper, input: unknown) {
  const prices = validateEveningPrices(input);
  await ensure(db);
  await db.transaction(async tx => {
    const previous = await tx.get<{body: string; updated_at: string}>('SELECT body, updated_at FROM evening_price_settings WHERE id = 1');
    // Freeze even evenings never opened since creation before changing defaults again.
    await tx.run(`INSERT OR IGNORE INTO evening_price_policies (evening_id, body)
      SELECT id, CASE WHEN julianday(created_at) >= julianday(?) THEN ? ELSE ? END FROM game_evenings`,
      [previous?.updated_at || null, JSON.stringify(decode(previous?.body)), JSON.stringify(DEFAULT_EVENING_PRICES)]);
    await tx.run('INSERT INTO evening_price_settings (id, body, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at', [JSON.stringify(prices), new Date().toISOString()]);
  });
  return prices;
}
/** Freeze the tariff for each evening. Editing system defaults never reprices an existing evening or historical ledger. */
export async function loadEveningPrices(db: DatabaseWrapper, eveningId: string): Promise<EveningPrices> {
  await ensure(db);
  const saved = await db.get<{body: string}>('SELECT body FROM evening_price_policies WHERE evening_id = ?', [eveningId]);
  if (saved?.body) return decode(saved.body);
  const settings = await db.get<{body: string; updated_at: string}>('SELECT body, updated_at FROM evening_price_settings WHERE id = 1');
  const evening = settings ? await db.get<{created_at: string}>('SELECT created_at FROM game_evenings WHERE id = ?', [eveningId]) : null;
  const prices = settings && evening?.created_at && Date.parse(evening.created_at) >= Date.parse(settings.updated_at) ? decode(settings.body) : { ...DEFAULT_EVENING_PRICES };
  await db.run('INSERT OR IGNORE INTO evening_price_policies (evening_id, body) VALUES (?, ?)', [eveningId, JSON.stringify(prices)]);
  return decode((await db.get<{body: string}>('SELECT body FROM evening_price_policies WHERE evening_id = ?', [eveningId]))?.body || JSON.stringify(prices));
}
