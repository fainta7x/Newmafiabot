// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PlayerLearningBlock from '../components/player/PlayerLearningBlock.tsx';
import { GUIDE_ENTRIES, GUIDE_LESSONS } from '../lib/guideCatalog.ts';

describe('«Прогресс → Обучение» (owner, 2026-10-06)', () => {
  it('lists every lesson and every guide entry with its /guide address', () => {
    render(<PlayerLearningBlock />);
    for (const [index, lesson] of GUIDE_LESSONS.entries()) {
      expect(screen.getByText(lesson.title).closest('a')?.getAttribute('href')).toBe(`/guide?tab=lessons&lesson=${index + 1}`);
    }
    for (const entry of GUIDE_ENTRIES) {
      expect(screen.getAllByText(entry.title).some((node) => node.closest('a')?.getAttribute('href') === `/guide?tab=${entry.id}`)).toBe(true);
    }
  });
});
