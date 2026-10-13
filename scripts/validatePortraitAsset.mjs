#!/usr/bin/env node
// Validate actual transparent 512x640 layers before any owner approval.
// Usage: node scripts/validatePortraitAsset.mjs path/to/layer.png [more.png]
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const WIDTH=512, HEIGHT=640, LIMIT=1024*1024;
function inspect(file) {
  const buf=readFileSync(file);
  if (buf.length>LIMIT) throw Error('PNG exceeds 1 MiB');
  if (buf.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw Error('not PNG');
  let offset=8, chunks=[], width=0,height=0,depth=0,colour=0,interlace=0;
  while(offset+12<=buf.length) {
    const len=buf.readUInt32BE(offset),type=buf.toString('ascii',offset+4,offset+8);
    if(offset+12+len>buf.length) throw Error('truncated chunk');
    const chunk=buf.subarray(offset+8,offset+8+len);
    if(type==='IHDR') {width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);depth=chunk[8];colour=chunk[9];interlace=chunk[12];}
    if(type==='IDAT')chunks.push(chunk);
    if(type==='IEND')break;
    offset+=12+len;
  }
  if(width!==WIDTH||height!==HEIGHT||depth!==8||colour!==6||interlace!==0)throw Error('expected noninterlaced RGBA PNG 512x640 at 8-bit depth');
  const packed=inflateSync(Buffer.concat(chunks),{maxOutputLength:HEIGHT*(1+WIDTH*4)});
  const stride=WIDTH*4;
  if(packed.length!==HEIGHT*(stride+1))throw Error('invalid decompressed raster');
  let prev=Buffer.alloc(stride), nonTransparent=0, partial=0, edgeNonTransparent=0;
  for(let y=0;y<HEIGHT;y++){
    const filter=packed[y*(stride+1)],row=Buffer.alloc(stride),start=y*(stride+1)+1;
    if(filter>4)throw Error('invalid PNG filter');
    for(let i=0;i<stride;i++){
      const left=i>=4?row[i-4]:0,up=prev[i],ul=i>=4?prev[i-4]:0;
      const predictor=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,ul);
      row[i]=(packed[start+i]+predictor)&255;
    }
    for(let x=0;x<WIDTH;x++){
      const a=row[x*4+3];
      if(a){nonTransparent++;if(a<255)partial++;if(x===0||x===WIDTH-1||y===0||y===HEIGHT-1)edgeNonTransparent++;}
    }
    prev=row;
  }
  const coverage=nonTransparent/(WIDTH*HEIGHT);
  if(coverage<0.01)throw Error('asset nearly empty');
  if(coverage>0.9)throw Error('asset fills entire canvas; likely flattened picture, not isolated transparent layer');
  if(!partial)throw Error('missing antialiased alpha edges; inspect mask');
  return {file,coverage:Math.round(coverage*1000)/10,edgeNonTransparent,partial};
}
function paeth(a,b,c){const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;}
let failed=false;
if(process.argv.length<3){console.error('Pass at least one PNG path');process.exit(2);}
for(const file of process.argv.slice(2)){try{const r=inspect(file);console.log('PASS',r);}catch(e){failed=true;console.error('FAIL',file,e.message);}}
if(failed)process.exitCode=1;
