import type { DatabaseWrapper } from './index.ts';

export const GUN_TOWN_CUP_RENAME_MIGRATION = 'gun_town_cup_rename_v1';

/**
 * The three tournaments held so far are the 2nd, 3rd and 4th Gun Town Cup (owner, 2026-11-13). Each one is found by its id AND its exact old
 * title, so a title the organizer already changed by hand is never overwritten. The old titles are kept in migration_history, and
 * `revertGunTownCupRename` puts them back.
 */
export const GUN_TOWN_CUP_RENAMES = [
  { id: '987670b4-afd7-48d1-92ce-3d4d4cbed8d6', from: 'Турнир Богдана 1.08', to: 'Gun Town Cup 2' },
  { id: 'bde2c16b-0f94-4083-ae80-e453698760f1', from: 'Турнир Богдана #2 3.10.2026', to: 'Gun Town Cup 3' },
  { id: 'd7fb7ae8-7812-44a8-a1a5-3057f6aafb20', from: 'Gun Town Cup 3', to: 'Gun Town Cup 4' },
] as const;

export async function applyGunTownCupRename(db: DatabaseWrapper): Promise<void> {
  const existing = await db.get<{ status?: string }>('SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1', [GUN_TOWN_CUP_RENAME_MIGRATION]);
  if (existing) return;

  const renamed: Array<{ id: string; from: string; to: string }> = [];
  const skipped: string[] = [];
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    for (const item of GUN_TOWN_CUP_RENAMES) {
      const row = await tx.get<any>('SELECT title FROM tournaments WHERE id = ?', [item.id]);
      if (!row || String(row.title) !== item.from) { skipped.push(item.id); continue; }
      await tx.run('UPDATE tournaments SET title = ?, updated_at = ? WHERE id = ? AND title = ?', [item.to, now, item.id, item.from]);
      renamed.push({ id: item.id, from: item.from, to: item.to });
    }
    await tx.run(
      `INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, 'completed', ?, ?)`,
      [GUN_TOWN_CUP_RENAME_MIGRATION, GUN_TOWN_CUP_RENAME_MIGRATION, JSON.stringify({ renamed, skipped }), now],
    );
  });
  if (renamed.length) console.log('[DATA CORRECTION] Gun Town Cup titles:', JSON.stringify(renamed));
}

/** Puts the old titles back (only where the title is still the one this migration set) and removes the marker, so it can be applied again. */
export async function revertGunTownCupRename(db: DatabaseWrapper): Promise<number> {
  const marker = await db.get<{ details_json?: string }>('SELECT details_json FROM migration_history WHERE migration_name = ?', [GUN_TOWN_CUP_RENAME_MIGRATION]);
  if (!marker) return 0;
  const details = JSON.parse(String(marker.details_json || '{}')) as { renamed?: Array<{ id: string; from: string; to: string }> };
  let restored = 0;
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    for (const item of [...(details.renamed || [])].reverse()) {
      const result = await tx.run('UPDATE tournaments SET title = ?, updated_at = ? WHERE id = ? AND title = ?', [item.from, now, item.id, item.to]);
      restored += Number((result as any)?.changes || 0);
    }
    await tx.run('DELETE FROM migration_history WHERE migration_name = ?', [GUN_TOWN_CUP_RENAME_MIGRATION]);
  });
  return restored;
}
