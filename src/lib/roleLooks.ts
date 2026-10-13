/** One recognizable portrait and four independent outfits. Role changes never alter game data. */
export const LOOK_ROLES = ['civilian', 'mafia', 'don', 'sheriff'] as const;
export type LookRole = typeof LOOK_ROLES[number];
export const LOOK_ROLE_LABELS: Record<LookRole, string> = { civilian: 'Мирный', mafia: 'Мафия', don: 'Дон', sheriff: 'Шериф' };
export const LOOK_BACKGROUNDS = ['noir', 'autumn', 'burgundy'] as const;
export const PORTRAIT_LAYOUT = 'bust-512x640-v1' as const;

/** Technical bust-portrait slot registry, NOT an approved seasonal item list.
 * Order is fixed for image compositing, not for item rarity or set grouping.
 * New slots have no approved assets or shop items and remain unusable until then.
 */
export const PORTRAIT_EQUIPMENT_SLOTS = [
  'portrait_shirt', 'portrait_vest', 'portrait_jacket',
  'portrait_neckwear', 'portrait_accessory', 'portrait_hat',
] as const;
export type PortraitEquipmentSlot = typeof PORTRAIT_EQUIPMENT_SLOTS[number];
export const PORTRAIT_SLOT_LABELS: Record<PortraitEquipmentSlot, string> = {
  portrait_shirt: 'Рубашка / основа одежды',
  portrait_vest: 'Жилет',
  portrait_jacket: 'Верхняя одежда',
  portrait_neckwear: 'Галстук / шейный аксессуар',
  portrait_accessory: 'Украшение',
  portrait_hat: 'Головной убор',
};
export const PORTRAIT_SLOT_ORDER: Readonly<Record<PortraitEquipmentSlot, number>> = {
  portrait_shirt: 0, portrait_vest: 1, portrait_jacket: 2,
  portrait_neckwear: 4, portrait_accessory: 5, portrait_hat: 6,
};
export const PORTRAIT_BASE_ORDER = 3;

export type EquippedItems = Partial<Record<PortraitEquipmentSlot, string>>;
export type RoleLook = {
  role: LookRole; phrase: string; background: typeof LOOK_BACKGROUNDS[number];
  // Kept for older clients and stored snapshots.
  hatItemId: string | null; jacketItemId: string | null;
  equippedItems?: EquippedItems;
  revision: number;
};
export type LookLayer = { itemId: string; name: string; slot: PortraitEquipmentSlot; url: string; rarity: string };
export type PortraitLayer = { slot: PortraitEquipmentSlot; itemId: string; url: string };
/** A released set is a collection, not a redeemable inventory item.
 * Player sees only published and reviewed components; ownership is individual.
 */
export type WardrobeSetItem = LookLayer & { owned: boolean };
export type WardrobeSet = { id: string; name: string; rarity: string; items: WardrobeSetItem[] };
export type RoleLooksResponse = {
  looks: RoleLook[]; layers: LookLayer[]; portraitVersion: string | null;
  sets?: WardrobeSet[]; canApprovePortrait?: boolean;
};
export type BroadcastRoleLook = RoleLook & {
  gameKey: string; portraitVersion: string | null;
  hatUrl: string | null; jacketUrl: string | null;
  /** Immutable URLs captured at game start. Old snapshots may not have this field. */
  equippedLayers?: PortraitLayer[];
};
/** Reading a legacy payload must never lose a hat/jacket already equipped. */
export function roleEquippedItems(look: Pick<RoleLook, 'hatItemId' | 'jacketItemId' | 'equippedItems'>): EquippedItems {
  const items: EquippedItems = { ...look.equippedItems };
  if (look.hatItemId && !items.portrait_hat) items.portrait_hat = look.hatItemId;
  if (look.jacketItemId && !items.portrait_jacket) items.portrait_jacket = look.jacketItemId;
  return items;
}
export const emptyRoleLook = (role: LookRole): RoleLook => ({ role, phrase: '', background: 'noir', hatItemId: null, jacketItemId: null, equippedItems: {}, revision: 0 });
export const plainPhrase = (text: string) => Array.from(text).filter(char => {
  const n=char.codePointAt(0)!; return n>=32 && n!==127 && n!==0x2028 && n!==0x2029;
}).join('');
export function lookRoleFromGame(role: string): LookRole | null {
  return ({ civilian: 'civilian', citizen: 'civilian', red: 'civilian', 'Мирный': 'civilian', 'Мирный житель': 'civilian', mafia: 'mafia', 'Мафия': 'mafia', don: 'don', 'Дон': 'don', sheriff: 'sheriff', 'Шериф': 'sheriff' } as Record<string, LookRole>)[role] || null;
}
