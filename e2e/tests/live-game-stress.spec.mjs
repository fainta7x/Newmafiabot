import { expect, test } from '@playwright/test';
import { auditScreen, auditSeatZones } from './support/layoutAudit.mjs';

// Stress test of the Live game (owner, 2026-11-02: «стресс-тесты всех нажатий, всех окон»): a seeded random walk over every
// tappable thing — buttons, seat cards (tap and long press), windows and their close buttons — starting from the first round of
// the e2e harness game (the real game window). After every tap the screen goes through the same layout audit as the scripted
// audit (text on text, cut labels, covered buttons, parts of a seat card) and the page must raise no error.
//
// It is a manual tool, not part of CI (it takes minutes): STRESS=1 npx playwright test -c e2e/playwright.config.mjs
//   tests/live-game-stress.spec.mjs   (STRESS_STEPS=200 STRESS_SEED=7 change the walk; STRESS_REPORT=1 prints every finding)
// Findings go to the report with the step number and what was tapped; the first screenshot of each new kind is saved.

const STEPS = Number(process.env.STRESS_STEPS || 120);
const STARTS = String(process.env.STRESS_START || 'round0,speeches,voting,result,night').split(',');
const SEEDS = String(process.env.STRESS_SEED || '1,2,3').split(',').map(Number);
const VIEWPORTS = [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]];
// Most taps go to what moves the game on, so a walk reaches the night, the voting, the revote, the shootout and the end, not only the first round.
const PROGRESS = /следующ|завершить|к голосованию|начать|подтвердить|сохранить|далее|подвести|открыть|зафиксировать|продолжить|дальше|отстрел|проверка|протокол убитого|лх|да, |поднять|оставить|пауза|выставить/i;
// What a random walk must not press: it leaves the game or ends it for good, which only restarts the walk.
const AVOID = /выйти|выход|закрыть игру|завершить игру|сбросить|удалить игру|ппк|удалить/i;

const random = (seed) => { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; }; };

const ROLE_SEQUENCE = ['Мирный', 'Мафия', 'Мирный', 'Шериф', 'Мирный', 'Мафия', 'Мирный', 'Дон', 'Мирный', 'Мирный'];

// The same start as the scripted audit: the real game window (with the seat cards the app has), up to the first round.
const tableGrid = (page) => page.locator('.evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"]').first();
const seatCard = (page, slot) => tableGrid(page).locator(':scope > div').nth(slot - 1);
const clickOptional = async (locator) => { if (await locator.isVisible().catch(() => false)) await locator.click(); };

// `start` is where the random walk begins: the first round, the end of the speeches, the vote count, its result, the night, the day.
const restore = async (page, start = 'round0') => {
  await page.goto('/e2e/live-game.html');
  await page.getByRole('button', { name: 'Подтвердить состав' }).click();
  await page.getByTestId('zero-round-rule').getByRole('radio', { name: 'Турнирная' }).click();
  await page.getByRole('button', { name: /Начать раздачу ролей/ }).click();
  await page.getByTestId('physical-role-deal-start').click();
  for (const role of ROLE_SEQUENCE) await page.getByRole('button', { name: new RegExp(role) }).click();
  await page.getByRole('button', { name: /Роли зафиксированы/ }).click();
  await page.getByRole('button', { name: /Включите музыку/ }).click();
  await page.getByRole('button', { name: /Договорка · 75с/ }).click();
  await page.getByRole('button', { name: /Вызов шерифа · 10с/i }).click();
  await page.getByRole('button', { name: /Свободная посадка · 40с/ }).click();
  await page.getByRole('button', { name: /Выключите музыку/ }).click();
  await page.getByRole('button', { name: /Открыть нулевой круг/ }).click();
  await page.waitForSelector('.evening-live-engine-shell .live-seat-card');
  if (start === 'round0') return;
  const speech = async (slot, nominee) => {
    await page.getByRole('button', { name: new RegExp(`Речь #${slot}(?:\\s| ·|$)`) }).last().click();
    if (nominee) {
      await seatCard(page, nominee).click();
      await page.locator('div[class*="z-[112]"]').getByRole('button', { name: 'Выставить', exact: true }).click();
    }
    await page.getByRole('button', { name: new RegExp(`Завершить речь #${slot}`) }).click();
  };
  await clickOptional(page.getByTestId('live-auto-toggle'));
  await clickOptional(page.getByTestId('live-auto-toggle'));
  await speech(1, 2);
  await speech(2, 3);
  for (let slot = 3; slot <= 10; slot += 1) await speech(slot);
  if (start === 'speeches') return;
  await page.getByRole('button', { name: 'К голосованию', exact: true }).click();
  await page.getByRole('button', { name: 'Начать голосование', exact: true }).click();
  await page.getByRole('button', { name: 'Свернуть', exact: true }).click();
  if (start === 'voting') return;
  for (const voter of [1, 2, 3, 4, 5, 6]) await seatCard(page, voter).click();
  await page.getByRole('button', { name: /Следующий/ }).click();
  await page.getByRole('button', { name: 'Подвести итог', exact: true }).click();
  if (start === 'result') return;
  await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  for (const seat of [1, 4, 8]) await page.locator('div[class*="z-[120]"]').getByRole('button', { name: String(seat), exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить лучший ход', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить последние речи', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить → дальше', exact: true }).click();
  if (start === 'night') return;
  await clickOptional(page.getByRole('button', { name: /Включите музыку/ }));
  await page.getByRole('button', { name: 'Отстрел', exact: true }).click();
  await page.getByRole('button', { name: 'Проверка Дона', exact: true }).click();
  await page.getByTestId('night-prompt-choose').click();
  await seatCard(page, 1).click();
};

test.skip(!process.env.STRESS, 'manual stress test: STRESS=1');

for (const [width, height] of VIEWPORTS) {
  for (const start of STARTS) for (const seed of SEEDS) {
    test(`live game stress walk at ${width}x${height}, ${start}, seed ${seed}`, async ({ page }, info) => {
      test.setTimeout(600_000);
      await page.setViewportSize({ width, height });
      const problems = [];
      const seen = new Set();
      const phases = new Set();
      const errors = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => { if (message.type() === 'error' && !/favicon|Failed to load resource/i.test(message.text())) errors.push(`console: ${message.text().slice(0, 200)}`); });
      const next = random(seed * 7919 + width);
      await restore(page, start);

      let spins = 0;
      for (let step = 1; step <= STEPS; step += 1) {
        if ((spins += 1) > STEPS * 4) break; // a walk that only meets things to avoid does not spin forever
        if (!(await page.locator('.evening-live-engine-shell').count())) await restore(page, start);
        // Candidates: what a finger could really press now (the topmost thing at the centre of the element is the element itself): when a
        // window is open the buttons under it are not candidates, so the walk goes through the window and out of it like a person.
        const candidates = await page.evaluate((progressSource) => {
          const progress = new RegExp(progressSource, 'i');
          document.querySelectorAll('[data-stress]').forEach((node) => node.removeAttribute('data-stress'));
          const out = [];
          const nodes = [...document.querySelectorAll('button:not([disabled]), .live-seat-card')];
          nodes.forEach((node, index) => {
            const r = node.getBoundingClientRect();
            if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
            const style = getComputedStyle(node);
            if (style.visibility === 'hidden' || style.display === 'none') return;
            const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
            if (!top || !(top === node || node.contains(top) || top.contains(node))) return;
            node.setAttribute('data-stress', String(index));
            const label = (node.getAttribute('aria-label') || node.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40);
            out.push({ id: index, card: node.classList.contains('live-seat-card'), label, progress: /live-judge-action--(primary|success)/.test(node.className) || progress.test(label) });
          });
          return out;
        }, PROGRESS.source);
        if (!candidates.length) { await page.keyboard.press('Escape'); continue; }
        const forward = candidates.filter((item) => item.progress && !item.card && !AVOID.test(item.label));
        const pool = forward.length > 0 && next() < 0.7 ? forward : candidates;
        const chosen = pool[Math.floor(next() * pool.length)];
        let label = chosen.label;
        try {
          const target = page.locator(`[data-stress="${chosen.id}"]`);
          if (!chosen.card) {
            if (AVOID.test(label)) { step -= 1; continue; }
            await target.click({ timeout: 1500 });
          } else {
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
        if (process.env.STRESS_TRACE) console.log(`step ${step}: ${label}`);
        const phase = await page.locator('.live-judge-hud__phase').first().innerText().catch(() => '');
        if (phase.trim()) phases.add(phase.replace(/\s+/g, ' ').trim());
        if (next() < 0.1) await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        const found = [...(await page.evaluate(auditScreen)), ...(await page.evaluate(auditSeatZones))];
        for (const issue of found) {
          // A warning or error notice («Игрок #1 уже выставлял кандидатов») floats over the table for a few seconds by design, where the
          // events panel is not on screen (a short phone); it is reported to the owner as a known item, not a failure of the walk.
          if (/live-game-floating-toast/.test(issue)) continue;
          const kind = issue.replace(/seat \d+: /, '').replace(/\[[^\]]*\]/g, '').replace(/\d+/g, 'N');
          const entry = `step ${step} after «${label}»: ${issue}`;
          problems.push(entry);
          if (!seen.has(kind)) { seen.add(kind); await page.screenshot({ path: info.outputPath(`finding-${seen.size}-step-${step}.png`) }); }
        }
      }

      const body = [...problems, ...errors].join('\n') || 'clean';
      console.log(`phases reached at ${width}x${height} seed ${seed}: ${[...phases].join(' | ')}`);
      await info.attach('report.txt', { body, contentType: 'text/plain' });
      if (process.env.STRESS_REPORT) console.log(`\n=== stress ${width}x${height} seed ${seed} ===\n${body}`);
      expect(errors, 'page errors').toEqual([]);
      expect(problems).toEqual([]);
    });
  }
}
