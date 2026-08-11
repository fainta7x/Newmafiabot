import type { DatabaseWrapper } from './index.ts';

const DEFAULT_ITEMS = [
  {
    id: 'buy_role',
    name: 'Купить роль на игру',
    description: 'Выбрать роль перед началом игры: Мирный, Мафия, Шериф или Дон.',
    price: 10000,
    icon: '🎭',
    itemType: 'role',
    sortOrder: 10,
  },
  {
    id: 'order_music',
    name: 'Заказ музыки',
    description: 'Две песни на игровой вечер: на раздачу и договорённость.',
    price: 5000,
    icon: '🎵',
    itemType: 'music',
    sortOrder: 20,
  },
  {
    id: 'free_evening',
    name: 'Бесплатный вечер',
    description: 'Один игровой вечер без оплаты.',
    price: 30000,
    icon: '🎟️',
    itemType: 'free_evening',
    sortOrder: 30,
  },
] as const;

export async function ensurePlayerShopSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shop_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price INTEGER NOT NULL,
      icon TEXT NOT NULL,
      item_type TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shop_purchases (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES shop_items(id),
      item_name_snapshot TEXT NOT NULL,
      item_type_snapshot TEXT NOT NULL,
      price_snapshot INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'purchased',
      request_id TEXT NOT NULL,
      token_ledger_entry_id TEXT,
      purchased_at TEXT NOT NULL,
      redeemed_at TEXT,
      notes TEXT,
      UNIQUE(player_id, request_id)
    );

    CREATE INDEX IF NOT EXISTS idx_shop_items_active_sort
      ON shop_items(active, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_shop_purchases_player_date
      ON shop_purchases(player_id, purchased_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shop_purchases_status
      ON shop_purchases(status, purchased_at DESC);
  `);

  const now = new Date().toISOString();
  for (const item of DEFAULT_ITEMS) {
    await db.run(
      `INSERT INTO shop_items (
         id, name, description, price, icon, item_type, active, sort_order, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [item.id, item.name, item.description, item.price, item.icon, item.itemType, item.sortOrder, now, now],
    );
  }
}
