import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=(mime,bytes)=>`data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
// Embed the actual editor fixtures; duplicated profiles made offline previews drift.
const fixtureBundle=await build({entryPoints:[path.join(root,'src/lib/dendiWardrobePilot.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {WARDROBE_PILOT_CHARACTERS,DENDI_PILOT_LAYERS}=await import(data('text/javascript',fixtureBundle.outputFiles[0].contents));
const embed=async(url,mime)=>data(mime,await readFile(path.join(root,'public',url)));
const characters=await Promise.all(WARDROBE_PILOT_CHARACTERS.map(async c=>({...c,baseUrl:await embed(c.baseUrl,'image/png'),sourceUrl:await embed(c.sourceUrl,'image/jpeg')})));
const layers=await Promise.all(DENDI_PILOT_LAYERS.map(async l=>({...l,url:await embed(l.url,'image/png')})));
const result=await build({stdin:{contents:`import {createRoot} from 'react-dom/client';import CosmeticsLab from './src/components/player/CosmeticsLab.tsx';createRoot(document.getElementById('root')).render(<CosmeticsLab characters={${JSON.stringify(characters)}} wearableLayers={${JSON.stringify(layers)}}/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},outfile:'lab.js'});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text.replace(/<\/script/gi,'<\\/script');
const css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
const output=process.argv[2]||path.join(root,'temp/fiery-autumn-test.html');
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,`<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Три персонажа · Примерка гардероба</title><style>body{margin:0;background:#100e14}${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`);
console.log(`Standalone cosmetics lab: ${output}`);
