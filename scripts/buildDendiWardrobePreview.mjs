import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'temp/ui-preview/dendi-wardrobe.html'));
const layerDir = path.join(root, 'temp/dendi-portrait-layers');
execFileSync(process.execPath, [path.join(root, 'scripts/buildDendiPortraitLayers.mjs'), layerDir], { cwd: root, stdio: 'inherit' });
const asset = async(file, mime='image/png') => `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
const face = await asset(path.join(layerDir, 'dendi-face-hair-base.png'));
const suit = await asset(path.join(layerDir, 'dendi-original-suit.png'));
const hat = await asset(path.join(root, 'public/cosmetics/autumn-fedora-v1.svg'), 'image/svg+xml');
const source = await asset(path.join(root, 'public/player-avatars/dendi.jpg'), 'image/jpeg');
const imports = `import React from 'react';import{createRoot}from'react-dom/client';import DendiWardrobePrototype from './src/components/player/DendiWardrobePrototype.tsx';createRoot(document.getElementById('root')!).render(<DendiWardrobePrototype faceUrl={${JSON.stringify(face)}} suitUrl={${JSON.stringify(suit)}} hatUrl={${JSON.stringify(hat)}} sourceUrl={${JSON.stringify(source)}}/>);`;
const result = await build({
  stdin: { contents: imports, resolveDir: root, loader: 'tsx', sourcefile: 'dendi-preview.tsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser', minify: true, jsx: 'automatic',
  define: {'process.env.NODE_ENV': '"production"'}, outfile: 'preview.js',
});
const js = result.outputFiles.find(f=>f.path.endsWith('.js'))?.text.replace(/<\/script/gi,'<\\/script');
const css = result.outputFiles.find(f=>f.path.endsWith('.css'))?.text || '';
if (!js || !css) throw new Error('Dendi preview JS or CSS missing');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>2LA NOIRE · Гардероб Денди · проверка</title><style>body{margin:0;background:#100d13}${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`);
console.log(`Standalone Dendi wardrobe preview: ${out}`);
