import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

const players = [
  { id: 'p1', nickname: 'Алоэ', game_level: 'club', club_role: 'none', attendance_count: 7, contact_status: 'normal', host_formats: 'CASUAL', organize_formats: '', curator_areas: '' },
  { id: 'p2', nickname: 'Атеист с ножом', game_level: 'tournament', club_role: 'team', attendance_count: 1, contact_status: 'normal', host_formats: 'NOVICE,CASUAL', organize_formats: 'CASUAL,RATING', curator_areas: '' },
  { id: 'p3', nickname: 'Богданчик', game_level: 'tournament', club_role: 'organizer', attendance_count: 6, contact_status: 'normal', host_formats: '', organize_formats: '', curator_areas: 'NOVICES' },
  { id: 'p4', nickname: 'Новичок', game_level: 'novice', club_role: 'none', attendance_count: 0, contact_status: 'normal' },
];

for (const [width, height] of [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]]) {
  test(`«Уровни и роли» filters at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.route(/\/api\/players(\?.*)?$/, (route) => route.fulfill({ json: players }));
    await page.goto('/e2e/crm-more.html');
    await page.getByTestId('crm-more-cat-people').click();
    await page.getByTestId('crm-more-access').click();
    await expect(page.getByTestId('crm-access-quick-filters')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ведут игры · 2' })).toBeVisible();
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`access-${width}.png`), fullPage: false });
    await page.getByRole('button', { name: 'Ведут игры · 2' }).click();
    await expect(page.getByTestId('crm-access-bulk-count')).toContainText('Игроков: 2');
    await page.getByTestId('crm-access-filters-open').click();
    await expect(page.getByLabel('Уровень игры')).toBeVisible();
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`access-sheet-${width}.png`), fullPage: false });
  });
}
