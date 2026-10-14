import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const compiled=await build({entryPoints:[path.join(root,'src/lib/dendiWardrobePilot.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {WARDROBE_PILOT_CHARACTERS:characters,DENDI_PILOT_LAYERS:items}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
const urls=new Set(characters.map(c=>c.baseUrl));
for(const item of items){
 urls.add(item.url);
 if(item.variants){
  for(const family of ['straight','curved']){
   if(!item.variants[family])throw new Error(`Missing ${family} variant: ${item.itemId}`);
   urls.add(item.variants[family]);
  }
 }
 if(item.slot==='portrait_eyewear'&&!item.attachment)throw new Error(`Missing eye attachment: ${item.itemId}`);
}
for(const url of urls){
 if(!url.startsWith('/character-editor/')||url.includes('..'))throw new Error('Invalid asset URL');
 const data=await readFile(path.join(root,'public',url));
 if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||data.readUInt32BE(16)!==512||data.readUInt32BE(20)!==640||data[25]!==6)throw new Error(`Expected PNG RGBA 512×640: ${url}`);
}
console.log(`Wardrobe templates: ${characters.length} identities, ${items.length} independent items, ${urls.size} PNG RGBA assets validated.`);
