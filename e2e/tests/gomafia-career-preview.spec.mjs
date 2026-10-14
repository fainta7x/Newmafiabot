import {test,expect} from '@playwright/test';
for (const width of [360,390]) {
 test(`automatic sports career and year filter at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});await page.goto('/e2e/gomafia-career.html');
  const panel=page.getByTestId('player-gomafia-link');
  await expect(panel.getByText('Турнирные выступления · 13',{exact:true})).toBeVisible();
  await expect(panel.getByTestId('gomafia-size-breakdown')).toBeVisible();
  await panel.getByRole('button',{name:/Большие турниры/}).click();
  await expect(panel.getByText('В этой категории пока нет подтверждённых турниров.')).toBeVisible();
  await panel.getByRole('button',{name:/Размер не подтверждён/}).click();
  await expect(panel.getByText('Турнирные выступления · 13',{exact:true})).toBeVisible();
  await expect(panel.getByTestId('gomafia-federation-stats').getByText('164',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`gomafia-all-${width}.png`),fullPage:true});
  await page.getByLabel('Год спортивной карьеры').selectOption('2026');
  await expect(panel.getByText('Турнирные выступления · 2',{exact:true})).toBeVisible();
  await expect(panel.getByTestId('gomafia-federation-stats').getByText('30',{exact:true})).toBeVisible();
  const cheaters=panel.locator('article').filter({hasText:'CHEATERS CUP 2026'});
  await expect(cheaters.getByText('11,3 баллов',{exact:true})).toBeVisible();
  await cheaters.locator('summary').click();
  await cheaters.getByText('№1 · Мирный · Место 6',{exact:true}).scrollIntoViewIfNeeded();
  await expect(cheaters.getByText('№1 · Мирный · Место 6',{exact:true})).toBeVisible();
  await expect(cheaters.getByText('Баллы: -0,2',{exact:true}).first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`gomafia-games-${width}.png`),fullPage:true});
  await page.getByLabel('Год спортивной карьеры').selectOption('2023');
  await expect(panel.getByTestId('gomafia-nomination')).toHaveCount(4);
  await expect(panel.getByText('Номинация: Лучший дон',{exact:true})).toBeVisible();
  await expect(panel.getByText('Номинация: MVP турнира',{exact:true})).toBeVisible();
  await panel.getByText('Номинация: MVP турнира',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath(`gomafia-nominations-${width}.png`),fullPage:true});
  await page.getByLabel('Год спортивной карьеры').selectOption('2022');
  await expect(panel.getByText('Турнирные выступления · 1',{exact:true})).toBeVisible();
  await expect(panel.getByRole('link',{name:'TULA MAFIA OPEN 2022 ↗'})).toBeVisible();
  await panel.getByText('Доступность данных и регистраций',{exact:true}).click();
  await expect(panel.getByText(/Автоматическое обнаружение будущей регистрации недоступно/)).toBeVisible();
 });
}
