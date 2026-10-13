import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`modular Dendi skin editor at ${width}px`, async ({page}, testInfo) => {
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width,height:860});
    await page.goto('/dendi-skin.html');
    await expect(page.getByRole('heading',{name:'Денди'})).toBeVisible();
    await expect(page.locator('#rig-stage svg [data-base="identity"]')).toHaveCount(1);
    await expect(page.locator('#rig-stage svg [data-base="hair"]')).toHaveCount(1);
    await expect(page.getByRole('button',{name:'Мирный'})).toHaveAttribute('aria-pressed','true');

    const visible=(item)=>page.locator(`#rig-stage svg [data-item="${item}"]`)
      .evaluate(g=>getComputedStyle(g).display!=='none');
    expect(await visible('coat-wine')).toBe(true);
    expect(await visible('coat-ink')).toBe(false);
    expect(await visible('hat-fedora')).toBe(false);
    await page.getByRole('button',{name:'Головной убор'}).click();
    await page.getByRole('button',{name:/Бордовая федора/}).click();
    expect(await visible('hat-fedora')).toBe(true);
    expect(await visible('coat-wine')).toBe(true);
    await expect(page.getByRole('button',{name:'Сохранить образ'})).toBeEnabled();

    await page.getByRole('button',{name:'Мафия'}).click();
    expect(await visible('coat-ink')).toBe(true);
    expect(await visible('hat-ink')).toBe(true);
    await page.getByRole('button',{name:'Мирный'}).click();
    expect(await visible('hat-fedora')).toBe(true);

    await page.getByRole('button',{name:'Пиджак'}).click();
    await page.getByRole('button',{name:/Чёрный классический/}).click();
    expect(await visible('coat-ink')).toBe(true);
    expect(await visible('hat-fedora')).toBe(true); // other slot unchanged
    await page.getByRole('button',{name:'Сохранить образ'}).click();
    await expect(page.getByText('Образ сохранён в этом браузере.')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading',{name:'Денди'})).toBeVisible();
    expect(await visible('coat-ink')).toBe(true);
    expect(await visible('hat-fedora')).toBe(true);
    await page.getByRole('button',{name:/Сравнить 4 образа/}).click();
    await expect(page.getByRole('dialog',{name:'Четыре ролевых образа'})).toBeVisible();
    await expect(page.locator('.compare-item svg')).toHaveCount(4);
    await page.getByRole('button',{name:'Закрыть сравнение'}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({path:testInfo.outputPath(`dendi-skin-editor-${width}.png`),fullPage:true});
  });
}
