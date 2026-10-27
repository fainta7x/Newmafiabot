import { expect, test } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

// The detector checks itself: each page holds one known defect, which it must report, and a clean page reports nothing.
// After changing the detector run this first — a gate that stops seeing defects is worse than none.
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#111;color:#fff;font:14px sans-serif}</style></head><body>${body}</body></html>`;

const CASES = [
  ['clean page', page('<div style="padding:20px"><h1>Заголовок</h1><button>Кнопка</button></div>'), null],
  ['label cut to «…», text far wider than its box', page('<div style="width:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Очень длинное название этапа голосования</div>'), /truncated/],
  ['text on text', page('<div style="position:relative;height:40px"><span style="position:absolute;left:10px;top:10px">Первый текст</span><span style="position:absolute;left:30px;top:12px">Второй текст</span></div>'), /text on text/],
  ['button partly under a translucent badge', page('<button style="position:absolute;left:100px;top:10px;width:80px;height:30px">Авто</button><div style="position:fixed;left:40px;top:8px;width:90px;height:20px;pointer-events:none;background:rgba(255,200,0,.1);backdrop-filter:blur(8px)">ТЕСТ</div>'), /covered button «Авто»/],
  ['button with its caption hidden', page('<button style="width:30px;height:30px"><span style="display:none">Авто</span></button>'), /empty button/],
  ['a fixed button over a label', page('<div style="padding:10px"><span style="background:#333;padding:2px 8px">ТЕСТ</span></div><button style="position:fixed;left:8px;top:6px;width:28px;height:28px;background:rgba(255,200,0,.08);backdrop-filter:blur(6px);border:1px solid #555" aria-label="Состояние"><svg width="14" height="14"><rect width="14" height="14" fill="#fc0"/></svg></button>'), /text «ТЕСТ» covered by/],
  ['setup text under an open window is fine', page('<p>Текст страницы</p><div style="position:fixed;inset:0;background:rgba(9,10,13,.95)"><p style="margin-top:120px">Окно</p></div>'), null],
  ['a fixed window inside a clipped page is not cut', page('<div style="overflow:hidden;height:50px;margin-top:60px"><div style="position:fixed;inset:0;background:#121318;padding:10px"><div>Раздача ролей</div></div></div>'), null],
  ['text cut by a box that hides overflow', page('<div style="width:80px;height:20px;overflow:hidden"><span style="white-space:nowrap">Следующий игрок →</span></div>'), /cut «Следующий/],
];

for (const [name, html, expected] of CASES) {
  test(`layout detector: ${name}`, async ({ page: tab }) => {
    await tab.setViewportSize({ width: 390, height: 300 });
    await tab.setContent(html);
    const found = await tab.evaluate(auditScreen);
    if (expected) expect(found.join('\n')).toMatch(expected);
    else expect(found).toEqual([]);
  });
}
