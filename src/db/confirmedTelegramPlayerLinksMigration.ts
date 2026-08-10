import type { DatabaseWrapper } from './index.ts';

const MIGRATION_KEY = '0012_confirmed_telegram_player_links_v1';

const CONFIRMED_LINKS = [
  ['a20493c8-5f4d-4b52-aa2e-ad3803b4b1c5', '587422177'],
  ['8f1a08a4-885e-4ec0-bddd-6877d664c0d8', '306803584'],
  ['8e805b16-6198-47c5-99db-e9a2679e291f', '1576242455'],
  ['470fea5a-d175-48bd-bb59-b7103277bd19', '706477103'],
  ['b47f10d9-c14a-4aa1-bc3c-9347cacaf28b', '595795530'],
  ['b53a8fb8-5c34-4a81-9ee2-08b8a40a1f28', '710664378'],
  ['6fdb127a-a1e7-47b0-95eb-96c9b5082811', '1192864659'],
  ['62fef3e1-99d9-4787-be4c-b76cc013a8e3', '633500672'],
] as const;

export function applyConfirmedTelegramPlayerLinksMigration(db: DatabaseWrapper): void {
  const existingMigration = db.sqlite
    .prepare('SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1')
    .get(MIGRATION_KEY) as { status?: string } | undefined;

  if (existingMigration?.status === 'completed') return;
  if (existingMigration) {
    throw new Error('Confirmed Telegram player link migration has an unexpected existing migration status.');
  }

  const migrate = db.sqlite.transaction(() => {
    const ids = new Set(CONFIRMED_LINKS.map(([playerId]) => playerId));
    const telegramIds = new Set(CONFIRMED_LINKS.map(([, telegramId]) => telegramId));
    if (ids.size !== CONFIRMED_LINKS.length || telegramIds.size !== CONFIRMED_LINKS.length) {
      throw new Error('Confirmed Telegram player link migration contains duplicate configured identifiers.');
    }

    const findPlayer = db.sqlite.prepare('SELECT id, telegram_user_id FROM players WHERE id = ? LIMIT 2');
    const findTelegramOwner = db.sqlite.prepare('SELECT id FROM players WHERE telegram_user_id = ? LIMIT 2');
    const updatePlayer = db.sqlite.prepare(
      "UPDATE players SET telegram_user_id = ? WHERE id = ? AND (telegram_user_id IS NULL OR trim(telegram_user_id) = '')",
    );

    for (const [playerId, telegramId] of CONFIRMED_LINKS) {
      const player = findPlayer.get(playerId) as { id: string; telegram_user_id: string | null } | undefined;
      if (!player) {
        throw new Error('Confirmed Telegram player link migration cannot find a required canonical player UUID.');
      }

      const currentTelegramId = String(player.telegram_user_id ?? '').trim();
      if (currentTelegramId && currentTelegramId !== telegramId) {
        throw new Error('Confirmed Telegram player link migration found a different existing Telegram link.');
      }

      const owner = findTelegramOwner.get(telegramId) as { id: string } | undefined;
      if (owner && owner.id !== playerId) {
        throw new Error('Confirmed Telegram player link migration found a duplicate Telegram link.');
      }

      if (!currentTelegramId) {
        const result = updatePlayer.run(telegramId, playerId);
        if (result.changes !== 1) {
          throw new Error('Confirmed Telegram player link migration could not update a required player.');
        }
      }
    }

    db.sqlite.prepare(
      'INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, ?, ?, ?)',
    ).run(MIGRATION_KEY, MIGRATION_KEY, 'completed', JSON.stringify({ pairs: CONFIRMED_LINKS.length }), new Date().toISOString());
  });

  migrate();
  console.log('Applied confirmed Telegram player link migration.');
}
