import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CANONICAL_EVENING_RESPONSES } from '../lib/eveningDomain.ts';

/**
 * The Python bot cannot import the TypeScript rule, so it repeats the response words («иду», «позже», «думаю»…).
 * This pins that every response word the bot compares with exists in the canonical list, so a renamed or mistyped
 * status fails here instead of silently matching nobody (docs/DOMAIN_MODEL.md rule 3).
 */
const FILES = ['organizer_notifications.py', 'handlers/telegram_evening_copy.py', 'handlers/bot_home.py'];
const WORDS = ['going', 'late', 'thinking', 'declined', 'unanswered'];

describe('Python bot response statuses', () => {
  it('uses only canonical response words when it compares a response status', () => {
    const used = new Set<string>();
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      for (const line of text.split('\n')) {
        if (!/response_status|_STATUS_TEXT|status in \{|status ==/.test(line)) continue;
        for (const match of line.matchAll(/["'](going|late|thinking|declined|unanswered|not_going|maybe|yes|no|attending|coming)["']/g)) used.add(match[1]);
      }
    }
    expect([...used].filter((word) => !(CANONICAL_EVENING_RESPONSES as readonly string[]).includes(word))).toEqual([]);
    expect(used.size).toBeGreaterThan(0);
    for (const word of used) expect(WORDS).toContain(word);
  });
});
