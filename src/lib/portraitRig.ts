/** Landmarks are measured in the original 512×640 layer, not screen pixels. */
export type RigPoint={x:number;y:number};
export type AnchorPair=readonly [RigPoint,RigPoint];
export type AnchorTransform=readonly [number,number,number,number,number,number];
export type PortraitRig={
  neck:AnchorPair;
  targetNeck:AnchorPair;
  hatSeat:AnchorPair;
  eyes?:AnchorPair;
  headAnchors?:{source:AnchorPair;target:AnchorPair};
  neckCutY:number;
  neckMask?:readonly [number,number];
  neckContour?:readonly RigPoint[];
  /** Cutout follows the neck/hair boundary, from bottom-right through the neck to bottom-left. */
  frontNeckCutout?:readonly RigPoint[];
};
/** The inner brim contacts the two temples, rather than the top of the hair. */
export const HAT_CONTACT:AnchorPair=[{x:184,y:129},{x:328,y:140}];
export const RIG_NECK_Y=400;
// The v4 artwork already shares a bust pose; preserve its painted anatomy vertically.
const GARMENT_ROWS=[[280,280],[378,378],[400,RIG_NECK_Y],[410,410],[475,475],[570,570],[640,640]] as const;
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
  const head=rig.headAnchors?anchorTransform(rig.headAnchors.source,rig.headAnchors.target):anchorTransform(rig.neck,rig.targetNeck);
  let neck:AnchorTransform=head;
  if(rig.headAnchors){
    const top=transformRigPoint({x:(rig.neck[0].x+rig.neck[1].x)/2,y:rig.neckCutY},head).y;
    const seat=transformRigPoint(rig.neck[0],head).y;
    const stretch=(rig.targetNeck[0].y-top)/(seat-top);
    if(stretch<.65||stretch>1.7)throw new Error('portrait_neck_outside_template');
    neck=[head[0],head[1]*stretch,head[2],head[3]*stretch,head[4],top+(head[5]-top)*stretch];
  }
  const hatSeat=rig.hatSeat.map(p=>transformRigPoint(p,head)) as unknown as AnchorPair;
  const eyes=rig.eyes?.map(p=>transformRigPoint(p,head)) as AnchorPair|undefined;
  return {head,neck,hat:anchorTransform(HAT_CONTACT,hatSeat),hatSeat,eyes};
}
/** Percent translation scales with each portrait card, including narrow phones. */
export function rigCssTransform(m:AnchorTransform){return `translate(${m[4]/512*100}%,${m[5]/640*100}%) matrix(${m[0]},${m[1]},${m[2]},${m[3]},0,0)`;}
/** Separate neck occlusion from front hair without editing the identity image. */
export function headClipPolygon(rig:PortraitRig,hat:boolean,front:boolean):RigPoint[]{
  const top=hat?Math.min(rig.hatSeat[0].y,rig.hatSeat[1].y)-4:0;
  const [leftSeat,rightSeat]=[Math.min(rig.hatSeat[0].x,rig.hatSeat[1].x),Math.max(rig.hatSeat[0].x,rig.hatSeat[1].x)];
  const outline=hat&&rig.headAnchors?[
    {x:0,y:top+70},{x:leftSeat-45,y:top+25},{x:leftSeat,y:top},
    {x:rightSeat,y:top},{x:rightSeat+45,y:top+25},{x:512,y:top+70},
  ]:[{x:0,y:top},{x:512,y:top}];
  // Extend the complete lower neck behind the collar; clipping its curved edges
  // with the foreground cutout would open triangular gaps when length changes.
  if(!front&&rig.headAnchors)return [{x:0,y:rig.neckCutY-2},{x:512,y:rig.neckCutY-2},{x:512,y:640},{x:0,y:640}];
  if(!front)return rig.neckContour?[{x:0,y:top},{x:512,y:top},...rig.neckContour]:[{x:0,y:top},{x:512,y:top},{x:512,y:640},{x:0,y:640}];
  if(rig.frontNeckCutout)return [...outline,{x:512,y:640},...rig.frontNeckCutout,{x:0,y:640}];
  const [left,right]=rig.neckMask??[Math.min(rig.neck[0].x,rig.neck[1].x),Math.max(rig.neck[0].x,rig.neck[1].x)];
  return [{x:0,y:top},{x:512,y:top},{x:512,y:640},{x:right,y:640},{x:right,y:rig.neckCutY},{x:left,y:rig.neckCutY},{x:left,y:640},{x:0,y:640}];
}
export function rigCssClip(points:RigPoint[]){return `polygon(${points.map(p=>`${p.x/512*100}% ${p.y/640*100}%`).join(',')})`;}
