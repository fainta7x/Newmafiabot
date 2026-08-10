import { z } from 'zod';

export const createEveningSchema = z.object({
  title: z.string().min(2, 'Заголовок должен содержать минимум 2 символа'),
  starts_at: z.string().min(10, 'Укажите дату и время начала'),
  ends_at: z.string().nullable().optional(),
  timezone: z.string().default('Europe/Moscow'),
  venue: z.string().nullable().optional(),
  format: z.enum(['NOVICE', 'STANDARD', 'TOURNAMENT']).default('STANDARD'),
  status: z.enum(['draft', 'published', 'active', 'completed', 'cancelled']).default('published'),
  capacity: z.number().int().positive().default(20),
  default_price: z.number().int().min(0).default(400),
  notes: z.string().nullable().optional(),
});
export const updateEveningSchema = createEveningSchema.partial();

export const eveningResponseStatusSchema = z.enum(['going', 'late', 'thinking', 'declined', 'unanswered']);
export const eveningAttendanceFactSchema = z.enum(['pending', 'attended_on_time', 'attended_late', 'no_show']);
const legacyRegistrationStatusSchema = z.enum(['going', 'late', 'thinking', 'declined', 'unanswered', 'invited', 'registered', 'confirmed', 'waitlist', 'cancelled']);

export const bulkAddParticipantsSchema = z.object({
  player_ids: z.array(z.string().min(1, 'Некорректный ID игрока')).min(1, 'Выберите хотя бы одного игрока'),
  table_id: z.string().nullable().optional(),
  response_status: eveningResponseStatusSchema.optional(),
  registration_status: legacyRegistrationStatusSchema.optional(),
  amount_due: z.number().int().min(0).optional(),
});

export const addSingleParticipantSchema = z.object({
  player_id: z.string().min(1).optional(), nickname: z.string().optional(), phone: z.string().optional(),
  table_id: z.string().nullable().optional(), response_status: eveningResponseStatusSchema.optional(),
  registration_status: legacyRegistrationStatusSchema.optional(), amount_due: z.number().int().min(0).optional(),
  amount_paid: z.number().int().min(0).default(0), notes: z.string().nullable().optional(),
});

export const updateParticipantSchema = z.object({
  table_id: z.string().nullable().optional(), response_status: eveningResponseStatusSchema.optional(),
  registration_status: legacyRegistrationStatusSchema.optional(), attendance_fact: eveningAttendanceFactSchema.optional(),
  attendance_status: z.enum(['pending', 'attended', 'no_show']).optional(), arrival_status: z.enum(['unknown', 'on_time', 'late']).optional(),
  payment_status: z.enum(['unpaid', 'partial', 'paid', 'waived']).optional(), amount_due: z.number().int().min(0).optional(),
  amount_paid: z.number().int().min(0).optional(), notes: z.string().nullable().optional(),
});

export const createPlayerSchema = z.object({
  nickname: z.string().min(1, 'Введите никнейм игрока'), full_name: z.string().nullable().optional(), telegram_user_id: z.string().nullable().optional(),
  telegram_username: z.string().nullable().optional(), phone: z.string().nullable().optional(), contact_status: z.enum(['normal', 'paused', 'blocked']).optional(),
  lifecycle_status: z.string().optional(), source: z.string().nullable().optional(), preferred_format: z.string().nullable().optional(),
  game_level: z.enum(['novice', 'club', 'tournament']).optional(),
  referred_by: z.string().nullable().optional(), do_not_invite_until: z.string().nullable().optional(), pause_reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(), elo: z.number().int().default(1000), tokens: z.number().int().default(0),
});
export const updatePlayerSchema = createPlayerSchema.partial();

export const createTaskSchema = z.object({
  title: z.string().min(2, 'Введите название задачи'), description: z.string().nullable().optional(),
  type: z.enum(['call', 'invite', 'reminder', 'feedback', 'preparation', 'payment', 'other']).default('other'),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).default('todo'), priority: z.enum(['low', 'medium', 'high']).default('medium'),
  due_at: z.string().nullable().optional(), player_id: z.string().min(1).nullable().optional(), evening_id: z.string().min(1).nullable().optional(),
});
export const updateTaskSchema = createTaskSchema.partial();

export const gameSlotSchema = z.object({
  slot: z.number().int().min(1).max(10), player_id: z.string().min(1).optional(), nickname: z.string().min(1, 'Укажите никнейм игрока'),
  role: z.enum(['Мирный', 'Шериф', 'Мафия', 'Дон']), fouls: z.number().int().min(0).default(0), is_alive: z.boolean().optional(), notes: z.string().optional(),
});
export const createGameSchema = z.object({
  evening_id: z.string().min(1).nullable().optional(), global_game_number: z.number().int().positive('Номер игры должен быть положительным числом'),
  game_date: z.string().min(1, 'Укажите дату игры'), winner_team: z.string().min(1, 'Укажите победившую команду'), winner_label: z.string().min(1, 'Укажите название победителей'),
  judge_name: z.string().min(1, 'Укажите имя ведущего/судьи'), protocol_text: z.string().nullable().optional(), slots: z.array(gameSlotSchema).min(1, 'В протоколе игры должен быть хотя бы один игрок'),
});