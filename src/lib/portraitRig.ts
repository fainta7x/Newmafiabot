/** Landmarks are measured in the original 512×640 layer, not screen pixels. */
export type RigPoint={x:number;y:number};
export type AnchorPair=readonly [RigPoint,RigPoint];
export type AnchorTransform=readonly [number,number,number,number,number,number];
export type PortraitRig={
  neck:AnchorPair;
  targetNeck:AnchorPair;
  hatSeat:AnchorPair;
  neckCutY:number;
  neckMask?:readonly [number,number];
  neckContour?:readonly RigPoint[];
};
/** The inner brim contacts the two temples, rather than the top of the hair. */
export const HAT_CONTACT:AnchorPair=[{x:184,y:129},{x:328,y:140}];
export const RIG_NECK_Y=315;
const GARMENT_ROWS=[[320,RIG_NECK_Y-25],[378,RIG_NECK_Y],[410,350],[475,430],[570,560],[640,640]] as const;
export function rigGarmentY(y:number){
  for(let i=1;i<GARMENT_ROWS.length;i++){
    const [a,b]=[GARMENT_ROWS[i-1],GARMENT_ROWS[i]];
    if(y<=b[0])return a[1]+(b[1]-a[1])*(y-a[0])/(b[0]-a[0]);
  }
  return y;
}
/** A similarity transform preserves every face proportion (no local warping). */
export function anchorTransform(source:AnchorPair,target:AnchorPair):AnchorTransform {
  const [p,q]=source,[u,v]=target,dx=q.x-p.x,dy=q.y-p.y,den=dx*dx+dy*dy;
  if(den<1e-8)throw new Error('degenerate_portrait_anchors');
  const a=((v.x-u.x)*dx+(v.y-u.y)*dy)/den,b=((v.y-u.y)*dx-(v.x-u.x)*dy)/den;
  return [a,b,-b,a,u.x-a*p.x+b*p.y,u.y-b*p.x-a*p.y];
}
export function transformRigPoint(p:RigPoint,m:AnchorTransform):RigPoint{return {x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};}
export function resolvePortraitRig(rig:PortraitRig){
  const head=anchorTransform(rig.neck,rig.targetNeck);
  const hatSeat=rig.hatSeat.map(p=>transformRigPoint(p,head)) as unknown as AnchorPair;
  return {head,hat:anchorTransform(HAT_CONTACT,hatSeat),hatSeat};
}
/** Percent translation scales with each portrait card, including narrow phones. */
export function rigCssTransform(m:AnchorTransform){return `translate(${m[4]/512*100}%,${m[5]/640*100}%) matrix(${m[0]},${m[1]},${m[2]},${m[3]},0,0)`;}
/** Separate neck occlusion from front hair without editing the identity image. */
export function headClipPolygon(rig:PortraitRig,hat:boolean,front:boolean):RigPoint[]{
  const top=hat?Math.min(rig.hatSeat[0].y,rig.hatSeat[1].y)-4:0;
  if(!front)return rig.neckContour?[{x:0,y:top},{x:512,y:top},...rig.neckContour]:[{x:0,y:top},{x:512,y:top},{x:512,y:640},{x:0,y:640}];
  const [left,right]=rig.neckMask??[Math.min(rig.neck[0].x,rig.neck[1].x),Math.max(rig.neck[0].x,rig.neck[1].x)];
  return [{x:0,y:top},{x:512,y:top},{x:512,y:640},{x:right,y:640},{x:right,y:rig.neckCutY},{x:left,y:rig.neckCutY},{x:left,y:640},{x:0,y:640}];
}
export function rigCssClip(points:RigPoint[]){return `polygon(${points.map(p=>`${p.x/512*100}% ${p.y/640*100}%`).join(',')})`;}
