/** One person's identity, four independent wardrobes. Never changes a game role. */
export const LOOK_ROLES = ['civilian', 'mafia', 'don', 'sheriff'] as const;
export type LookRole = typeof LOOK_ROLES[number];
export const LOOK_ROLE_LABELS: Record<LookRole, string> = { civilian: 'Мирный', mafia: 'Мафия', don: 'Дон', sheriff: 'Шериф' };
export const LOOK_BACKGROUNDS = ['noir', 'autumn', 'burgundy'] as const;
export const PORTRAIT_LAYOUT = 'bust-512x640-v1' as const;
export type RoleLook = { role: LookRole; phrase: string; background: typeof LOOK_BACKGROUNDS[number]; hatItemId: string | null; jacketItemId: string | null; revision: number };
export type LookLayer = { itemId: string; name: string; slot: 'portrait_hat' | 'portrait_jacket'; url: string; rarity: string };
export type RoleLooksResponse = { looks: RoleLook[]; layers: LookLayer[]; portraitVersion: string | null; canApprovePortrait?: boolean };
export type BroadcastRoleLook = RoleLook & { gameKey: string; portraitVersion: string | null; hatUrl: string | null; jacketUrl: string | null };
export const emptyRoleLook = (role: LookRole): RoleLook => ({ role, phrase: '', background: 'noir', hatItemId: null, jacketItemId: null, revision: 0 });
export const plainPhrase = (text: string) => Array.from(text).filter(char => {
  const n=char.codePointAt(0)!; return n>=32 && n!==127 && n!==0x2028 && n!==0x2029;
}).join('');
export function lookRoleFromGame(role: string): LookRole | null {
  return ({ civilian: 'civilian', citizen: 'civilian', red: 'civilian', 'Мирный': 'civilian', 'Мирный житель': 'civilian', mafia: 'mafia', 'Мафия': 'mafia', don: 'don', 'Дон': 'don', sheriff: 'sheriff', 'Шериф': 'sheriff' } as Record<string, LookRole>)[role] || null;
}
