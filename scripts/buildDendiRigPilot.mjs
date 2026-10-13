import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** One-click, self-contained actual editor built from the SAME assets as /character-editor/dendi.html. */
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'public/character-editor');
const [html,css,js,rig]=await Promise.all(['dendi.html','dendi-editor.css','dendi-editor.js','dendi-rig.svg']
  .map(name=>readFile(path.join(dir,name),'utf8')));
const serialized=JSON.stringify(rig).replace(/<\/script/gi,'<\\/script');
const page=html
  .replace('<link rel="stylesheet" href="./dendi-editor.css"/>',`<style>${css}</style>`)
  .replace('<script src="./dendi-editor.js" defer></script>','')
  .replace('</body>',`<script>window.__DENDI_RIG_INLINE__=${serialized};</script><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body>`);
if(page.includes('src="./dendi-editor.js"') || !page.includes('__DENDI_RIG_INLINE__'))
  throw new Error('Incomplete Dendi standalone output');
const output=path.resolve(process.argv[2]||path.join(root,'temp/ui-preview/dendi-skin.html'));
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,page,'utf8');
console.log(`Standalone modular Dendi editor: ${output}`);
