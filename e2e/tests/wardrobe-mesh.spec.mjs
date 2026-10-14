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
   const shirtStage=editor.getByTestId('role-look-preview');
   await editor.getByRole('button',{name:/Медный лист/}).click();
   await expect.poll(()=>shirtStage.getByRole('img',{name:'Головной убор',exact:true}).evaluate(i=>i.complete&&i.naturalWidth===512)).toBe(true);
   await expect(shirtStage.locator('canvas.role-portrait-portrait_shirt')).toHaveAttribute('data-rendered','true');
   await shirtStage.screenshot({path:testInfo.outputPath(`shirt-neck-${name}-${width}.png`)});
   await editor.getByRole('button',{name:/Багряный пиджак/}).click();
   const coat=editor.getByTestId('role-look-preview').getByRole('img',{name:'Пиджак',exact:true});
   await expect(coat).toHaveAttribute('data-asset-url',name==='Фандорин'?/jacket-burgundy-v4/:/jacket-burgundy-curved/);await expect(coat).toHaveAttribute('data-rendered','true');
   const preview=editor.getByTestId('role-look-preview');
   const shirt=preview.locator('canvas.role-portrait-portrait_shirt');
   await expect(shirt).toHaveAttribute('data-rendered','true');
   // A closed coat covers shirt sleeves, preventing white strips in armholes.
   expect(await shirt.evaluate(c=>{
    const rgba=c.getContext('2d').getImageData(0,0,512,640).data;
    for(let y=320;y<640;y++)for(const x of [48,100,410,464])if(rgba[(y*512+x)*4+3])return false;
    return true;
   })).toBe(true);
   const hat=preview.getByRole('img',{name:'Головной убор',exact:true});
   await expect.poll(()=>hat.evaluate(i=>i.complete&&i.naturalWidth===512)).toBe(true);
   const base=preview.getByAltText('Портрет игрока');
   await expect(base).toHaveCSS('transform-origin','0px 0px');
   expect(await base.evaluate(i=>getComputedStyle(i).transform)).not.toBe('none');
   expect(await hat.evaluate(i=>getComputedStyle(i).transform)).not.toBe('none');
   await preview.screenshot({path:testInfo.outputPath(`outfit-${name}-${width}.png`)});
   if(name==='Джава'){
    await expect(active().getByLabel('Шаблон фигуры')).toHaveValue('curved-slim');
    await editor.getByRole('group',{name:'Головной убор',exact:true}).getByRole('button',{name:'Без предмета',exact:true}).click();
    await expect(preview.getByRole('img',{name:'Головной убор',exact:true})).toHaveCount(0);
    await preview.screenshot({path:testInfo.outputPath(`collar-burgundy-no-hat-${width}.png`)});
    await editor.getByRole('button',{name:/Чёрный пиджак/}).click();
    await expect(coat).toHaveAttribute('data-asset-url',/jacket-black-curved/);
    await expect(coat).toHaveAttribute('data-rendered','true');
    await preview.screenshot({path:testInfo.outputPath(`collar-black-no-hat-${width}.png`)});
    await editor.getByRole('button',{name:/Медный лист/}).click();
    await expect.poll(()=>preview.getByRole('img',{name:'Головной убор',exact:true}).evaluate(i=>i.complete&&i.naturalWidth===512)).toBe(true);
    await preview.screenshot({path:testInfo.outputPath(`collar-black-hat-${width}.png`)});
    const slimPixels=await coat.evaluate(c=>c.toDataURL());
    await active().getByLabel('Шаблон фигуры').selectOption('curved-full');
    await expect.poll(()=>coat.evaluate(c=>c.toDataURL())).not.toBe(slimPixels);
    await preview.screenshot({path:testInfo.outputPath(`java-curved-full-${width}.png`)});
    await active().getByLabel('Шаблон фигуры').selectOption('curved-slim');
   }
   if(name==='Фандорин'){
    const face=preview.getByAltText('Портрет игрока'),source=await face.getAttribute('src');
    await expect(face).toHaveAttribute('src',/fandorin-clean/);
    await editor.getByRole('button',{name:/Квадратные очки/}).click();
    const glasses=preview.getByRole('img',{name:'Очки',exact:true});
    await expect.poll(()=>glasses.evaluate(i=>i.complete&&i.naturalWidth===512)).toBe(true);
    expect(await glasses.evaluate(i=>getComputedStyle(i).transform)).not.toBe('none');
    await preview.screenshot({path:testInfo.outputPath(`fandorin-glasses-${width}.png`)});
    await editor.getByRole('group',{name:'Очки',exact:true}).getByRole('button',{name:'Без предмета',exact:true}).click();
    await expect(glasses).toHaveCount(0);await expect(face).toHaveAttribute('src',source);
   }
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
   await expect(coat).toHaveAttribute('data-rendered','true');await expect(coat).toHaveAttribute('data-asset-url',id==='fandorin'?/jacket-burgundy-v4/:/jacket-burgundy-curved/);
  }
  const pixels=await comparison.locator('canvas[aria-label="Пиджак"]').evaluateAll(nodes=>nodes.map(c=>c.toDataURL()));
  // Identical template uses identical garment pixels regardless of player identity.
  expect(pixels[0]).toBe(pixels[1]);expect(pixels[0]).not.toBe(pixels[2]);
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
  const savedWaist=await active().getByLabel('Талия',{exact:true}).inputValue();
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
  await expect(active().getByLabel('Талия',{exact:true})).toHaveValue(savedWaist);
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
