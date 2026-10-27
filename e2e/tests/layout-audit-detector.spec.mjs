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
  ['page text scrolled under a fixed bottom menu is fine', page('<div style="height:900px;padding:10px"><p style="margin-top:250px">Текст страницы</p><button style="margin-top:4px">Кнопка страницы</button></div><nav style="position:fixed;left:0;right:0;bottom:0;height:60px;background:#111;display:flex;gap:10px"><button>Главная</button><button>Вечера</button></nav>'), null],
  ['the last text a bottom menu hides for good is not', page('<div style="height:300px;padding:10px;box-sizing:border-box"><p style="margin-top:250px">Последняя строка</p></div><nav style="position:fixed;left:0;right:0;bottom:0;height:60px;background:#111"><button>Главная</button></nav>'), /covered by/],
  ['a percentage inside an svg ring is fine', page('<div style="position:relative;width:80px;height:80px"><span style="position:absolute;inset:0;display:grid;place-items:center">58%</span><svg style="position:absolute;inset:0" width="80" height="80"><circle cx="40" cy="40" r="34" stroke="#fc0" stroke-width="6" fill="none"/></svg></div>'), null],
  ['a label cut to «…» is not over its neighbour', page('<div style="display:flex;width:200px;gap:8px"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Очень длинный ник игрока клуба</span><span>+1</span></div>'), /^truncated[^\n]*$/],
  ['a sideways scrolling strip of chips is fine', page('<div style="overflow:hidden;width:390px"><nav style="display:flex;gap:8px;overflow-x:auto;padding:8px">' + ['Данные', 'Уведомления', 'Приглашения', 'Приватность', 'Музыка'].map((t) => `<a style="flex:none;border:1px solid #555;padding:10px 12px">${t}</a>`).join('') + '</nav></div>'), null],
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
