import {expect,it} from 'vitest';
import {anchorTransform,headClipPolygon,HAT_CONTACT,resolvePortraitRig,RIG_NECK_Y,rigGarmentY,transformRigPoint} from '../lib/portraitRig.ts';
import {WARDROBE_PILOT_CHARACTERS} from '../lib/dendiWardrobePilot.ts';
import {createGarmentMesh} from '../lib/portraitMesh.ts';
it('attaches both measured neck and hat contact landmarks for every character',()=>{
 for(const c of WARDROBE_PILOT_CHARACTERS){
  const rig=c.fit.rig!,placed=resolvePortraitRig(rig);
  rig.neck.forEach((p,i)=>{
   const mapped=transformRigPoint(p,placed.head);
   expect(mapped.x).toBeCloseTo(rig.targetNeck[i].x);expect(mapped.y).toBeCloseTo(rig.targetNeck[i].y);
   expect(rigGarmentY(378)).toBeCloseTo(mapped.y);
  });
  HAT_CONTACT.forEach((p,i)=>{
   const hat=transformRigPoint(p,placed.hat),temple=transformRigPoint(rig.hatSeat[i],placed.head);
   expect(Math.hypot(hat.x-temple.x,hat.y-temple.y)).toBeLessThan(.001);
  });
  expect(Math.hypot(placed.head[0],placed.head[1])).toBeCloseTo(.78);
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
 expect(rigGarmentY(378)).toBe(RIG_NECK_Y);
 expect(rigGarmentY(410)).toBe(350);expect(rigGarmentY(640)).toBe(640);
 for(let bits=0;bits<16;bits++){
  const values=Array.from({length:4},(_,i)=>bits&(1<<i)?.35:-.15);
  for(const t of createGarmentMesh({neck:values[0],shoulders:values[1],chest:values[2],waist:values[3]},true)){
   const [a,b,c]=t.target;expect((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)).toBeGreaterThan(0);
  }
 }
});

it('masks the exported male neck flares while retaining jaw and female front hair',()=>{
 const inside=(p:{x:number;y:number},poly:{x:number;y:number}[])=>{
  let result=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const a=poly[i],b=poly[j];
   if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;
  }
  return result;
 };
 const male=WARDROBE_PILOT_CHARACTERS.find(c=>c.id==='fandorin')!.fit.rig!;
 const rear=headClipPolygon(male,false,false),front=headClipPolygon(male,false,true);
 expect(inside({x:188,y:335},rear)).toBe(false);
 expect(inside({x:327,y:335},rear)).toBe(false);
 expect(inside({x:256,y:335},rear)).toBe(true);
 expect(inside({x:256,y:335},front)).toBe(false);
 expect(inside({x:256,y:310},front)).toBe(true);
 const dendi=WARDROBE_PILOT_CHARACTERS[0].fit.rig!;
 expect(inside({x:175,y:400},headClipPolygon(dendi,false,true))).toBe(true);
});
