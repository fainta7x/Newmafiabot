/**
 * The club token as a drawn coin. The 🪙 emoji is too new for older phones and Windows, where it
 * shows as an empty square (owner report 2026-10-01), so the icon is inline SVG.
 */
export function TokenIcon({ className = '', title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      className={`inline-block shrink-0 align-[-0.15em] ${className}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <circle cx="12" cy="12" r="10.5" fill="#E2A93B" />
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="#9A6A16" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="#FCE7A8" strokeWidth="1.3" opacity="0.85" />
      <path d="M9.2 8.6h5.6M12 8.6v7" stroke="#7A5210" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
