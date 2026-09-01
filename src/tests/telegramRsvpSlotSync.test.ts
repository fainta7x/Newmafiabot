import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('Telegram evening RSVP contracts', () => {
  it('maps Буду to all game slots and keeps non-going quick answers without slot commitments', () => {
    const source = read('src/server/routes/botRoutes.ts');

    expect(source).toContain("import { loadEveningSlotPlan, replacePlayerSlotSelection } from '../services/eveningSlotPlanningService.ts';");
    expect(source).toContain("if (responseStatus === 'going')");
    expect(source).toContain('plan.slots.map((slot) => slot.id)');
    expect(source).toContain("await replacePlayerSlotSelection(db, String(evening.id), String(player.id), []);");
    expect(source).toContain('await setParticipantResponse(db, String(participant.id), responseStatus as any);');
  });

  it('uses the actual player slot PUT endpoint when saving exact games', () => {
    const source = read('src/components/player/PlayerEventSlotDetail.tsx');

    expect(source).toContain("method: 'PUT'");
    expect(source).not.toContain("method: 'POST'");
  });

  it('freezes routed Telegram event posts when an evening leaves an active destination', () => {
    const source = read('handlers/crm_telegram_publishing.py');

    expect(source).toContain('"action": "archived"');
    expect(source).not.toContain('closed_event_text');
    expect(source).not.toContain('"action": "closed"');
  });
});
