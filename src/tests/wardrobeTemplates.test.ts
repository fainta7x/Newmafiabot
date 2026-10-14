import {expect,it} from 'vitest';
import {BODY_TEMPLATES,CANONICAL_EYE_SPAN,templateFit,templateLayerUrl,type BodyTemplateId} from '../lib/wardrobeTemplates.ts';
import {PREPARED_HEADS} from '../lib/dendiWardrobePilot.ts';
import {resolvePortraitRig,transformRigPoint} from '../lib/portraitRig.ts';

it('normalizes every prepared face without player-specific head or hat scaling',()=>{
 for(const head of Object.values(PREPARED_HEADS)){
  const first=templateFit('straight-regular',head),placed=resolvePortraitRig(first.rig!);
  const eyes=head.eyes.map(p=>transformRigPoint(p,placed.head));
  expect(eyes[0].y).toBeCloseTo(210);expect(eyes[1].y).toBeCloseTo(210);
  expect(eyes[1].x-eyes[0].x).toBeLessThanOrEqual(CANONICAL_EYE_SPAN+.001);
  expect(transformRigPoint(head.chin,placed.head).y).toBeLessThanOrEqual(328.001);
  head.neck.forEach((p,i)=>{
   const seat=transformRigPoint(p,placed.neck);
   expect(seat.x).toBeCloseTo(first.rig!.targetNeck[i].x);expect(seat.y).toBeCloseTo(400);
  });
  for(const id of Object.keys(BODY_TEMPLATES) as BodyTemplateId[]){
   const fit=templateFit(id,head);
   expect(fit.body).toEqual(BODY_TEMPLATES[id].body);
   expect(resolvePortraitRig(fit.rig!).head).toEqual(placed.head);
   expect(resolvePortraitRig(fit.rig!).hat).toEqual(placed.hat);
  }
 }
});
it('never substitutes a straight cut when the selected family is missing',()=>{
 const item={url:'/straight.png',variants:{straight:'/straight.png'}};
 expect(templateLayerUrl(item,'curved-slim')).toBeNull();
 expect(templateLayerUrl(item,'straight-broad')).toBe('/straight.png');
 expect(templateLayerUrl({url:'/universal.png'},'curved-full')).toBe('/universal.png');
 expect(()=>templateFit('curved-slim',{...PREPARED_HEADS.java,chin:{x:265,y:263}})).toThrow('invalid_prepared_head');
});
