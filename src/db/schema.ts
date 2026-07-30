import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const players = sqliteTable('players', {
  id: text('id').primaryKey(), // UUID
  telegram_user_id: text('telegram_user_id').unique(),
  nickname: text('nickname').notNull(),
  full_name: text('full_name'),
  telegram_username: text('telegram_username'),
  phone: text('phone'),
  contact_status: text('contact_status').notNull().default('normal'), // normal, paused, blocked
  lifecycle_status: text('lifecycle_status').notNull().default('normal'), // legacy / compatibility
  source: text('source'),
  preferred_format: text('preferred_format'), // novice, standard, any
  referred_by: text('referred_by'),
  do_not_invite_until: text('do_not_invite_until'),
  pause_reason: text('pause_reason'),
  notes: text('notes'),
  elo: integer('elo').notNull().default(1000),
  tokens: integer('tokens').notNull().default(0),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const gameEvenings = sqliteTable('game_evenings', {
  id: text('id').primaryKey(), // UUID
  title: text('title').notNull(),
  starts_at: text('starts_at').notNull(),
  ends_at: text('ends_at'),
  timezone: text('timezone').notNull().default('Europe/Moscow'),
  venue: text('venue'),
  format: text('format').notNull().default('STANDARD'), // NOVICE, STANDARD, TOURNAMENT
  status: text('status').notNull().default('draft'), // draft, published, active, completed, cancelled
  capacity: integer('capacity').default(20),
  default_price: integer('default_price').notNull().default(0),
  notes: text('notes'),
  settled_at: text('settled_at'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const eveningTables = sqliteTable('evening_tables', {
  id: text('id').primaryKey(), // UUID
  evening_id: text('evening_id').notNull().references(() => gameEvenings.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  format: text('format').notNull().default('STANDARD'), // NOVICE, STANDARD, TOURNAMENT
  capacity: integer('capacity').notNull(),
  host_name: text('host_name'),
  starts_at: text('starts_at'),
  default_price: integer('default_price'),
  notes: text('notes'),
  sort_order: integer('sort_order').default(0),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const eveningParticipants = sqliteTable('evening_participants', {
  id: text('id').primaryKey(), // UUID
  evening_id: text('evening_id').notNull().references(() => gameEvenings.id, { onDelete: 'cascade' }),
  player_id: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  table_id: text('table_id').references(() => eveningTables.id, { onDelete: 'set null' }),
  registration_status: text('registration_status').notNull().default('registered'), // invited, registered, confirmed, waitlist, cancelled
  attendance_status: text('attendance_status').notNull().default('pending'), // pending, attended, no_show
  arrival_status: text('arrival_status').notNull().default('unknown'), // unknown, on_time, late
  payment_status: text('payment_status').notNull().default('unpaid'), // unpaid, partial, paid, waived
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

export const organizerTasks = sqliteTable('organizer_tasks', {
  id: text('id').primaryKey(), // UUID
  title: text('title').notNull(),
  description: text('description'),
  type: text('type').notNull().default('other'), // call, invite, reminder, feedback, preparation, payment, other
  status: text('status').notNull().default('todo'), // todo, in_progress, done, cancelled
  priority: text('priority').notNull().default('medium'), // low, medium, high
  due_at: text('due_at'),
  completed_at: text('completed_at'),
  automation_key: text('automation_key').unique(),
  player_id: text('player_id').references(() => players.id, { onDelete: 'set null' }),
  evening_id: text('evening_id').references(() => gameEvenings.id, { onDelete: 'set null' }),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const playerActivities = sqliteTable('player_activities', {
  id: text('id').primaryKey(), // UUID
  player_id: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  evening_id: text('evening_id').references(() => gameEvenings.id, { onDelete: 'set null' }),
  task_id: text('task_id').references(() => organizerTasks.id, { onDelete: 'set null' }),
  type: text('type').notNull(), // invite, contact, response, feedback, note, status_change
  outcome: text('outcome'), // sent, confirmed, declined, no_response, busy, interested_later, completed, other
  description: text('description'),
  occurred_at: text('occurred_at').notNull(),
  created_at: text('created_at').notNull(),
});

export const financialTransactions = sqliteTable('financial_transactions', {
  id: text('id').primaryKey(), // UUID
  type: text('type').notNull(), // income, expense, debt_created, debt_paid, refund, adjustment
  amount: integer('amount').notNull(),
  category: text('category'),
  description: text('description'),
  player_id: text('player_id').references(() => players.id, { onDelete: 'set null' }),
  evening_id: text('evening_id').references(() => gameEvenings.id, { onDelete: 'set null' }),
  source_type: text('source_type'), // e.g. evening_settle, manual, deposit, adjustment
  source_id: text('source_id'), // e.g. participant_id or evening_id
  created_at: text('created_at').notNull(),
}, (table) => ({
  transactionSourceUnique: uniqueIndex('idx_financial_tx_source_unique').on(table.source_type, table.source_id, table.type),
}));

export const games = sqliteTable('games', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  evening_id: text('evening_id').references(() => gameEvenings.id, { onDelete: 'set null' }),
  evening_table_id: text('evening_table_id').references(() => eveningTables.id, { onDelete: 'set null' }),
  global_game_number: integer('global_game_number').notNull(),
  game_date: text('game_date').notNull(),
  winner_team: text('winner_team').notNull(),
  winner_label: text('winner_label').notNull(),
  judge_name: text('judge_name'),
  protocol_text: text('protocol_text'),
  slots_json: text('slots_json').notNull(),
  created_at: text('created_at').notNull(),
});

export const migrationHistory = sqliteTable('migration_history', {
  id: text('id').primaryKey(),
  migration_name: text('migration_name').notNull().unique(),
  status: text('status').notNull(), // success, error
  details_json: text('details_json'),
  executed_at: text('executed_at').notNull(),
});
