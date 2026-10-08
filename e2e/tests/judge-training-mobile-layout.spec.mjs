import { expect, test } from '@playwright/test';

const TRAINING_ROLES = [
  'Мирный', 'Мирный', 'Мафия', 'Мирный', 'Дон',
  'Мирный', 'Мирный', 'Шериф', 'Мафия', 'Мирный',
];

test.describe.configure({ retries: 0 });

for (const width of [360, 390]) {
  test(`guided judge practice does not overlap player identities at ${width}px`, async ({ page }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/e2e/live-game.html?mode=training');

    for (let seat = 1; seat <= 10; seat += 1) {
      const description = await page.getByTestId('judge-training-seat-task').innerText();
      const player = description.match(/Игрок \d+/)?.[0];
      expect(player, `training seat ${seat} should name a player`).toBeTruthy();
      await page.getByRole('button', { name: `${player} +`, exact: true }).click();
    }
    await page.getByTestId('judge-training-seat-finish').click();
    // Training first teaches seat order, then the real judge workflow requires
    // an explicit confirmation of that already assembled ten-player roster.
    await page.getByRole('button', { name: 'Подтвердить состав' }).click();
    await page.getByRole('button', { name: /Начать раздачу ролей/ }).click();

    const intro = page.getByText('Подготовьте 10 карт');
    await expect(intro).toBeVisible();
    await intro.locator('xpath=ancestor::section[1]').getByRole('button', { name: 'Начать раздачу', exact: true }).click();

    for (const role of TRAINING_ROLES) {
      await page.getByRole('button', { name: new RegExp(role) }).click();
    }
    await page.getByRole('button', { name: /Роли зафиксированы/ }).click();

    const shell = page.locator('.evening-live-engine-shell[data-training-input-gate="active"]');
    const coach = page.getByTestId('judge-conduct-coach');
    await expect(coach).toBeVisible();
    await expect(shell.locator('.live-seat-card')).toHaveCount(10);
    await expect(page.locator('.evening-live-identity-layer')).toHaveCount(0);
    await expect(page.locator('button[title="OBS-трансляция"]')).toHaveCount(0);

    const geometry = await page.evaluate(() => {
      const modal = document.querySelector('.fixed.inset-0.z-\\[95\\]');
      const shell = document.querySelector('.evening-live-engine-shell[data-training-input-gate="active"]');
      const coach = document.querySelector('[data-testid="judge-conduct-coach"]');
      const cards = Array.from(shell?.querySelectorAll('.live-seat-card') || []);
      const seatBounds = cards.map((card) => {
        const name = card.querySelector('.live-seat-footer__name');
        const seatRect = card.getBoundingClientRect();
        const labelRect = name?.getBoundingClientRect();
        return {
          label: name?.textContent,
          visible: name && getComputedStyle(name).display !== 'none',
          inside: Boolean(labelRect &&
            labelRect.left >= seatRect.left - 1 &&
            labelRect.right <= seatRect.right + 1 &&
            labelRect.top >= seatRect.top - 1 &&
            labelRect.bottom <= seatRect.bottom + 1),
        };
      });
      return {
        directChild: shell?.parentElement === modal,
        coachSibling: coach?.parentElement === modal,
        scrollY: shell ? getComputedStyle(shell).overflowY : '',
        scrollHeight: shell?.scrollHeight ?? 0,
        clientHeight: shell?.clientHeight ?? 0,
        docWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        seatBounds,
      };
    });

    expect(geometry.directChild).toBe(true);
    expect(geometry.coachSibling).toBe(true);
    expect(geometry.scrollY).toBe('auto');
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
    expect(geometry.docWidth).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.seatBounds).toHaveLength(10);
    for (const seat of geometry.seatBounds) {
      expect(seat.label).toMatch(/^Игрок \d+$/);
      expect(seat.visible).toBe(true);
      expect(seat.inside).toBe(true);
    }

    // Last-row seats must be reachable by scrolling the game, not by
    // scrolling an outer wrapper or covering the center controls.
    await shell.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const lastRow = shell.locator('.live-seat-card[data-seat="7"]');
    await expect(lastRow).toBeInViewport();
    await expect(lastRow.locator('.live-seat-footer__name')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`judge-training-${width}.png`), fullPage: false });
  });
}
