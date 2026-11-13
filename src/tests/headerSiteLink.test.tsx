/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import PlayerQuickAccessBar from '../components/player/PlayerQuickAccessBar.tsx';

afterEach(cleanup);

describe('the way back to the club site from the top of the app (owner, 2026-11-13)', () => {
  it('the player cabinet top bar has a link to the site next to the wallet and the settings', () => {
    render(<PlayerQuickAccessBar player={{ nickname: 'Дина' } as any} tokenBalance={5} active={null} onOpenWallet={vi.fn()} onOpenSettings={vi.fn()} onOpenHome={vi.fn()} />);
    const link = screen.getByTestId('player-quick-site');
    expect(link.getAttribute('href')).toBe('https://2lamafia.ru/');
    expect(link.getAttribute('aria-label')).toBe('На сайт клуба');
  });
});
