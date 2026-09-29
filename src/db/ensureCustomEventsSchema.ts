import type { DatabaseWrapper } from './index.ts';

/** Separate non-Mafia events. These tables deliberately have no links to games or game_evenings. */
export async function ensureCustomEventsSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS custom_events (
      id TEXT PRIMARY KEY,
      organizer_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_image_data_url TEXT,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      signup_deadline TEXT,
      venue TEXT NOT NULL DEFAULT '',
      participant_limit INTEGER NOT NULL DEFAULT 20 CHECK (participant_limit > 0),
      price_rub INTEGER NOT NULL DEFAULT 0 CHECK (price_rub >= 0),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled','completed')),
      registration_open INTEGER NOT NULL DEFAULT 1 CHECK (registration_open IN (0,1)),
      visibility TEXT NOT NULL DEFAULT 'everyone' CHECK (visibility IN ('everyone','club','invite')),
      allow_guest INTEGER NOT NULL DEFAULT 0 CHECK (allow_guest IN (0,1)),
      announce_telegram_channel INTEGER NOT NULL DEFAULT 0 CHECK (announce_telegram_channel IN (0,1)),
      announce_club_group INTEGER NOT NULL DEFAULT 0 CHECK (announce_club_group IN (0,1)),
      announce_vk INTEGER NOT NULL DEFAULT 0 CHECK (announce_vk IN (0,1)),
      announce_bot_dm INTEGER NOT NULL DEFAULT 0 CHECK (announce_bot_dm IN (0,1)),
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_custom_events_starts_at ON custom_events(starts_at, status);
    CREATE INDEX IF NOT EXISTS idx_custom_events_organizer ON custom_events(organizer_player_id, starts_at);

    CREATE TABLE IF NOT EXISTS custom_event_registrations (
      event_id TEXT NOT NULL REFERENCES custom_events(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      guest_count INTEGER NOT NULL DEFAULT 0 CHECK (guest_count IN (0,1)),
      status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','cancelled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (event_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_custom_event_registrations_event ON custom_event_registrations(event_id, status);

    CREATE TABLE IF NOT EXISTS custom_event_invitations (
      event_id TEXT NOT NULL REFERENCES custom_events(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (event_id, player_id)
    );
  `);
}
