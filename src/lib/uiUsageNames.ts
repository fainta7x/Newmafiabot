/**
 * Shared by the browser and the server: turns a screen path or a control's
 * test id into a name that carries no entity ids (players, evenings, …).
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

// Test ids whose suffix is a row/entity id — only the prefix is kept.
const ENTITY_ACTION_PREFIXES = [
  'club-player-',
  'player-row-',
  'evening-roster-row-',
  'evening-roster-action-',
  'evening-active-row-',
  'evening-payment-row-',
  'crm-calendar-event-',
  'crm-evening-',
  'judge-bonus-',
];

const collapseIdSegments = (value: string, separator: string) =>
  value.split(separator).map((segment) => (/\d/.test(segment) ? ':id' : segment)).join(separator);

export const sanitizeUiScreenName = (path: string) => {
  const clean = (path.split(/[?#]/)[0] || '/').toLowerCase().replace(UUID, ':id');
  const segments = clean.split('/').filter(Boolean).slice(0, 5).map((segment) => (/\d/.test(segment) ? ':id' : segment));
  return `/${segments.join('/')}`.replace(/[^a-z0-9/:_.-]/g, '').slice(0, 80) || '/';
};

export const sanitizeUiActionName = (value: string) => {
  const name = value.trim().toLowerCase();
  const prefix = ENTITY_ACTION_PREFIXES.find((item) => name.startsWith(item));
  if (prefix) return `${prefix}:id`;
  return collapseIdSegments(name.replace(UUID, ':id'), '-').replace(/[^a-z0-9/:_.-]+/g, '-').slice(0, 80);
};
