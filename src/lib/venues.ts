import KNOWN_VENUES_JSON from '../shared/venues.json';

/**
 * Known club venues: the address and a map link shown next to the venue name in announcements and
 * evening cards. The list is `src/shared/venues.json`, shared with the Python bot.
 */
export type VenueDetails = { name: string; address: string | null; mapUrl: string | null };

const mapUrl = (query: string) => `https://yandex.ru/maps/?text=${encodeURIComponent(query)}`;

const KNOWN_VENUES: Record<string, { address: string; mapQuery: string }> = KNOWN_VENUES_JSON;

export const venueDetails = (venue: string | null | undefined): VenueDetails => {
  const name = String(venue || '').trim() || 'Суп с Котом';
  const known = KNOWN_VENUES[name.toLowerCase().replace(/[«»"]/g, '').trim()];
  return known ? { name, address: known.address, mapUrl: mapUrl(known.mapQuery) } : { name, address: null, mapUrl: null };
};

/** «Суп с Котом, Пушкинский проезд, 4А» — the name with the address when it is known. */
export const venueLine = (venue: string | null | undefined) => {
  const details = venueDetails(venue);
  return details.address ? `${details.name}, ${details.address}` : details.name;
};
