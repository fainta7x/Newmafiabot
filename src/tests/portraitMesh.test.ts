import {expect,it} from 'vitest';
import {createGarmentMesh,fitBodyPoint,normalizeBodyFit,rasterizeGarmentMesh,triangleMatrix,NEUTRAL_BODY_FIT,FIT_MIN,FIT_MAX} from '../lib/portraitMesh.ts';
it('moves fitting anchors independently while preserving the face region and center seam',()=>{
 const fit={neck:0.1,shoulders:0.3,chest:0.15,waist:0.25};
 expect(fitBodyPoint({x:200,y:250},fit)).toEqual({x:200,y:250});
 expect(fitBodyPoint({x:256,y:570},fit)).toEqual({x:256,y:570});
 expect(fitBodyPoint({x:156,y:410},fit).x).toBeCloseTo(126);
 expect(fitBodyPoint({x:156,y:570},fit).x).toBeCloseTo(131);
});
it('keeps UV triangles continuous and unflipped at all allowed fitting extremes',()=>{
 for(let mask=0;mask<16;mask++){
  const fit={neck:mask&1?FIT_MAX:FIT_MIN,shoulders:mask&2?FIT_MAX:FIT_MIN,chest:mask&4?FIT_MAX:FIT_MIN,waist:mask&8?FIT_MAX:FIT_MIN};
  for(const t of createGarmentMesh(fit)){
   const [a,b,c]=t.target;expect((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)).toBeGreaterThan(0);
   const [ma,mb,mc,md,me,mf]=triangleMatrix(t.source,t.target);
   t.source.forEach((p,i)=>{expect(ma*p.x+mc*p.y+me).toBeCloseTo(t.target[i].x);expect(mb*p.x+md*p.y+mf).toBeCloseTo(t.target[i].y);});
  }
 }
});
it('preserves RGBA exactly at neutral fit and leaves no seams in an opaque fitted garment',()=>{
 const source=new Uint8ClampedArray(512*640*4);
 for(let y=320;y<640;y++)for(let x=0;x<512;x++){const n=(y*512+x)*4;source[n]=x%255;source[n+1]=y%255;source[n+2]=180;source[n+3]=255;}
 expect(rasterizeGarmentMesh(source,NEUTRAL_BODY_FIT)).toEqual(source);
 const fitted=rasterizeGarmentMesh(source,{neck:0.1,shoulders:0.2,chest:0.15,waist:0.3});
 for(let y=321;y<640;y++)for(let x=1;x<511;x++)expect(fitted[(y*512+x)*4+3]).toBe(255);
 expect(fitted.slice(0,320*512*4).some(Boolean)).toBe(false);
});
it('rejects nonfinite fitting and bounds untrusted saved values',()=>{
 expect(normalizeBodyFit({neck:Infinity,shoulders:NaN,chest:99,waist:-99})).toEqual({neck:0,shoulders:0,chest:FIT_MAX,waist:FIT_MIN});
});
