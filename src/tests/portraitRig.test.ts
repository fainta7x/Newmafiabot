import {expect,it} from 'vitest';
import {anchorTransform,headClipPolygon,HAT_CONTACT,resolvePortraitRig,RIG_NECK_Y,rigGarmentY,transformRigPoint} from '../lib/portraitRig.ts';
import {WARDROBE_PILOT_CHARACTERS} from '../lib/dendiWardrobePilot.ts';
import {createGarmentMesh,FIT_MIN,FIT_MAX} from '../lib/portraitMesh.ts';
it('attaches both measured neck and hat contact landmarks for every character',()=>{
 for(const c of WARDROBE_PILOT_CHARACTERS){
  const rig=c.fit.rig!,placed=resolvePortraitRig(rig);
  rig.neck.forEach((p,i)=>{
   const mapped=transformRigPoint(p,placed.head);
   expect(mapped.x).toBeCloseTo(rig.targetNeck[i].x);expect(mapped.y).toBeCloseTo(rig.targetNeck[i].y);
   expect(rigGarmentY(400)).toBeCloseTo(mapped.y);
  });
  HAT_CONTACT.forEach((p,i)=>{
   const hat=transformRigPoint(p,placed.hat),temple=transformRigPoint(rig.hatSeat[i],placed.head);
   expect(Math.hypot(hat.x-temple.x,hat.y-temple.y)).toBeLessThan(.001);
  });
  expect(placed.head[0]).toBeCloseTo(placed.head[3]);
  expect(placed.head[1]).toBeCloseTo(-placed.head[2]);
 }
});
it('preserves face proportions under rotation and scale',()=>{
 const m=anchorTransform([{x:10,y:10},{x:30,y:10}],[{x:40,y:50},{x:40,y:60}]);
 const a=transformRigPoint({x:10,y:10},m),b=transformRigPoint({x:30,y:10},m),c=transformRigPoint({x:10,y:30},m);
 expect(Math.hypot(b.x-a.x,b.y-a.y)).toBeCloseTo(10);
 expect(Math.hypot(c.x-a.x,c.y-a.y)).toBeCloseTo(10);
 expect((b.x-a.x)*(c.x-a.x)+(b.y-a.y)*(c.y-a.y)).toBeCloseTo(0);
 expect(()=>anchorTransform([{x:0,y:0},{x:0,y:0}],[{x:0,y:0},{x:1,y:1}])).toThrow();
});
it('fits collar and shoulders vertically without folding UV triangles at extreme widths',()=>{
 expect(rigGarmentY(400)).toBe(RIG_NECK_Y);
 expect(rigGarmentY(410)).toBe(410);expect(rigGarmentY(640)).toBe(640);
 for(let bits=0;bits<16;bits++){
  const values=Array.from({length:4},(_,i)=>bits&(1<<i)?FIT_MAX:FIT_MIN);
  for(const t of createGarmentMesh({neck:values[0],shoulders:values[1],chest:values[2],waist:values[3]},true)){
   const [a,b,c]=t.target;expect((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)).toBeGreaterThan(0);
  }
 }
});

it('keeps anatomical lower neck behind the collar and long front hair above clothes',()=>{
 const inside=(p:{x:number;y:number},poly:{x:number;y:number}[])=>{
  let result=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const a=poly[i],b=poly[j];
   if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;
  }
  return result;
 };
 for(const c of WARDROBE_PILOT_CHARACTERS){
  const rig=c.fit.rig!,neck={x:(rig.neck[0].x+rig.neck[1].x)/2,y:rig.neck[0].y};
  expect(inside(neck,headClipPolygon(rig,false,false))).toBe(true);
  expect(inside(neck,headClipPolygon(rig,false,true))).toBe(false);
  expect(inside({...neck,y:rig.neckCutY-30},headClipPolygon(rig,false,true))).toBe(true);
 }
 const dendi=WARDROBE_PILOT_CHARACTERS[0].fit.rig!;
 expect(inside({x:100,y:480},headClipPolygon(dendi,false,true))).toBe(true);
 const java=WARDROBE_PILOT_CHARACTERS.find(c=>c.id==='java')!.fit.rig!;
 for(const hat of [false,true]){
  const front=headClipPolygon(java,hat,true),back=headClipPolygon(java,hat,false);
  // Measured skin flares beyond the old rectangular mask at both sides of the collar.
  for(const skin of [{x:190,y:510},{x:357,y:510},{x:315,y:455}]){
   expect(inside(skin,back)).toBe(true);expect(inside(skin,front)).toBe(false);
  }
  // Keep the chin and the two lower hair tips; widening a rectangle clips these tips.
  for(const p of [{x:265,y:410},{x:140,y:460},{x:403,y:465}])expect(inside(p,front)).toBe(true);
 }
});
