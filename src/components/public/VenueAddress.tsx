import { venueDetails } from '../../lib/venues.ts';

type TelegramWindow = Window & { Telegram?: { WebApp?: { openLink?: (url: string) => void } } };

/** Venue name, its address and a «Как добраться» map link (inside Telegram it opens outside the Mini App). */
export const VenueAddress = ({ venue, className = '' }: { venue: string | null | undefined; className?: string }) => {
  const { name, address, mapUrl } = venueDetails(venue);
  return (
    <span className={className}>
      <span className="block">{name}</span>
      {address ? <span className="block text-[12px] text-white/55">{address}</span> : null}
      {mapUrl ? (
        <a href={mapUrl} target="_blank" rel="noopener noreferrer" data-testid="venue-map-link"
          onClick={(event) => {
            const telegram = (window as TelegramWindow).Telegram?.WebApp;
            if (typeof telegram?.openLink === 'function') { event.preventDefault(); telegram.openLink(mapUrl); }
          }}
          className="mt-1 inline-flex min-h-8 items-center text-[12px] font-semibold text-sky-300 underline underline-offset-2">Как добраться</a>
      ) : null}
    </span>
  );
};

export default VenueAddress;
