/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OrganizerAgenda from '../components/crm/OrganizerAgenda.tsx';

vi.mock('../components/crm/CancelEveningSheet.tsx', () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const agendaResponse = (section: 'participants' | 'games' | 'management', label: string) => ({
  items: [{
    id: `evening-followup:${section}`,
    group: 'now',
    kind: 'evening',
    title: 'Дело по вечеру',
    why: 'Перейти к нужному действию',
    action: { type: 'evening', evening_id: 'evening 1', section },
    action_label: label,
  }],
  counts: { now: 1, week: 0, later: 0 },
  total: 1,
  snoozed: 0,
  groups: { now: 'Сейчас', week: 'На этой неделе', later: 'Когда будет время' },
});

describe('CRM «Дела» evening navigation', () => {
  it('uses the mounted OrganizerCRM navigation handler, not the URL-only helper', () => {
    // A direct URL push bypasses the mounted CRM section state in the app router.
    // Assert the parent wires its already-established stateful handler to «Дела».
    const source = readFileSync(new URL('../components/OrganizerCRM.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/<OrganizerAgenda mode="full" onOpenEveningSection=\{handleOpenEveningSection\}/);
    expect(source).not.toContain('onOpenEveningSection={navigateEveningSection}');
  });

  it.each([
    ['participants', 'К ответам'],
    ['games', 'К играм'],
    ['management', 'К составу'],
  ] as const)('opens the %s section through the provided callback', async (section, label) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(agendaResponse(section, label)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    const onOpenEveningSection = vi.fn();
    render(
      <OrganizerAgenda
        mode="full"
        onOpenEveningSection={onOpenEveningSection}
        onOpenPlayer={vi.fn()}
        onCreateEvening={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: new RegExp(label) }));
    expect(onOpenEveningSection).toHaveBeenCalledExactlyOnceWith('evening 1', section);
  });
});
