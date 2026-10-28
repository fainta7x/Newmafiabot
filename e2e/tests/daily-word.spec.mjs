import {expect,test} from '@playwright/test';
import {auditScreen} from './support/layoutAudit.mjs';
for(const [width,height] of [[360,640],[390,844],[1366,768],[1440,900]]){
 test(`daily word actions and states ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height});
  for(const mode of ['new','long','playing','won','lost','admin','error','card']){
   await page.goto(`/e2e/daily-word.html?mode=${mode}`);
   if(mode==='error')await expect(page.getByRole('alert')).toContainText('Нет связи');
   else if(mode==='card')await expect(page.getByRole('button',{name:/Играть бесплатно/})).toBeVisible();
   else await expect(page.getByText('Бесплатная партия',{exact:true})).toBeVisible();
   expect(await page.evaluate(auditScreen)).toEqual([]);
   await page.screenshot({path:info.outputPath(`${mode}.png`),fullPage:true});
   if(mode==='admin'){
    await page.getByText('Назначить слова · владелец клуба').click();
    await page.getByLabel('Дата',{exact:true}).fill('2026-11-02');
    await page.getByLabel('Слово · 4–8 букв').fill('книга');
    await page.getByRole('button',{name:'Сохранить слово'}).click();
    await expect(page.getByText('Слово сохранено')).toBeVisible();
    expect(await page.evaluate(auditScreen)).toEqual([]);
   }
   if(mode==='lost'){
    await page.getByRole('button',{name:'Показать ответ'}).click();
    await expect(page.getByText('Ответ: маска')).toBeVisible();
    expect(await page.evaluate(auditScreen)).toEqual([]);
   }
   if(mode==='error'){
    await page.getByRole('button',{name:'Повторить загрузку'}).click();
    await expect(page.getByText('Бесплатная партия',{exact:true})).toBeVisible();
   }
  }
  await page.goto('/e2e/daily-word.html');
  await page.getByLabel('Слово из 5 букв',{exact:true}).fill('ааааа');
  await page.getByRole('button',{name:'Проверить слово'}).click();
  await expect(page.getByRole('alert')).toContainText('Слова нет в словаре');
  expect(await page.evaluate(auditScreen)).toEqual([]);
  await page.getByLabel('Слово из 5 букв',{exact:true}).fill('маска');
  await page.getByRole('button',{name:'Проверить слово'}).click();
  await expect(page.getByText('Слово разгадано!')).toBeVisible();
  await expect(page.getByText('Попыток: 1 из 6. Начислено 200 жетонов.')).toBeVisible();
  expect(await page.evaluate(auditScreen)).toEqual([]);
 });
}
test('daily word reachable from home and mini-games',async({page})=>{
 await page.goto('/e2e/player-cabinet.html');
 await page.getByRole('button',{name:/Играть бесплатно/}).click();
 await expect(page.getByTestId('daily-word')).toBeVisible();
 await page.getByRole('button',{name:'← Мини-игры'}).click();
 await page.getByTestId('player-club-daily-word').click();
 await expect(page.getByTestId('daily-word')).toBeVisible();
});
