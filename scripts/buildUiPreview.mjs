import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'temp/ui-preview');
const pages = [
  'preview/index.html',
  'e2e/crm-evening-roster.html',
  'e2e/live-game.html',
  'e2e/tournament-live-game.html',
  'e2e/live-game-overlay.html',
  'e2e/player-shell.html',
  'e2e/split-vote.html',
  'e2e/player-cabinet.html',
  'e2e/daily-word.html',
  'e2e/player-profile.html',
  'e2e/gomafia-career.html',
  'e2e/crm-overview.html',
  'e2e/publication-recovery.html',
  'e2e/crm-login.html',
  'e2e/organizer-crm.html',
  'e2e/crm-analytics.html',
  'e2e/player-game-detail.html',
  'e2e/live-reveal.html',
  'e2e/trophy-icons.html',
  'e2e/project-board.html',
  'e2e/live-broadcast-reveal.html',
  'e2e/crm-evenings.html',
  'e2e/owner-evenings.html',
  'e2e/crm-players.html',
  'e2e/crm-more.html',
  'e2e/evening-prices.html',
  'e2e/crm-closeout.html',
  'e2e/poker-harness.html',
  'e2e/protocol-window.html',
  // Pages of the whole-app layout and text audit (e2e/tests/app-text-audit.spec.mjs) that no other preview check opens.
  'e2e/player-rating.html',
  'e2e/profile-form.html',
  'e2e/live-game-cabinet.html',
];
const bootstrapSource = 'src/lib/uiPreviewProductionBootstrap.ts';
const bootstrapPath = path.join(root, bootstrapSource);
const telegramPreviewPlugin = {
  name: 'telegram-preview-production-bootstrap',
  transformIndexHtml() {
    return [{
      tag: 'script',
      attrs: { type: 'module', src: `/${bootstrapSource}` },
      injectTo: 'head-prepend',
    }];
  },
};
await build({
  configFile: path.join(root, 'vite.config.ts'),
  plugins: [telegramPreviewPlugin],
  // Do not copy uploads, checkpoints, avatars or other runtime data.
  publicDir: false,
  build: {
    outDir: output,
    emptyOutDir: true,
    sourcemap: false,
    manifest: true,
    rolldownOptions: { input: [...pages.map((file) => path.join(root, file)), bootstrapPath] },
  },
});
// The poker harness needs only the checked-in art bundle. Keep uploads, avatars,
// checkpoints and other runtime files out of the isolated preview artifact.
await cp(path.join(root, 'public/assets/poker'), path.join(output, 'assets/poker'), { recursive: true });
const manifest = JSON.parse(await readFile(path.join(output, '.vite/manifest.json'), 'utf8'));
const bootstrapAsset = manifest[bootstrapSource]?.file;
if (!bootstrapAsset) throw new Error(`UI preview bootstrap asset missing from Vite manifest: ${bootstrapSource}`);
const csp = "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";
for (const file of pages) {
  const target = path.join(output, file);
  let html = (await readFile(target, 'utf8')).replace(/<link\b[^>]*href=["']https?:\/\/[^>]*>/gi, '');
  html = html.replace(`/${bootstrapSource}`, `/${bootstrapAsset}`);
  html = html.replace('<head>', '<head>\n<meta http-equiv="Content-Security-Policy" content="' + csp + '">');
  await writeFile(target, html);
}
await writeFile(path.join(output, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=preview/index.html"><a href="preview/index.html">Открыть предпросмотр</a>');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim());
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'revision.json'), JSON.stringify({ commit, dirty }));
console.log('Isolated UI preview: temp/ui-preview');
