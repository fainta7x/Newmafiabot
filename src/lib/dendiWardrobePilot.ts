import type { LookLayer } from './roleLooks.ts';
import type { PortraitFit } from './portraitMesh.ts';
import {templateFit,type PreparedHead} from './wardrobeTemplates.ts';

/** One fit-check fixture, not a universal body rig or approved seasonal catalog. */
export const DENDI_PILOT_BASE = '/character-editor/dendi-v2/base-v3.png';
export const DENDI_PILOT_LAYERS: LookLayer[] = [
  { itemId: 'lab-shirt', name: 'Белая рубашка · примерка', slot: 'portrait_shirt', url: '/character-editor/dendi-v2/shirt-v4.png', rarity: 'draft',variants:{straight:'/character-editor/dendi-v2/shirt-v4.png',curved:'/character-editor/templates-v1/shirt-curved.png'} },
  { itemId: 'lab-jacket', name: 'Багряный пиджак · примерка', slot: 'portrait_jacket', url: '/character-editor/dendi-v2/jacket-burgundy-v4.png', rarity: 'draft', shirtCoverage:'front-only',variants:{straight:'/character-editor/dendi-v2/jacket-burgundy-v4.png',curved:'/character-editor/templates-v1/jacket-burgundy-curved.png'} },
  { itemId: 'lab-jacket-black', name: 'Чёрный пиджак · примерка', slot: 'portrait_jacket', url: '/character-editor/dendi-v2/jacket-black-v4.png', rarity: 'draft', shirtCoverage:'front-only',variants:{straight:'/character-editor/dendi-v2/jacket-black-v4.png',curved:'/character-editor/templates-v1/jacket-black-curved.png'} },
  { itemId: 'lab-hat', name: 'Медный лист · примерка', slot: 'portrait_hat', url: '/character-editor/dendi-v2/hat-v2.png', rarity: 'draft' },
  { itemId:'lab-glasses',name:'Квадратные очки · примерка',slot:'portrait_eyewear',url:'/character-editor/templates-v1/glasses-square.png',rarity:'draft',attachment:{target:'eyes',source:[{x:163,y:308},{x:350,y:308}]} },
];

export type WardrobePilotCharacter={id:string;name:string;baseUrl:string;sourceUrl:string;fit:PortraitFit};
/** Identity preparation records eyes and neck once; reusable templates own fitting/masks. */
export const PREPARED_HEADS:Record<string,PreparedHead>={
 dendi:{eyes:[{x:206,y:228},{x:306,y:228}],chin:{x:256,y:389},neck:[{x:200,y:480},{x:320,y:480}],hair:'long'},
 java:{eyes:[{x:205,y:263},{x:325,y:263}],chin:{x:265,y:435},neck:[{x:195,y:515},{x:330,y:515}],hair:'bob'},
 fandorin:{eyes:[{x:205,y:249},{x:304,y:249}],chin:{x:256,y:434},neck:[{x:180,y:516},{x:338,y:516}],hair:'short'},
};
/** Shared bust artwork; profiles are fitting examples, not real body measurements. */
export const WARDROBE_PILOT_CHARACTERS:WardrobePilotCharacter[]=[
  {id:'dendi',name:'Денди',baseUrl:DENDI_PILOT_BASE,sourceUrl:'/player-avatars/dendi.jpg',fit:templateFit('curved-slim',PREPARED_HEADS.dendi)},
  {id:'java',name:'Джава',baseUrl:'/character-editor/dendi-v2/java-base-v2.png',sourceUrl:'/player-avatars/java.jpg',fit:templateFit('curved-slim',PREPARED_HEADS.java)},
  {id:'fandorin',name:'Фандорин',baseUrl:'/character-editor/templates-v1/fandorin-clean.png',sourceUrl:'/player-avatars/fandorin.jpg',fit:templateFit('straight-regular',PREPARED_HEADS.fandorin)},
];
