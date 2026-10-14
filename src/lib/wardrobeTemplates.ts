import type { BodyFit, PortraitFit } from './portraitMesh.ts';
import type { AnchorPair, PortraitRig, RigPoint } from './portraitRig.ts';

export type BodyFamily='straight'|'curved';
export const BODY_TEMPLATES={
  'straight-regular':{name:'Прямой · обычный',family:'straight',body:{neck:0,shoulders:0,chest:0,waist:0}},
  'straight-broad':{name:'Прямой · широкий',family:'straight',body:{neck:.05,shoulders:.13,chest:.15,waist:.13}},
  'curved-slim':{name:'Женский · стройный',family:'curved',body:{neck:-.12,shoulders:-.22,chest:-.06,waist:-.30}},
  'curved-full':{name:'Женский · объёмный',family:'curved',body:{neck:-.06,shoulders:-.08,chest:.12,waist:-.10}},
} as const satisfies Record<string,{name:string;family:BodyFamily;body:BodyFit}>;
export type BodyTemplateId=keyof typeof BODY_TEMPLATES;
export type HairTemplateId='short'|'bob'|'long';
export const HAIR_TEMPLATES:Record<HairTemplateId,{name:string;front:'neck-contour'|'above-neck';hat:'temple-seat'}>={
  short:{name:'Короткая',front:'above-neck',hat:'temple-seat'},
  bob:{name:'Каре / до плеч',front:'neck-contour',hat:'temple-seat'},
  long:{name:'Длинная',front:'neck-contour',hat:'temple-seat'},
};
/** Measured once when an identity is prepared. Clothing and hat have no player IDs. */
export type PreparedHead={eyes:AnchorPair;chin:RigPoint;neck:AnchorPair;hair:HairTemplateId;jaw?:readonly RigPoint[]};
export const CANONICAL_EYE_SPAN=86;
export const CANONICAL_EYE_Y=215;
export const CANONICAL_FACE_HEIGHT=132;
const NECK_SEAT_Y=400;
export function templateFit(templateId:BodyTemplateId,head:PreparedHead):PortraitFit{
  const [a,b]=head.eyes,span=Math.hypot(b.x-a.x,b.y-a.y);
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  if(!Number.isFinite(span)||span<40||span>200||!Number.isFinite(head.chin.y)||head.chin.y<=mid.y+50||!HAIR_TEMPLATES[head.hair])throw new Error('invalid_prepared_head');
  const scale=Math.min(CANONICAL_EYE_SPAN/span,CANONICAL_FACE_HEIGHT/(head.chin.y-mid.y));
  // All hairstyle masks use eye-relative coordinates, not custom player cutouts.
  const point=(x:number,y:number):RigPoint=>({x:mid.x+x*span,y:mid.y+y*span});
  const jaw=head.jaw??[point(-.95,1),point(-.8,1.4),{x:mid.x-.45*span,y:head.chin.y-6},head.chin,{x:mid.x+.45*span,y:head.chin.y-6},point(.8,1.4),point(.95,1)];
  const cutY=head.hair==='short'?Math.min(...jaw.map(p=>p.y)):(head.neck[0].y+head.neck[1].y)/2-.7*span;
  const neckPoint=(x:number,y:number):RigPoint=>({x:mid.x+x*span,y:cutY+y*span});
  const cutout=HAIR_TEMPLATES[head.hair].front==='above-neck'?[
    {x:512,y:640},{x:512,y:jaw[jaw.length-1].y},...jaw.slice().reverse(),{x:0,y:jaw[0].y},{x:0,y:640},
  ]:[
    {x:mid.x+span,y:640},neckPoint(1,.6),neckPoint(.71,.47),neckPoint(.54,.33),neckPoint(.45,.14),neckPoint(.425,0),
    neckPoint(-.375,0),neckPoint(-.40,.16),neckPoint(-.49,.37),neckPoint(-.68,.52),neckPoint(-.79,.6),{x:mid.x-.79*span,y:640},
  ];
  const rig:PortraitRig={neck:head.neck,eyes:head.eyes,
    headAnchors:{source:head.eyes,target:[{x:256-span*scale/2,y:CANONICAL_EYE_Y},{x:256+span*scale/2,y:CANONICAL_EYE_Y}]},
    targetNeck:head.neck.map(p=>({x:256+(p.x-mid.x)*scale,y:NECK_SEAT_Y})) as unknown as AnchorPair,
    hatSeat:[point(-.88,-.59),point(.88,-.59)],neckCutY:cutY,frontNeckCutout:cutout};
  return {templateId,body:{...BODY_TEMPLATES[templateId].body},hatScale:1,rig};
}
export function bodyTemplateId(value:unknown,fallback:BodyTemplateId):BodyTemplateId{
  return typeof value==='string'&&Object.hasOwn(BODY_TEMPLATES,value)?value as BodyTemplateId:fallback;
}
export function changeBodyTemplate(fit:PortraitFit,templateId:BodyTemplateId):PortraitFit{
  return {...fit,templateId,body:{...BODY_TEMPLATES[templateId].body}};
}
export function templateLayerUrl(layer:{url:string;variants?:Partial<Record<BodyFamily,string>>},templateId?:BodyTemplateId):string|null{
  return templateId&&layer.variants?layer.variants[BODY_TEMPLATES[templateId].family]??null:layer.url;
}
