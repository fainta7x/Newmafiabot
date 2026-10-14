import type { LookLayer } from './roleLooks.ts';
import type { PortraitFit } from './portraitMesh.ts';
import {RIG_NECK_Y} from './portraitRig.ts';

/** One fit-check fixture, not a universal body rig or approved seasonal catalog. */
export const DENDI_PILOT_BASE = '/character-editor/dendi-v2/base-v3.png';
export const DENDI_PILOT_LAYERS: LookLayer[] = [
  { itemId: 'lab-shirt', name: 'Белая рубашка · примерка', slot: 'portrait_shirt', url: '/character-editor/dendi-v2/shirt-v4.png', rarity: 'draft' },
  { itemId: 'lab-jacket', name: 'Багряный пиджак · примерка', slot: 'portrait_jacket', url: '/character-editor/dendi-v2/jacket-burgundy-v4.png', rarity: 'draft', shirtCoverage:'front-only' },
  { itemId: 'lab-jacket-black', name: 'Чёрный пиджак · примерка', slot: 'portrait_jacket', url: '/character-editor/dendi-v2/jacket-black-v4.png', rarity: 'draft', shirtCoverage:'front-only' },
  { itemId: 'lab-hat', name: 'Медный лист · примерка', slot: 'portrait_hat', url: '/character-editor/dendi-v2/hat-v2.png', rarity: 'draft' },
];

export type WardrobePilotCharacter={id:string;name:string;baseUrl:string;sourceUrl:string;fit:PortraitFit};
/** Neck-seat landmarks are measured inside the anatomical neck, not at its cut edge. */
const rig=(left:number,right:number,neckY:number,scale:number,hatY:number,hatLeft:number,hatRight:number,cut:number)=>({
  neck:[{x:left,y:neckY},{x:right,y:neckY}] as const,
  targetNeck:[{x:256+(left-256)*scale,y:RIG_NECK_Y},{x:256+(right-256)*scale,y:RIG_NECK_Y}] as const,
  hatSeat:[{x:hatLeft,y:hatY},{x:hatRight,y:hatY+6}] as const,neckCutY:cut,
});
/** Shared bust artwork; profiles are fitting examples, not real body measurements. */
export const WARDROBE_PILOT_CHARACTERS:WardrobePilotCharacter[]=[
  {id:'dendi',name:'Денди',baseUrl:DENDI_PILOT_BASE,sourceUrl:'/player-avatars/dendi.jpg',fit:{body:{neck:-.12,shoulders:-.14,chest:-.14,waist:-.12},hatScale:1,rig:rig(200,320,480,.82,165,150,365,410)}},
  {id:'java',name:'Джава',baseUrl:'/character-editor/dendi-v2/java-base-v2.png',sourceUrl:'/player-avatars/java.jpg',fit:{body:{neck:-.10,shoulders:-.10,chest:-.08,waist:-.08},hatScale:1,rig:{...rig(195,330,515,.82,200,156,360,432),frontNeckCutout:[
    {x:376,y:640},{x:376,y:500},{x:350,y:487},{x:330,y:470},{x:319,y:448},{x:316,y:432},
    {x:220,y:432},{x:217,y:450},{x:206,y:475},{x:183,y:493},{x:170,y:500},{x:170,y:640},
  ]}}},
  {id:'fandorin',name:'Фандорин',baseUrl:'/character-editor/dendi-v2/fandorin-base-v2.png',sourceUrl:'/player-avatars/fandorin.jpg',fit:{body:{neck:0,shoulders:0,chest:0,waist:0},hatScale:1,rig:{...rig(178,338,510,.765,173,146,368,425),neckMask:[0,512]}}},
];
