import type { LookLayer } from './roleLooks.ts';
import type { PortraitFit } from './portraitMesh.ts';

/** One fit-check fixture, not a universal body rig or approved seasonal catalog. */
export const DENDI_PILOT_BASE = '/character-editor/dendi-v2/base-v2.png';
export const DENDI_PILOT_LAYERS: LookLayer[] = [
  { itemId: 'lab-shirt', name: 'Белая рубашка · примерка', slot: 'portrait_shirt', url: '/character-editor/dendi-v2/shirt-v3.png', rarity: 'draft' },
  { itemId: 'lab-jacket', name: 'Багряный пиджак · примерка', slot: 'portrait_jacket', url: '/character-editor/dendi-v2/jacket-burgundy-v3.png', rarity: 'draft', shirtCoverage:'front-only' },
  { itemId: 'lab-jacket-black', name: 'Чёрный пиджак · примерка', slot: 'portrait_jacket', url: '/character-editor/dendi-v2/jacket-black-v3.png', rarity: 'draft', shirtCoverage:'front-only' },
  { itemId: 'lab-hat', name: 'Медный лист · примерка', slot: 'portrait_hat', url: '/character-editor/dendi-v2/hat-v2.png', rarity: 'draft' },
];

export type WardrobePilotCharacter={id:string;name:string;baseUrl:string;sourceUrl:string;fit:PortraitFit};
/** Fit profiles are demo silhouettes, not claimed measurements of real people. */
export const WARDROBE_PILOT_CHARACTERS:WardrobePilotCharacter[]=[
  {id:'dendi',name:'Денди',baseUrl:DENDI_PILOT_BASE,sourceUrl:'/player-avatars/dendi.jpg',fit:{body:{neck:0,shoulders:0,chest:0,waist:0},hatScale:1}},
  {id:'java',name:'Джава',baseUrl:'/character-editor/dendi-v2/java-base-v1.png',sourceUrl:'/player-avatars/java.jpg',fit:{body:{neck:0.03,shoulders:0.08,chest:0.13,waist:0.17},hatScale:1.03}},
  {id:'fandorin',name:'Фандорин',baseUrl:'/character-editor/dendi-v2/fandorin-base-v1.png',sourceUrl:'/player-avatars/fandorin.jpg',fit:{body:{neck:0.26,shoulders:0.26,chest:0.18,waist:0.30},hatScale:1.12}},
];
