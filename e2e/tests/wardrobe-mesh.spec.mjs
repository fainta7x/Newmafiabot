import {test,expect} from '@playwright/test';
for(const width of [360,390,1440]){
 test(`one garment fits three characters with independent wardrobes at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await page.goto('/e2e/cosmetics-lab.html');
  const active=()=>page.locator('.cosmetics-lab-character-view:not([hidden])');
  const selector=page.getByRole('group',{name:'Персонаж примерки'});
  for(const name of ['Денди','Джава','Фандорин']){
   await selector.getByRole('button',{name,exact:true}).click();
   const editor=active().locator('.role-looks-editor');
   await editor.getByRole('button',{name:'Дон',exact:true}).click();
   await editor.getByRole('button',{name:/Багряный пиджак/}).click();
   const coat=editor.getByTestId('role-look-preview').getByRole('img',{name:'Пиджак',exact:true});
   await expect(coat).toHaveAttribute('data-asset-url',/jacket-burgundy-v3/);await expect(coat).toHaveAttribute('data-rendered','true');
   const preview=editor.getByTestId('role-look-preview');
   const shirt=preview.locator('canvas.role-portrait-portrait_shirt');
   await expect(shirt).toHaveAttribute('data-rendered','true');
   // A closed coat covers shirt sleeves, preventing white strips in armholes.
   expect(await shirt.evaluate(c=>{
    const rgba=c.getContext('2d').getImageData(0,0,512,640).data;
    for(let y=320;y<640;y++)for(const x of [100,150,360,410])if(rgba[(y*512+x)*4+3])return false;
    return true;
   })).toBe(true);
   await preview.screenshot({path:testInfo.outputPath(`outfit-${name}-${width}.png`)});
   const summary=editor.locator('.role-looks-compare>summary');
   expect(await summary.evaluate(el=>getComputedStyle(el).display)).toBe('block');
   await editor.getByLabel('Фраза',{exact:true}).fill(`Образ: ${name}`);
   await editor.getByRole('button',{name:'Сохранить: Дон',exact:true}).click();
   await expect(editor.getByRole('status')).toContainText('сохранён');
  }
  await active().getByText('Эта же одежда на трёх персонажах',{exact:true}).click();
  const comparison=active().locator('.cosmetics-lab-cross-grid');await expect(comparison).toBeVisible();
  for(const id of ['dendi','java','fandorin']){
   const card=comparison.getByTestId(`shared-fit-${id}`),coat=card.getByRole('img',{name:'Пиджак',exact:true});
   await expect(coat).toHaveAttribute('data-rendered','true');await expect(coat).toHaveAttribute('data-asset-url',/jacket-burgundy-v3/);
  }
  const pixels=await comparison.locator('canvas[aria-label="Пиджак"]').evaluateAll(nodes=>nodes.map(c=>c.toDataURL()));
  expect(new Set(pixels).size).toBe(3);
  await active().getByText('Посадка одежды · Фандорин',{exact:true}).click();
  const editor=active().locator('.role-looks-editor'),face=editor.getByTestId('role-look-preview').getByAltText('Портрет игрока');
  const originalFace=await face.getAttribute('src');
  const stage=editor.getByTestId('role-look-preview');
  const before=await stage.locator('canvas[aria-label="Пиджак"]').evaluate(c=>c.toDataURL());
  await active().getByLabel('Талия',{exact:true}).focus();await active().getByLabel('Талия',{exact:true}).press('ArrowLeft');
  await expect.poll(()=>stage.locator('canvas[aria-label="Пиджак"]').evaluate(c=>c.toDataURL())).not.toBe(before);
  await expect(face).toHaveAttribute('src',originalFace);
  await active().getByLabel('Показать сетку',{exact:true}).check();await expect(stage.getByRole('img',{name:'Сетка посадки одежды'})).toBeVisible();
  await active().getByRole('button',{name:'Сохранить посадку',exact:true}).click();
  await active().getByRole('group',{name:'Роль на трансляции'}).getByRole('button',{name:'Дон',exact:true}).click();
  await active().getByRole('button',{name:'Зафиксировать образ для тестовой игры'}).click();
  const frozen=active().getByTestId('lab-frozen-card').getByRole('img',{name:'Пиджак',exact:true});await expect(frozen).toHaveAttribute('data-rendered','true');
  const frozenPixels=await frozen.evaluate(c=>c.toDataURL());
  await active().getByLabel('Талия',{exact:true}).press('ArrowLeft');
  expect(await frozen.evaluate(c=>c.toDataURL())).toBe(frozenPixels);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`three-character-mesh-${width}.png`),fullPage:true});
  await page.reload();await selector.getByRole('button',{name:'Фандорин',exact:true}).click();
  await active().locator('.role-looks-editor').getByRole('button',{name:'Дон',exact:true}).click();
  await expect(active().getByLabel('Фраза',{exact:true})).toHaveValue('Образ: Фандорин');
  await expect(active().getByLabel('Талия',{exact:true})).toHaveValue('0.29');
 });
}
test('offline package embeds three distinct portrait bases and renders fitted clothing',async({page})=>{
 await page.goto('/fiery-autumn-standalone.html');
 const selector=page.getByRole('group',{name:'Персонаж примерки'});
 const sources=[];
 for(const name of ['Денди','Джава','Фандорин']){
  await selector.getByRole('button',{name,exact:true}).click();const active=page.locator('.cosmetics-lab-character-view:not([hidden])');
  const stage=active.getByTestId('role-look-preview');const face=stage.getByAltText('Портрет игрока');
  await expect.poll(()=>face.evaluate(i=>i.complete&&i.naturalWidth===512)).toBe(true);sources.push(await face.getAttribute('src'));
  await active.locator('.role-looks-editor').getByRole('button',{name:/Багряный пиджак/}).click();
  await expect(stage.getByRole('img',{name:'Пиджак',exact:true})).toHaveAttribute('data-rendered','true');
 }
 expect(new Set(sources).size).toBe(3);expect(sources.every(s=>s.startsWith('data:image/png;'))).toBe(true);
});
