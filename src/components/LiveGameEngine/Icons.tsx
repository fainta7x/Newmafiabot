/** Shared compact revolver silhouette for Mafia roles throughout the application. */
export const PistolIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 32 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" className={className}>
    {/* Barrel, sight and muzzle */}
    <path d="M13.2 7.2H27.7V10.9H13.2Z" fill="currentColor" stroke="none" />
    <path d="M25.6 5.8h1.7v1.4h-1.7zM27.6 8.1h2.1v2h-2.1z" fill="currentColor" stroke="none" />
    {/* Frame and visible cylinder: characteristic revolver profile */}
    <path d="M7.4 7.5 12.1 5.8 17.6 6.5 18.6 12.3 14.8 15 9.6 13.6 7 10.9Z" fill="currentColor" stroke="none" />
    <circle cx="12.9" cy="10.5" r="3.1" fill="none" stroke="rgba(0,0,0,.6)" strokeWidth="1.1" />
    <circle cx="12.9" cy="10.5" r=".9" fill="rgba(0,0,0,.55)" stroke="none" />
    {/* Hammer and trigger guard */}
    <path d="M7.1 7.5 5 5.2 6.7 4.1 9.6 6.8M14.5 14.1c1.1 3.9-2 5.6-5.8 4.4l-.1-2.2" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8.8 13.1c.8 1.7.7 3.1-.4 4.4" stroke="rgba(0,0,0,.65)" />
    {/* Angled grip with a distinct heel */}
    <path d="m7.7 12.1 5.3 2.2-3.6 8-6.4-2.1 2.8-7.2z" fill="currentColor" stroke="none" />
    <path d="m6.3 14.8 4 1.4-1.5 4.1-4.2-1.4" stroke="rgba(0,0,0,.45)" strokeWidth="1" />
  </svg>
);

export const MafiaHatIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M7.15 5.6c.16-.66.75-1.13 1.43-1.13h6.84c.68 0 1.27.47 1.43 1.13l1.7 7.1H5.45l1.7-7.1Z" />
    <path d="M5.9 10.15h12.2l.62 2.55H5.28l.62-2.55Z" opacity=".48" />
    <path d="M2.35 14.1c3.04-.82 6.25-1.22 9.65-1.22s6.61.4 9.65 1.22c.72.2 1.15.93.96 1.65-.2.72-.94 1.14-1.66.95A34.8 34.8 0 0 0 12 15.55c-3.1 0-6.08.38-8.95 1.15a1.35 1.35 0 0 1-.7-2.6Z" />
  </svg>
);
