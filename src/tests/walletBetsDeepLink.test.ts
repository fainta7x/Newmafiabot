import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('betting notification deep link', () => {
  it('opens the wallet «Ставки» tab from every notification path', () => {
    expect(read('server/routes/organizerBettingRoutes.ts')).not.toContain("buildTrustedPublicAppUrl('/player', req)");
    expect(read('server/routes/organizerBettingRoutes.ts')).toContain("'/player/wallet?tab=bets'");
    expect(read('server/services/bettingNotificationService.ts')).toContain("actionPath: '/player/wallet?tab=bets'");
    expect(read('server/services/clubGameStartService.ts')).toContain('/player/wallet?tab=bets');
  });

  it('wallet hub reads the tab query', () => {
    expect(read('components/player/PlayerWalletHub.tsx')).toContain("readViewParam('tab'");
  });
});
