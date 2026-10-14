import { useEffect, useRef, useState } from 'react';
import { drawGarmentMesh, type BodyFit } from '../../lib/portraitMesh.ts';

const images=new Map<string,Promise<HTMLImageElement>>();
const frames=new Map<HTMLImageElement,Map<string,Uint8ClampedArray>>();
let frameCount=0;
function loadTexture(url:string){
  const cached=images.get(url);if(cached)return cached;
  const promise=new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{images.delete(url);reject(new Error('portrait_texture_load'));};image.src=url;});
  if(images.size>=24)images.delete(images.keys().next().value!);
  images.set(url,promise);return promise;
}

/** Real UV triangles, rendered only when an asset/fit changes; no animation loop. */
export default function MeshGarment({url,label,slot,order,fit}:{url:string;label:string;slot:string;order:number;fit:BodyFit}){
  const ref=useRef<HTMLCanvasElement>(null);
  const [error,setError]=useState(false);
  const {neck,shoulders,chest,waist}=fit;
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    let cancelled=false;
    canvas.dataset.rendered='false';
    const ctx=canvas.getContext('2d');
    loadTexture(url).then(image=>{
      if(cancelled||!ctx)return;
      const key=JSON.stringify([neck,shoulders,chest,waist]);
      const cached=frames.get(image)?.get(key);
      if(cached){const frame=ctx.createImageData(512,640);frame.data.set(cached);ctx.putImageData(frame,0,0);}
      else{
        drawGarmentMesh(ctx,image,{neck,shoulders,chest,waist});
        if(frameCount>=12){for(const [owner,entries] of frames){if(entries.size){entries.delete(entries.keys().next().value!);frameCount--;if(!entries.size)frames.delete(owner);break;}}}
        const entries=frames.get(image)||new Map<string,Uint8ClampedArray>();entries.set(key,ctx.getImageData(0,0,512,640).data);frames.set(image,entries);frameCount++;
      }
      canvas.dataset.rendered='true';setError(false);
    }).catch(()=>{if(!cancelled){ctx?.clearRect(0,0,512,640);setError(true);}});
    return ()=>{cancelled=true;};
  },[url,neck,shoulders,chest,waist]);
  return <>
    <canvas ref={ref} width={512} height={640} role="img" aria-label={label} data-asset-url={url}
      className={`role-portrait-layer role-portrait-${slot}`} style={{zIndex:order}}/>
    {error&&<span className="role-portrait-asset-error" role="alert">Не удалось загрузить: {label}</span>}
  </>;
}
