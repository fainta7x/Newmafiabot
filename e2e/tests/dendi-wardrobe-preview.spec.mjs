import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`Dendi original avatar layers and four role outfits at ${width}px`, async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    await page.goto('/dendi-wardrobe.html');
    await expect(page.getByRole('heading',{name:'Гардероб'})).toBeVisible();
    await expect(page.getByAltText('Портрет игрока')).toBeVisible();
    // The old isolated ellipse was visibly chopped off on Android: the scene
    // must now have a continuous panel-wide backdrop behind transparent PNGs.
    await expect(page.locator('.dgw-halo')).toHaveCount(0);
    const surface = await page.locator('.dgw-portrait-stage').evaluate(element => {
      const style = getComputedStyle(element);
      const portrait = element.querySelector('.role-portrait');
      const figureStyle = portrait ? getComputedStyle(portrait) : null;
      return {
        backgroundImage: style.backgroundImage,
        clip: style.overflow,
        figureMask: figureStyle?.maskImage || figureStyle?.webkitMaskImage || '',
      };
    });
    expect(surface.backgroundImage).toContain('linear-gradient');
    expect(surface.clip).toBe('hidden');
    expect(surface.figureMask).toContain('linear-gradient');
    await expect(page.getByRole('button',{name:'Мирный'})).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.dgw-portrait-stage .role-portrait-body-base')).toHaveCount(1); // original suit is NOT an item
    await expect(page.locator('.dgw-portrait-stage .role-portrait-layer')).toHaveCount(0);
    // The original JPG suit contains hands/bow tie/shirt: don't sell it as a
    // removable jacket before these underlying pixels are reconstructed.
    await page.locator('.dgw-slot[title="Нужен самостоятельный проверенный слой"]').first().click();
    await expect(page.getByText(/Оригинальный пиджак пока неотделим/)).toBeVisible();
    await expect(page.getByRole('button',{name:/Оригинальный костюм Денди/})).toHaveCount(0);
    if(width===390){
      const rect=await page.locator('.dgw-kit-head').boundingBox();
      expect(rect?.y??Infinity).toBeLessThan(820);
    }
    await page.locator('.dgw-slot[title="Шляпа"]').click();
    await expect(page.getByRole('button',{name:/Черновая шляпа/})).toBeVisible();
    await page.getByRole('button',{name:/Черновая шляпа/}).click();
    await expect(page.locator('.dgw-portrait-stage .role-portrait-layer')).toHaveCount(1);
    await page.getByRole('button',{name:'Запомнить примерку'}).click();
    await expect(page.getByRole('status')).toContainText('в этой примерке');
    await page.getByRole('button',{name:'Дон'}).click();
    await expect(page.locator('.dgw-portrait-stage .role-portrait-layer')).toHaveCount(0);
    await page.getByRole('button',{name:'Мирный'}).click();
    await expect(page.locator('.dgw-portrait-stage .role-portrait-layer')).toHaveCount(1);
    await page.getByRole('button',{name:'4 роли'}).click();
    await expect(page.getByRole('dialog',{name:'Сравнение ролей'})).toBeVisible();
    await expect(page.locator('.dgw-four .role-portrait')).toHaveCount(4);
    await page.getByRole('button',{name:/Закрыть/}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({path:testInfo.outputPath(`dendi-wardrobe-${width}.png`),fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    expect(overflow).toBe(false);
  });
}
