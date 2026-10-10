// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PlayerLearningBlock from '../components/player/PlayerLearningBlock.tsx';
import { appBackTarget } from '../lib/appNavigation.ts';

afterEach(() => cleanup());

describe('«Прогресс → Обучение»: categorized entry rather than a duplicate guide', () => {
  it('offers an immediate judge trainer and three clearly named directions', () => {
    render(<PlayerLearningBlock />);
    expect(screen.getByTestId('player-learning')).toBeDefined();
    expect(screen.getByTestId('player-learning-judge').getAttribute('href')).toBe('/guide?from=progress&tab=judge-conduct');
    expect(screen.getByTestId('player-learning-reasoning').getAttribute('href')).toBe('/guide?from=progress&tab=quiz');
    for (const tab of ['lessons', 'trainers', 'reference']) {
      expect(screen.getByTestId('player-learning-section-' + tab).getAttribute('href'))
        .toBe('/guide?from=progress&tab=' + tab);
    }
    expect(screen.getByText('Уроки')).toBeDefined();
    expect(screen.getByText('Тренажёры')).toBeDefined();
    expect(screen.getByText('Правила и справочник')).toBeDefined();
  });

  it('Telegram Back on a guide page opened from «Обучение» returns to Progress Learning', () => {
    window.history.replaceState(null, '', '/guide?tab=roles&from=progress');
    expect(appBackTarget('/guide')).toBe('/player/profile/learning');
    window.history.replaceState(null, '', '/guide?tab=roles');
    expect(appBackTarget('/guide')).toBe('/player/events');
  });
});
