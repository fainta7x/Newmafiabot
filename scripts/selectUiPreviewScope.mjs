import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const base = process.env.PR_BASE_SHA;
if (base && !/^[a-f0-9]{40}$/.test(base)) throw new Error('Invalid PR_BASE_SHA');
const changed = base ? execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean) : [];
// Scheduled/manual runs have no PR base and intentionally run the full audit.

// A mapping is deliberately opt-in. Unknown changes always run the whole suite.
// Components shared across multiple screens must NEVER be added to a narrow mapping.
const targeted = [
  { match: /^src\/components\/crm\/GiftCollectionCRM\.tsx$|^src\/server\/(services\/birthdayPostService|routes\/giftCollectionRoutes)\.ts$/, pages: ['crm-more'], specs: ['crm-visual-audit.spec.mjs'] },
  { match: /^src\/components\/player\/(PlayerEventSlotDetail|PlayerEveningSeatBooking)\.tsx$|^src\/server\/services\/eveningSeatBookingService\.ts$/, pages: ['cabinet-evening', 'cabinet-events'], specs: ['current-booking-preview.spec.mjs', 'mobile-usability.spec.mjs'] },
  { match: /^src\/components\/player\/PlayerDailyWord[^/]*\.tsx$|^src\/server\/services\/dailyWordService\.ts$/, pages: ['daily-word-'], specs: ['ui-preview.spec.mjs'] },
];
const selections = changed.map(file => /^e2e\/tests\/[a-zA-Z0-9_-]+\.spec\.mjs$/.test(file)
  ? { pages: [], specs: [file.slice('e2e/tests/'.length)] }
  : targeted.find(item => item.match.test(file)));
const full = !changed.length || selections.some(item => !item);
const pages = [...new Set(selections.filter(Boolean).flatMap(item => item.pages))];
const specs = [...new Set(selections.filter(Boolean).flatMap(item => item.specs))];
const grep = full ? '' : pages.map(name => name.endsWith('-') ? name + '[^ ]*' : name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const fileList = full ? '' : specs.join(',');
const auditSkip = !full && pages.length === 0;
console.log(JSON.stringify({ mode: full ? 'full' : 'targeted', changed, pages, specs, auditSkip }));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mode=${full ? 'full' : 'targeted'}\naudit_grep=${grep}\npreview_specs=${fileList}\naudit_skip=${auditSkip}\n`);
