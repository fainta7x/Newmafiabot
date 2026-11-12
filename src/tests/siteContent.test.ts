import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { SITE_BLOCKS, listSiteBlocks, loadSiteTexts, resetSiteBlock, resetSiteContentSchemaForTests, saveSiteBlock } from '../server/services/siteContentService.ts';
import { listPostTemplates, resetPostTemplateSchemaForTests } from '../server/services/postTemplateService.ts';

let db: DatabaseWrapper;
beforeEach(() => { resetSiteContentSchemaForTests(); resetPostTemplateSchemaForTests(); db = createDatabaseConnection(':memory:'); });
afterEach(() => { try { db.sqlite.close(); } catch {} });

describe('texts of the club site edited in the CRM', () => {
  it('shows the defaults until a text is saved, then the saved one, then the default again', async () => {
    const before = await loadSiteTexts(db);
    expect(Object.keys(before)).toEqual(SITE_BLOCKS.map((block) => block.key));
    await saveSiteBlock(db, 'about', '  Новый текст  ');
    expect((await loadSiteTexts(db)).about).toBe('Новый текст');
    expect((await listSiteBlocks(db)).find((block) => block.key === 'about')?.customized).toBe(true);
    await resetSiteBlock(db, 'about');
    expect((await loadSiteTexts(db)).about).toBe(before.about);
  });

  it('refuses an empty text and a link that is not https', async () => {
    await expect(saveSiteBlock(db, 'about', '   ')).rejects.toMatchObject({ status: 400 });
    await expect(saveSiteBlock(db, 'telegram_url', 'javascript:alert(1)')).rejects.toMatchObject({ status: 400 });
    await saveSiteBlock(db, 'telegram_url', 'https://t.me/club');
    expect((await loadSiteTexts(db)).telegram_url).toBe('https://t.me/club');
  });

  it('does not leak into the list of post texts that share the table', async () => {
    await saveSiteBlock(db, 'about', 'Текст');
    expect((await listPostTemplates(db)).some((template) => template.key.startsWith('site.'))).toBe(false);
  });
});
