import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { players, gameEvenings, eveningTables } from './schemaBase.ts';

export * from './schemaBase.ts';

// Canonical 04B0 participant schema. Legacy registration/attendance/arrival columns remain
// as compatibility storage, but response_status is the only planned-response source of truth.
export const eveningParticipants = sqliteTable('evening_participants', {
  id: text('id').primaryKey(),
  evening_id: text('evening_id').notNull().references(() => gameEvenings.id, { onDelete: 'cascade' }),
  player_id: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  table_id: text('table_id').references(() => eveningTables.id, { onDelete: 'set null' }),
  response_status: text('response_status').notNull().default('unanswered'),
  registration_status: text('registration_status').notNull().default('unanswered'),
  attendance_status: text('attendance_status').notNull().default('pending'),
  arrival_status: text('arrival_status').notNull().default('unknown'),
  payment_status: text('payment_status').notNull().default('unpaid'),
  amount_due: integer('amount_due').notNull().default(0),
  amount_paid: integer('amount_paid').notNull().default(0),
  notes: text('notes'),
  registered_at: text('registered_at'),
  confirmed_at: text('confirmed_at'),
  checked_in_at: text('checked_in_at'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => ({
  eveningPlayerUnique: uniqueIndex('idx_evening_player_unique').on(table.evening_id, table.player_id),
}));