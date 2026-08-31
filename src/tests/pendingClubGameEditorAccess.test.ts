import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/crm/EveningGamesView.tsx', 'utf8');

describe('pending club game editor access', () => {
  it('opens the recoverable pending payload in the existing protocol editor', () => {
    expect(source).toContain('getRecoverablePendingClubGame');
    expect(source).toContain('setActiveProtocolGame(getRecoverablePendingClubGame(game))');
    expect(source).toContain('Редактировать протокол');
  });

  it('keeps destructive/reconduct actions blocked while allowing recovery editing', () => {
    expect(source).toContain('Повторное проведение и архивирование остаются заблокированы');
    expect(source).not.toContain('ручное редактирование и архивирование игры заблокированы');
  });
});
