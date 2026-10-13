import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

/** Export the same hand-drawn SVG rig used by the editor to individual 512x640 transparent PNGs.
 * These are draft test assets, not published catalog items. */
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'public/character-editor/dendi-rig.svg');
const output=path.resolve(process.argv[2]||path.join(root,'temp/dendi-rig-assets'));
const svg=await readFile(source,'utf8');
await mkdir(output,{recursive:true});
const layers=[
  ['core-body','body',null], ['face','face',null], ['hair-front','hair',null],
  ['coat-wine','item','outerwear'], ['coat-ink','item','outerwear'],
  ['neck-bow','item','neckwear'], ['neck-tie','item','neckwear'],
  ['accessory-brooch','item','accessory'], ['accessory-chain','item','accessory'],
  ['hat-fedora','item','hat'], ['hat-ink','item','hat'],
];
const manifest={
  source:'public/character-editor/dendi-rig.svg',
  sourceSha256:createHash('sha256').update(svg).digest('hex'),
  width:512,height:640,format:'PNG RGBA',status:'draft-only',
  previewUrl:'/character-editor/dendi.html',
  compositingOrder:['core-body','outerwear','neckwear','accessory','face','hair-front','hat'],
  layers:[],
};
for(const [id,kind,slot] of layers){
  if(!svg.includes(`id="${id}"`))throw new Error('Missing rig group: '+id);
  // All groups share exactly one coordinate space. CSS specificity intentionally
  // overrides display="none" on the unselected variations.
  const style=`<style>[data-base],[data-slot]{display:none!important}
    #${id}{display:inline!important}</style>`;
  const isolated=svg.replace('</defs>','</defs>'+style);
  const bytes=new Resvg(isolated,{fitTo:{mode:'original'}}).render().asPng();
  const name=id+'.png';
  await writeFile(path.join(output,name),bytes);
  manifest.layers.push({id,kind,slot,file:name,bytes:bytes.length});
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(`Exported ${layers.length} distinct Dendi transparent layers to ${output}`);
