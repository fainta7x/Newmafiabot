/** Stable renderer contract. Draft artwork is not a reward or an active season. */
export const COSMETIC_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;
export const COSMETIC_SLOTS = ['profile_frame', 'profile_cover', 'poker_table', 'poker_card_back', 'seat_accent', 'broadcast_accent', 'emote'] as const;
export type CosmeticRarity = typeof COSMETIC_RARITIES[number];
export type CosmeticSlot = typeof COSMETIC_SLOTS[number];
export const COSMETIC_ASSETS = {
  'fiery-autumn-frame-v1': { slot: 'profile_frame', url: '/cosmetics/fiery-autumn-frame-v1.svg', width: 256, height: 256, audience: 'public', draft: true },
  'fiery-autumn-table-v1': { slot: 'poker_table', url: '/cosmetics/fiery-autumn-table-v1.svg', width: 1200, height: 720, audience: 'self', draft: true },
  'fiery-autumn-broadcast-v1': { slot: 'broadcast_accent', url: '/cosmetics/fiery-autumn-broadcast-v1.svg', width: 640, height: 128, audience: 'broadcast', draft: true },
  'noir-frame-v1': { slot: 'profile_frame', url: '/cosmetics/noir-frame-v1.svg', width: 256, height: 256, audience: 'public', draft: true },
  'noir-table-v1': { slot: 'poker_table', url: '/cosmetics/noir-table-v1.svg', width: 1200, height: 720, audience: 'self', draft: true },
  'noir-broadcast-v1': { slot: 'broadcast_accent', url: '/cosmetics/noir-broadcast-v1.svg', width: 640, height: 128, audience: 'broadcast', draft: true },
} as const;
export type CosmeticAssetKey = keyof typeof COSMETIC_ASSETS;
