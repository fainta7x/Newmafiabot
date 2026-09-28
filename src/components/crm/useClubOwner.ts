import { createContext, useContext } from 'react';

/**
 * Whether the signed-in organizer is the club owner («Владелец»), from /api/auth/me.
 * Only the owner gives or takes the organizer role / cabinet, so the CRM hides those
 * controls from other organizers. The server enforces the same rule; this keeps the screen honest.
 * null = unknown (e.g. outside the CRM shell): the controls stay visible and the server decides.
 */
export const ClubOwnerContext = createContext<boolean | null>(null);

export const useClubOwner = () => useContext(ClubOwnerContext);
