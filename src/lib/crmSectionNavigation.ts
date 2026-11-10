import type { OrganizerMoreScreen } from '../components/crm/organizerRouting.ts';

/** Opens a «Ещё» section from anywhere in the CRM (for example from a player card), optionally on one player. */
export const CRM_OPEN_SECTION_EVENT = 'crm:open-more-screen';
export const SECTION_PLAYER_HANDOFF: Partial<Record<OrganizerMoreScreen, string>> = { achievements: 'crm.achievements.player', vip: 'crm.vip.player', tokens: 'crm.tokens.player' };

export function openCrmSection(screen: OrganizerMoreScreen, playerId?: string) {
  const key = SECTION_PLAYER_HANDOFF[screen];
  if (playerId && key) { try { sessionStorage.setItem(key, playerId); } catch { /* the section just opens without a player */ } }
  window.dispatchEvent(new CustomEvent(CRM_OPEN_SECTION_EVENT, { detail: { screen } }));
}
