import type { DatabaseWrapper } from './index.ts';

export async function ensureCommerceSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS payment_intents (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      participant_id TEXT,
      token_package_id TEXT,
      campaign_id TEXT,
      amount_rub INTEGER NOT NULL,
      token_amount INTEGER,
      provider TEXT NOT NULL DEFAULT 'unconfigured',
      provider_payment_id TEXT,
      confirmation_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      description TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT,
      paid_at TEXT,
      cancelled_at TEXT,
      UNIQUE(player_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS token_packages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      token_amount INTEGER NOT NULL,
      price_rub INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fundraising_campaigns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      target_amount_rub INTEGER,
      status TEXT NOT NULL DEFAULT 'draft',
      starts_at TEXT,
      ends_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS external_publications (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      content_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      message_snapshot TEXT NOT NULL,
      external_id TEXT,
      external_url TEXT,
      error_text TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_payment_intents_player_created
      ON payment_intents(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payment_intents_status
      ON payment_intents(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payment_intents_participant
      ON payment_intents(participant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_token_packages_active
      ON token_packages(active, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_fundraising_campaigns_status
      ON fundraising_campaigns(status, starts_at, ends_at);
    CREATE INDEX IF NOT EXISTS idx_external_publications_source
      ON external_publications(platform, content_type, source_id, created_at DESC);
  `);
}
