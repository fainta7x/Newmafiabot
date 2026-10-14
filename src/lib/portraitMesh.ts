import type { PortraitEquipmentSlot } from './roleLooks.ts';

/** The pilot owns fitting geometry, never a player's facial geometry. */
export type BodyFit = { neck: number; shoulders: number; chest: number; waist: number };
export type PortraitFit = { body: BodyFit; hatScale: number };
export type MeshPoint = { x: number; y: number };
export type MeshTriangle = { source: [MeshPoint, MeshPoint, MeshPoint]; target: [MeshPoint, MeshPoint, MeshPoint] };
export const NEUTRAL_BODY_FIT: BodyFit = { neck: 0, shoulders: 0, chest: 0, waist: 0 };
export const FIT_MIN = -0.15;
export const FIT_MAX = 0.35;
export function normalizeBodyFit(value: Partial<BodyFit> | null | undefined, fallback=NEUTRAL_BODY_FIT): BodyFit {
  const clamp=(v:unknown,base:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(FIT_MAX,Math.max(FIT_MIN,v)):base;
  return {neck:clamp(value?.neck,fallback.neck),shoulders:clamp(value?.shoulders,fallback.shoulders),chest:clamp(value?.chest,fallback.chest),waist:clamp(value?.waist,fallback.waist)};
}
const XS=[0,64,112,160,200,232,256,280,312,352,400,448,512];
const YS=[345,360,378,400,425,450,480,520,555,590,615,640];
/** Common anchors keep a shirt, vest and coat seam at the same destination. */
export function fitBodyPoint(point:MeshPoint, raw:BodyFit):MeshPoint {
  if(point.y<345)return {...point};
  const fit=normalizeBodyFit(raw);
  const anchors=[[345,fit.neck],[378,fit.neck],[410,fit.shoulders],[475,fit.chest],[570,fit.waist],[640,fit.waist]];
  let amount=fit.waist;
  for(let i=1;i<anchors.length;i++){
    if(point.y<=anchors[i][0]){
      const [y0,v0]=anchors[i-1], [y1,v1]=anchors[i];
      const t=Math.max(0,Math.min(1,(point.y-y0)/(y1-y0)));
      amount=v0+(v1-v0)*t;
      break;
    }
  }
  return {x:256+(point.x-256)*(1+amount),y:point.y};
}
export function createGarmentMesh(fit:BodyFit):MeshTriangle[] {
  const triangles:MeshTriangle[]=[];
  for(let row=0;row<YS.length-1;row++)for(let col=0;col<XS.length-1;col++){
    const a={x:XS[col],y:YS[row]},b={x:XS[col+1],y:YS[row]},c={x:XS[col],y:YS[row+1]},d={x:XS[col+1],y:YS[row+1]};
    for(const source of [[a,b,c],[b,d,c]] as [MeshPoint,MeshPoint,MeshPoint][])
      triangles.push({source,target:source.map(p=>fitBodyPoint(p,fit)) as MeshTriangle['target']});
  }
  return triangles;
}
/** Affine UV mapping for one triangle; shared by browser and evidence renderer. */
export function triangleMatrix(source:MeshTriangle['source'],target:MeshTriangle['target']):[number,number,number,number,number,number] {
  const [s0,s1,s2]=source,[t0,t1,t2]=target;
  const ux=s1.x-s0.x,uy=s1.y-s0.y,vx=s2.x-s0.x,vy=s2.y-s0.y,det=ux*vy-vx*uy;
  if(Math.abs(det)<1e-8)throw new Error('degenerate_portrait_mesh');
  const dux=t1.x-t0.x,duy=t1.y-t0.y,dvx=t2.x-t0.x,dvy=t2.y-t0.y;
  const a=(dux*vy-dvx*uy)/det,b=(duy*vy-dvy*uy)/det,c=(dvx*ux-dux*vx)/det,d=(dvy*ux-duy*vx)/det;
  return [a,b,c,d,t0.x-a*s0.x-c*s0.y,t0.y-b*s0.x-d*s0.y];
}
export function isMeshGarment(slot:PortraitEquipmentSlot){return slot==='portrait_shirt'||slot==='portrait_vest'||slot==='portrait_jacket';}

/** Rasterize shared UV triangles without overlapping alpha or clip-antialias seams. */
export function rasterizeGarmentMesh(source:Uint8ClampedArray,fit:BodyFit):Uint8ClampedArray {
  const width=512,height=640,result=new Uint8ClampedArray(width*height*4);
  for(const triangle of createGarmentMesh(fit)){
    const [p0,p1,p2]=triangle.target;
    const minX=Math.max(0,Math.floor(Math.min(p0.x,p1.x,p2.x))),maxX=Math.min(width-1,Math.ceil(Math.max(p0.x,p1.x,p2.x)));
    const minY=Math.max(0,Math.floor(Math.min(p0.y,p1.y,p2.y))),maxY=Math.min(height-1,Math.ceil(Math.max(p0.y,p1.y,p2.y)));
    const [a,b,c,d,e,f]=triangleMatrix(triangle.target,triangle.source);
    const cross=(u:MeshPoint,v:MeshPoint,x:number,y:number)=>(v.x-u.x)*(y-u.y)-(v.y-u.y)*(x-u.x);
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const px=x+.5,py=y+.5;
      if(cross(p0,p1,px,py)<-1e-7||cross(p1,p2,px,py)<-1e-7||cross(p2,p0,px,py)<-1e-7)continue;
      const sx=Math.min(width-1,Math.max(0,a*px+c*py+e-.5)),sy=Math.min(height-1,Math.max(0,b*px+d*py+f-.5));
      const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),tx=sx-x0,ty=sy-y0;
      const indices=[(y0*width+x0)*4,(y0*width+x1)*4,(y1*width+x0)*4,(y1*width+x1)*4];
      const weights=[(1-tx)*(1-ty),tx*(1-ty),(1-tx)*ty,tx*ty];
      let alpha=0,r=0,g=0,bl=0;
      for(let j=0;j<4;j++){const n=indices[j],w=weights[j]*source[n+3];alpha+=w;r+=source[n]*w;g+=source[n+1]*w;bl+=source[n+2]*w;}
      if(alpha>.001){const n=(y*width+x)*4;result[n]=r/alpha;result[n+1]=g/alpha;result[n+2]=bl/alpha;result[n+3]=alpha;}
    }
  }
  return result;
}
/** Draw into one transparent garment canvas; the portrait compositor owns layer order. */
export function drawGarmentMesh(ctx:CanvasRenderingContext2D,image:CanvasImageSource,fit:BodyFit){
  ctx.clearRect(0,0,512,640);ctx.drawImage(image,0,0,512,640);
  const source=ctx.getImageData(0,0,512,640),frame=ctx.createImageData(512,640);
  frame.data.set(rasterizeGarmentMesh(source.data,fit));ctx.putImageData(frame,0,0);
}
