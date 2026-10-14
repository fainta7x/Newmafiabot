import type { LookLayer } from './roleLooks.ts';

/** One fit-check fixture, not a universal body rig or approved seasonal catalog. */
export const DENDI_PILOT_BASE = '/character-editor/dendi-v2/base-v2.png';
export const DENDI_PILOT_LAYERS: LookLayer[] = [
  { itemId: 'lab-shirt', name: 'Белая рубашка · примерка', slot: 'portrait_shirt', url: '/character-editor/dendi-v2/shirt-v2.png', rarity: 'draft' },
  { itemId: 'lab-jacket', name: 'Багряный пиджак · примерка', slot: 'portrait_jacket', url: '/character-editor/dendi-v2/jacket-burgundy-v2.png', rarity: 'draft' },
  { itemId: 'lab-jacket-black', name: 'Чёрный пиджак · примерка', slot: 'portrait_jacket', url: '/character-editor/dendi-v2/jacket-black-v2.png', rarity: 'draft' },
  { itemId: 'lab-hat', name: 'Медный лист · примерка', slot: 'portrait_hat', url: '/character-editor/dendi-v2/hat-v2.png', rarity: 'draft' },
];
