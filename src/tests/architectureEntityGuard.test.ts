import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard against the cause found on 2026-11-03 (docs/ARCHITECTURE_REVIEW_2026-11-03.md): each new kind of game or event
 * got its own tables. A new kind is a new value of the entity's `format`/`kind`, never a new `*_games`,
 * `*_participants`, `*_registrations`, `*_publications` or `*_outbox` table. The list below is today's state; it may
 * only shrink as entities are unified. Adding a name needs an architecture note and the owner's «да».
 */
const KNOWN: Record<string, string[]> = {
  games: ['games', 'tournament_games', 'gomafia_external_games'],
  participants: ['evening_participants', 'tournament_participants'],
  registrations: ['tournament_registrations', 'custom_event_registrations', 'evening_slot_registrations'],
  publications: ['evening_telegram_publications', 'vk_evening_publications', 'tournament_telegram_publications', 'custom_event_publications', 'poker_tournament_publications', 'external_publications'],
  outbox: ['telegram_message_outbox', 'vk_message_outbox', 'telegram_dispatch_outbox', 'telegram_sync_outbox'],
};

const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return name === 'tests' ? [] : files(path);
  return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
});

describe('one table family per entity (architecture guard)', () => {
  const created = new Set<string>();
  for (const file of files(new URL('..', import.meta.url).pathname)) {
    for (const match of readFileSync(file, 'utf8').matchAll(/CREATE TABLE (?:IF NOT EXISTS )?["`]?([a-z_0-9]+)/g)) created.add(match[1]);
  }
  for (const [family, known] of Object.entries(KNOWN)) {
    it(`no new *_${family} table`, () => {
      const found = [...created].filter((name) => name === family || name.endsWith(`_${family}`)).sort();
      expect(found.filter((name) => !known.includes(name))).toEqual([]);
    });
  }
});
