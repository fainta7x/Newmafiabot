import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyDirection, detectStage, groupByDirection, parseProjectState } from '../lib/projectBoard.ts';

const sample = `# State

## Current queue (organizer flow)

1. ~~Evening route with stages~~ — built.
2. Organizer accountability.
   - Built: an organizer is required.

### Waiting on the owner

- **Poker chat at the training table (owner, 2026-10-12).** Enabled; waiting for the owner's phone check.
- Owner idea: rating of reveals, NOT BUILT, waits for the owner's «да».

## Telegram bot UX — ACTIVE

Something in progress about the bot.
`;

describe('project board', () => {
  it('turns the waiting bullets, the queue and active sections into cards', () => {
    const cards = parseProjectState(sample);
    const waiting = cards.filter((card) => card.status === 'waiting');
    expect(waiting).toHaveLength(2);
    expect(waiting[0]).toMatchObject({ title: 'Poker chat at the training table (owner, 2026-10-12)', direction: 'poker', stage: 'check' });
    expect(waiting[1]).toMatchObject({ stage: 'idea' });
    const queue = cards.filter((card) => card.section.startsWith('Current queue'));
    expect(queue.map((card) => card.status)).toEqual(['done', 'active']);
    expect(queue[1].body).toContain('organizer is required');
    expect(cards.some((card) => card.status === 'active' && card.direction === 'bot')).toBe(true);
  });

  it('guesses a direction and a stage from the words', () => {
    expect(classifyDirection('Покер: чат')).toBe('poker');
    expect(classifyDirection('Вскрытие в Live Game')).toBe('game');
    expect(classifyDirection('Профиль игрока и рейтинг')).toBe('profile');
    expect(classifyDirection('nothing known')).toBe('other');
    expect(detectStage('Built in a PR (merge pending)')).toBe('in_pr');
    expect(detectStage('Merged in #858')).toBe('merged');
  });

  it('reads the real PROJECT_STATE.md into grouped cards', () => {
    const cards = parseProjectState(readFileSync('docs/PROJECT_BOARD_RU.md', 'utf8'));
    expect(cards.filter((card) => card.status === 'waiting').length).toBe(3);
    expect(cards.every((card) => card.title.length > 0 && card.summary.length <= 170)).toBe(true);
    expect(cards.every((card) => /[А-Яа-яЁё]/.test(card.title))).toBe(true);
    expect(cards.some((card) => card.title.includes('GoMafia') && card.status === 'done')).toBe(true);
    const groups = groupByDirection(cards);
    expect(groups.length).toBeGreaterThan(2);
    expect(groups.reduce((sum, group) => sum + group.cards.length, 0)).toBe(cards.length);
  });
});
