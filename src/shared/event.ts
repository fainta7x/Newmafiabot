/**
 * «Событие» — ONE entity for everything players come to (docs/ARCHITECTURE_REVIEW_2026-11-03.md, entity 1): a game
 * evening, a tournament, the club's own event, a poker tournament. Today they live in four tables; this is the one shape
 * every feature reads (key, kind, date, one status). Kind-specific details (slots, registrations, blinds) stay with
 * their kind. A new kind of event is a new value of `kind`, never a new table.
 */
export type EventKind = 'evening' | 'tournament' | 'custom' | 'poker';
export type EventStatus = 'draft' | 'published' | 'running' | 'completed' | 'cancelled';
export type EventKey = `${EventKind}:${string}`;

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Черновик',
  published: 'Опубликовано',
  running: 'Идёт',
  completed: 'Завершено',
  cancelled: 'Отменено',
};

export interface ClubEvent {
  key: EventKey;
  kind: EventKind;
  id: string;
  title: string;
  startsAt: string;
  status: EventStatus;
  venue: string | null;
}

export const eventKey = (kind: EventKind, id: string | number): EventKey => `${kind}:${String(id)}` as EventKey;
export const isOpenEventStatus = (status: EventStatus) => status === 'published' || status === 'running';
