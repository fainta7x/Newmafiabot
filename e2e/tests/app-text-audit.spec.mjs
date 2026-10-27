import { expect, test } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

// The layout and text gate for every app page outside the Live Engine game route (owner, 2026-10-27: «не только Live
// Engine, а вообще везде»). Each page is opened in its harness, checked, and then every visible tab of it is opened and
// checked too. LIVE_TEXT_AUDIT_REPORT=1 prints all findings; e2e/fonts-ci.conf gives a local run the fonts CI has.

const cabinet = (route, extra = '') => `/e2e/player-cabinet.html?route=${encodeURIComponent(route)}${extra}`;

export const PAGES = [
  ['cabinet-home', cabinet('/player')],
  ['cabinet-home-live', '/e2e/player-cabinet.html?scenario=live'],
  ['cabinet-events', cabinet('/player/events')],
  ['cabinet-evening', cabinet('/player/events/preview-evening', '&booking=novice')],
  ['cabinet-games', cabinet('/player/games')],
  ['cabinet-club', cabinet('/player/club')],
  ['cabinet-rating', cabinet('/player/rating')],
  ['cabinet-rating-tournaments', cabinet('/player/rating/tournaments')],
  ['cabinet-stats', cabinet('/player/stats')],
  ['cabinet-career', cabinet('/player/career')],
  ['cabinet-profile', cabinet('/player/profile')],
  ['cabinet-profile-elo', cabinet('/player/profile/elo')],
  ['cabinet-seasons', cabinet('/player/seasons')],
  ['cabinet-recaps', cabinet('/player/recaps')],
  ['cabinet-settings', cabinet('/player/settings')],
  ['cabinet-wallet', cabinet('/player/wallet')],
  ['cabinet-wallet-shop', cabinet('/player/wallet/shop', '&scenario=personal')],
  ['cabinet-poker', cabinet('/player/poker')],
  ['cabinet-clocktower', cabinet('/player/clocktower')],
  ['cabinet-conduct', cabinet('/player/conduct')],
  ['player-shell', '/e2e/player-shell.html'],
  ['player-profile', '/e2e/player-profile.html'],
  ['player-profile-friend', '/e2e/player-profile.html?target=friend'],
  ['player-rating', '/e2e/player-rating.html'],
  ['player-game-detail', '/e2e/player-game-detail.html'],
  ['player-game-recap', '/e2e/player-game-detail.html?screen=recap'],
  ['profile-form', '/e2e/profile-form.html'],
  ['gomafia-career', '/e2e/gomafia-career.html'],
  ['trophy-icons', '/e2e/trophy-icons.html'],
  ['split-vote', '/e2e/split-vote.html'],
  ['split-vote-three', '/e2e/split-vote.html?tab=split-three'],
  ['split-vote-articles', '/e2e/split-vote.html?tab=articles'],
  ['poker', '/e2e/poker-harness.html'],
  ['crm-login', '/e2e/crm-login.html'],
  ['organizer-crm', '/e2e/organizer-crm.html'],
  ['organizer-crm-active', '/e2e/organizer-crm.html?scenario=active'],
  ['crm-overview', '/e2e/crm-overview.html'],
  ['crm-evenings', '/e2e/crm-evenings.html'],
  ['crm-evening-roster', '/e2e/crm-evening-roster.html'],
  ['crm-closeout', '/e2e/crm-closeout.html'],
  ['crm-players', '/e2e/crm-players.html'],
  ['crm-analytics', '/e2e/crm-analytics.html'],
  ['crm-more', '/e2e/crm-more.html'],
  ['evening-prices', '/e2e/evening-prices.html'],
  ['owner-evenings', '/e2e/owner-evenings.html'],
  ['owner-evenings-answers', '/e2e/owner-evenings.html?screen=answers'],
  ['project-board', '/e2e/project-board.html'],
  ['protocol-window', '/e2e/protocol-window.html?draft=1'],
  ['protocol-window-tournament', '/e2e/protocol-window.html?kind=tournament&draft=1'],
  ['tournament-live-game', '/e2e/tournament-live-game.html?mode=audit'],
  ['live-game-cabinet', '/e2e/live-game-cabinet.html'],
  ['live-game-cabinet-night', '/e2e/live-game-cabinet.html?phase=night'],
  ['live-game-overlay', '/e2e/live-game-overlay.html', 'broadcast'],
  ['live-reveal', '/e2e/live-reveal.html'],
  ['live-broadcast-reveal', '/e2e/live-broadcast-reveal.html', 'broadcast'],
];

const VIEWPORTS = [[360, 640, false], [390, 844, false], [1366, 768, false], [1440, 900, false], [360, 640, true], [390, 844, true]];
const WIDE_FONT = ':root{--font-sans:"DejaVu Sans",sans-serif}html,body{font-family:"DejaVu Sans",sans-serif}*{letter-spacing:.04em!important}';

for (const [width, height, wideFont] of VIEWPORTS) {
  test.describe(`app text audit at ${width}x${height}${wideFont ? ' in a wide font' : ''}`, () => {
    // An OBS broadcast scene is shown in OBS on a computer screen, never on a phone.
    for (const [name, url] of PAGES.filter(([, , kind]) => kind !== 'broadcast' || width > 1000)) {
      test(name, async ({ page }, info) => {
        test.setTimeout(60_000);
        await page.setViewportSize({ width, height });
        if (wideFont) await page.addInitScript((css) => document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style); }), WIDE_FONT);
        const report = [];
        const check = async (screen) => {
          await page.waitForTimeout(400);
          for (const issue of await page.evaluate(auditScreen)) report.push(`${screen}: ${issue}`);
        };
        await page.goto(url);
        await page.waitForLoadState('networkidle').catch(() => {});
        await check(name);
        await page.screenshot({ path: info.outputPath(`${name}.png`) });
        // Every tab the page shows, one after another (a tab that disappears on the way is skipped).
        const tabs = await page.getByRole('tab').all();
        for (const [index, tab] of tabs.entries()) {
          if (!(await tab.isVisible().catch(() => false)) || await tab.isDisabled().catch(() => true)) continue;
          const label = ((await tab.textContent().catch(() => '')) || `tab ${index + 1}`).replace(/\s+/g, ' ').trim().slice(0, 30);
          await tab.click({ timeout: 3000 }).catch(() => {});
          await check(`${name} › ${label}`);
        }
        if (process.env.LIVE_TEXT_AUDIT_REPORT) console.log(`\n=== ${width}x${height}${wideFont ? '-wide' : ''} ${name} ===\n${report.join('\n') || 'clean'}`);
        await info.attach('report.txt', { body: report.join('\n') || 'clean', contentType: 'text/plain' });
        expect(report).toEqual([]);
      });
    }
  });
}
