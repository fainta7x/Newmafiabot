import { expect, test } from '@playwright/test';
import { auditScreen, auditSeatZones } from './support/layoutAudit.mjs';

// Stress test of the Live game (owner, 2026-11-02: «стресс-тесты всех нажатий, всех окон»): a seeded random walk over every
// tappable thing — buttons, seat cards (tap and long press), windows and their close buttons — starting from the restored
// mid-game state of the e2e harness. After every tap the screen goes through the same layout audit as the scripted
// audit (text on text, cut labels, covered buttons, parts of a seat card) and the page must raise no error.
//
// It is a manual tool, not part of CI (it takes minutes): STRESS=1 npx playwright test -c e2e/playwright.config.mjs
//   tests/live-game-stress.spec.mjs   (STRESS_STEPS=200 STRESS_SEED=7 change the walk; STRESS_REPORT=1 prints every finding)
// Findings go to the report with the step number and what was tapped; the first screenshot of each new kind is saved.

const STEPS = Number(process.env.STRESS_STEPS || 120);
const SEEDS = String(process.env.STRESS_SEED || '1,2,3').split(',').map(Number);
const VIEWPORTS = [[360, 640], [390, 844], [1366, 768]];
// What a random walk must not press: it leaves the game or ends it for good, which only restarts the walk.
const AVOID = /выйти|выход|закрыть игру|завершить игру|сбросить|удалить игру|ппк|удалить/i;

const random = (seed) => { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; }; };

const restore = async (page) => {
  await page.goto('/e2e/live-game.html?mode=audit');
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
  await page.waitForSelector('.evening-live-engine-shell');
};

test.skip(!process.env.STRESS, 'manual stress test: STRESS=1');

for (const [width, height] of VIEWPORTS) {
  for (const seed of SEEDS) {
    test(`live game stress walk at ${width}x${height}, seed ${seed}`, async ({ page }, info) => {
      test.setTimeout(600_000);
      await page.setViewportSize({ width, height });
      const problems = [];
      const seen = new Set();
      const errors = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => { if (message.type() === 'error' && !/favicon|Failed to load resource/i.test(message.text())) errors.push(`console: ${message.text().slice(0, 200)}`); });
      const next = random(seed * 7919 + width);
      await restore(page);

      for (let step = 1; step <= STEPS; step += 1) {
        if (!(await page.locator('.evening-live-engine-shell').count())) await restore(page);
        // Candidates: every visible enabled button and every seat card.
        const buttons = page.locator('button:visible:enabled');
        const cards = page.locator('.live-seat-card:visible');
        const buttonCount = await buttons.count();
        const cardCount = await cards.count();
        const pick = Math.floor(next() * (buttonCount + cardCount));
        let label = '';
        try {
          if (pick < buttonCount) {
            const target = buttons.nth(pick);
            label = ((await target.getAttribute('aria-label')) || (await target.innerText()) || '').replace(/\s+/g, ' ').trim().slice(0, 40);
            if (AVOID.test(label)) { step -= 1; continue; }
            await target.click({ timeout: 1500 });
          } else {
            const target = cards.nth(pick - buttonCount);
            const seat = await target.getAttribute('data-seat');
            if (next() < 0.3) {
              const box = await target.boundingBox();
              label = `seat ${seat} long press`;
              if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); }
            } else {
              label = `seat ${seat} tap`;
              await target.click({ timeout: 1500 });
            }
          }
        } catch (error) {
          // A tap that cannot be made (covered, moved away, disabled meanwhile) is not a finding by itself: a covered BUTTON is, and the
          // audit below reports it. Only an unexpected failure other than a timeout is kept.
          if (!/Timeout|timeout|detached|not visible|intercepts|not enabled/i.test(String(error?.message))) problems.push(`step ${step} «${label}»: ${String(error?.message).slice(0, 120)}`);
          continue;
        }
        if (next() < 0.1) await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        const found = [...(await page.evaluate(auditScreen)), ...(await page.evaluate(auditSeatZones))];
        for (const issue of found) {
          const kind = issue.replace(/seat \d+: /, '').replace(/\[[^\]]*\]/g, '').replace(/\d+/g, 'N');
          const entry = `step ${step} after «${label}»: ${issue}`;
          problems.push(entry);
          if (!seen.has(kind)) { seen.add(kind); await page.screenshot({ path: info.outputPath(`finding-${seen.size}-step-${step}.png`) }); }
        }
      }

      const body = [...problems, ...errors].join('\n') || 'clean';
      await info.attach('report.txt', { body, contentType: 'text/plain' });
      if (process.env.STRESS_REPORT) console.log(`\n=== stress ${width}x${height} seed ${seed} ===\n${body}`);
      expect(errors, 'page errors').toEqual([]);
      expect(problems).toEqual([]);
    });
  }
}
