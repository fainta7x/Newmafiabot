import {expect,test} from '@playwright/test';
import {auditScreen} from './support/layoutAudit.mjs';
const typeWord=async(page,word)=>{for(const letter of word)await page.getByRole('button',{name:new RegExp(`^Буква ${letter}`)}).click();};
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
  await typeWord(page,'ааааа');
  await page.getByRole('button',{name:'Проверить слово'}).click();
  await expect(page.getByRole('alert')).toContainText('Слова нет в словаре');
  expect(await page.evaluate(auditScreen)).toEqual([]);
  // Letters go into the cells chosen by tapping them, not only in order: «а» in cell 2, then «с» in cell 1 (skipping filled ones).
  await page.getByRole('button',{name:'Стереть'}).click();
  for(let i=0;i<5;i++)await page.getByRole('button',{name:'Стереть'}).click();
  await page.getByRole('button',{name:/Клетка 2 из 5/}).click();
  await typeWord(page,'а');
  await expect(page.getByRole('button',{name:'Клетка 2 из 5: а'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Клетка 1 из 5: пусто'})).toBeVisible();
  await page.getByRole('button',{name:/Клетка 1 из 5/}).click();
  await typeWord(page,'м');
  await expect(page.getByRole('button',{name:'Клетка 1 из 5: м'})).toBeVisible();
  await page.getByRole('button',{name:/Клетка 3 из 5/}).click();
  await typeWord(page,'ска');
  await expect(page.getByRole('button',{name:'Проверить слово'})).toBeEnabled();
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
test('daily word accepts a physical keyboard: letters, arrows, backspace, Enter',async({page})=>{
 await page.setViewportSize({width:1366,height:768});
 await page.goto('/e2e/daily-word.html');
 await expect(page.getByText('Бесплатная партия',{exact:true})).toBeVisible();
 // Playwright cannot press Cyrillic keys by name, so the key event is dispatched as a real keyboard would send it.
 const press=(key)=>page.evaluate((k)=>window.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true})),key);
 await press('м');await press('а');
 await press('ArrowRight');await press('ArrowRight');
 await press('к');
 await expect(page.getByRole('button',{name:'Клетка 5 из 5: к'})).toBeVisible();
 await page.getByRole('button',{name:/Клетка 5 из 5/}).click();
 await press('Backspace');
 await expect(page.getByRole('button',{name:'Клетка 5 из 5: пусто'})).toBeVisible();
 await press('а');
 await expect(page.getByRole('button',{name:'Клетка 5 из 5: а'})).toBeVisible();
});
